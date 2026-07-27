// Regression guard for the reduced-motion flash.
//
// History: <MotionConfig reducedMotion="user"> only skips transform/layout
// animations, and the CSS guard only clamps animation-*/transition-* durations.
// Neither stops a `filter`. For the life of the project, a prefers-reduced-motion
// visitor got a full-viewport brightness(4) contrast(8) flash on every route
// change. toVariants()'s 'none' branch is what stops it; this asserts it stays
// stopped.
//
// Run (needs the workspace's node_modules, so do it in the build image):
//   docker build --target web-build -t echorift-webbuild:probe -f Dockerfile .
//   docker run --rm -w /workspace/apps/web echorift-webbuild:probe \
//     npx --yes tsx@4 scripts/check-motion-a11y.mts
//
// Not wired into the Dockerfile: it needs a network fetch for tsx, and the build
// should not depend on the npm registry being up. Run it when touching
// spec.ts / variants.ts / useMotionTier.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { toVariants } from '../components/motion/variants';
import { SPECS } from '../components/motion/spec';
import type { MotionTier } from '../lib/motion/useMotionTier';

const FILTERY = /filter|clipPath/;
let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) { failures++; console.log(`  FAIL  ${name} ${detail}`); }
  else console.log(`  ok    ${name}`);
};

const propsOf = (v: Record<string, unknown>) =>
  Object.keys(v ?? {}).filter((k) => k !== 'transition');

for (const [key, spec] of Object.entries(SPECS)) {
  console.log(`\n[${key}]`);

  // ── tier 'none': the a11y floor ──────────────────────────────────
  const none = toVariants(spec, 'none' as MotionTier);
  for (const state of ['hidden', 'visible', 'exit'] as const) {
    const v = none[state] as Record<string, unknown>;
    if (!v) continue;
    const bad = propsOf(v).filter((p) => FILTERY.test(p));
    check(`none/${state} has no filter or clipPath`, bad.length === 0, `→ got ${bad.join(',')}`);
  }
  const noneVis = none.visible as Record<string, { duration?: number }>;
  check('none/visible is instant', noneVis.transition?.duration === 0);
  check(
    'none/hidden is fully visible (final state, not a fade-in)',
    (none.hidden as Record<string, unknown>).opacity === 1,
  );

  // ── tier 'light': filters stripped, animation kept ───────────────
  const light = toVariants(spec, 'light' as MotionTier);
  for (const state of ['hidden', 'visible', 'exit'] as const) {
    const v = light[state] as Record<string, unknown>;
    if (!v) continue;
    const bad = propsOf(v).filter((p) => (spec.heavyProps ?? []).includes(p));
    check(`light/${state} strips heavyProps`, bad.length === 0, `→ got ${bad.join(',')}`);
  }

  // ── tier 'full': nothing dropped ─────────────────────────────────
  const full = toVariants(spec, 'full' as MotionTier);
  const fullVis = propsOf(full.visible as Record<string, unknown>).sort();
  const specTo = Object.keys(spec.to).sort();
  check('full/visible keeps every prop', JSON.stringify(fullVis) === JSON.stringify(specTo),
    `→ ${fullVis.join(',')} vs ${specTo.join(',')}`);
}

// The specific regression: signalLoss is the full-viewport route transition.
console.log('\n[regression: signalLoss brightness flash]');
const sl = toVariants(SPECS.signalLoss, 'none' as MotionTier);
const serialized = JSON.stringify(sl);
check('no "brightness" anywhere in the none-tier variants', !/brightness/.test(serialized),
  `→ ${serialized}`);
const slFull = JSON.stringify(toVariants(SPECS.signalLoss, 'full' as MotionTier));
check('control: full tier DOES still carry brightness(4)', /brightness\(4\)/.test(slFull));

// ── decay-on-mount contract ────────────────────────────────────────
// A spec whose `to.opacity` is 0 fades to nothing. toVariants' 'none' branch
// returns hidden:{opacity:1} — "final state, immediately" — but for a decay the
// final state is INVISIBLE, so the none branch pins it BRIGHT and it never
// leaves. Such a spec is only safe if the CALLER refuses to mount it at tier
// 'none' (TrackCard's PhosphorTrail gate; WaveformPlayerInner's flashAt gate).
//
// This is the one thing the assertions above cannot see: they check the variants,
// and the bug lives at the call site. Grep-based on purpose — the alternative is
// rendering React in a build script, which this repo does not do.
console.log('\n[decay-on-mount contract]');
const decaySpecs = Object.entries(SPECS)
  .filter(([, sp]) => (sp.to as Record<string, unknown>).opacity === 0)
  .map(([k]) => k);

check(`found decay specs (guard has not rotted): ${decaySpecs.join(', ')}`, decaySpecs.length > 0);

const componentFiles = readdirSync('components', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `components/${f}`);

for (const key of decaySpecs) {
  const none = toVariants(SPECS[key as keyof typeof SPECS], 'none' as MotionTier);
  check(
    `${key}: none/hidden is opacity 1 — documents WHY the call-site gate is required`,
    (none.hidden as Record<string, unknown>).opacity === 1,
  );
  const mounters = componentFiles.filter((f) => readFileSync(f, 'utf8').includes(`'${key}'`));
  check(`${key}: found the component that mounts it`, mounters.length > 0, '→ spec is unused?');
  for (const f of mounters) {
    const src = readFileSync(f, 'utf8');
    // Must go through useDecayMount, which owns the gate. Deliberately NOT "does
    // this file check the tier somewhere" — that first version passed with every
    // gate deleted, because WaveformPlayerInner checks the tier for four other
    // unrelated reasons. A guard that cannot fail is worse than no guard.
    check(
      `${key} in ${f.replace('components/', '')} is mounted via useDecayMount('${key}')`,
      new RegExp(`useDecayMount<[^>]*>\\(\\s*'${key}'\\s*\\)`).test(src),
      `→ mount it with useDecayMount, which owns the tier-'none' gate; a raw ` +
        `useVariants('${key}') mount pins bright forever for reduced-motion visitors`,
    );
    check(
      `${key} in ${f.replace('components/', '')} does not bypass the hook`,
      !new RegExp(`useVariants\\(\\s*'${key}'\\s*\\)`).test(src),
      '→ raw useVariants on a decay spec skips the gate',
    );
  }
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
