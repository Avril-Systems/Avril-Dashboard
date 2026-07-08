'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

type PointerFollowOffsets = {
  offsetX: number;
  offsetY: number;
  angleDelta: number;
  glowBoost: number;
};

const ZERO_OFFSETS: PointerFollowOffsets = {
  offsetX: 0,
  offsetY: 0,
  angleDelta: 0,
  glowBoost: 0,
};

type UseHeatmapPointerFollowOptions = {
  enabled?: boolean;
  /** Max shader offset (-1..1 scale) */
  influence?: number;
  /** 0..1 — lower = smoother lag */
  smoothing?: number;
  /** Extra degrees added to heatmap angle from horizontal pointer */
  angleInfluence?: number;
  /** Max added inner/outer glow from pointer proximity */
  glowBoost?: number;
};

export function useHeatmapPointerFollow(
  containerRef: RefObject<HTMLElement | null>,
  {
    enabled = true,
    influence = 0.06,
    smoothing = 0.04,
    angleInfluence = 6,
    glowBoost = 0.03,
  }: UseHeatmapPointerFollowOptions = {},
): PointerFollowOffsets {
  const [offsets, setOffsets] = useState<PointerFollowOffsets>(ZERO_OFFSETS);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      setOffsets(ZERO_OFFSETS);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;

      targetRef.current = {
        x: (nx - 0.5) * 2 * influence,
        y: -(ny - 0.5) * 2 * influence,
      };
    };

    const handlePointerLeave = () => {
      targetRef.current = { x: 0, y: 0 };
    };

    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    let frame = 0;
    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;

      current.x += (target.x - current.x) * smoothing;
      current.y += (target.y - current.y) * smoothing;

      const dist = Math.hypot(current.x, current.y);
      const normalizedInfluence = Math.min(1, dist / Math.max(influence, 0.001));

      setOffsets({
        offsetX: current.x,
        offsetY: current.y,
        angleDelta: current.x * angleInfluence,
        glowBoost: normalizedInfluence * glowBoost,
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(frame);
      targetRef.current = { x: 0, y: 0 };
      currentRef.current = { x: 0, y: 0 };
      setOffsets(ZERO_OFFSETS);
    };
  }, [angleInfluence, containerRef, enabled, glowBoost, influence, smoothing]);

  return offsets;
}
