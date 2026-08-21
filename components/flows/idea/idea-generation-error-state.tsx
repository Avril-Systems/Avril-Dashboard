'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { LiquidMetalShape } from '@/components/ui/liquid-metal-shape';
import { avrilColors } from '@/lib/avril-tokens';

export type IdeaGenerationErrorStateProps = {
  title?: string;
  description?: string;
  onEditIdea: () => void;
  onTryAgain: () => void;
  busy?: boolean;
};

export function IdeaGenerationErrorState({
  title = 'We need a bit more to work with.',
  description = "Avril couldn't turn your idea into a clear blueprint. Add more detail, or edit what you already wrote.",
  onEditIdea,
  onTryAgain,
  busy = false,
}: IdeaGenerationErrorStateProps) {
  return (
    <div className="relative mx-auto flex w-full max-w-3xl items-center justify-center py-16">
      <LiquidMetalShape
        variant="orbs"
        className="pointer-events-none fixed -bottom-16 -left-20 z-0 hidden h-[420px] w-[240px] opacity-60 lg:block xl:h-[480px] xl:w-[280px]"
        colorTint={avrilColors.brand}
        speed={0.5}
        scale={0.78}
      />

      <GlassPanel className="relative z-10 w-full max-w-lg space-y-6 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle size={26} className="text-amber-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-medium tracking-tight text-foreground md:text-3xl">{title}</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
            {description}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          <MarketingBrandButton label="Edit my idea" onClick={onEditIdea} disabled={busy} />
          <button
            type="button"
            onClick={onTryAgain}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
            Try again
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}

export default IdeaGenerationErrorState;