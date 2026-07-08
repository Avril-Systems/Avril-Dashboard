import { cn } from '@/lib/utils';

type SectionBackdropProps = {
  variant?: 'hero' | 'footer';
  className?: string;
  children?: React.ReactNode;
  id?: string;
};

export function SectionBackdrop({
  variant = 'hero',
  className,
  children,
  id,
}: SectionBackdropProps) {
  const glow =
    variant === 'hero'
      ? 'radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.62 0.14 210 / 0.12) 0%, transparent 70%)'
      : 'radial-gradient(ellipse 70% 60% at 50% 100%, oklch(0.62 0.14 210 / 0.10) 0%, transparent 70%)';

  return (
    <section id={id} className={cn('relative overflow-hidden', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--avril-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--avril-grid-line) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: glow }}
      />
      <div className="relative z-10">{children}</div>
    </section>
  );
}
