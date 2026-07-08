import { cn } from '@/lib/utils';

type EyebrowProps = {
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
};

export function Eyebrow({ children, className, pulse = false }: EyebrowProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/80 px-3 py-1 backdrop-blur-sm',
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-brand', pulse && 'animate-pulse')} />
      <span className="text-xs font-medium tracking-wide text-muted-foreground">{children}</span>
    </div>
  );
}
