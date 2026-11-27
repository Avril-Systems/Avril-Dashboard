import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload, requireDashboardToken } from '@/src/lib/apiSecurity';
import {
  cancelAgentToolProposal,
  claimAgentToolProposal,
  createAgentToolProposal,
  finishAgentToolProposal,
  getAgentChat,
  getDefaultOrganizationId,
  getOrCreateAgentChat,
  getMetacognitionLessons,
  getSessionIntentions,
  listChats,
  listMessages,
  recordAgentToolCall,
  sendMessage,
  sendAgentMessage,
  upsertChatIgnitionDraft,
} from '@/src/lib/convexServer';
import { formatBridgeFetchError, resolveOpenClawBridgeUrl } from '@/src/lib/openclawBridgeEnv';
import {
  callOpenAICompatible,
  hasInferenceConfig,
  inferenceTemperature,
  readInferenceConfig,
} from '@/src/lib/inference';
import {
  augmentUserMessageForModel,
  buildAvrilUnifiedSystemPrompt,
} from '@/src/modules/avril/buildAvrilSystemPrompt';
import {
  augmentAgentMessageForModel,
  buildAgentSystemPrompt,
  buildIntentionReminder,
} from '@/src/modules/agents/buildAgentSystemPrompt';
import { resolveAgentIdentity } from '@/src/modules/agents/agentPersonas';
import type { ResolvedAgentIdentity } from '@/src/modules/agents/agentPersonas';
import {
  getAgentTool,
  isToolAllowedForAgent,
  toolsForAgent,
} from '@/src/modules/agents/toolCatalog';
import { isActivityForHarness } from '@/convex/lib/harnessActivities';
import { buildTurnMeta } from '@/src/modules/agents/turnMeta';
import { selectRelevantLessons } from '@/src/modules/metacognition/lessons';
import type { AgentToolDef } from '@/src/modules/agents/toolCatalog';
import { describeToolProposal, parseToolCall, stripToolBlocks } from '@/src/modules/agents/toolProtocol';
import {
  executeAgentTool,
  executeConfirmedAgentTool,
  summarizeConfirmedToolOutcome,
  summarizeToolOutcome,
} from '@/src/modules/agents/executeAgentTool';
import type { ToolCall } from '@/src/modules/agents/toolProtocol';
import { parseAvrilAssistantReply } from '@/src/modules/avril/parseAvrilAssistantReply';
import { extractDraftFromArchitectPayload } from '@/src/modules/avril/extractDraftFromArchitectPayload';
import { isFolderAgentBriefMessage } from '@/src/lib/orchestrationSwarmGuardrails';

/** Max number of recent messages to send to the bridge as per-agent context. */
const BRIDGE_CONTEXT_LAST_N = 20;
/** When a chat has a stored summary, send only this many recent messages (summary covers the rest). */
const BRIDGE_CONTEXT_LAST_N_WHEN_SUMMARY = 10;
/** Max characters per message content when sending context (reduces token use). */
const BRIDGE_CONTEXT_MAX_CONTENT_CHARS = 600;
/** Suggested max total context size (chars) for the bridge; bridge may truncate further. */
const BRIDGE_CONTEXT_MAX_CHARS = 12_000;
/** Agent loop (solo orquestador, proveedores de texto): topes duros. */
const AGENT_LOOP_MAX_STEPS = 4;
const AGENT_LOOP_MAX_READS = 3;
const AGENT_LOOP_MAX_DIRECT_WRITES = 1;
const AGENT_LOOP_MAX_MS = 60_000;
const AGENT_LOOP_MAX_OBSERVATION_CHARS = 16_000;
/** Short chat turns (intake, commands). */
const MAX_CHAT_MESSAGE_CHARS = 4_000;
/** Folder-card “Agent brief” can be long markdown. */
const MAX_AGENT_BRIEF_CHARS = 56 * 1024;
const RESPOND_MAX_BODY_BYTES = 128 * 1024;

type RequestBody = {
  /** Architect mode: the founder chat. */
  chatId?: string;
  /** Agent mode: session + agentKey identify the 1:1 agent conversation (chatId is resolved server-side). */
  sessionId?: string;
  agentKey?: string;
  message: string;
  organizationId?: string;
  /** `mock` solo existe en modo agente y solo fuera de producción (pruebas de plumbing). */
  model?: 'auto' | 'openai' | 'codex' | 'opus' | 'venice' | 'mock';
  /** Confirmación ligada a una propuesta persistida (punto 2). */
  confirmProposalId?: string;
  /** Cancelación de una propuesta pendiente. */
  cancelProposalId?: string;
};

type PromptMode = 'architect' | 'agent';

type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'CONFIG_ERROR'
  | 'CHAT_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_NOT_AUTHORIZED'
  | 'AGENT_CHAT_FAILED'
  | 'CONVEX_ERROR'
  | 'BRIDGE_TIMEOUT'
  | 'BRIDGE_ERROR'
  | 'VENICE_TIMEOUT'
  | 'VENICE_ERROR'
  | 'INFERENCE_CONFIG_MISSING'
  | 'INFERENCE_TIMEOUT'
  | 'INFERENCE_ERROR'
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_NOT_PENDING'
  | 'PROPOSAL_MISMATCH'
  | 'INTERNAL_ERROR';

type BridgeResult =
  | { ok: true; text: string; attempts: number }
  | { ok: false; code: 'BRIDGE_TIMEOUT' | 'BRIDGE_ERROR'; message: string; attempts: number; retryable: boolean };

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: unknown }
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        retryable: options?.retryable ?? false,
        ...(options?.details !== undefined ? { details: options.details } : {}),
      },
    },
    { status }
  );
}

type BridgeInput = {
  chatId: string;
  message: string;
  mode?: PromptMode;
  model?: 'codex' | 'opus' | 'venice';
  agentId?: string;
  area?: string;
  subArea?: string;
  summary?: string;
  messages?: Array<{ authorType: string; authorId: string; content: string; createdAt: string }>;
  maxContextChars?: number;
  /** System prompt: Avril architect (founder flow) or the targeted agent's persona. */
  systemPrompt?: string;
  /** Recordatorio de intenciones vigentes (se inserta tras el historial). */
  intentionReminder?: string;
  /** Turnos efímeros del agent loop (tool call + observación); no se persisten. */
  loopMessages?: Array<{ role: 'assistant' | 'user'; content: string }>;
};

type VeniceResult =
  | { ok: true; text: string }
  | { ok: false; code: 'VENICE_TIMEOUT' | 'VENICE_ERROR'; message: string; retryable: boolean };

function augmentForMode(mode: PromptMode | undefined, message: string): string {
  return mode === 'agent' ? augmentAgentMessageForModel(message) : augmentUserMessageForModel(message);
}

/**
 * Respuesta de pruebas (solo dev, solo modo agente): valida identidad, hilo por
 * agente y persistencia sin llamar a Venice ni al bridge. Nunca se presenta como
 * respuesta real: el texto va marcado como MOCK.
 */
function buildMockAgentReply(
  identity: ResolvedAgentIdentity | null,
  message: string,
  historyCount: number
): string {
  const name = identity?.name ?? 'Agente';
  const key = identity?.agentKey ?? 'desconocido';
  const harness = identity?.persona.harnessType ?? 'sin arnés (orquestador)';
  return [
    '[MOCK · respuesta simulada, sin modelo real]',
    '',
    `Soy **${name}** (\`${key}\`). Arnés: ${harness}.`,
    `Mensaje recibido: “${message.slice(0, 500)}”`,
    `Mensajes previos en este hilo: ${historyCount}.`,
    '',
    'Esto valida identidad, hilo por agente y persistencia. No valida Venice ni el bridge.',
  ].join('\n');
}

function buildChatMessages(input: BridgeInput): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const base = input.systemPrompt?.trim() || buildAvrilUnifiedSystemPrompt();
  const meta = [input.area && `Primary area: ${input.area}.`, input.subArea && `Sub-area: ${input.subArea}.`]
    .filter(Boolean)
    .join(' ');
  const systemMain = meta ? `${base}\n\n${meta}` : base;

  const fromContext =
    input.messages?.map((msg) => ({
      role: msg.authorType === 'agent' ? ('assistant' as const) : ('user' as const),
      content: String(msg.content ?? ''),
    })) ?? [];

  return [
    { role: 'system', content: systemMain },
    ...(input.summary ? [{ role: 'system' as const, content: `Conversation summary: ${input.summary}` }] : []),
    ...fromContext,
    ...(input.intentionReminder
      ? [
          {
            role: 'user' as const,
            content: `${input.intentionReminder}\n\n(Esta es la versión vigente; prevalece sobre el historial. Responde con ella.)`,
          },
        ]
      : []),
    { role: 'user', content: augmentForMode(input.mode, input.message) },
    ...(input.loopMessages ?? []),
  ];
}

async function callVeniceInference(input: BridgeInput): Promise<VeniceResult> {
  const veniceRaw = process.env.VENICE_INFERENCE_KEY ?? process.env.VENICE_ADMIN_KEY;
  const veniceUrl = process.env.VENICE_INFERENCE_URL || 'https://api.venice.ai/api/v1/chat/completions';
  const veniceModel = process.env.VENICE_MODEL || 'venice-uncensored';

  if (!veniceRaw) {
    return {
      ok: false,
      code: 'VENICE_ERROR',
      message: 'Venice is not configured. Missing VENICE_INFERENCE_KEY or VENICE_ADMIN_KEY.',
      retryable: false,
    };
  }

  const normalizedRaw = veniceRaw.trim().replace(/^Bearer\s+/i, '');
  const keyCandidates = Array.from(
    new Set(
      normalizedRaw.startsWith('VENICE_')
        ? [normalizedRaw]
        : [normalizedRaw, `VENICE_ADMIN_KEY_${normalizedRaw}`, `VENICE_ADMIN_KEY_W_${normalizedRaw}`],
    ),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    let res: Response | null = null;
    let bodyText = '';
    for (const key of keyCandidates) {
      const candidateRes = await fetch(veniceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: veniceModel,
          messages: buildChatMessages(input),
          temperature: 0.45,
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (candidateRes.ok || candidateRes.status !== 401) {
        res = candidateRes;
        break;
      }

      bodyText = await candidateRes.text().catch(() => '');
      res = candidateRes;
    }

    if (!res) {
      return {
        ok: false,
        code: 'VENICE_ERROR',
        message: 'Venice request failed before a response was received.',
        retryable: true,
      };
    }

    if (!res.ok) {
      if (!bodyText) bodyText = await res.text().catch(() => '');
      return {
        ok: false,
        code: 'VENICE_ERROR',
        message: `Venice responded with ${res.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`,
        retryable: res.status >= 500,
      };
    }

    const data: any = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.reply ??
      data?.text ??
      data?.message ??
      '';

    if (typeof text === 'string' && text.trim().length > 0) {
      return { ok: true, text: text.trim() };
    }

    return {
      ok: false,
      code: 'VENICE_ERROR',
      message: 'Venice returned no reply text.',
      retryable: true,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      code: isAbort ? 'VENICE_TIMEOUT' : 'VENICE_ERROR',
      message: isAbort ? 'Venice request timed out after 60s.' : err instanceof Error ? err.message : 'Venice request failed.',
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenClawBridge(input: BridgeInput): Promise<BridgeResult> {
  const bridgeUrl = resolveOpenClawBridgeUrl();
  const bridgeToken = process.env.OPENCLAW_BRIDGE_TOKEN;

  if (!bridgeUrl || !bridgeToken) {
    return {
      ok: false,
      code: 'BRIDGE_ERROR',
      message:
        'Bridge is not configured. Set OPENCLAW_BRIDGE_URL and OPENCLAW_BRIDGE_TOKEN (or for `next dev` only: OPENCLAW_BRIDGE_URL_DEV=http://127.0.0.1:8787/respond plus the same token).',
      attempts: 0,
      retryable: false,
    };
  }

  const maxAttempts = 2;
  let lastError: BridgeResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bridgeToken}`,
        },
        body: JSON.stringify({
          message: augmentForMode(input.mode, input.message),
          model: input.model ?? 'codex',
          source: 'avril-dashboard',
          chatId: input.chatId,
          systemPrompt: input.systemPrompt?.trim() || buildAvrilUnifiedSystemPrompt(),
          ...(input.agentId !== undefined && { agentId: input.agentId }),
          ...(input.area !== undefined && { area: input.area }),
          ...(input.subArea !== undefined && { subArea: input.subArea }),
          ...(input.summary !== undefined && input.summary.length > 0 && { summary: input.summary }),
          ...(input.messages !== undefined && input.messages.length > 0 && { messages: input.messages }),
          ...(input.maxContextChars !== undefined && { maxContextChars: input.maxContextChars }),
        }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        lastError = {
          ok: false,
          code: 'BRIDGE_ERROR',
          message: `Bridge responded with ${res.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`,
          attempts: attempt,
          retryable: res.status >= 500,
        };
        continue;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = (await res.text().catch(() => '')).trim();
        if (text.length > 0) {
          return { ok: true, text, attempts: attempt };
        }

        lastError = {
          ok: false,
          code: 'BRIDGE_ERROR',
          message: 'Bridge returned an unreadable response body.',
          attempts: attempt,
          retryable: true,
        };
        continue;
      }

      const text = data?.reply || data?.text || data?.message;
      if (typeof text === 'string' && text.trim().length > 0) {
        return { ok: true, text: text.trim(), attempts: attempt };
      }

      lastError = {
        ok: false,
        code: 'BRIDGE_ERROR',
        message: 'Bridge returned no reply text.',
        attempts: attempt,
        retryable: true,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      lastError = {
        ok: false,
        code: isAbort ? 'BRIDGE_TIMEOUT' : 'BRIDGE_ERROR',
        message: isAbort
          ? 'Bridge request timed out after 60s.'
          : formatBridgeFetchError(err, bridgeUrl),
        attempts: attempt,
        retryable: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    lastError || {
      ok: false,
      code: 'BRIDGE_ERROR',
      message: 'Bridge request failed with unknown error.',
      attempts: maxAttempts,
      retryable: true,
    }
  );
}

type ProviderKind = 'openai' | 'venice' | 'bridge' | 'mock';

function hasVeniceConfig(): boolean {
  return Boolean(
    (process.env.VENICE_INFERENCE_KEY ?? '').trim() || (process.env.VENICE_ADMIN_KEY ?? '').trim()
  );
}

/**
 * Prioridad: elección explícita del caller; en `auto` (o sin `model`) se usa el
 * proveedor genérico OpenAI-compatible si está configurado; luego Venice; luego bridge.
 */
function resolveProvider(requested: RequestBody['model']): ProviderKind {
  if (requested === 'mock') return 'mock';
  if (requested === 'venice') return 'venice';
  if (requested === 'codex' || requested === 'opus') return 'bridge';
  if (requested === 'openai') return 'openai';
  if (hasInferenceConfig()) return 'openai';
  if (hasVeniceConfig()) return 'venice';
  return 'bridge';
}

function proposalError(reason: string): { status: number; code: ApiErrorCode } {
  if (reason === 'not_found') return { status: 404, code: 'PROPOSAL_NOT_FOUND' };
  if (reason === 'mismatch') return { status: 403, code: 'PROPOSAL_MISMATCH' };
  return { status: 409, code: 'PROPOSAL_NOT_PENDING' };
}

export async function POST(req: Request) {
  try {
    if (!requireDashboardToken(req)) {
      return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`respond:${ip}`, 30)) {
      return errorResponse(429, 'RATE_LIMITED', 'Rate limit exceeded', { retryable: true });
    }

    if (rejectLargePayload(req, RESPOND_MAX_BODY_BYTES)) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid JSON body.');
    }

    const chatIdFromBody = body.chatId?.trim();
    const sessionId = body.sessionId?.trim();
    const agentKey = body.agentKey?.trim();
    const agentTarget = sessionId && agentKey ? { sessionId, agentKey } : null;
    const agentSessionId = agentTarget?.sessionId ?? '';
    const message = body.message?.trim();

    /**
     * Punto 2: la confirmación se vincula a una propuesta persistida (`proposalId`).
     * El claim es atómico (pending -> executing): una propuesta se ejecuta una sola vez.
     * Se reutiliza la autenticación del endpoint y se valida sesión/agente/chat/org.
     */
    const confirmProposalId = body.confirmProposalId?.trim();
    const cancelProposalId = body.cancelProposalId?.trim();

    if (confirmProposalId || cancelProposalId) {
      if (!agentTarget) {
        return errorResponse(
          400,
          'BAD_REQUEST',
          'confirmProposalId/cancelProposalId requieren sessionId + agentKey.'
        );
      }
      if (confirmProposalId && cancelProposalId) {
        return errorResponse(400, 'BAD_REQUEST', 'Envía solo confirmProposalId o cancelProposalId.');
      }

      if (cancelProposalId) {
        let cancelled: Awaited<ReturnType<typeof cancelAgentToolProposal>>;
        try {
          cancelled = await cancelAgentToolProposal({
            proposalId: cancelProposalId,
            sessionId: agentTarget.sessionId,
            agentKey: agentTarget.agentKey,
          });
        } catch (err) {
          return errorResponse(502, 'CONVEX_ERROR', 'No se pudo cancelar la propuesta.', {
            retryable: true,
            details: err instanceof Error ? err.message : String(err),
          });
        }

        if (!cancelled.ok) {
          const { status, code } = proposalError(cancelled.reason ?? 'not_pending');
          return errorResponse(
            status,
            code,
            `No se pudo cancelar la propuesta (${cancelled.reason ?? 'not_pending'}${
              cancelled.status ? `: ${cancelled.status}` : ''
            }).`
          );
        }

        return NextResponse.json({
          ok: true,
          mode: 'agent',
          proposalId: cancelProposalId,
          status: 'cancelled',
        });
      }

      let claim: Awaited<ReturnType<typeof claimAgentToolProposal>>;
      try {
        claim = await claimAgentToolProposal({
          proposalId: confirmProposalId as string,
          sessionId: agentTarget.sessionId,
          agentKey: agentTarget.agentKey,
        });
      } catch (err) {
        return errorResponse(502, 'CONVEX_ERROR', 'No se pudo reclamar la propuesta.', {
          retryable: true,
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!claim.ok) {
        const { status, code } = proposalError(claim.reason);
        return errorResponse(
          status,
          code,
          `La propuesta no se puede confirmar (${claim.reason}${
            claim.status ? `: ${claim.status}` : ''
          }). No se ejecutó nada.`
        );
      }

      const def = getAgentTool(claim.proposal.tool);
      if (!def || def.kind !== 'write') {
        try {
          await finishAgentToolProposal({
            proposalId: claim.proposal._id,
            status: 'failed',
            error: 'Herramienta no válida en la propuesta.',
          });
        } catch {
          // el claim ya evitó duplicados
        }
        return errorResponse(400, 'BAD_REQUEST', 'La propuesta no corresponde a una herramienta de escritura.');
      }

      let confirmHarness: string | null = null;
      let confirmIdentity: ResolvedAgentIdentity | null = null;
      try {
        const agentChat = await getAgentChat({
          sessionId: claim.proposal.sessionId,
          agentKey: claim.proposal.agentKey,
        });
        if (!agentChat) {
          await finishAgentToolProposal({
            proposalId: claim.proposal._id,
            status: 'failed',
            error: 'El agente de la propuesta ya no existe.',
          });
          return errorResponse(404, 'AGENT_NOT_FOUND', 'El agente de la propuesta ya no existe.');
        }
        confirmIdentity = resolveAgentIdentity({
          agentKey: agentChat.agent.agentKey,
          name: agentChat.agent.name,
          role: agentChat.agent.role,
          meta: agentChat.agent.meta,
        });
        confirmHarness = confirmIdentity.persona.harnessType;
      } catch (err) {
        return errorResponse(502, 'CONVEX_ERROR', 'No se pudo verificar el agente de la propuesta.', {
          retryable: true,
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!confirmIdentity?.persona.authorized) {
        try {
          await finishAgentToolProposal({
            proposalId: claim.proposal._id,
            status: 'failed',
            error: 'El agente no tiene identidad autorizada.',
          });
        } catch {
          // el claim ya evitó duplicados
        }
        return errorResponse(403, 'AGENT_NOT_AUTHORIZED', 'El agente no tiene una identidad autorizada.');
      }

      if (
        !isToolAllowedForAgent(def.name, confirmHarness, {
          authorized: confirmIdentity.persona.authorized,
          orchestrator: confirmIdentity.persona.kind === 'orchestrator',
        })
      ) {
        try {
          await finishAgentToolProposal({
            proposalId: claim.proposal._id,
            status: 'failed',
            error: 'Herramienta no disponible para este arnés.',
          });
        } catch {
          // el claim ya evitó duplicados
        }
        return errorResponse(400, 'BAD_REQUEST', 'La propuesta usa una herramienta no disponible para este arnés.');
      }

      const call: ToolCall = { tool: def.name, args: claim.proposal.args };
      const outcome = await executeConfirmedAgentTool(call, {
        sessionId: claim.proposal.sessionId,
        harnessType: confirmHarness,
        agentKey: claim.proposal.agentKey,
      });

      try {
        await finishAgentToolProposal({
          proposalId: claim.proposal._id,
          status: outcome.ok ? 'executed' : 'failed',
          result: outcome.ok ? outcome.data : undefined,
          error: outcome.ok ? undefined : outcome.error,
        });
      } catch {
        // El claim es la garantía anti-duplicado; si no se puede cerrar, queda executing.
      }

      const reply = summarizeConfirmedToolOutcome(outcome);
      const meta = buildTurnMeta({
        tools: [{ tool: call.tool, ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) }],
        executed: outcome.ok,
      });

      try {
        const data = outcome.ok ? (outcome.data as any) : undefined;
        await recordAgentToolCall({
          chatId: claim.proposal.chatId,
          sessionId: claim.proposal.sessionId,
          agentKey: claim.proposal.agentKey,
          tool: call.tool,
          args: call.args,
          ok: outcome.ok,
          error: outcome.ok ? undefined : outcome.error,
          runId: typeof data?.runId === 'string' ? data.runId : undefined,
          activityId: typeof data?.activityId === 'string' ? data.activityId : undefined,
        });
      } catch {
        // La traza no debe romper una acción que ya se ejecutó.
      }

      let warning: string | undefined;
      try {
        await sendMessage({
          chatId: claim.proposal.chatId,
          content: `Confirmo: ${describeToolProposal(call)}`,
        });
        await sendAgentMessage({
          chatId: claim.proposal.chatId,
          content: reply,
          authorId: claim.proposal.agentKey,
          meta,
        });
      } catch (err) {
        warning = `La acción se procesó, pero no se pudo persistir el mensaje: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }

      return NextResponse.json({
        ok: true,
        mode: 'agent',
        chatId: claim.proposal.chatId,
        agentKey: claim.proposal.agentKey,
        proposalId: claim.proposal._id,
        proposalStatus: outcome.ok ? 'executed' : 'failed',
        reply,
        toolCalls: [
          {
            tool: outcome.tool,
            args: call.args,
            ok: outcome.ok,
            ...(outcome.ok ? {} : { error: outcome.error }),
          },
        ],
        meta,
        ...(warning ? { warning } : {}),
      });
    }

    if ((!chatIdFromBody && !agentTarget) || !message) {
      return errorResponse(
        400,
        'BAD_REQUEST',
        'chatId, or sessionId + agentKey, and message are required.'
      );
    }

    if (message.length > MAX_AGENT_BRIEF_CHARS) {
      return errorResponse(400, 'BAD_REQUEST', `Message too long (max ${MAX_AGENT_BRIEF_CHARS} chars).`);
    }
    if (message.length > MAX_CHAT_MESSAGE_CHARS && !isFolderAgentBriefMessage(message)) {
      return errorResponse(
        400,
        'BAD_REQUEST',
        `Message too long for a normal turn (max ${MAX_CHAT_MESSAGE_CHARS} chars). Use the folder “Agent brief” flow or shorten the text.`
      );
    }

    /**
     * Dos modos sobre el mismo endpoint:
     *   - agent:     conversación 1:1 con un agente del Agent Office. El chat se resuelve
     *                en el servidor por (sessionId, agentKey); el cliente no puede elegirlo.
     *   - architect: flujo Avril de siempre (entrevista founder + ignition draft), sin cambios.
     */
    const mode: PromptMode = agentTarget ? 'agent' : 'architect';

    let chatId: string;
    let systemPrompt: string;
    let agentAuthorId: string | undefined;
    let agentId: string | undefined;
    let area: string | undefined;
    let subArea: string | undefined;
    let hasSummary = false;
    let summaryText: string | undefined;
    let agentIdentity: ResolvedAgentIdentity | null = null;
    let agentTools: AgentToolDef[] = [];
    let intentionReminder: string | undefined;

    if (agentTarget) {
      let resolved: Awaited<ReturnType<typeof getOrCreateAgentChat>>;
      try {
        resolved = await getOrCreateAgentChat(agentTarget);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const notFound = /unknown agent/i.test(detail);
        return errorResponse(
          notFound ? 404 : 502,
          notFound ? 'AGENT_NOT_FOUND' : 'AGENT_CHAT_FAILED',
          notFound ? 'Unknown agent for this session.' : 'Failed to resolve the agent conversation.',
          { retryable: !notFound, details: detail }
        );
      }

      chatId = resolved.chatId;
      agentAuthorId = resolved.agent.agentKey;
      const identity = resolveAgentIdentity({
        agentKey: resolved.agent.agentKey,
        name: resolved.agent.name,
        role: resolved.agent.role,
        meta: resolved.agent.meta,
      });
      if (!identity.persona.authorized) {
        return errorResponse(
          403,
          'AGENT_NOT_AUTHORIZED',
          'El agente no tiene una identidad autorizada en esta sesión.'
        );
      }

      // Punto 3: el orquestador ve todas las tools; cada arnés solo las suyas.
      agentTools = toolsForAgent(identity.persona.harnessType, {
        authorized: identity.persona.authorized,
        orchestrator: identity.persona.kind === 'orchestrator',
      });

      // Intención persistida (se relee en cada turno; sobrevive a chats y cambios de modelo).
      let sessionIntentions: Awaited<ReturnType<typeof getSessionIntentions>> | null = null;
      try {
        sessionIntentions = await getSessionIntentions({ sessionId: agentSessionId });
      } catch {
        sessionIntentions = null;
      }

      let metacognitionLessons: string[] = [];
      try {
        const lessons = await getMetacognitionLessons({
          sessionId: agentSessionId,
          agentKey: identity.agentKey,
        });
        metacognitionLessons = selectRelevantLessons(
          lessons.map((lesson) => ({ lesson: lesson.lesson, status: lesson.status })),
          message
        );
      } catch {
        metacognitionLessons = [];
      }

      systemPrompt = buildAgentSystemPrompt(identity, {
        sessionId,
        tools: agentTools,
        intentions: sessionIntentions,
        metacognitionLessons,
      });
      intentionReminder = buildIntentionReminder(identity, sessionIntentions) ?? undefined;
      agentIdentity = identity;
    } else {
      const requestedChatId = chatIdFromBody as string;

      let existingChats: any[];
      try {
        existingChats = await listChats({ organizationId: body.organizationId });
      } catch (err) {
        return errorResponse(502, 'CONVEX_ERROR', 'Failed to validate chat against Convex.', {
          retryable: true,
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!Array.isArray(existingChats) || !existingChats.some((c: any) => c?._id === requestedChatId)) {
        return errorResponse(400, 'CHAT_NOT_FOUND', 'Invalid chatId. The selected chat no longer exists.');
      }

      const currentChat = existingChats.find((c: any) => c?._id === requestedChatId) as
        | {
            _id: string;
            agentId?: string;
            agent?: { name: string; area?: string; subArea?: string };
            summary?: string;
            summaryUpdatedAt?: string;
          }
        | undefined;

      chatId = requestedChatId;
      agentId = currentChat?.agentId;
      area = currentChat?.agent?.area;
      subArea = currentChat?.agent?.subArea;
      hasSummary = Boolean(currentChat?.summary?.trim());
      summaryText = hasSummary ? currentChat?.summary?.trim() : undefined;
      systemPrompt = buildAvrilUnifiedSystemPrompt();
    }

    try {
      await sendMessage({ chatId, content: message });
    } catch (err) {
      return errorResponse(502, 'CONVEX_ERROR', 'Failed to persist user message.', {
        retryable: true,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    let contextMessages: NonNullable<BridgeInput['messages']> = [];
    try {
      const allMessages = await listMessages({ chatId });
      // El mensaje actual ya se persistió arriba: no lo mandes otra vez como contexto.
      const history =
        allMessages.length > 0 && allMessages[allMessages.length - 1]?.content === message
          ? allMessages.slice(0, -1)
          : allMessages;
      const limit = hasSummary ? BRIDGE_CONTEXT_LAST_N_WHEN_SUMMARY : BRIDGE_CONTEXT_LAST_N;
      const lastN = history.slice(-limit).map((m: any) => {
        const content = String(m.content ?? '').trim();
        const truncated =
          content.length <= BRIDGE_CONTEXT_MAX_CONTENT_CHARS
            ? content
            : content.slice(0, BRIDGE_CONTEXT_MAX_CONTENT_CHARS) + '…';
        return {
          authorType: m.authorType,
          authorId: m.authorId ?? '',
          content: truncated,
          createdAt: m.createdAt,
        };
      });
      contextMessages = lastN;
    } catch {
      // Proceed without context if listing fails
    }

    const input: BridgeInput = {
      chatId,
      message,
      mode,
      agentId,
      area,
      subArea,
      systemPrompt,
      ...(intentionReminder ? { intentionReminder } : {}),
      ...(summaryText ? { summary: summaryText } : {}),
      messages: contextMessages.length > 0 ? contextMessages : undefined,
      maxContextChars: BRIDGE_CONTEXT_MAX_CHARS,
    };

    const provider = resolveProvider(body.model);
    const wantsMock = provider === 'mock';
    if (wantsMock && mode !== 'agent') {
      return errorResponse(400, 'BAD_REQUEST', 'El modelo mock solo existe en modo agente.');
    }
    if (wantsMock && process.env.NODE_ENV === 'production') {
      return errorResponse(400, 'BAD_REQUEST', 'El modelo mock está deshabilitado en producción.');
    }

    const callModel = async (modelInput: BridgeInput) => {
      if (provider === 'mock') {
        return {
          ok: true as const,
          text: buildMockAgentReply(agentIdentity, modelInput.message, contextMessages.length),
        };
      }
      if (provider === 'openai') {
        const config = readInferenceConfig();
        if (!config.ok) {
          return {
            ok: false as const,
            code: 'INFERENCE_CONFIG_MISSING' as const,
            message: `Falta configuración de inferencia: ${config.missing.join(', ')}.`,
            retryable: false,
          };
        }
        return await callOpenAICompatible({
          config: config.config,
          messages: buildChatMessages(modelInput),
          temperature: inferenceTemperature(),
        });
      }
      if (provider === 'venice') return await callVeniceInference(modelInput);
      return await callOpenClawBridge({
        ...modelInput,
        model: body.model === 'opus' ? 'opus' : 'codex',
      });
    };

    const result = await callModel(input);

    if (!result.ok) {
      return errorResponse(502, result.code, result.message, {
        retryable: result.retryable,
        details: 'attempts' in result ? { attempts: result.attempts } : undefined,
      });
    }

    const toolCalls: Array<{ tool: string; args: Record<string, unknown>; ok: boolean; error?: string }> = [];
    let pendingProposal: {
      id: string;
      expiresAt: number;
      tool: string;
      arguments: Record<string, unknown>;
      summary: string;
    } | null = null;
    let agentFinalText = result.text.trim();

    if (mode === 'agent' && agentTools.length > 0) {
      const harnessScope = agentIdentity?.persona.harnessType ?? null;
      const toolScope = {
        authorized: agentIdentity?.persona.authorized ?? false,
        orchestrator: agentIdentity?.persona.kind === 'orchestrator',
      };
      // El loop se limita al orquestador en proveedores de texto. Los arneses y el
      // bridge conservan el flujo de una tool por turno.
      const loopEnabled =
        agentIdentity?.persona.kind === 'orchestrator' && (provider === 'openai' || provider === 'venice');
      const maxSteps = loopEnabled ? AGENT_LOOP_MAX_STEPS : 1;
      const loopStartedAt = Date.now();
      const loopMessages: NonNullable<BridgeInput['loopMessages']> = [];
      const seenCalls = new Set<string>();
      let readCount = 0;
      let directWriteCount = 0;
      let currentResult = result;
      let step = 0;

      while (true) {
        step += 1;
        const parsedCall = parseToolCall(currentResult.text);

        if (parsedCall.kind === 'none') {
          agentFinalText = stripToolBlocks(currentResult.text);
          break;
        }
        if (parsedCall.kind === 'invalid') {
          agentFinalText = stripToolBlocks(currentResult.text) || `No pude ejecutar la herramienta: ${parsedCall.error}`;
          break;
        }

        const call = parsedCall.call;
        const signature = `${call.tool}:${JSON.stringify(call.args)}`;
        if (seenCalls.has(signature)) {
          agentFinalText = 'Detuve el loop: la misma herramienta se repitió con los mismos argumentos sin progreso.';
          break;
        }
        seenCalls.add(signature);

        const callDef = getAgentTool(call.tool);
        if (!callDef || !isToolAllowedForAgent(callDef.name, harnessScope, toolScope)) {
          agentFinalText = 'Esa herramienta no está disponible para este agente.';
          break;
        }

        if (callDef.kind === 'read') {
          if (readCount >= AGENT_LOOP_MAX_READS) {
            agentFinalText = 'Detuve el loop: se alcanzó el máximo de lecturas para este turno.';
            break;
          }
          const outcome = await executeAgentTool(call, {
            sessionId: agentSessionId,
            harnessType: harnessScope,
            agentKey: agentAuthorId ?? 'agent',
          });
          readCount += 1;
          toolCalls.push({
            tool: outcome.tool,
            args: call.args,
            ok: outcome.ok,
            ...(outcome.ok ? {} : { error: outcome.error }),
          });

          try {
            const data = outcome.ok ? (outcome.data as any) : undefined;
            await recordAgentToolCall({
              chatId,
              sessionId: agentSessionId,
              agentKey: agentAuthorId ?? 'agent',
              tool: outcome.tool,
              args: call.args,
              ok: outcome.ok,
              error: outcome.ok ? undefined : outcome.error,
              runId: typeof data?.runId === 'string' ? data.runId : undefined,
              activityId: typeof data?.activityId === 'string' ? data.activityId : undefined,
            });
          } catch {
            // La traza no debe romper la respuesta.
          }

          let observation: string;
          if (call.tool === 'get_activity_result' && outcome.ok) {
            const resultJson = JSON.stringify(outcome.data, null, 2);
            observation =
              resultJson.length > AGENT_LOOP_MAX_OBSERVATION_CHARS
                ? `${resultJson.slice(0, AGENT_LOOP_MAX_OBSERVATION_CHARS)}\n…(resultado truncado)`
                : resultJson;
          } else {
            observation = summarizeToolOutcome(outcome);
          }

          if (!loopEnabled) {
            // Conserva el comportamiento previo de una tool por turno para arneses/bridge.
            if (call.tool === 'get_activity_result' && outcome.ok) {
              const nowIso = new Date().toISOString();
              const followUp = await callModel({
                ...input,
                summary: undefined,
                messages: [
                  { authorType: 'human', authorId: 'user', content: message, createdAt: nowIso },
                  {
                    authorType: 'agent',
                    authorId: agentAuthorId ?? 'agent',
                    content: stripToolBlocks(currentResult.text) || `[tool:${call.tool}]`,
                    createdAt: nowIso,
                  },
                ],
                message: [
                  `[Resultado real de la herramienta ${call.tool}]`,
                  observation,
                  '',
                  'Interpreta este resultado real para el usuario: qué encontró, qué significa y cuál es el siguiente paso. No inventes datos.',
                ].join('\n'),
              });
              agentFinalText = followUp.ok
                ? stripToolBlocks(followUp.text) || summarizeToolOutcome(outcome)
                : `${summarizeToolOutcome(outcome)}\n\n(No pude interpretar el resultado con el modelo: ${followUp.message})`;
            } else {
              agentFinalText = summarizeToolOutcome(outcome);
            }
            break;
          }

          if (step >= maxSteps || Date.now() - loopStartedAt > AGENT_LOOP_MAX_MS) {
            agentFinalText = observation;
            break;
          }

          loopMessages.push({ role: 'assistant', content: currentResult.text.trim() });
          loopMessages.push({
            role: 'user',
            content: `[Observación de la herramienta ${call.tool}]\n${observation}`,
          });
          const next = await callModel({ ...input, loopMessages: [...loopMessages] });
          if (!next.ok) {
            agentFinalText = `${observation}\n\nNo pude continuar el loop: ${next.message}`;
            break;
          }
          currentResult = next;
          continue;
        }

        if (callDef.direct) {
          if (directWriteCount >= AGENT_LOOP_MAX_DIRECT_WRITES) {
            agentFinalText = 'Detuve el loop: se alcanzó el máximo de escrituras directas para este turno.';
            break;
          }
          const outcome = await executeConfirmedAgentTool(call, {
            sessionId: agentSessionId,
            harnessType: harnessScope,
            agentKey: agentAuthorId ?? 'agent',
          });
          directWriteCount += 1;
          toolCalls.push({
            tool: outcome.tool,
            args: call.args,
            ok: outcome.ok,
            ...(outcome.ok ? {} : { error: outcome.error }),
          });

          try {
            await recordAgentToolCall({
              chatId,
              sessionId: agentSessionId,
              agentKey: agentAuthorId ?? 'agent',
              tool: outcome.tool,
              args: call.args,
              ok: outcome.ok,
              error: outcome.ok ? undefined : outcome.error,
            });
          } catch {
            // La traza no debe romper la respuesta.
          }

          const observation = summarizeConfirmedToolOutcome(outcome);
          if (!outcome.ok || !loopEnabled) {
            agentFinalText = observation;
            break;
          }
          if (step >= maxSteps || Date.now() - loopStartedAt > AGENT_LOOP_MAX_MS) {
            agentFinalText = observation;
            break;
          }

          loopMessages.push({ role: 'assistant', content: currentResult.text.trim() });
          loopMessages.push({
            role: 'user',
            content: `[Observación de la herramienta ${call.tool}]\n${observation}`,
          });
          const next = await callModel({ ...input, loopMessages: [...loopMessages] });
          if (!next.ok) {
            agentFinalText = `${observation}\n\nNo pude continuar el loop: ${next.message}`;
            break;
          }
          currentResult = next;
          continue;
        }

        // Escritura con confirmación: se persiste una propuesta y el loop termina.
        const requestedHarness =
          typeof call.args.harnessType === 'string' ? call.args.harnessType.trim() : '';
        const requestedActivity =
          typeof call.args.activity === 'string' ? call.args.activity.trim() : '';
        const wrongHarness = Boolean(harnessScope && requestedHarness && requestedHarness !== harnessScope);
        const wrongActivity = Boolean(
          harnessScope && requestedActivity && !isActivityForHarness(harnessScope, requestedActivity)
        );

        if (wrongHarness || wrongActivity) {
          agentFinalText = wrongHarness
            ? `Solo puedes asignar actividades del arnés \`${harnessScope}\`.`
            : `La actividad \`${requestedActivity}\` no pertenece al arnés \`${harnessScope}\`.`;
          break;
        }

        const proposalArgs = harnessScope ? { ...call.args, harnessType: harnessScope } : call.args;
        const summary = describeToolProposal({ tool: call.tool, args: proposalArgs });
        let createdProposal: { proposalId: string; expiresAt: number };
        try {
          createdProposal = await createAgentToolProposal({
            chatId,
            agentKey: agentAuthorId ?? '',
            tool: call.tool,
            args: proposalArgs,
            summary,
          });
        } catch (err) {
          return errorResponse(502, 'CONVEX_ERROR', 'No se pudo persistir la propuesta.', {
            retryable: true,
            details: err instanceof Error ? err.message : String(err),
          });
        }

        pendingProposal = {
          id: createdProposal.proposalId,
          expiresAt: createdProposal.expiresAt,
          tool: call.tool,
          arguments: proposalArgs,
          summary,
        };
        agentFinalText = [
          `Propongo ejecutar \`${call.tool}\`:`,
          summary,
          '',
          'No se ha ejecutado nada. Usa “Confirmar” para ejecutarlo o “Cancelar” para descartarlo.',
        ].join('\n');
        break;
      }
    }

    const turnMeta =
      mode === 'agent'
        ? buildTurnMeta({
            tools: toolCalls.map((call) => ({
              tool: call.tool,
              ok: call.ok,
              ...(call.error ? { error: call.error } : {}),
            })),
            proposal: pendingProposal !== null,
            mock: wantsMock,
          })
        : null;

    const parsed =
      mode === 'agent'
        ? { displayText: agentFinalText, architectPayload: null as Record<string, unknown> | null }
        : parseAvrilAssistantReply(result.text);
    const displayText = parsed.displayText;
    const architectPayload = parsed.architectPayload;

    try {
      await sendAgentMessage({
        chatId,
        content: displayText,
        authorId: agentAuthorId ?? 'AvrilAgent',
        ...(turnMeta ? { meta: turnMeta } : {}),
      });
    } catch (err) {
      return errorResponse(502, 'CONVEX_ERROR', 'Agent reply received but failed to persist.', {
        retryable: true,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    let ignitionReady = false;
    if (mode === 'architect' && architectPayload !== null) {
      const extracted = extractDraftFromArchitectPayload(architectPayload);
      if (extracted) {
        ignitionReady = extracted.nextStatus === 'ready';
        try {
          const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
          await upsertChatIgnitionDraft({
            organizationId,
            chatId,
            phase: extracted.phase,
            captured: extracted.captured,
            ignitionPrompt: extracted.ignitionPrompt,
            handoffPayload: extracted.handoffPayload,
            lastArchitectPayload: architectPayload,
            nextStatus: extracted.nextStatus,
          });
        } catch {
          /* draft persistence must not break chat */
        }
      }
    }

    if (mode === 'architect' && isFolderAgentBriefMessage(message)) {
      try {
        const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
        const capturedFromJson =
          architectPayload !== null &&
          typeof architectPayload.captured === 'object' &&
          architectPayload.captured !== null &&
          !Array.isArray(architectPayload.captured)
            ? (architectPayload.captured as Record<string, unknown>)
            : undefined;

        const h1Title = message.match(/^#\s+(.+)$/m)?.[1]?.trim().replace(/\s+/g, ' ');
        const h1Company =
          h1Title &&
          !/^agent\s*brief\b/i.test(h1Title) &&
          !/^(conservative|balanced|ambitious)$/i.test(h1Title)
            ? h1Title.slice(0, 56)
            : undefined;

        const ideaFromBrief =
          message.match(/^(?:company|venture|project|startup|idea)\s*(?:name)?\s*[:\-–]\s*(.+)$/im)?.[1]?.trim() ||
          message
            .split(/\n/)
            .map((l) => l.trim())
            .find(
              (l) =>
                l.length >= 4 &&
                !/^#+\s*/.test(l) &&
                !/^\*\*.+\*\*:?\s*$/.test(l) &&
                !/^[A-Za-z][\w\s/()&-]{2,70}:\s*$/.test(l) &&
                !/^agent\s*brief\b/i.test(l.replace(/^#+\s*/, '')),
            );

        const companyGuess =
          (typeof capturedFromJson?.companyName === 'string' && capturedFromJson.companyName.trim()) ||
          h1Company ||
          (typeof capturedFromJson?.rawIdea === 'string' && capturedFromJson.rawIdea.trim()) ||
          ideaFromBrief;

        await upsertChatIgnitionDraft({
          organizationId,
          chatId,
          phase: 'handoff_ready',
          captured: {
            ...(capturedFromJson ?? {}),
            ...(companyGuess
              ? {
                  companyName:
                    (typeof capturedFromJson?.companyName === 'string' && capturedFromJson.companyName.trim()) ||
                    companyGuess.slice(0, 56),
                  rawIdea:
                    (typeof capturedFromJson?.rawIdea === 'string' && capturedFromJson.rawIdea.trim()) ||
                    companyGuess,
                }
              : {}),
          },
          ignitionPrompt: message,
          handoffPayload: {
            kind: 'chat_intake_brief_v1',
            ...(companyGuess ? { companyName: companyGuess.slice(0, 56) } : {}),
            intakeSource: 'chat_intake',
          },
          lastArchitectPayload: architectPayload ?? undefined,
          nextStatus: 'ready',
        });
        ignitionReady = true;
      } catch {
        /* draft persistence must not break chat */
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      chatId,
      ...(agentAuthorId ? { agentKey: agentAuthorId } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(pendingProposal ? { requiresConfirmation: true, proposal: pendingProposal } : {}),
      ...(turnMeta ? { meta: turnMeta } : {}),
      provider,
      reply: displayText,
      ...(mode === 'architect' && architectPayload !== null ? { architectPayload } : {}),
      ...(ignitionReady ? { ignitionReady: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return errorResponse(500, 'INTERNAL_ERROR', message, { retryable: true });
  }
}
