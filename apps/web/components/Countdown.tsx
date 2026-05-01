'use client';

import { useState, useEffect } from 'react';

function fmtCountdown(target: string) {
  const diff = Math.max(0, new Date(target).getTime() - Date.now());
  const h = Math.floor(diff / 3_600_000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3_600_000) / 60_000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60_000) / 1_000).toString().padStart(2, '0');
  if (diff === 0) return 'RELEASED';
  return `T-${h}:${m}:${s}`;
}

export function Countdown({ time }: { time: string }) {
  const [label, setLabel] = useState(fmtCountdown(time));
  useEffect(() => {
    const id = setInterval(() => setLabel(fmtCountdown(time)), 1000);
    return () => clearInterval(id);
  }, [time]);
  return (
    <span
      style={{
        color: '#22d3ee',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        letterSpacing: '0.06em',
      }}
      aria-live="off"
    >
      {label}
    </span>
  );
}

export function isPast(isoDatetime: string): boolean {
  return new Date(isoDatetime).getTime() <= Date.now();
}
