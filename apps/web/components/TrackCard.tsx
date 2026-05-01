'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WaveformPlayer } from './WaveformPlayer';
import { useActiveTrack } from '../lib/activeTrack';
import { typeScan } from './motion/glitch';

interface Props {
  file: string;
  index: number;
}

function GlitchFilename({ name, active }: { name: string; active: boolean }) {
  const [glitching, setGlitching] = useState(false);

  const triggerGlitch = () => {
    setGlitching(true);
    setTimeout(() => setGlitching(false), 220);
  };

  return (
    <span
      onMouseEnter={triggerGlitch}
      style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: active ? '#ffb000' : '#8a5f00',
        transition: 'color 0.15s',
        textShadow: glitching
          ? '1px 0 #22d3ee, -1px 0 #ff3b3b'
          : active
          ? '0 0 6px rgba(255,176,0,0.3)'
          : 'none',
        fontWeight: active ? 700 : 400,
      }}
    >
      {name}
    </span>
  );
}

export function TrackCard({ file, index }: Props) {
  const { activeFile, setActiveFile } = useActiveTrack();
  const isActive = activeFile === file;

  const toggle = () => setActiveFile(isActive ? null : file);

  return (
    <motion.article
      layout
      variants={typeScan}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={`Track: ${file}`}
      data-track-row
      style={{ borderBottom: '1px solid #1a1f12' }}
    >
      {/* Row */}
      <div
        className="track-row"
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
        role="button"
        tabIndex={0}
        aria-expanded={isActive}
        aria-label={`${isActive ? 'Collapse' : 'Expand'} player for ${file}`}
        style={{ borderBottom: 'none', cursor: 'pointer', gap: '0.75rem' }}
      >
        {/* Index */}
        <span
          aria-hidden
          style={{
            fontFamily: "'JetBrains Mono', monospace",
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
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#39ff14',
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}
          >
            ◉ PLAYING
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#8a5f00',
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}
          >
            [ ▶ ]
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
            transition={{ duration: 0.22, ease: 'easeOut' }}
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
