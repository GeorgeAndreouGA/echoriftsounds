'use client';

import { useEffect, useState } from 'react';

/**
 * True when the device's primary pointer is coarse (touchscreen) AND the
 * viewport is small. Used to gate touch-only UI like the waveform scrub
 * overlay and to drop GPU-heavy filter animations on mobile.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse) and (max-width: 768px)');
    const update = () => setCoarse(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return coarse;
}
