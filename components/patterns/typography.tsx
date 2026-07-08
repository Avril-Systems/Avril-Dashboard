import { cn } from '@/lib/utils';
import { avrilTypography } from '@/lib/avril-tokens';

type TypographyProps = {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
};

export function DisplayTitle({ children, className, as: Tag = 'h1' }: TypographyProps) {
  return <Tag className={cn(avrilTypography.display, className)}>{children}</Tag>;
}

export function SectionTitle({ children, className, as: Tag = 'h2' }: TypographyProps) {
  return <Tag className={cn(avrilTypography.section, className)}>{children}</Tag>;
}

export function CardTitle({ children, className, as: Tag = 'h3' }: TypographyProps) {
  return <Tag className={cn(avrilTypography.card, className)}>{children}</Tag>;
}

export function KickerLabel({ children, className, as: Tag = 'p' }: TypographyProps) {
  return <Tag className={cn(avrilTypography.kicker, 'text-brand', className)}>{children}</Tag>;
}

export { avrilTypography };
