'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Variants } from 'framer-motion';
import { STAGGER, s } from './tokens';
import { SPECS, type MotionSpec, type SpecKey } from './spec';
import { useMotionTier, type MotionTier } from '../../lib/motion/useMotionTier';

function strip(
  props: Record<string, string | number>,
  drop: readonly string[] = [],
): Record<string, string | number> {
  if (drop.length === 0) return { ...props };
  const out = { ...props };
  for (const p of drop) delete out[p];
  return out;
}

/**
 * Turn a spec into framer variants for a given tier.
 *
 * The 'none' branch is the reason this function exists. `<MotionConfig
 * reducedMotion="user">` only skips transform and layout animations — it leaves
 * filter, clipPath and opacity running. The reduced-motion guard in globals.css
 * doesn't catch them either: it clamps animation and transition durations, and
 * framer animates via inline styles on rAF. So without this branch, a
 * prefers-reduced-motion visitor still gets signalLoss's full-viewport
 * brightness(4) contrast(8) flash on every route change.
 *
 * Reduced motion gets the FINAL state immediately — not a slower wipe, not a
 * dimmer flash.
 *
 * Exported (rather than inlined into the hook) so the gallery generator can render
 * all three tiers from the same logic the app runs.
 */
export function toVariants(spec: MotionSpec, tier: MotionTier): Variants {
  if (tier === 'none') {
    return {
      hidden: { opacity: 1 },
      visible: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }

  const drop = tier === 'light' ? spec.heavyProps : undefined;

  return {
    // Stripped of clipPath/filter, `from` degrades to a plain opacity fade.
    hidden: strip(spec.from, drop),
    visible: {
      ...strip(spec.to, drop),
      transition: { duration: s(spec.duration), ease: [...spec.ease] },
    },
    ...(spec.exit && {
      exit: {
        ...strip(spec.exit.props, drop),
        transition: { duration: s(spec.exit.duration), ease: [...spec.exit.ease] },
      },
    }),
  };
}

export function useVariants(key: SpecKey): Variants {
  const tier = useMotionTier();
  return useMemo(() => toVariants(SPECS[key], tier), [key, tier]);
}

/**
 * Mount-and-decay animations (a spec whose `to.opacity` is 0) — the phosphor
 * trail, the seek strike.
 *
 * These carry an obligation that `toVariants` structurally cannot discharge. Its
 * `none` branch returns `hidden: { opacity: 1 }`, meaning "final state,
 * immediately" — correct for an enter, but a decay's final state is *invisible*,
 * so at tier `none` the element would mount bright and never leave. A permanent
 * glowing bar, shown to exactly the visitors who asked for less motion.
 *
 * The gate therefore lives at the mount site, and this hook is that site. It is a
 * hook rather than a convention because the convention was tried and it does not
 * hold: a grep-based build guard for "is there a tier check in this file" passes
 * vacuously on any file that happens to check the tier for something else, which
 * is most of them. Owning the gate in one place is the only version that cannot
 * silently rot.
 *
 *   const trail = useDecayMount<void>('persistence');
 *   trail.fire();                                   // no-op at tier 'none'
 *   {trail.token && <Ghost key={trail.token.k} variants={trail.variants}
 *                          onAnimationComplete={trail.clear} />}
 */
export function useDecayMount<T = void>(key: SpecKey) {
  const tier = useMotionTier();
  const variants = useVariants(key);
  const [token, setToken] = useState<{ k: number; payload: T } | null>(null);
  const n = useRef(0);

  const fire = useCallback(
    (payload: T) => {
      if (tier === 'none') return; // THE GATE — see above.
      // The key restarts a decay interrupted by a second trigger rather than
      // letting the stale one finish.
      setToken({ k: ++n.current, payload });
    },
    [tier],
  );

  const clear = useCallback(() => setToken(null), []);

  return { variants, token, fire, clear };
}

/**
 * Same as useVariants, but `visible` is a function of the row index so each item
 * starts a beat after the one above it. Pass the index as `custom` on the element.
 *
 * Two dead ends are baked into this, both measured against the running app rather
 * than assumed:
 *
 *  1. A parent `staggerContainer` with staggerChildren does nothing here. Variant
 *     labels don't survive the trip from the list container, down through
 *     AnimatePresence, into the row wrappers — so the container orchestrated
 *     nothing and the rows never even received "hidden".
 *  2. A `transition={{ delay }}` prop on the row is silently dropped. When a
 *     variant carries its own `transition`, that replaces the prop rather than
 *     merging with it — five rows measured identical start times. The delay has to
 *     be inside the variant, which is what this does.
 *
 * The delay is capped so a long archive still finishes painting promptly instead
 * of dealing out one row at a time forever.
 */
export function useStaggeredVariants(key: SpecKey, cap = 12): Variants {
  const tier = useMotionTier();
  return useMemo(() => {
    const base = toVariants(SPECS[key], tier);
    // Reduced motion is already instant — a stagger would just re-introduce
    // motion through the back door.
    if (tier === 'none') return base;

    const visible = base.visible as Record<string, unknown>;
    const transition = (visible.transition ?? {}) as Record<string, unknown>;

    return {
      ...base,
      visible: (i: number) => ({
        ...visible,
        transition: { ...transition, delay: Math.min(i, cap) * STAGGER.row },
      }),
    };
  }, [key, tier, cap]);
}
