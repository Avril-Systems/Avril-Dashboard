import { cn } from '@/lib/utils';

type GlassPanelProps = {
  className?: string;
  children: React.ReactNode;
  showBrandLine?: boolean;
};

export function GlassPanel({ className, children, showBrandLine = true }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/70',
        'bg-surface/60 backdrop-blur-xl',
        'shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_20px_50px_oklch(0_0_0/0.35)]',
        className
      )}
    >
      {showBrandLine && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
        />
      )}
      {children}
    </div>
  );
}
