'use client';

import { useEffect, useState } from 'react';
import { useMotionTier } from './useMotionTier';

/**
 * Ramps an integer 0 → `target` over `durationMs`, on requestAnimationFrame.
 *
 * Linear on purpose: a counter ramping is a mechanical readout, and easing it
 * would be decoration on top of decoration.
 *
 * Replaces lib/useFillAnimation.ts, which stepped on a 50ms setInterval it never
 * cleared — so it ran a 20Hz setState loop for the life of the page, re-armed
 * every time its target changed.
 */
export function useCountUp(target: number, durationMs: number): number {
  const tier = useMotionTier();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (tier === 'none' || durationMs <= 0 || target === 0) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (target - from) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, tier]);

  return value;
}
