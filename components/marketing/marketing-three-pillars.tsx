'use client';

import { Rocket, Sparkles, Radar } from 'lucide-react';
import { useLanguage } from './language-context';
import { GlassPanel } from '@/components/patterns/glass-panel';

const PILLAR_ICONS = [Sparkles, Rocket, Radar];

export function MarketingThreePillars() {
  const { t } = useLanguage();
  const p = t.pillars;

  return (
    <section id="pillars" className="border-b border-border bg-background py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center md:mb-12">
          <p className="text-xs font-medium uppercase tracking-widest text-brand">{p.label}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{p.title}</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {p.items.map((pillar, index) => {
            const Icon = PILLAR_ICONS[index] ?? Sparkles;
            return (
              <GlassPanel key={pillar.title} className="group flex flex-col gap-4 p-6 transition-colors hover:bg-surface/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised">
                  <Icon size={20} className="text-brand" />
                </div>
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">{pillar.title}</h3>
                  <ul className="space-y-2">
                    {pillar.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand/50" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      </div>
    </section>
  );
}
