'use client';

import { motion } from 'framer-motion';
import { Bot, Gauge, Target, Zap } from 'lucide-react';
import { CosmicButton } from '@/components/ui/cosmic-button';
import { useLanguage } from '@/components/marketing/language-context';
import { cn } from '@/lib/utils';
import type { Opportunity } from './types';

type OpportunityCardProps = {
  opportunity: Opportunity;
  index: number;
  onSelect: (opportunity: Opportunity) => void;
};

function difficultyColor(difficulty: Opportunity['difficulty']) {
  switch (difficulty) {
    case 'low':
      return 'text-emerald-400';
    case 'medium':
      return 'text-amber-400';
    case 'high':
      return 'text-rose-400';
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed text-foreground/90">{value}</p>
    </div>
  );
}

export function OpportunityCard({ opportunity, index, onSelect }: OpportunityCardProps) {
  const { t } = useLanguage();
  const c = t.flow.cards;

  const difficultyLabel =
    opportunity.difficulty === 'low'
      ? c.difficultyLow
      : opportunity.difficulty === 'medium'
        ? c.difficultyMedium
        : c.difficultyHigh;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: 'easeOut' }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border/70',
        'bg-surface/60 backdrop-blur-xl',
        'shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_20px_50px_oklch(0_0_0/0.35)]'
      )}
    >
      <div className="flex flex-1 flex-col gap-6 p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-brand">{opportunity.type}</p>
            <h3 className="text-xl tracking-tight text-foreground md:text-2xl">{opportunity.name}</h3>
          </div>
          <div className="shrink-0 rounded-xl border border-brand/25 bg-brand/10 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.opportunityScore}</p>
            <p className="avril-stat-value text-lg tabular-nums text-brand">{opportunity.score}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={c.idealCustomer} value={opportunity.idealClient} />
          <Field label={c.problem} value={opportunity.problem} />
          <Field label={c.initialOffer} value={opportunity.offer} />
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{c.requiredAgents}</p>
            <div className="flex flex-wrap gap-1.5">
              {opportunity.agents.map((agent) => (
                <span
                  key={agent}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-raised/80 px-2.5 py-1 text-xs text-foreground/85"
                >
                  <Bot size={12} className="text-brand" />
                  {agent}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl border border-border/60 bg-surface-raised/50 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <Zap size={12} />
              {c.monetizationSpeed}
            </div>
            <p className="text-sm font-medium">{opportunity.monetizationSpeed}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface-raised/50 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <Gauge size={12} />
              {c.difficulty}
            </div>
            <p className={cn('text-sm font-medium', difficultyColor(opportunity.difficulty))}>{difficultyLabel}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center border-t border-border/50 bg-surface/40 px-6 py-5">
        <CosmicButton
          as="button"
          type="button"
          onClick={() => onSelect(opportunity)}
          className="w-full sm:w-auto"
        >
          <span className="inline-flex items-center gap-2">
            <Target size={14} />
            {c.choose}
          </span>
        </CosmicButton>
      </div>
    </motion.article>
  );
}
