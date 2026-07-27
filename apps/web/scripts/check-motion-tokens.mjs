#!/usr/bin/env node
/**
 * Fails the build if the --dur-* / --ease-* block in globals.css has drifted from
 * components/motion/tokens.ts.
 *
 * The two must be duplicated (framer needs literal numbers, CSS needs literal
 * custom properties — see the header of tokens.ts), so this is the only thing
 * standing between us and a silent split-brain motion scale. Runs in the Docker
 * web-build stage before `next build`.
 *
 * Deliberately regex over the source rather than importing it: this runs as plain
 * node with no TS toolchain, before the build, with zero deps.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '../styles/globals.css');
const tsPath = resolve(here, '../components/motion/tokens.ts');

const css = readFileSync(cssPath, 'utf8');
const ts = readFileSync(tsPath, 'utf8');

const errors = [];

// ── durations ──────────────────────────────────────────────────────
// tokens.ts:  d1: 70,        css:  --dur-1: 70ms;
const tsDur = new Map();
const durBlock = ts.match(/export const DUR = \{([\s\S]*?)\} as const;/);
if (!durBlock) errors.push('tokens.ts: could not find `export const DUR = { … } as const;`');
else {
  for (const m of durBlock[1].matchAll(/\bd(\d+)\s*:\s*(\d+)/g)) tsDur.set(m[1], Number(m[2]));
}

const cssDur = new Map();
for (const m of css.matchAll(/--dur-(\d+):\s*(\d+)ms/g)) cssDur.set(m[1], Number(m[2]));

for (const [k, v] of tsDur) {
  if (!cssDur.has(k)) errors.push(`globals.css is missing --dur-${k} (tokens.ts has d${k}: ${v})`);
  else if (cssDur.get(k) !== v)
    errors.push(`--dur-${k}: css has ${cssDur.get(k)}ms, tokens.ts has d${k}: ${v}`);
}
for (const k of cssDur.keys()) {
  if (!tsDur.has(k)) errors.push(`globals.css has --dur-${k} with no d${k} in tokens.ts`);
}

// ── easings ────────────────────────────────────────────────────────
// tokens.ts:  cut: [0, 0, 1, 1],   css:  --ease-cut: cubic-bezier(0, 0, 1, 1);
const nums = (str) => str.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];

const tsEase = new Map();
const easeBlock = ts.match(/export const EASE = \{([\s\S]*?)\} as const;/);
if (!easeBlock) errors.push('tokens.ts: could not find `export const EASE = { … } as const;`');
else {
  // Strip comments first — the doc comments are full of numbers (bezier values,
  // the I0·e^(−t/τ) formula) that would otherwise be scraped as control points.
  const body = easeBlock[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const m of body.matchAll(/\b(\w+)\s*:\s*\[([^\]]+)\]/g)) tsEase.set(m[1], nums(m[2]));
}

const cssEase = new Map();
for (const m of css.matchAll(/--ease-([\w-]+):\s*cubic-bezier\(([^)]+)\)/g))
  cssEase.set(m[1], nums(m[2]));

const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

for (const [k, v] of tsEase) {
  if (!cssEase.has(k)) errors.push(`globals.css is missing --ease-${k} (tokens.ts has ${k})`);
  else if (!same(cssEase.get(k), v))
    errors.push(
      `--ease-${k}: css has [${cssEase.get(k).join(', ')}], tokens.ts has [${v.join(', ')}]`,
    );
}
for (const k of cssEase.keys()) {
  if (!tsEase.has(k)) errors.push(`globals.css has --ease-${k} with no ${k} in tokens.ts`);
}

// Guard the guard: if both sides parsed as empty, the regexes have rotted and
// this script would "pass" everything forever.
if (tsDur.size === 0 || tsEase.size === 0)
  errors.push('parsed 0 tokens out of tokens.ts — this checker is broken, not the tokens');

if (errors.length) {
  console.error('\n✗ motion tokens drifted between tokens.ts and globals.css:\n');
  for (const e of errors) console.error(`  • ${e}`);
  console.error('\nEdit both, or neither.\n');
  process.exit(1);
}

console.log(`✓ motion tokens in sync (${tsDur.size} durations, ${tsEase.size} easings)`);
