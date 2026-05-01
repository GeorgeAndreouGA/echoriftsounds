'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const BOOT_LINES = [
  '> INITIALIZING AUDIO ARCHIVE...',
  '> MOUNTING PHOSPHOR DISPLAY.......... OK',
  '> LOADING TRACK INDEX................. OK',
  '> SIGNAL CHECK........................ ██████ OK',
  '> SYSTEM READY.',
  '',
  '  ECHORIFT SOUNDS — TERMINAL v1.0',
];


function BootScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const reduceMotion = useReducedMotion();

  const skip = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase < 1) return;
    if (lineIdx >= BOOT_LINES.length) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    const line = BOOT_LINES[lineIdx];
    const chars = line.length;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleLines((prev) => {
        const next = [...prev];
        next[lineIdx] = line.slice(0, i);
        return next;
      });
      if (i >= chars) {
        clearInterval(interval);
        setTimeout(() => setLineIdx((n) => n + 1), lineIdx === BOOT_LINES.length - 1 ? 200 : 60);
      }
    }, 22);
    return () => clearInterval(interval);
  }, [phase, lineIdx, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scaleY: 0.05, filter: 'brightness(6)' }
      }
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0b06',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 4vw, 2rem)',
        cursor: 'pointer',
      }}
      onClick={skip}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && skip()}
      tabIndex={0}
      role="status"
      aria-label="Boot sequence loading, press any key to skip"
    >
      {/* Warmup glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0.08, 0.12, 0.06] }}
        transition={{ duration: 0.4, times: [0, 0.2, 0.4, 0.6, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(255,176,0,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Terminal lines */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'clamp(11px, 2.8vw, 13px)',
          color: '#ffb000',
          maxWidth: 'min(520px, 92vw)',
          width: '100%',
          minHeight: '14rem',
        }}
      >
        {BOOT_LINES.map((_, i) => (
          <div key={i} style={{ minHeight: '1.6em', letterSpacing: '0.04em' }}>
            {visibleLines[i] ?? ''}
            {i === lineIdx && visibleLines[i] !== undefined && (
              <span aria-hidden="true" style={{ animation: 'blink 0.8s step-start infinite' }}>▮</span>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          fontSize: '10px',
          color: '#8a5f00',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.08em',
        }}
      >
        TAP TO SKIP
      </div>
    </motion.div>
  );
}

export function BootSequence({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('__booted')) {
        setBooted(true);
      } else {
        setBooted(false);
      }
    } catch {
      setBooted(true);
    }
  }, []);

  const handleDone = useCallback(() => {
    try { sessionStorage.setItem('__booted', '1'); } catch { /* storage unavailable */ }
    setBooted(true);
  }, []);

  if (booted === null) return null;

  return (
    <AnimatePresence mode="wait">
      {!booted ? (
        <BootScreen key="boot" onDone={handleDone} />
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          style={{ minHeight: '100vh' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
