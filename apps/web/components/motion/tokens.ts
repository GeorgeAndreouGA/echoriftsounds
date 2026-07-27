/**
 * SOURCE OF TRUTH for every duration and easing in the app.
 *
 * globals.css mirrors these as --dur-* / --ease-*, because neither side can own
 * them alone: framer needs transition.duration as a literal number (it cannot
 * read a CSS var, and getComputedStyle is unavailable at SSR module scope),
 * while @keyframes and the .crt-* rules need literal custom properties at build
 * time. scripts/check-motion-tokens.mjs parses globals.css and fails the Docker
 * web-build if the two drift. Change a number here and there, or the build breaks.
 *
 * The scale is ~1.6x, seeded at 110ms. A CRT is an electromechanical device: a
 * relay either closes or it doesn't, and the beam sweeps at constant velocity.
 *
 * It was seeded at 70ms first, which was a mistake — mechanically honest and
 * completely imperceptible. Every animation finished before the eye arrived, so
 * the only motion anyone noticed was the one looping bar in the player. Snappy
 * and invisible are not the same thing; these are the durations at which the
 * vocabulary can actually be read.
 *
 * Off-vocabulary by convention — do not add: `type: 'spring'`, or any bezier with
 * a control-point y outside [0, 1]. Overshoot is a rubber/mass metaphor, and a
 * phosphor has no mass. There are four easings and there should stay four.
 */
export const DUR = {
  d1: 110, // relay tick   — hover fill, press, colour swap
  d2: 170, // cut          — exits, glitch flash
  d3: 260, // region scan  — collapse/expand, small enters
  d4: 440, // field scan   — card wipe-in, panel enter, route change
  d5: 700, // decay tail   — phosphor afterglow, boot fade
} as const;

export const EASE = {
  /** A scan beam has constant velocity. Wipes and typing are linear, always. */
  cut: [0, 0, 1, 1],
  /** Mechanical state change: fast off the mark, dead stop. No overshoot. */
  snap: [0.3, 0, 0, 1],
  /** Phosphor decay is exponential — I(t) = I0·e^(−t/τ). Expo-out.
   *  Kept at the project's existing hand-rolled value so enters don't shift. */
  decay: [0.22, 1, 0.36, 1],
  /** Power-off: the collapse accelerates into the cut. */
  kill: [0.55, 0, 1, 0.45],
} as const;

/**
 * Sequence timings. Tokenised so they're reviewable in one place, but
 * deliberately NOT on the DUR scale — these aren't transitions. A typewriter's
 * rate is set by content length and a count-up ramp is a mechanical readout;
 * forcing either onto the transition scale would be cargo-cult.
 */
export const SEQ = {
  cpsWordmark: 56, // chars/sec — Hero wordmark
  cpsBoot: 45, // chars/sec — BootSequence lines
  readoutMs: 1200, // track count 0 → N
  meterCellMs: 50, // signal meter, per cell
  borderDrawMs: 700, // LoginForm — beam drawing the frame via pathLength
  bootWarmupMs: 200, // dead air before the first line types
  bootLineGapMs: 60,
  bootLastGapMs: 200,
  bootHoldMs: 350, // last line typed → hand off to the site
  signalJitterMs: 1200,
} as const;

/** Stagger steps. row = 40ms ≈ d1/2 — why the list reads sequential, not queued. */
export const STAGGER = {
  row: 0.04,
} as const;

/** framer wants seconds; CSS wants ms. One conversion point. */
export const s = (ms: number) => ms / 1000;
