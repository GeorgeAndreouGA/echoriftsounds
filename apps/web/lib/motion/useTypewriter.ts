'use client';

import { useEffect, useState } from 'react';
import { useMotionTier } from './useMotionTier';

/**
 * Reveals `text` at `cps` characters per second, on requestAnimationFrame.
 *
 * Returns the character COUNT, not a string — callers slice their own text. That
 * keeps a multi-line wordmark one animation with one clock, rather than one timer
 * per line racing the others.
 *
 * Self-terminating: the rAF loop stops once the text is complete, instead of the
 * setInterval it replaced, which kept ticking after it had nothing left to do.
 */
export function useTypewriter(text: string, cps: number): number {
  const tier = useMotionTier();
  const [chars, setChars] = useState(0);

  useEffect(() => {
    // Reduced motion gets the end state immediately. WCAG 2.3.3 asks for the
    // result, not a politely slower version of the animation.
    if (tier === 'none') {
      setChars(text.length);
      return;
    }

    const rate = tier === 'light' ? cps * 2 : cps;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const n = Math.min(text.length, Math.floor(((now - start) / 1000) * rate));
      setChars(n);
      if (n < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [text, cps, tier]);

  return chars;
}
