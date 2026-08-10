'use client';

import { Radar, Sparkles, Rocket } from 'lucide-react';
import { useLanguage } from './language-context';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { LiquidMetalShape } from '@/components/ui/liquid-metal-shape';
import { avrilColors } from '@/lib/avril-tokens';

const PILLAR_ICONS = [Radar, Sparkles, Rocket];

export function MarketingThreePillars() {
  const { t } = useLanguage();
  const p = t.pillars;

  return (
    <section id="pillars" className="relative overflow-hidden border-b border-border bg-background py-16 md:py-20">
      <LiquidMetalShape
        variant="orbs"
        className="absolute -right-16 top-1/2 hidden h-[420px] w-[220px] -translate-y-1/2 opacity-70 lg:block xl:-right-8 xl:h-[480px] xl:w-[260px]"
        colorTint={avrilColors.brand}
        speed={0.55}
        scale={0.78}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center md:mb-12">
          <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{p.label}</p>
          <h2 className="mt-2 text-3xl tracking-tight md:text-4xl">{p.title}</h2>
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
                  <h3 className="mb-2 text-lg text-foreground">{pillar.title}</h3>
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{pillar.description}</p>
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
