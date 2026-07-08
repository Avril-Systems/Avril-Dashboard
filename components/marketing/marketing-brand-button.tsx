import Link from 'next/link';
import { cn } from '@/lib/utils';

type MarketingBrandButtonProps = {
  label: string;
  href?: string;
  className?: string;
  onClick?: () => void;
};

const buttonClassName =
  'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium bg-brand text-white shadow-[0_0_24px_rgba(0,153,175,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]';

export function MarketingBrandButton({ label, href, className, onClick }: MarketingBrandButtonProps) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(buttonClassName, className)}>
        {label}
      </button>
    );
  }

  return (
    <Link href={href ?? '/get-started'} className={cn(buttonClassName, className)}>
      {label}
    </Link>
  );
}
