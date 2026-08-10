'use client';

import * as React from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

import { cn } from '@/lib/utils';
import { avrilColors } from '@/lib/avril-tokens';

const MemoizedLiquidMetal = React.memo(LiquidMetal);

/** Multi-orb silhouette — spheres / droplet cluster */
const ORBS_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjYwIiBoZWlnaHQ9IjQ3OCIgdmlld0JveD0iMCAwIDI2MCA0NzgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0xMzAgMjE2Ljg5NkMxMDYuMTA2IDIxNi44OTYgODYuNjY2NyAxOTcuNDU3IDg2LjY2NjcgMTczLjU2M0M4Ni42NjY3IDE0OS42NjkgMTA2LjEwNiAxMzAuMjMgMTMwIDEzMC4yM0MxNTMuODk0IDEzMC4yMyAxNzMuMzMzIDE0OS42NjkgMTczLjMzMyAxNzMuNTYzQzE3My4zMzMgMTk3LjQ1NyAxNTMuODk0IDIxNi44OTYgMTMwIDIxNi44OTZaTTEzMCAzOTAuNjlDMTUzLjg5NCAzOTAuNjkgMTczLjMzMyA0MTAuMTI5IDE3My4zMzMgNDM0LjAyM0MxNzMuMzMzIDQ1Ny45MTcgMTUzLjg5NCA0NzcuMzU2IDEzMCA0NzcuMzU2QzEwNi4xMDYgNDc3LjM1NiA4Ni42NjY3IDQ1Ny45MTcgODYuNjY2NyA0MzQuMDIzQzg2LjY2NjcgNDEwLjEyOSAxMDYuMTA2IDM5MC42OSAxMzAgMzkwLjY5Wk0yMTYuNjY3IDg2LjY2NjdDMTkyLjc3MiA4Ni42NjY3IDE3My4zMzMgNjcuMjI3NyAxNzMuMzMzIDQzLjMzMzNDMTczLjMzMyAxOS40MzkgMTkyLjc3MiAwIDIxNi42NjcgMEMyNDAuNTYxIDAgMjYwIDE5LjQzOSAyNjAgNDMuMzMzM0MyNjAgNjcuMjI3NyAyNDAuNTYxIDg2LjY2NjcgMjE2LjY2NyA4Ni42NjY3Wk0yMTYuNjY3IDI2MC40NTlDMjQwLjU2MSAyNjAuNDU5IDI2MCAyNzkuODk4IDI2MCAzMDMuNzkzQzI2MCAzMjcuNjg3IDI0MC41NjEgMzQ3LjEyNiAyMTYuNjY3IDM0Ny4xMjZDMTkyLjc3MiAzNDcuMTI2IDE3My4zMzMgMzI3LjY4NyAxNzMuMzMzIDMwMy43OTNDMTczLjMzMyAyNzkuODk4IDE5Mi43NzIgMjYwLjQ1OSAyMTYuNjY3IDI2MC40NTlaTTQzLjMzMzMgODYuNjY2N0MxOS40MzkgODYuNjY2NyAwIDY3LjIyNzcgMCA0My4zMzMzQzAgMTkuNDM5IDE5LjQzOSAwIDQzLjMzMzMgMEM2Ny4yMjc3IDAgODYuNjY2NyAxOS40MzkgODYuNjY2NyA0My4zMzMzQzg2LjY2NjcgNjcuMjI3NyA2Ny4yMjc3IDg2LjY2NjcgNDMuMzMzMyA4Ni42NjY3Wk00My4zMzMzIDI2MC40NTlDNjcuMjI3NyAyNjAuNDU5IDg2LjY2NjcgMjc5Ljg5OCA4Ni42NjY3IDMwMy43OTNDODYuNjY2NyAzMjcuNjg3IDY3LjIyNzcgMzQ3LjEyNiA0My4zMzMzIDM0Ny4xMjZDMTkuNDM5IDM0Ny4xMjYgMCAzMjcuNjg3IDAgMzAzLjc5M0MwIDI3OS44OTggMTkuNDM5IDI2MC40NTkgNDMuMzMzMyAyNjAuNDU5WiIgZmlsbD0iYmxhY2siLz4KPC9zdmc+';

const DIAMOND_IMAGE = 'https://shaders.paper.design/images/logos/diamond.svg';

/** Soft concentric rings for a ripple / pool look */
const RINGS_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjU2IiBjeT0iMjU2IiByPSIyMjAiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMjgiIGZpbGw9Im5vbmUiLz48Y2lyY2xlIGN4PSIyNTYiIGN5PSIyNTYiIHI9IjE2MCIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyOCIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjI1NiIgY3k9IjI1NiIgcj0iMTAwIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjI4IiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjU2IiBjeT0iMjU2IiByPSI0MCIgZmlsbD0iYmxhY2siLz48L3N2Zz4=';

export type LiquidMetalShapeVariant = 'orbs' | 'diamond' | 'rings';

const VARIANT_IMAGE: Record<LiquidMetalShapeVariant, string> = {
  orbs: ORBS_IMAGE,
  diamond: DIAMOND_IMAGE,
  rings: RINGS_IMAGE,
};

export type LiquidMetalShapeProps = {
  variant?: LiquidMetalShapeVariant;
  className?: string;
  /** Tint color for the metal sheen */
  colorTint?: string;
  speed?: number;
  scale?: number;
  repetition?: number;
  softness?: number;
  distortion?: number;
  contour?: number;
  shiftRed?: number;
  shiftBlue?: number;
};

/**
 * Decorative LiquidMetal accent — reusable across marketing surfaces.
 * Keep instances sparse (WebGL); prefer 1–2 visible at a time.
 */
export function LiquidMetalShape({
  variant = 'orbs',
  className,
  colorTint = avrilColors.brand,
  speed = 0.7,
  scale = 0.72,
  repetition = 6,
  softness = 0.85,
  distortion = 0.35,
  contour = 0.4,
  shiftRed = 1,
  shiftBlue = -1,
}: LiquidMetalShapeProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none relative overflow-hidden', className)}
      data-slot="liquid-metal-shape"
      data-variant={variant}
    >
      <MemoizedLiquidMetal
        width={640}
        height={640}
        image={VARIANT_IMAGE[variant]}
        colorBack="#ffffff00"
        colorTint={colorTint}
        repetition={repetition}
        softness={softness}
        shiftRed={shiftRed}
        shiftBlue={shiftBlue}
        distortion={distortion}
        contour={contour}
        angle={0}
        speed={speed}
        scale={scale}
        fit="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

export default LiquidMetalShape;
