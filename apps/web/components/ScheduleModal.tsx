'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CrtScheduler } from './CrtScheduler';

interface Props {
  file: string;
  csrfToken: string;
  onClose: () => void;
  onConfirm: (timeIso: string) => Promise<void>;
}

export function ScheduleModal({ file, csrfToken, onClose, onConfirm }: Props) {
  const [datetime, setDatetime] = useState(() => new Date(Date.now() + 3_600_000).toISOString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleConfirm = async () => {
    if (!csrfToken) { setError('Session expired. Please reload.'); return; }
    if (new Date(datetime).getTime() <= Date.now()) {
      setError('Schedule time must be in the future.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(datetime);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes('timeout') || msg.includes('abort') ? 'Request timed out' : msg);
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 11, 6, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        style={{
          background: '#0a0b06',
          border: '1px solid #ffb000',
          maxWidth: '40rem',
          width: '100%',
          maxHeight: 'calc(100vh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 24px rgba(255,176,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div style={titleBarStyle}>
          <span>● ○ ○</span>
          <span id="schedule-modal-title" style={{ flex: 1, textAlign: 'center', color: '#ffb000' }}>
            admin.echorift.local — schedule.sh
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
          <div style={fileLabelStyle}>
            <span style={{ color: '#8a5f00' }}>FILE: </span>
            <span style={{ color: '#ffb000', fontWeight: 700 }}>{file}</span>
          </div>

          <CrtScheduler value={datetime} onChange={setDatetime} />

          {error && (
            <p className="crt-error" role="alert">&gt; {error}</p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
            <button
              type="button"
              className="crt-btn small danger"
              onClick={onClose}
              disabled={submitting}
            >
              [ CANCEL ]
            </button>
            <button
              type="button"
              className="crt-btn small"
              onClick={handleConfirm}
              disabled={submitting || !csrfToken}
            >
              {submitting ? (
                <>
                  SCHEDULING<span aria-hidden="true" style={{ animation: 'blink 0.6s step-start infinite' }}>▮</span>
                </>
              ) : (
                '[ CONFIRM SCHEDULE ]'
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.35rem 0.75rem',
  background: '#11140c',
  borderBottom: '1px solid #ffb000',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  color: '#8a5f00',
  letterSpacing: '0.06em',
  userSelect: 'none',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#ff3b3b',
  fontSize: '12px',
  cursor: 'pointer',
  padding: '0 0.25rem',
};

const fileLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  letterSpacing: '0.04em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
