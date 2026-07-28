'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Activity, Bot, DollarSign, Shield } from 'lucide-react';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { GlassPanel } from '@/components/patterns/glass-panel';

type FlowDashboardProps = {
  companyName: string;
  ideaId?: string;
  sessionId?: string;
  onRestart: () => void;
};

export function FlowDashboard({ companyName, ideaId, sessionId, onRestart }: FlowDashboardProps) {
  const { t } = useLanguage();
  const d = t.flow.dashboard;
  const dashboardHref = sessionId
    ? `/agents/office?sessionId=${encodeURIComponent(sessionId)}`
    : '/agents/office';

  const stats = [
    { label: d.stats.agents, value: '4', icon: Bot },
    { label: d.stats.approvals, value: '2', icon: Shield },
    { label: d.stats.health, value: '94%', icon: Activity },
    { label: d.stats.revenue, value: '3', icon: DollarSign },
  ];

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

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <GlassPanel key={stat.label} className="flex items-center gap-4 p-5 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised">
                <Icon size={18} className="text-brand" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                <p className="avril-stat-value text-2xl tabular-nums text-foreground">{stat.value}</p>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <MarketingBrandButton label={d.cta} href={dashboardHref} />
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
