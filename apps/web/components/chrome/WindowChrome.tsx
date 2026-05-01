'use client';

import { motion } from 'framer-motion';
import { scanWipe } from '../motion/glitch';

interface Props {
  title?: string;
  children: React.ReactNode;
  delay?: number;
}

export function WindowChrome({ title = 'terminal', children, delay = 0 }: Props) {

  return (
    <motion.section
      variants={scanWipe}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
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
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
          userSelect: 'none',
        }}
      >
        <span>● ○ ○</span>
        <span style={{ flex: 1, textAlign: 'center', color: '#ffb000' }}>
          admin.echorift.local — {title}
        </span>
        {/* Activity indicator */}
        <span
          role="img"
          aria-label="Terminal active"
          style={{
            color: '#39ff14',
            fontSize: '10px',
            animation: 'blink 2s step-start infinite',
          }}
        >
          ◉
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
