'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FlowShell } from '@/components/flows/shared/flow-shell';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';

export function BillingCancelPage() {
  const searchParams = useSearchParams();
  const company = searchParams.get('company');
  const flow = searchParams.get('flow');
  const { language } = useLanguage();

  const resumeHref = flow === 'idea' ? '/start/idea' : '/get-started';

  return (
    <FlowShell>
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-2xl md:text-3xl">
          {language === 'es' ? 'Pago cancelado' : 'Payment canceled'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {language === 'es'
            ? `No se completó el checkout${company ? ` para ${company}` : ''}. Puedes volver al paso de deploy cuando quieras.`
            : `Checkout was not completed${company ? ` for ${company}` : ''}. You can return to deploy whenever you're ready.`}
        </p>
        <MarketingBrandButton
          label={language === 'es' ? 'Volver al deploy' : 'Back to deploy'}
          href={resumeHref}
        />
        <p className="text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            {language === 'es' ? 'Volver al inicio' : 'Back to home'}
          </Link>
        </p>
      </div>
    </FlowShell>
  );
}
