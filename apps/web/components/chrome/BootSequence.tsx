'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DUR, EASE, SEQ, s } from '../motion/tokens';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import { Caret } from '../icons/CrtIcons';

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
  // 'none' never reaches here — BootSequence skips the screen entirely — so this
  // only picks between the full power-off and the cheaper fade on 'light'.
  const tier = useMotionTier();

  const skip = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), SEQ.bootWarmupMs);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase < 1) return;
    if (lineIdx >= BOOT_LINES.length) {
      const t = setTimeout(onDone, SEQ.bootHoldMs);
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
        setTimeout(
          () => setLineIdx((n) => n + 1),
          lineIdx === BOOT_LINES.length - 1 ? SEQ.bootLastGapMs : SEQ.bootLineGapMs,
        );
      }
    }, 1000 / SEQ.cpsBoot);
    return () => clearInterval(interval);
  }, [phase, lineIdx, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={
        tier === 'full'
          ? { opacity: 0, scaleY: 0.05, filter: 'brightness(6)' }
          : { opacity: 0 }
      }
      transition={{ duration: s(DUR.d2), ease: [...EASE.kill] }}
      className="cur-pointer"
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
      }}
      onClick={skip}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) =>
        (e.key === 'Enter' || e.key === ' ') && skip()
      }
      tabIndex={0}
      role="status"
      aria-label="Boot sequence loading, press any key to skip"
    >
      {/* Warmup glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0.08, 0.12, 0.06] }}
        transition={{ duration: s(DUR.d5), times: [0, 0.2, 0.4, 0.6, 1], ease: [...EASE.cut] }}
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
          fontFamily: "var(--font-jetbrains-mono), monospace",
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
              <Caret speed={0.8} />
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          fontSize: '10px',
          color: '#8a5f00',
          fontFamily: "var(--font-jetbrains-mono), monospace",
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
  const tier = useMotionTier();

  useEffect(() => {
    // The boot screen is ~2.5s of full-screen, purely decorative animation. WCAG
    // 2.3.3 asks for the end state, and a boot screen's end state is the site —
    // so the right answer for reduced motion isn't "type it instantly", it's
    // "don't". Skipped before BootScreen ever mounts.
    if (tier === 'none') {
      setBooted(true);
      return;
    }
    try {
      if (sessionStorage.getItem('__booted')) {
        setBooted(true);
      } else {
        setBooted(false);
      }
    } catch {
      setBooted(true);
    }
  }, [tier]);

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
          transition={{ duration: s(DUR.d4), ease: [...EASE.decay] }}
          style={{ minHeight: '100vh' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
