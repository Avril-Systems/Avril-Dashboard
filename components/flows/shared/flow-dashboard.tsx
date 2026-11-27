'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';

type FlowDashboardProps = {
  companyName: string;
  ideaId?: string;
  sessionId?: string;
  onRestart: () => void;
};

/**
 * Cierre del flujo de fundador. No muestra métricas: no hay datos reales de
 * agentes/aprobaciones/health/ingresos en este punto. Solo confirma la sesión y
 * lleva a las superficies reales (Agent Office y Runs).
 */
export function FlowDashboard({ companyName, ideaId, sessionId, onRestart }: FlowDashboardProps) {
  const { t } = useLanguage();
  const d = t.flow.dashboard;
  const dashboardHref = sessionId
    ? `/agents/office?sessionId=${encodeURIComponent(sessionId)}`
    : '/agents/office';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-3xl space-y-8 text-center"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-2xl text-brand">
        ✓
      </div>
      <div className="space-y-3">
        <h2 className="text-3xl tracking-tight md:text-4xl">{d.title}</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">{d.subtitle}</p>
        <p className="text-sm font-medium text-brand">{companyName}</p>
        {ideaId && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Idea · {ideaId.slice(0, 12)}…
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <MarketingBrandButton label={d.cta} href={dashboardHref} />
        <Link href="/agents/swarmy" className="text-sm text-brand hover:underline">
          {d.runsCta}
        </Link>
        <button type="button" onClick={onRestart} className="text-sm text-brand hover:underline">
          {d.restart}
        </button>
        <Link href="/" className="text-xs text-muted-foreground/70 hover:text-foreground">
          {t.flow.backHome}
        </Link>
      </div>
    </motion.div>
  );
}
