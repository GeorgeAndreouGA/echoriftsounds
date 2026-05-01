'use client';

import { useEffect, useState, useRef } from 'react';
import { useFillAnimation } from '../../lib/useFillAnimation';

const WORDMARK = [
  '┌─                               ─┐',
  '   E C H O R I F T   S O U N D S   ',
  '└─                               ─┘',
];


function fmt(s: number) {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function SignalBars({ level }: { level: number }) {
  const total = 8;
  const target = Math.round(Math.max(0, Math.min(1, level)) * total);
  const filled = useFillAnimation(target, 'once');
  return (
    <span aria-hidden style={{ letterSpacing: '-0.05em', color: '#39ff14' }}>
      {'▮'.repeat(filled)}
      <span style={{ color: '#8a5f00' }}>{'▯'.repeat(total - filled)}</span>
    </span>
  );
}

interface Props {
  trackCount: number;
}

export function Hero({ trackCount }: Props) {
  const startRef = useRef(Date.now());
  const [uptime, setUptime] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);
  const [signal, setSignal] = useState(0.72);
  const [wordmarkLines, setWordmarkLines] = useState<string[]>(() => WORDMARK.map(() => ''));

  // Wordmark typewriter
  useEffect(() => {
    const allText = WORDMARK.join('\n');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      const built: string[] = WORDMARK.map(() => '');
      let pos = 0;
      for (let li = 0; li < WORDMARK.length; li++) {
        const lineLen = WORDMARK[li].length;
        if (pos + lineLen <= i) {
          built[li] = WORDMARK[li];
          pos += lineLen + 1;
        } else if (pos < i) {
          built[li] = WORDMARK[li].slice(0, i - pos);
          pos = i;
          break;
        }
      }
      setWordmarkLines(built);
      if (i >= allText.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, []);

  // Uptime ticker
  useEffect(() => {
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Track count type-up
  useEffect(() => {
    if (trackCount === 0) return;
    let n = 0;
    const step = Math.max(1, Math.ceil(trackCount / 30));
    const id = setInterval(() => {
      n = Math.min(n + step, trackCount);
      setDisplayCount(n);
      if (n >= trackCount) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [trackCount]);

  // Signal fluctuation
  useEffect(() => {
    const id = setInterval(() => {
      setSignal(0.45 + Math.random() * 0.55);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={{ padding: '2rem 0 1.5rem', textAlign: 'center' }}>
      {/* ASCII wordmark — scrolls horizontally if viewport too narrow to fit */}
      <div
        role="img"
        aria-label="EchoRift Sounds"
        className="hero-wordmark"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'clamp(10px, 2vw, 15px)',
          color: '#ffb000',
          letterSpacing: '0.04em',
          lineHeight: 1.4,
          marginBottom: '0.75rem',
          whiteSpace: 'pre',
        }}
      >
        {wordmarkLines.map((line, i) => (
          <div key={i} aria-hidden="true">{line}</div>
        ))}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.1em',
          marginBottom: '1.25rem',
        }}
      >
        <span aria-hidden="true" style={{ color: '#ffb000' }}>&gt;</span>
        {' '}a retro audio archive
        <span aria-hidden="true" style={{ animation: 'blink 1s step-start infinite', color: '#ffb000' }}>▮</span>
      </div>

      {/* Status strip */}
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'inline-flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
          padding: '0.4rem 1rem',
          border: '1px solid #1a1f12',
          background: '#11140c',
        }}
      >
        <span>
          UPTIME <span style={{ color: '#ffb000' }}>{fmt(uptime)}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          TRACKS <span style={{ color: '#ffb000' }}>{String(displayCount).padStart(3, '0')}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          SIGNAL <SignalBars level={signal} />
        </span>
      </div>
    </header>
  );
}
