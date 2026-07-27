import { DUR, EASE } from './tokens';

/**
 * Every animation in the app, declared rather than hand-written.
 *
 * Two consumers read these: variants.ts (what actually runs) and
 * scripts/build-motion-gallery.mts (the claude.ai/design preview cards). That's
 * the point — the gallery cannot document a timing the app doesn't use, because
 * there is only one copy of the number.
 *
 * `note` and `group` are for the gallery cards. Write `note` in CRT terms: the
 * physical thing the motion is imitating. If you can't name one, the animation
 * probably doesn't belong in this vocabulary.
 *
 * NOT everything animated belongs here, and adding the missing ones is a mistake.
 * A spec is a transition between two declared states over a fixed duration. Two
 * things in the player are deliberately hand-written against DUR/EASE instead:
 *
 *   - the hover readout (WaveformPlayerInner) — a pointer-tracked position has no
 *     `from`, no `to` and no duration, and routing it through toVariants would
 *     hand it to the 'none' branch, which collapses to opacity:1 and would delete
 *     information a reduced-motion visitor needs.
 *   - BeamBar — animates `left`, a layout prop no variant system will touch.
 *
 * The house rule is *use the tokens*, not *be a spec*. Forcing either in here
 * would also make the gallery generator emit a card that is simply false, since
 * it renders every entry as a two-keyframe from→to animation.
 */
export interface MotionSpec {
  /** Slug — the gallery filename and the card title. */
  name: string;
  /** DesignSync card group. */
  group: string;
  /** Why it exists, in CRT terms. Rendered as the card caption. */
  note: string;
  duration: number;
  ease: readonly [number, number, number, number];
  from: Record<string, string | number>;
  to: Record<string, string | number>;
  exit?: {
    props: Record<string, string | number>;
    duration: number;
    ease: readonly [number, number, number, number];
  };
  /**
   * Props dropped on the 'light' tier — the ones that force a full re-raster.
   * In practice: `filter` and `clipPath`. Stripping them degrades the animation
   * to transform + opacity, which the compositor handles without repainting.
   */
  heavyProps?: readonly string[];
}

export const SPECS = {
  typeScan: {
    name: 'type-scan',
    group: 'Motion / Enters',
    note: 'The beam paints the row left→right. Linear, because a scan beam has constant velocity.',
    duration: DUR.d4,
    ease: EASE.cut,
    from: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
    to: { opacity: 1, clipPath: 'inset(0 0% 0 0)' },
    exit: {
      props: { opacity: 0, scaleY: 0, filter: 'saturate(4) hue-rotate(60deg) brightness(2)' },
      duration: DUR.d2,
      ease: EASE.kill,
    },
    heavyProps: ['clipPath', 'filter'],
  },

  scanWipe: {
    name: 'scan-wipe',
    group: 'Motion / Enters',
    note: 'Panel reveals top-down, the way a field paints. Expo-out so it settles rather than stops dead.',
    duration: DUR.d4,
    ease: EASE.decay,
    from: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
    to: { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
    exit: {
      props: { opacity: 0, clipPath: 'inset(100% 0 0 0)' },
      duration: DUR.d3,
      ease: EASE.kill,
    },
    heavyProps: ['clipPath'],
  },

  /**
   * The afterglow a row leaves when the beam moves off it — i.e. when a track
   * stops being the active one. The signature CRT effect, and the reason
   * EASE.decay is named what it is: real phosphor falls off exponentially, so a
   * linear fade here would read as a dip-to-black rather than a glow dying.
   *
   * Deliberately opacity + box-shadow only: both composite, so the trail costs
   * nothing on the 1-CPU box this deploys to. No filter, no re-raster.
   */
  persistence: {
    name: 'phosphor-persistence',
    group: 'Motion / Feedback',
    note: 'Afterglow left behind when the beam moves off a row. Expo-out — phosphor decays exponentially, it does not fade linearly.',
    duration: DUR.d5,
    ease: EASE.decay,
    // Started at opacity 0.5 over a 0.10 amber wash — 5% effective, which measured
    // as a real decay and looked like absolutely nothing on screen. A phosphor
    // that just stopped conducting is BRIGHT for the first instant; that is the
    // whole read. Starts near-opaque and falls off exponentially.
    from: { opacity: 0.95, boxShadow: 'inset 0 0 22px 2px rgba(255,176,0,0.7)' },
    to: { opacity: 0, boxShadow: 'inset 0 0 0 0 rgba(255,176,0,0)' },
    heavyProps: ['boxShadow'],
  },

  /**
   * Switching category is switching channel: the picture rolls, tears sideways
   * for a frame, and the new field paints. Without this the list fired N separate
   * row exits and enters at once, which read as noise rather than as one event.
   *
   * Linear — the roll is the beam losing and regaining vertical lock, which is a
   * mechanical failure, not an eased one.
   */
  channelRoll: {
    name: 'channel-roll',
    group: 'Motion / Feedback',
    note: 'Category switch = channel change. The field loses vertical hold, tears 2px sideways, then re-locks.',
    duration: DUR.d3,
    ease: EASE.cut,
    from: { opacity: 0, y: -8, skewX: 2 },
    to: { opacity: 1, y: 0, skewX: 0 },
    exit: { props: { opacity: 0, y: 6, skewX: -2 }, duration: DUR.d2, ease: EASE.kill },
  },

  /**
   * The beam painting the waveform, once, when the audio first decodes. The
   * loading bar says "wait"; this says "here it is" — and it's the only place in
   * the app where the CRT metaphor and the actual product (an audio waveform)
   * are the same picture.
   *
   * d5 because it should read as a sweep rather than a pop, and cut because a
   * beam does not accelerate.
   */
  beamDraw: {
    name: 'beam-draw',
    group: 'Motion / Feedback',
    note: 'The beam paints the decoded waveform left→right, once. Constant velocity — a sweep, not a reveal.',
    duration: DUR.d5,
    ease: EASE.cut,
    from: { clipPath: 'inset(0 100% 0 0)' },
    to: { clipPath: 'inset(0 0% 0 0)' },
    // On 'light' this degrades to no clip at all — the waveform simply appears,
    // which is what the mobile tier wants anyway.
    heavyProps: ['clipPath'],
  },

  /**
   * Where the beam re-strikes after a seek. A CRT does not glide the beam from one
   * x to another — it blanks, flies back, and re-strikes, so what you see is a
   * bright, briefly over-tall column at the new position, decaying.
   *
   * d3 and NOT a reuse of `persistence`, deliberately: that one is d5 because it
   * is the afterglow of something LEAVING, tuned as a full-bleed inset on a row
   * rect. This is the strike of something ARRIVING at a 2px column, and arrivals
   * are fast — 700ms of decay on a completed input reads as lag. Sharing them
   * would also mean tuning the click flash silently retunes TrackCard's rows.
   *
   * `scaleY: 1.35 → 1` is a from-value, not an overshoot ease: the strike is
   * taller than the trace for one instant because the beam is off-raster during
   * flyback. No bezier control point leaves [0,1], so the house rule holds.
   *
   * MOUNT GATE: `to.opacity` is 0, so toVariants' 'none' branch (hidden:
   * {opacity: 1}) would pin this BRIGHT forever. The CALLER must not mount it at
   * tier 'none' — see `flashAt` in WaveformPlayerInner, and TrackCard's
   * PhosphorTrail. scripts/check-motion-a11y.mts enforces this.
   */
  beamLand: {
    name: 'beam-land',
    group: 'Motion / Feedback',
    note: 'Where the beam re-strikes after a seek. Blank, flyback, strike — bright for one instant, then expo-out, because phosphor decays exponentially.',
    duration: DUR.d3,
    ease: EASE.decay,
    from: { opacity: 1, scaleY: 1.35, boxShadow: '0 0 14px 3px rgba(255,217,107,0.85)' },
    to: { opacity: 0, scaleY: 1, boxShadow: '0 0 0 0 rgba(255,217,107,0)' },
    heavyProps: ['boxShadow'],
  },

  signalLoss: {
    name: 'signal-loss',
    group: 'Motion / Route',
    note: 'Vertical collapse to a hot line — a CRT dumping its field on power-off. Expo-out is phosphor decay.',
    duration: DUR.d4,
    ease: EASE.decay,
    from: { opacity: 0, scaleY: 0.04, filter: 'brightness(4) contrast(8) saturate(0)' },
    to: { opacity: 1, scaleY: 1, filter: 'brightness(1) contrast(1) saturate(1)' },
    exit: {
      props: { opacity: 0, scaleY: 0.04, filter: 'brightness(4) contrast(8) saturate(0)' },
      duration: DUR.d3,
      ease: EASE.kill,
    },
    // Non-negotiable. Unstripped, this is a full-viewport brightness(4) flash on
    // every route change — the exact thing prefers-reduced-motion exists to stop.
    heavyProps: ['filter'],
  },
} satisfies Record<string, MotionSpec>;

export type SpecKey = keyof typeof SPECS;
