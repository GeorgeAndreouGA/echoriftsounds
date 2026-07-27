/**
 * Generates the motion spec gallery — one self-contained HTML card per animation,
 * for upload to a claude.ai/design design-system project via DesignSync.
 *
 * It imports the REAL SPECS/DUR/EASE and the REAL toVariants, so a card cannot
 * document a timing the app doesn't use: there is only one copy of each number.
 * That's the whole reason this is a generator rather than a hand-written page.
 *
 * Each card renders the same animation at all three motion tiers side by side, so
 * the previews document the degradation, not just the happy path.
 *
 * Run (needs the workspace's node_modules — do it in the build image):
 *   docker build --target web-build -t echorift-webbuild:probe -f Dockerfile .
 *   docker run --rm -v "$PWD/apps/web/.motion-gallery:/out" \
 *     -w /workspace/apps/web echorift-webbuild:probe \
 *     npx --yes tsx@4 scripts/build-motion-gallery.mts /out
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUR, EASE, SEQ } from '../components/motion/tokens';
import { SPECS } from '../components/motion/spec';
import { toVariants } from '../components/motion/variants';
import type { MotionTier } from '../lib/motion/useMotionTier';

const OUT = process.argv[2] ?? join(process.cwd(), '.motion-gallery');
mkdirSync(OUT, { recursive: true });

const BG = '#0a0b06';
const PANEL = '#11140c';
const GRID = '#1a1f12';
const AMBER = '#ffb000';
const DIM = '#8a5f00';

const bez = (e: readonly number[]) => `cubic-bezier(${e.join(', ')})`;
const easeName = (e: readonly number[]) =>
  Object.entries(EASE).find(([, v]) => v.join() === e.join())?.[0] ?? 'custom';
const durName = (ms: number) =>
  Object.entries(DUR).find(([, v]) => v === ms)?.[0] ?? `${ms}ms`;

/** framer prop → CSS. Only the props the specs actually use. */
function toCss(props: Record<string, string | number>): string {
  const out: string[] = [];
  const transforms: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (k === 'opacity') out.push(`opacity: ${v}`);
    else if (k === 'filter') out.push(`filter: ${v}`);
    else if (k === 'clipPath') out.push(`clip-path: ${v}`);
    else if (k === 'boxShadow') out.push(`box-shadow: ${v}`);
    else if (k === 'backgroundColor') out.push(`background-color: ${v}`);
    else if (k === 'scaleY') transforms.push(`scaleY(${v})`);
    else if (k === 'scaleX') transforms.push(`scaleX(${v})`);
    else if (k === 'skewX') transforms.push(`skewX(${v}deg)`);
    else if (k === 'x') transforms.push(`translateX(${typeof v === 'number' ? `${v}px` : v})`);
    else if (k === 'y') transforms.push(`translateY(${typeof v === 'number' ? `${v}px` : v})`);
  }
  if (transforms.length) out.push(`transform: ${transforms.join(' ')}`);
  return out.join('; ');
}

const TIERS: MotionTier[] = ['full', 'light', 'none'];
const TIER_NOTE: Record<MotionTier, string> = {
  full: 'Everything.',
  light: 'save-data or coarse-pointer mobile. Filter chains dropped; animation kept.',
  none: 'prefers-reduced-motion. Final state, immediately.',
};

function card(key: string, spec: (typeof SPECS)[keyof typeof SPECS]): string {
  const panes = TIERS.map((tier) => {
    // The same function the app runs — not a re-description of it.
    const v = toVariants(spec, tier) as Record<string, Record<string, string | number>>;
    const hidden = { ...v.hidden };
    const visible = { ...v.visible };
    const trans = (visible.transition ?? {}) as unknown as { duration?: number; ease?: number[] };
    delete (visible as Record<string, unknown>).transition;
    delete (hidden as Record<string, unknown>).transition;

    const durMs = Math.round((trans.duration ?? 0) * 1000);
    const easeArr = trans.ease ?? EASE.cut;
    const stripped =
      tier === 'light' && spec.heavyProps?.length
        ? `<div class="stripped">stripped: ${spec.heavyProps.join(', ')}</div>`
        : tier === 'none'
          ? `<div class="stripped">all motion removed</div>`
          : `<div class="stripped">&nbsp;</div>`;

    return `
      <div class="pane">
        <div class="pane-h">${tier}</div>
        <div class="stage">
          <div class="box" data-tier="${tier}"
               style="animation-duration: ${durMs}ms; animation-timing-function: ${bez(easeArr)};">
            <span>ECHORIFT</span>
          </div>
        </div>
        <div class="meta">${durMs}ms · ${easeName(easeArr)}</div>
        ${stripped}
        <div class="tier-note">${TIER_NOTE[tier]}</div>
      </div>
      <style>
        .box[data-tier="${tier}"] { ${toCss(visible)} }
        .box[data-tier="${tier}"].run { animation-name: kf-${tier}-${key}; }
        @keyframes kf-${tier}-${key} {
          from { ${toCss(hidden)} }
          to   { ${toCss(visible)} }
        }
      </style>`;
  }).join('\n');

  const exitRow = spec.exit
    ? `<tr><th>exit</th><td>${durName(spec.exit.duration)} (${spec.exit.duration}ms) · ${easeName(spec.exit.ease)}</td></tr>`
    : '';

  return `<!-- @dsCard group="${spec.group}" -->
<meta charset="utf-8">
<title>${spec.name}</title>
<style>
  :root {
    --dur-1: ${DUR.d1}ms; --dur-2: ${DUR.d2}ms; --dur-3: ${DUR.d3}ms;
    --dur-4: ${DUR.d4}ms; --dur-5: ${DUR.d5}ms;
    --ease-cut: ${bez(EASE.cut)}; --ease-snap: ${bez(EASE.snap)};
    --ease-decay: ${bez(EASE.decay)}; --ease-kill: ${bez(EASE.kill)};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: ${BG}; color: ${AMBER};
    font-family: ui-monospace, "JetBrains Mono", "IBM Plex Mono", monospace;
    font-size: 12px; line-height: 1.5;
  }
  h1 { font-size: 14px; letter-spacing: 0.08em; margin: 0 0 4px; text-transform: uppercase; }
  .note { color: ${DIM}; margin: 0 0 18px; max-width: 68ch; }
  .panes { display: flex; gap: 12px; flex-wrap: wrap; }
  .pane { flex: 1 1 200px; min-width: 180px; border: 1px solid ${GRID}; background: ${PANEL}; padding: 10px; }
  .pane-h { color: ${AMBER}; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; margin-bottom: 8px; }
  .stage { height: 74px; display: grid; place-items: center; background: ${BG}; border: 1px solid ${GRID}; overflow: hidden; }
  .box {
    width: 128px; height: 40px; display: grid; place-items: center;
    border: 1px solid ${AMBER}; color: ${AMBER}; letter-spacing: 0.14em; font-size: 11px;
    animation-fill-mode: both;
  }
  .meta { color: ${AMBER}; margin-top: 8px; font-size: 10px; }
  .stripped { color: #22d3ee; font-size: 10px; min-height: 15px; }
  .tier-note { color: ${DIM}; font-size: 10px; margin-top: 4px; }
  button {
    margin: 16px 0 20px; background: ${BG}; color: ${AMBER}; border: 1px solid ${AMBER};
    padding: 7px 16px; font: inherit; font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; cursor: pointer; border-radius: 0;
  }
  button:hover { background: ${AMBER}; color: ${BG}; }
  table { border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 3px 16px 3px 0; vertical-align: top; }
  th { color: ${DIM}; font-weight: 400; white-space: nowrap; }
  .src { color: ${DIM}; font-size: 10px; margin-top: 18px; border-top: 1px solid ${GRID}; padding-top: 10px; }
</style>

<h1>${spec.name}</h1>
<p class="note">${spec.note}</p>

<button id="replay">▶ replay</button>

<div class="panes">${panes}</div>

<table>
  <tr><th>enter</th><td>${durName(spec.duration)} (${spec.duration}ms) · ${easeName(spec.ease)} ${bez(spec.ease)}</td></tr>
  ${exitRow}
  <tr><th>heavy props</th><td>${spec.heavyProps?.join(', ') || '—'}</td></tr>
</table>

<p class="src">Generated from apps/web/components/motion/spec.ts by scripts/build-motion-gallery.mts.
Panes render through the app's own toVariants(), so this page cannot drift from what ships.
Edit the spec, re-run the generator — never edit this file.</p>

<script>
  const boxes = () => document.querySelectorAll('.box');
  function play() {
    boxes().forEach((b) => {
      b.classList.remove('run');
      void b.offsetWidth; // force reflow so the animation restarts
      b.classList.add('run');
    });
  }
  document.getElementById('replay').addEventListener('click', play);
  play();
</script>`;
}

let n = 0;
for (const [key, spec] of Object.entries(SPECS)) {
  const file = join(OUT, `${spec.name}.html`);
  writeFileSync(file, card(key, spec), 'utf8');
  console.log(`  ${spec.name}.html   ${spec.group}`);
  n++;
}

// An index card, so the gallery has a front page listing the scale itself.
const index = `<!-- @dsCard group="Motion / Foundations" -->
<meta charset="utf-8">
<title>Motion scale</title>
<style>
  body { margin: 0; padding: 24px; background: ${BG}; color: ${AMBER};
         font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 12px; }
  h1 { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px; }
  p.note { color: ${DIM}; max-width: 70ch; }
  table { border-collapse: collapse; margin-top: 16px; width: 100%; max-width: 640px; }
  th, td { text-align: left; padding: 5px 14px 5px 0; border-bottom: 1px solid ${GRID}; }
  th { color: ${DIM}; font-weight: 400; }
  .bar { height: 6px; background: ${AMBER}; }
  .swatch { height: 26px; border: 1px solid ${GRID}; position: relative; overflow: hidden; background: ${PANEL}; }
  .dot { position: absolute; top: 5px; left: 0; width: 14px; height: 14px; background: ${AMBER};
         animation: slide 2.2s infinite alternate; }
  @keyframes slide { from { left: 2px; } to { left: calc(100% - 16px); } }
</style>
<h1>Motion scale</h1>
<p class="note">A CRT is an electromechanical device: a relay either closes or it doesn't, and the beam
sweeps at constant velocity. The scale is ~1.6x from 70ms. Nothing overshoots — a phosphor has no mass,
so springs and back-eases are off-vocabulary.</p>

<table>
  <tr><th>token</th><th>ms</th><th>for</th><th></th></tr>
  ${Object.entries(DUR)
    .map(
      ([k, v]) =>
        `<tr><td>${k}</td><td>${v}</td><td style="color:${DIM}">${
          { d1: 'relay tick — hover, press, colour swap', d2: 'cut — exits, glitch flash',
            d3: 'region scan — collapse/expand', d4: 'field scan — card wipe, route change',
            d5: 'decay tail — afterglow, boot fade' }[k as keyof typeof DUR]
        }</td><td style="width:200px"><div class="bar" style="width:${(v / DUR.d5) * 100}%"></div></td></tr>`,
    )
    .join('\n  ')}
</table>

<table>
  <tr><th>easing</th><th>curve</th><th>motion</th></tr>
  ${Object.entries(EASE)
    .map(
      ([k, v]) =>
        `<tr><td>${k}</td><td style="color:${DIM}">${bez(v)}</td><td><div class="swatch"><div class="dot" style="animation-timing-function:${bez(v)}"></div></div></td></tr>`,
    )
    .join('\n  ')}
</table>

<table>
  <tr><th>sequence</th><th>value</th></tr>
  ${Object.entries(SEQ)
    .map(([k, v]) => `<tr><td>${k}</td><td style="color:${DIM}">${v}</td></tr>`)
    .join('\n  ')}
</table>

<p class="note" style="margin-top:18px">Sequence timings are deliberately not on the duration scale —
a typewriter's rate is set by content length and a count-up is a mechanical readout. Neither is a transition.</p>`;

writeFileSync(join(OUT, 'motion-scale.html'), index, 'utf8');
console.log(`  motion-scale.html   Motion / Foundations`);
console.log(`\n${n + 1} cards → ${OUT}`);
