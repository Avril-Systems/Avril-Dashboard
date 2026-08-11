'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { useLanguage } from '@/components/marketing/language-context';
import { fetchWalletSession } from '@/src/lib/establishWalletSession';
import { rememberOfficeSessionId } from '@/src/lib/officeSessionMemory';
import {
  clearRedeemCheckout,
  readRedeemCheckout,
  updateRedeemCheckout,
  writeRedeemCheckout,
} from '@/src/lib/checkoutRedeem';

type DeployResult = {
  ok?: boolean;
  companyId?: string | null;
  deploymentId?: string | null;
  orchestrationSessionId?: string | null;
  status?: string | null;
  message?: string | null;
  error?: { code?: string; message?: string; retryable?: boolean; action?: string };
};

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 36;

type DeployLaunchOutcome = { deploy: DeployResult; companyName: string; ideaId?: string; planId?: string };

// Single-flight: React 18 StrictMode double-invokes effects in dev, which would otherwise fire
// two concurrent POST /api/deploy/launch (the losing one gets 409 IDEA_NO_DISPONIBLE and the idea
// was already acquired by the winner). Keyed by Stripe session_id, dropped once settled so a real
// refresh can retry (server-side dedup in /api/deploy/launch handles that case safely).
const deployLaunchTasks = new Map<string, Promise<DeployLaunchOutcome>>();

function getDeployLaunchTask(sessionId: string): Promise<DeployLaunchOutcome> {
  let task = deployLaunchTasks.get(sessionId);
  if (!task) {
    task = (async () => {
      const [verifyRes, walletSession] = await Promise.all([
        fetch(`/api/billing/verify?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }),
        fetchWalletSession(),
      ]);

      const data = (await verifyRes.json()) as {
        ok?: boolean;
        paid?: boolean;
        companyName?: string;
        planId?: string;
        ideaId?: string | null;
        opportunityId?: string | null;
      };

      if (!verifyRes.ok || !data.ok || !data.paid) {
        throw new Error('Payment is not verified.');
      }

      // Opción R redeem: if this paid session is a replayed checkout after a 409,
      // the user already picked a new idea (stored client-side). That override must
      // win over the Stripe metadata (which still holds the first, failed idea).
      const redeem = readRedeemCheckout();
      const reusing = redeem !== null && redeem.sessionId === sessionId;
      const name =
        (reusing && (redeem.companyName || data.companyName)) || data.companyName || '';
      const overriddenOpportunityId =
        (reusing && (redeem.opportunityId || data.opportunityId)) || data.opportunityId;
      const linkedIdeaId = data.ideaId || walletSession?.luckIdeaId || undefined;

      // Allow E2E simulation without a real Launch conflict: ?simulate=409 makes
      // /api/deploy/launch answer a fake IDEA_NO_DISPONIBLE so we can test the
      // "choose another idea" redeem flow end-to-end.
      const simulate = new URLSearchParams(window.location.search).get('simulate');

      let deploy: DeployResult = {};
      try {
        const qs = simulate ? `?simulate=${encodeURIComponent(simulate)}` : '';
        const deployRes = await fetch(`/api/deploy/launch${qs}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            opportunityId: overriddenOpportunityId ?? undefined,
            companyName: reusing ? name || undefined : undefined,
          }),
        });
        deploy = (await deployRes.json().catch(() => ({}))) as DeployResult;
      } catch {
        deploy = { error: { message: 'Could not start the company deploy.' } };
      }

      return { deploy, companyName: name, ideaId: linkedIdeaId, planId: data.planId };
    })();
    task.finally(() => deployLaunchTasks.delete(sessionId));
    deployLaunchTasks.set(sessionId, task);
  }
  return task;
}

export function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const router = useRouter();
  const { language } = useLanguage();
  const [state, setState] = useState<'loading' | 'creating' | 'dashboard' | 'failed'>('loading');
  const [companyName, setCompanyName] = useState('');
  const [ideaId, setIdeaId] = useState<string | undefined>();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const deployRef = useRef<{ deploymentId?: string | null; orchestrationSessionId?: string | null }>({});
  const pollAttemptRef = useRef(0);
  const [redeemActive, setRedeemActive] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setState('failed');
      return;
    }

    let cancelled = false;

    void getDeployLaunchTask(sessionId)
      .then(({ deploy, companyName: name, ideaId: linkedIdeaId, planId }) => {
        if (cancelled) return;

        setCompanyName(name);
        setIdeaId(linkedIdeaId);

        if (deploy.ok) {
          clearRedeemCheckout();
          if (deploy.orchestrationSessionId) {
            deployRef.current = {
              deploymentId: deploy.deploymentId ?? null,
              orchestrationSessionId: deploy.orchestrationSessionId,
            };
            setCompanyId(deploy.companyId ?? null);
            setState('creating');
            return;
          }

          setCompanyId(deploy.companyId ?? null);
          setState('creating');
          return;
        }

        // The idea the user paid for is no longer available (or a simulated 409).
        // Persist the paid session so the next opportunity reuses it (no new charge).
        if (deploy.error?.action === 'elegir_nueva_idea') {
          writeRedeemCheckout({ sessionId, planId: planId ?? '' });
          setRedeemActive(true);
          toast.error(deploy.error.message || 'La idea ya no está disponible. Elige otra empresa.', {
            description: 'Tu pago se reutilizará para la próxima oportunidad — no se te cobrará de nuevo.',
            duration: 8000,
          });
        } else if (deploy.error?.message) {
          toast.error(deploy.error.message);
        }

        if (deploy.error?.message) setDeployError(deploy.error.message);
        setState('failed');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const orchestrationSessionId = deployRef.current.orchestrationSessionId;
    if (state !== 'creating' || !orchestrationSessionId) return;
    const sessionId = orchestrationSessionId;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/deploy/status?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store', credentials: 'include' }
        );
        const data = (await res.json().catch(() => ({}))) as {
          status?: string | null;
          error?: string | null;
        };
        if (cancelled) return;

        const status = data.status ?? null;
        if (status) setDeployStatus(status);

        if (status === 'ready') {
          rememberOfficeSessionId(sessionId);
          router.push(`/agents/office?sessionId=${encodeURIComponent(sessionId)}`);
          return;
        }

        if (status === 'failed' || status === 'stale') {
          setDeployError(data.error || 'The deploy failed. Contact support.');
          setState('failed');
          return;
        }
      } catch {
        if (cancelled) return;
      }

      pollAttemptRef.current += 1;
      if (pollAttemptRef.current >= MAX_POLL_ATTEMPTS) {
        rememberOfficeSessionId(sessionId);
        router.push(`/agents/office?sessionId=${encodeURIComponent(sessionId)}`);
      }
    }

    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, router]);

  if (state === 'loading') {
    return (
      <FlowShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-muted-foreground">
            {language === 'es' ? 'Verificando pago con Stripe…' : 'Verifying Stripe payment…'}
          </p>
        </div>
      </FlowShell>
    );
  }

  if (state === 'failed') {
    return (
      <FlowShell>
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl md:text-3xl">
            {language === 'es' ? 'No pudimos iniciar el despliegue' : 'We could not start the deploy'}
          </h1>
          {deployError && <p className="text-sm text-rose-300">{deployError}</p>}
          <p className="text-sm text-muted-foreground">
            {language === 'es'
              ? 'Revisa tu sesión de Stripe o intenta de nuevo desde el flujo de deploy.'
              : 'Check your Stripe session or try again from the deploy step.'}
          </p>
          {redeemActive && (
            <GlassPanel className="space-y-2 p-4 text-center">
              <p className="text-sm font-medium text-amber-200">
                {language === 'es'
                  ? 'Tu pago ya está procesado y se reutilizará en la próxima oportunidad — no se te cobrará de nuevo.'
                  : 'Your payment is already processed and will be reused for the next opportunity — you will not be charged again.'}
              </p>
            </GlassPanel>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/get-started" className="text-sm text-brand hover:underline">
              {language === 'es' ? 'Elegir otra idea' : 'Choose another idea'}
            </Link>
            <Link href="/start/idea" className="text-sm text-brand hover:underline">
              {language === 'es' ? 'Volver a mi idea' : 'Back to my idea'}
            </Link>
          </div>
        </div>
      </FlowShell>
    );
  }

  if (state === 'creating') {
    return (
      <FlowShell>
        <div className="flex flex-col items-center gap-4">
          <CompanyCreating
            companyName={companyName || (language === 'es' ? 'Tu empresa' : 'Your company')}
            onComplete={() => {
              if (!deployRef.current.orchestrationSessionId) setState('dashboard');
            }}
            durationMs={180_000}
          />
          {deployStatus && (
            <p className="font-mono text-[11px] text-muted-foreground/70">
              Deploy · {deployStatus}
            </p>
          )}
          {companyId && (
            <p className="font-mono text-[11px] text-muted-foreground/70">
              {language === 'es' ? 'Empresa · ' : 'Company · '}
              {companyId}
            </p>
          )}
          {deployError && (
            <GlassPanel className="max-w-md space-y-2 p-4 text-center">
              <p className="text-sm font-medium text-rose-300">{deployError}</p>
              <p className="text-xs text-muted-foreground">
                {language === 'es'
                  ? 'El despliegue no pudo iniciarse. Revisa la configuración de Launch o intenta de nuevo.'
                  : 'The deploy could not start. Check Launch configuration or try again.'}
              </p>
            </GlassPanel>
          )}
        </div>
      </FlowShell>
    );
  }

  return (
    <FlowShell>
      <FlowDashboard
        companyName={companyName || (language === 'es' ? 'Tu empresa' : 'Your company')}
        ideaId={ideaId}
        onRestart={() => {
          window.location.href = '/get-started';
        }}
      />
    </FlowShell>
  );
}
