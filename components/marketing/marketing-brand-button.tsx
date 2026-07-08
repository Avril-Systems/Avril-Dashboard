'use client';

import { LiquidMetalButton, type LiquidMetalButtonProps } from '@/components/ui/liquid-metal-button';

type MarketingBrandButtonProps = Pick<
  LiquidMetalButtonProps,
  'label' | 'href' | 'className' | 'onClick' | 'disabled' | 'size' | 'motion'
>;

/** Primary CTA — metallic shader border (see LiquidMetalButton). */
export function MarketingBrandButton({
  label,
  href,
  className,
  onClick,
  disabled,
  size = 'auto',
  motion = 'default',
}: MarketingBrandButtonProps) {
  return (
    <LiquidMetalButton
      label={label}
      href={href}
      onClick={onClick}
      className={className}
      disabled={disabled}
      size={size}
      motion={motion}
    />
  );
}
