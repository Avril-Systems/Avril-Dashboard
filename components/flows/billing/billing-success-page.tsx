'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { FlowDashboard } from '@/components/flows/shared/flow-dashboard';
import { CompanyCreating } from '@/components/flows/shared/company-creating';
import { useLanguage } from '@/components/marketing/language-context';
import { fetchWalletSession } from '@/src/lib/establishWalletSession';

export function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { language } = useLanguage();
  const [state, setState] = useState<'loading' | 'creating' | 'dashboard' | 'failed'>('loading');
  const [companyName, setCompanyName] = useState('');
  const [ideaId, setIdeaId] = useState<string | undefined>();

  useEffect(() => {
    if (!sessionId) {
      setState('failed');
      return;
    }

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
        };

        if (!verifyRes.ok || !data.ok || !data.paid) {
          setState('failed');
          return;
        }

        setCompanyName(data.companyName || '');
        setIdeaId(walletSession?.luckIdeaId);
        setState('creating');
      } catch {
        setState('failed');
      }
    })();
  }, [sessionId]);

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
            {language === 'es' ? 'No pudimos verificar el pago' : 'We could not verify payment'}
          </h1>
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
        <CompanyCreating
          companyName={companyName || (language === 'es' ? 'Tu empresa' : 'Your company')}
          onComplete={() => setState('dashboard')}
        />
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
