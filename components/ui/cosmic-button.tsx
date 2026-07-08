'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { avrilColors } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';

export type CosmicButtonProps<E extends 'a' | 'button' = 'a'> = {
  as?: E;
} & ComponentPropsWithoutRef<E>;

export function CosmicButton<E extends 'a' | 'button' = 'a'>({
  as,
  className,
  children,
  ...props
}: CosmicButtonProps<E>) {
  const Element = as ?? 'a';
  const isAnchor = Element === 'a';

  const baseClassName = cn(
    'group/cosmic relative inline-flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-[15px] p-[3px] transition-transform',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className
  );

  const content = (
    <>
      <span className="absolute inset-0 overflow-hidden rounded-[15px] transition-all duration-300 ease-out group-hover/cosmic:inset-[-3px]">
        <span
          className="absolute inset-[-200%] animate-cosmic-spin opacity-95"
          style={{
            background: `conic-gradient(from 0deg, ${avrilColors.brand}, #33cce0, ${avrilColors.shaderDeep}, ${avrilColors.accentLime}, ${avrilColors.brand})`,
          }}
        />
      </span>
      <span className="relative z-10 flex items-center gap-3 rounded-[12px] bg-muted px-5 py-2.5 shadow-lg transition-all duration-300 active:scale-[0.98]">
        <span className="text-base font-medium tracking-wide text-foreground">{children ?? 'Continue'}</span>
      </span>
    </>
  );

  if (isAnchor) {
    const { href, rel, target, ...rest } = props as ComponentPropsWithoutRef<'a'>;
    return (
      <a className={baseClassName} href={href ?? '#'} rel={rel ?? 'noopener noreferrer'} target={target} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button className={baseClassName} {...(props as ComponentPropsWithoutRef<'button'>)}>
      {content}
    </button>
  );
}
