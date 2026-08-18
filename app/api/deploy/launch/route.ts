import { NextResponse } from "next/server";
import { getClientIp, hitRateLimit } from "@/src/lib/apiSecurity";
import { readSession } from "@/src/lib/sessionAuth";
import { verifyStripeCheckoutSession } from "@/src/lib/stripeCheckout";
import { isStripeCheckoutEnabled } from "@/src/lib/stripe";
import {
  startCompanyDeploy,
  fetchCompanyDeployStatus,
  LaunchServiceError,
  mapLaunchStatusToSessionStatus,
} from "@/src/lib/launchClient";
import {
  appendOrchestrationEvent,
  attachCheckoutSession,
  consumeDeploymentIntent,
  createChat,
  createDeploymentIntent,
  createOrchestrationSession,
  getDeploymentIntentBySession,
  getOrchestrationSession,
  getOrchestrationSessionByOpportunity,
  linkOrchestrationSession,
  markDeploymentIntentPaid,
  releaseDeploymentIntent,
  setOrchestrationSessionStatus,
  upsertOrchestrationAgents,
} from "@/src/lib/convexServer";
import { buildSwarmAgentsForPrompt } from "@/src/lib/orchestrationSwarmGuardrails";

type DeployLaunchBody = {
  /** Stripe Checkout session id. The Launch call only runs when this session is paid. */
  session_id?: string;
  /** RAG opportunity uuid (from Stripe metadata via verify, or supplied directly in the body). */
  opportunityId?: string;
  /** Company name override (used when re-deploying a previously paid session after a 409). */
  companyName?: string;
};

const ERROR_STATUS: Record<string, number> = {
  STRIPE_NOT_ENABLED: 400,
  PAYMENT_NOT_PAID: 402,
  OPPORTUNITY_ID_MISSING: 400,
  LAUNCH_DISABLED: 501,
  CONFIG_ERROR: 501,
  LAUNCH_UPSTREAM_ERROR: 502,
  LAUNCH_TIMEOUT: 502,
  LAUNCH_CONNECTION_ERROR: 502,
  IDEA_NO_DISPONIBLE: 409,
  LAUNCH_CONFLICT: 409,
};

export async function POST(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Sign in with your wallet to continue.",
          },
        },
        { status: 401 },
      );
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`deploy:launch:${ip}`, 15)) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "RATE_LIMITED", message: "Rate limit exceeded" },
        },
        { status: 429 },
      );
    }

    const body = (await req.json()) as DeployLaunchBody;
    const stripeSessionId = body.session_id?.trim();
    if (!stripeSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "BAD_REQUEST", message: "session_id is required." },
        },
        { status: 400 },
      );
    }

    if (!isStripeCheckoutEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "STRIPE_NOT_ENABLED",
            message: "Stripe checkout is not enabled.",
          },
        },
        { status: 400 },
      );
    }

    const verified = await verifyStripeCheckoutSession(stripeSessionId);
    if (!verified.paid) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "PAYMENT_NOT_PAID",
            message: "Payment is not verified as paid.",
          },
        },
        { status: 402 },
      );
    }

    // The explicit body value wins over the Stripe metadata. This is what makes
    // the "Opción R" redeem flow work: the user paid for idea A (metadata), the
    // deploy got a 409 (idea already taken), and after re-picking idea B the SAME
    // paid session is replayed with body.opportunityId = B — without a new charge.
    const opportunityId = body.opportunityId?.trim() || verified.opportunityId;
    if (!opportunityId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "OPPORTUNITY_ID_MISSING",
            message: "No RAG opportunity uuid found for this payment.",
          },
        },
        { status: 400 },
      );
    }

    const companyName = body.companyName?.trim() || verified.companyName;

    const { searchParams } = new URL(req.url);
    if (
      process.env.NODE_ENV !== "production" &&
      searchParams.get("simulate") === "409"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "IDEA_NO_DISPONIBLE",
            message: "La idea ya no está disponible. Elige otra empresa.",
            action: "elegir_nueva_idea",
          },
        },
        { status: 409 },
      );
    }

    const existing = await getOrchestrationSessionByOpportunity({
      opportunityId,
    }).catch(() => null);
    let existingTerminalFailure =
      existing?.status === "failed" || existing?.status === "stale";
    if (existing && existing._id && !existingTerminalFailure) {
      // The local session status can be stale (e.g. "active" from a previous
      // deploy whose container died after a server restart). Before reusing the
      // session as a dedup hit, verify the REAL remote state with Launch: if the
      // underlying deployment is actually failed/stale, mark the session failed
      // and fall through to start a fresh deploy instead of pointing the user at
      // a dead container ("Container not running after server restart").
      if (typeof existing.spawnRequestId === "string" && existing.spawnRequestId) {
        try {
          const remote = await fetchCompanyDeployStatus(existing.spawnRequestId);
          if (remote.status === "failed" || remote.status === "stale") {
            await setOrchestrationSessionStatus({
              sessionId: existing._id,
              status: "failed",
              error:
                remote.error ??
                "The deploy is no longer running; a fresh deploy will start.",
            }).catch(() => null);
            existingTerminalFailure = true;
          }
        } catch {
          // Launch unreachable: fall back to trusting the local session status.
        }
      }
    }
    if (existing && existing._id && !existingTerminalFailure) {
      return NextResponse.json({
        ok: true,
        companyId:
          typeof existing.containerRef === "string"
            ? existing.containerRef.replace(/^oc-/, "")
            : null,
        status: existing.status ?? "queued",
        deploymentId: existing.spawnRequestId ?? null,
        orchestrationSessionId: existing._id,
        alreadyExisted: true,
        companyName,
        planId: verified.planId,
      });
    }

    let intentConsumed = false;
    try {
      let intent = await getDeploymentIntentBySession({
        stripeCheckoutSessionId: stripeSessionId,
      });
      if (!intent) {
        const lazyId = await createDeploymentIntent({
          source:
            verified.flowSource === "form_intake"
              ? "form_intake"
              : "rag_opportunity",
          companyName,
          opportunityId,
          founderWallet: session.address,
          planId: verified.planId || undefined,
        });
        await attachCheckoutSession({
          intentId: lazyId,
          stripeCheckoutSessionId: stripeSessionId,
          planId: verified.planId || undefined,
        });
        intent = await getDeploymentIntentBySession({
          stripeCheckoutSessionId: stripeSessionId,
        });
      }
      if (intent) {
        if (intent.status === "spawning" || intent.status === "deployed") {
          // If the claimed intent points to an orchestration session that died in a
          // terminal failure (e.g. container never came up after a VPS restart), the
          // claim is stale: release the intent so the SAME paid session can re-deploy
          // without being blocked here (and without a second charge).
          let staleClaim = false;
          const claimedSessionId = (
            intent as { orchestrationSessionId?: string | null }
          ).orchestrationSessionId;
          if (claimedSessionId) {
            try {
              const claimed = await getOrchestrationSession({
                sessionId: claimedSessionId,
              });
              staleClaim =
                claimed?.status === "failed" || claimed?.status === "stale";
            } catch {
              staleClaim = false;
            }
          }
          if (staleClaim) {
            await releaseDeploymentIntent({
              stripeCheckoutSessionId: stripeSessionId,
            }).catch(() => null);
            intent = await getDeploymentIntentBySession({
              stripeCheckoutSessionId: stripeSessionId,
            });
          } else {
            return NextResponse.json({
              ok: true,
              status: intent.status === "deployed" ? "active" : "spawning",
              companyId: null,
              deploymentId: null,
              orchestrationSessionId: intent.orchestrationSessionId ?? null,
              alreadyExisted: true,
              companyName,
              planId: verified.planId,
            });
          }
        }
        if (intent.status === "draft" || intent.status === "checkout_pending") {
          // Verify already confirmed this session is paid; the webhook may simply
          // not have processed yet. Reconcile before consuming.
          await markDeploymentIntentPaid({
            stripeCheckoutSessionId: stripeSessionId,
          }).catch(() => null);
        }
        const consume = await consumeDeploymentIntent({
          stripeCheckoutSessionId: stripeSessionId,
          opportunityId,
          companyName: companyName || undefined,
        });
        if (consume.found && !consume.consumed && consume.status !== "paid") {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "DEPLOY_ALREADY_STARTED",
                message: "Este pago ya se utilizó para iniciar un deploy.",
                retryable: false,
              },
            },
            { status: 409 },
          );
        }
        intentConsumed = true;
      }
    } catch {
      // Convex unavailable or intent handling failed: fall back to the payment-only
      // guard (payment is already verified above).
    }

    let result;
    try {
      result = await startCompanyDeploy(opportunityId);
    } catch (err) {
      // Any Launch failure must leave the paid intent reusable: the user re-picks
      // another idea and re-deploys with the SAME session — never charged again.
      if (intentConsumed) {
        await releaseDeploymentIntent({
          stripeCheckoutSessionId: stripeSessionId,
        }).catch(() => null);
      }
      throw err;
    }

    // Adapter (compatibilidad temporal, ver CONTRATOS_INTEGRACION_FLUJOS.md):
    // Launch provisiona y corre el runtime, pero NO toca Convex. El dashboard crea
    // la sesión de orquestación que Agent Office visualiza y la enlaza al deploy.
    let orchestrationSessionId: string | null = null;
    try {
      const chat = await createChat({
        title: companyName || "Untitled company",
        area: "General",
      });
      const chatId =
        typeof chat === "string" ? chat : (chat as { chatId?: string })?.chatId;
      if (chatId && typeof chatId === "string") {
        const newSessionId = await createOrchestrationSession({
          chatId,
          companyName: companyName || undefined,
          status: mapLaunchStatusToSessionStatus(result.status),
          spawnRequestId: result.deploymentId ?? undefined,
          containerRef: result.companyId ? `oc-${result.companyId}` : undefined,
          opportunityId,
        });
        if (newSessionId) {
          orchestrationSessionId = newSessionId;
          // Link the paid intent to its orchestration session so the stale-claim
          // guard above can detect a deploy that died (field was never written).
          const linkedIntentId = (
            await getDeploymentIntentBySession({
              stripeCheckoutSessionId: stripeSessionId,
            }).catch(() => null)
          )?._id;
          if (linkedIntentId) {
            await linkOrchestrationSession({
              intentId: linkedIntentId,
              orchestrationSessionId: newSessionId,
            }).catch(() => null);
          }
          await appendOrchestrationEvent({
            sessionId: newSessionId,
            type: "deploy.created",
            payload: {
              deploymentId: result.deploymentId,
              companyId: result.companyId,
              status: result.status,
              alreadyExisted: result.alreadyExisted,
            },
          });

          try {
            await upsertOrchestrationAgents({
              sessionId: newSessionId,
              agents: buildSwarmAgentsForPrompt(undefined),
            });
          } catch {
            /* seeding agents is best-effort */
          }
        }
      }
    } catch {
      // Convex adapter failure is not fatal: Launch already accepted the deploy.
      // Future deploymentIntents will make session creation atomic with the intent.
    }

    return NextResponse.json({
      ok: true,
      companyId: result.companyId,
      status: mapLaunchStatusToSessionStatus(result.status),
      deploymentId: result.deploymentId,
      orchestrationSessionId,
      alreadyExisted: result.alreadyExisted,
      companyName,
      planId: verified.planId,
    });
  } catch (err) {
    if (err instanceof LaunchServiceError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            retryable: err.retryable,
            ...(err.code === "IDEA_NO_DISPONIBLE" ||
            err.code === "LAUNCH_CONFLICT"
              ? { action: "elegir_nueva_idea" }
              : {}),
          },
        },
        { status: ERROR_STATUS[err.code] ?? 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      },
      { status: 500 },
    );
  }
}
