'use client';

import { useSyncExternalStore } from 'react';

/**
 * The single answer to "how much motion is this visitor allowed?".
 *
 * Replaces three mechanisms that used to disagree: the `html.save-data` class,
 * the `(pointer: coarse) and (max-width: 768px)` CSS block, and
 * `lightFx = !!reduceMotion || coarsePointer` inside WaveformPlayerInner.
 *
 *   'none'  — prefers-reduced-motion. The a11y floor; beats everything.
 *   'light' — save-data or coarse-pointer mobile. Animations stay; filter chains go.
 *   'full'  — everything.
 *
 * Also mirrors itself onto <html data-motion-tier="…"> so CSS branches on the
 * same decision. Two rules for consumers of that attribute:
 *
 *  1. Only ever key CSS on the RESTRICTIVE tiers ([data-motion-tier="light"] /
 *     ="none"). The attribute is absent on the first paint, so gating the default
 *     path behind ="full" would flash one unstyled frame at full-tier visitors.
 *  2. This does NOT replace the `@media (prefers-reduced-motion: reduce)` block in
 *     globals.css. That one must keep working before hydration and with JS off.
 */
export type MotionTier = 'full' | 'light' | 'none';

const Q = {
  reduce: '(prefers-reduced-motion: reduce)',
  coarse: '(pointer: coarse) and (max-width: 768px)',
} as const;

function compute(): MotionTier {
  if (window.matchMedia(Q.reduce).matches) return 'none';
  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData || window.matchMedia(Q.coarse).matches) return 'light';
  return 'full';
}

let cached: MotionTier | null = null;
const listeners = new Set<() => void>();
let mqls: MediaQueryList[] | null = null;

function onChange() {
  const next = compute();
  if (next === cached) return;
  cached = next;
  document.documentElement.dataset.motionTier = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);

  if (listeners.size === 1) {
    mqls = Object.values(Q).map((q) => window.matchMedia(q));
    for (const m of mqls) m.addEventListener('change', onChange);
    // Stamp the attribute on first subscribe. cached is already warm from
    // getSnapshot, so force the write rather than relying on onChange's diff.
    cached = compute();
    document.documentElement.dataset.motionTier = cached;
  }

  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && mqls) {
      for (const m of mqls) m.removeEventListener('change', onChange);
      mqls = null;
    }
  };
}

const getSnapshot = (): MotionTier => (cached ??= compute());

// The server cannot know the client's preference. 'full' matches the SSR markup;
// the CSS media query covers reduced-motion visitors until hydration.
const getServerSnapshot = (): MotionTier => 'full';

export function useMotionTier(): MotionTier {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Mounts the tier as an <html> attribute for CSS. Render once, near the root —
 * pages whose components never call useMotionTier still need the attribute set.
 */
export function MotionTierSync(): null {
  useMotionTier();
  return null;
}
