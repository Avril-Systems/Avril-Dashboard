'use client';

import { useLanguage } from './language-context';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { LiquidMetalShape } from '@/components/ui/liquid-metal-shape';
import { avrilColors } from '@/lib/avril-tokens';

export function MarketingPricing() {
  const { t } = useLanguage();
  const p = t.pricing;

  return (
    <section id="pricing" className="relative overflow-hidden border-b border-border bg-[var(--avril-canvas)] py-16 md:py-20">
      <LiquidMetalShape
        variant="diamond"
        className="absolute -left-20 top-8 hidden h-[280px] w-[280px] opacity-60 lg:block xl:left-0"
        colorTint={avrilColors.shaderBlue}
        speed={0.45}
        scale={0.7}
        distortion={0.4}
        contour={0.45}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center md:mb-12">
          <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{p.label}</p>
          <h2 className="mt-2 text-3xl tracking-tight md:text-4xl">{p.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{p.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {p.plans.map((plan) => (
            <GlassPanel key={plan.name} className="flex flex-col gap-3 p-5">
              <p className="font-heading text-sm font-semibold text-foreground">{plan.name}</p>
              <p className="avril-stat-value text-2xl text-brand">
                {plan.price}
                <span className="block text-xs font-normal text-muted-foreground">{plan.interval}</span>
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
            </GlassPanel>
          ))}
        </div>
      </div>
    </section>
  );
}
