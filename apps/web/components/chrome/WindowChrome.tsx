'use client';

import { motion } from 'framer-motion';
import { useVariants } from '../motion/variants';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import { StatusDot, WindowDots } from '../icons/CrtIcons';

interface Props {
  title?: string;
  children: React.ReactNode;
  delay?: number;
}

export function WindowChrome({ title = 'terminal', children, delay = 0 }: Props) {
  const scanWipe = useVariants('scanWipe');
  const tier = useMotionTier();

  return (
    <motion.section
      variants={scanWipe}
      initial="hidden"
      animate="visible"
      // The stagger is motion too: on 'none' the variants are instant, but an
      // un-gated delay would still deal the panels in one at a time.
      transition={{ delay: tier === 'none' ? 0 : delay }}
      style={{ marginBottom: '1.5rem' }}
    >
      {/* Titlebar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.75rem',
          background: '#0a0b06',
          border: '1px solid #ffb000',
          borderBottom: 'none',
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
          userSelect: 'none',
        }}
      >
        <WindowDots />
        <span style={{ flex: 1, textAlign: 'center', color: '#ffb000' }}>
          admin.echorift.local — {title}
        </span>
        {/* Activity indicator */}
        <span
          role="img"
          aria-label="Terminal active"
          style={{
            color: '#39ff14',
            display: 'inline-flex',
            alignItems: 'center',
            animation: 'blink 2s step-start infinite',
          }}
        >
          <StatusDot />
        </span>
      </div>

      {/* Content */}
      <div
        className="crt-panel"
        style={{ padding: 0, border: '1px solid #ffb000' }}
      >
        {children}
      </div>
    </motion.section>
  );
}
