'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useTypewriter } from '../../lib/motion/useTypewriter';
import { useCountUp } from '../../lib/motion/useCountUp';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import { SEQ } from '../motion/tokens';
import { Caret, MeterBar } from '../icons/CrtIcons';

const WORDMARK = [
  '┌─                               ─┐',
  '   E C H O R I F T   S O U N D S   ',
  '└─                               ─┘',
];
const WORDMARK_TEXT = WORDMARK.join('\n');

function fmt(s: number) {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

const TOTAL_CELLS = 8;

function SignalBars({ level }: { level: number }) {
  const target = Math.round(Math.max(0, Math.min(1, level)) * TOTAL_CELLS);
  const firstRun = useRef(true);
  // Ramp the cells on the first fill only; after that the meter tracks the signal
  // directly, the way a real one would.
  const filled = useCountUp(target, firstRun.current ? SEQ.meterCellMs * TOTAL_CELLS : 0);
  useEffect(() => {
    firstRun.current = false;
  }, []);

  return (
    <span style={{ color: '#39ff14' }}>
      <MeterBar filled={filled} total={TOTAL_CELLS} />
    </span>
  );
}

interface Props {
  trackCount: number;
}

export function Hero({ trackCount }: Props) {
  const tier = useMotionTier();
  const startRef = useRef(Date.now());
  const [uptime, setUptime] = useState(0);
  const [signal, setSignal] = useState(0.72);

  const chars = useTypewriter(WORDMARK_TEXT, SEQ.cpsWordmark);
  const displayCount = useCountUp(trackCount, SEQ.readoutMs);

  // One clock drives all three lines, so they can't drift apart.
  const wordmarkLines = useMemo(() => {
    let pos = 0;
    return WORDMARK.map((line) => {
      const shown = line.slice(0, Math.max(0, Math.min(line.length, chars - pos)));
      pos += line.length + 1; // +1 for the '\n' that join() put between lines
      return shown;
    });
  }, [chars]);

  // A wall clock, not an animation — stays on setInterval. rAF would be wrong
  // here: it pauses with the tab and fires 60x more often than a 1s readout needs.
  useEffect(() => {
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // An event schedule rather than a tween, so setInterval is right — but it is
  // pure decoration, so anything below 'full' freezes it at the initial reading.
  useEffect(() => {
    if (tier !== 'full') return;
    const id = setInterval(() => {
      setSignal(0.45 + Math.random() * 0.55);
    }, SEQ.signalJitterMs);
    return () => clearInterval(id);
  }, [tier]);

  return (
    <header style={{ padding: '2rem 0 1.5rem', textAlign: 'center' }}>
      {/* ASCII wordmark — scrolls horizontally if viewport too narrow to fit */}
      <div
        role="img"
        aria-label="EchoRift Sounds"
        className="hero-wordmark"
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 'clamp(10px, 2vw, 15px)',
          color: '#ffb000',
          letterSpacing: '0.04em',
          lineHeight: 1.4,
          marginBottom: '0.75rem',
          whiteSpace: 'pre',
        }}
      >
        {wordmarkLines.map((line, i) => (
          <div key={i} aria-hidden="true">
            {line}
          </div>
        ))}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.1em',
          marginBottom: '1.25rem',
        }}
      >
        <span aria-hidden="true" style={{ color: '#ffb000' }}>
          &gt;
        </span>{' '}
        a retro audio archive
        <Caret speed={1} />
      </div>

      {/* Status strip.
          Deliberately NOT role="status"/aria-live: it contains a 1s uptime ticker,
          so a live region here re-announced the whole strip every second, forever.
          The animated readouts are hidden from AT and the settled values exposed
          once, below. */}
      <div
        role="group"
        aria-label="System status"
        style={{
          display: 'inline-flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
          padding: '0.4rem 1rem',
          border: '1px solid #1a1f12',
          background: '#11140c',
        }}
      >
        <span aria-hidden="true">
          UPTIME <span style={{ color: '#ffb000' }}>{fmt(uptime)}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          <span aria-hidden="true">
            TRACKS{' '}
            <span style={{ color: '#ffb000' }}>{String(displayCount).padStart(3, '0')}</span>
          </span>
          {/* The true value, announced once — not the 30-step ramp. */}
          <span className="sr-only">{trackCount} tracks</span>
        </span>
        <span aria-hidden>·</span>
        <span aria-hidden="true">
          SIGNAL <SignalBars level={signal} />
        </span>
      </div>
    </header>
  );
}
