'use client';

import { useEffect, useRef, useState } from 'react';

const STEP_MS = 50; // 8 cells × 50ms ≈ 400ms full fill — matches the CRT loading-bar feel.

/**
 * Animates an integer "filled" count toward `target` one cell per STEP_MS tick.
 * - mode 'always' animates on every target change.
 * - mode 'once' animates only the first time it reaches its target; after that it snaps.
 */
export function useFillAnimation(target: number, mode: 'always' | 'once'): number {
  const [filled, setFilled] = useState(0);
  const oneShotDone = useRef(false);

  useEffect(() => {
    if (mode === 'once' && oneShotDone.current) {
      setFilled(target);
      return;
    }

    const id = setInterval(() => {
      setFilled((cur) => {
        if (cur === target) {
          if (mode === 'once') oneShotDone.current = true;
          return cur;
        }
        return cur < target ? cur + 1 : cur - 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [target, mode]);

  return filled;
}
