'use client';

import { useEffect, useRef, useState } from 'react';
import type { Variants } from 'framer-motion';
import { motion, AnimatePresence } from 'framer-motion';
import { WaveformPlayer } from './WaveformPlayer';
import { useActiveTrack } from '../lib/activeTrack';
import { useDecayMount } from './motion/variants';
import { DUR, EASE, s } from './motion/tokens';
import { PlayIcon, StatusDot } from './icons/CrtIcons';

interface Props {
  file: string;
  index: number;
}

function GlitchFilename({ name, active }: { name: string; active: boolean }) {
  const [glitching, setGlitching] = useState(false);

  return (
    <span
      // The RGB split is the chromatic-pulse keyframe in globals.css — which,
      // until now, was declared and never used while this component hand-rolled
      // the same effect with a setTimeout and an inline textShadow. One CSS
      // animation instead: no timer to leak, and the tier gating lives with the
      // rest of the tier CSS. `animationend` clears the flag, so the duration is
      // owned by --dur-3 rather than duplicated in a JS timeout.
      data-glitch={glitching || undefined}
      onMouseEnter={() => setGlitching(true)}
      onAnimationEnd={() => setGlitching(false)}
      style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: active ? '#ffb000' : '#8a5f00',
        transition: `color var(--dur-2) var(--ease-snap)`,
        textShadow: active ? '0 0 6px rgba(255,176,0,0.3)' : 'none',
        fontWeight: active ? 700 : 400,
      }}
    >
      {name}
    </span>
  );
}

/**
 * The afterglow a row leaves when the beam moves off it. Mounted only for the
 * decay and unmounted on completion — there is no steady state worth keeping in
 * the DOM once it has fallen to zero.
 */
function PhosphorTrail({ variants, onDone }: { variants: Variants; onDone: () => void }) {
  return (
    <motion.div
      aria-hidden
      variants={variants}
      initial="hidden"
      animate="visible"
      onAnimationComplete={onDone}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'rgba(255,176,0,0.22)',
      }}
    />
  );
}

export function TrackCard({ file, index }: Props) {
  const { activeFile, setActiveFile } = useActiveTrack();
  const isActive = activeFile === file;

  // Fire the trail on the active → inactive edge only: the beam leaving is what
  // leaves a glow. The tier-'none' gate and the restart-on-retrigger key both live
  // inside useDecayMount — persistence decays to opacity 0, and toVariants' 'none'
  // branch would otherwise pin it bright forever.
  const trail = useDecayMount<void>('persistence');
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (wasActive.current && !isActive) trail.fire();
    wasActive.current = isActive;
  }, [isActive, trail]);

  const toggle = () => setActiveFile(isActive ? null : file);

  return (
    // The row's enter/exit (typeScan) is owned by the listitem wrapper in
    // TrackListPage, which is the direct child of the stagger container — variant
    // labels do not reach this far down. `layout` stays here so the row animates
    // its own height when the player expands.
    <motion.article
      layout
      aria-label={`Track: ${file}`}
      data-track-row
      style={{ borderBottom: '1px solid #1a1f12', position: 'relative' }}
    >
      {trail.token && (
        <PhosphorTrail key={trail.token.k} variants={trail.variants} onDone={trail.clear} />
      )}

      {/* Row */}
      <div
        className="track-row"
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
        role="button"
        tabIndex={0}
        aria-expanded={isActive}
        aria-label={`${isActive ? 'Collapse' : 'Expand'} player for ${file}`}
        style={{ borderBottom: 'none', gap: '0.75rem' }}
      >
        {/* Index */}
        <span
          aria-hidden
          style={{
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '11px',
            color: '#8a5f00',
            minWidth: '2.5rem',
            flexShrink: 0,
          }}
        >
          {String(index).padStart(3, '0')}
        </span>

        {/* Filename */}
        <GlitchFilename name={file} active={isActive} />

        {/* Status / play button */}
        {isActive ? (
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '11px',
              color: '#39ff14',
              flexShrink: 0,
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <StatusDot /> PLAYING
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '11px',
              color: '#8a5f00',
              flexShrink: 0,
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            [ <PlayIcon size={9} /> ]
          </span>
        )}
      </div>

      {/* Expanded player */}
      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            key="player"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: s(DUR.d3), ease: [...EASE.decay] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0 0.75rem 0' }}>
              <WaveformPlayer file={file} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
