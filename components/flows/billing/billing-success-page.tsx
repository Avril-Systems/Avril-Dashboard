'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { useLanguage } from '@/components/marketing/language-context';
import { fetchWalletSession } from '@/src/lib/establishWalletSession';
import { rememberOfficeSessionId } from '@/src/lib/officeSessionMemory';

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

  useEffect(() => {
    if (!sessionId) {
      setState('failed');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const [verifyRes, walletSession] = await Promise.all([
          fetch(`/api/billing/verify?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }),
          fetchWalletSession(),
        ]);

        const data = (await verifyRes.json()) as {
          ok?: boolean;
          paid?: boolean;
          companyName?: string;
          ideaId?: string | null;
          opportunityId?: string | null;
        };

        if (!verifyRes.ok || !data.ok || !data.paid) {
          setState('failed');
          return;
        }

        const name = data.companyName || '';
        const linkedIdeaId = data.ideaId || walletSession?.luckIdeaId || undefined;

        let deploy: DeployResult = {};
        try {
          const deployRes = await fetch('/api/deploy/launch', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              opportunityId: data.opportunityId ?? undefined,
            }),
          });
          deploy = (await deployRes.json().catch(() => ({}))) as DeployResult;
        } catch {
          deploy = { error: { message: 'Could not start the company deploy.' } };
        }

        if (cancelled) return;

        setCompanyName(name);
        setIdeaId(linkedIdeaId);

        if (deploy.ok && deploy.orchestrationSessionId) {
          deployRef.current = {
            deploymentId: deploy.deploymentId ?? null,
            orchestrationSessionId: deploy.orchestrationSessionId,
          };
          setCompanyId(deploy.companyId ?? null);
          setState('creating');
          return;
        }

        if (deploy.ok) {
          setCompanyId(deploy.companyId ?? null);
          setState('creating');
          return;
        }

        if (deploy.error?.message) setDeployError(deploy.error.message);
        setState('failed');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();

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
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/get-started" className="text-sm text-brand hover:underline">
              {language === 'es' ? 'Volver a oportunidades' : 'Back to opportunities'}
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
