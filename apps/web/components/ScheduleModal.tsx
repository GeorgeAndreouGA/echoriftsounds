'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { DUR, EASE, s } from './motion/tokens';
import type { Category } from '@echorift/shared';
import { isValidYoutubeUrl } from '@echorift/shared';
import { CrtScheduler } from './CrtScheduler';
import { CategorySelect } from './CategorySelect';
import { Countdown } from './Countdown';
import { Caret, CloseIcon, WindowDots } from './icons/CrtIcons';

interface Props {
  /** One or more files. Length drives the stagger UI. */
  files: string[];
  categories: Category[];
  defaultCategory: string | null;
  /** Seeds the per-file link inputs below from drafts already typed into the
   * publish form, so scheduling a file doesn't mean retyping its link. */
  initialYoutubeUrls?: Record<string, string>;
  csrfToken: string;
  onClose: () => void;
  onConfirm: (
    scheduled: { file: string; time: string; youtubeUrl: string }[],
    category: string | null,
  ) => Promise<void>;
}

const STAGGER_PRESETS: { label: string; minutes: number }[] = [
  { label: '[ NONE ]', minutes: 0 },
  { label: '[ +1H ]', minutes: 60 },
  { label: '[ +6H ]', minutes: 360 },
  { label: '[ +12H ]', minutes: 720 },
  { label: '[ +24H ]', minutes: 1440 },
  { label: '[ +7D ]', minutes: 10080 },
];

export function ScheduleModal({
  files,
  categories,
  defaultCategory,
  initialYoutubeUrls,
  csrfToken,
  onClose,
  onConfirm,
}: Props) {
  const [datetime, setDatetime] = useState(() => new Date(Date.now() + 3_600_000).toISOString());
  const [staggerMin, setStaggerMin] = useState(0);
  const [category, setCategory] = useState<string | null>(defaultCategory);
  const [youtubeUrls, setYoutubeUrls] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const f of files) seeded[f] = initialYoutubeUrls?.[f] ?? '';
    return seeded;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  const bulk = files.length > 1;
  const linksValid = files.every((f) => isValidYoutubeUrl(youtubeUrls[f]));

  // Plain UTC arithmetic, so "+24H" is exactly 24 hours rather than "the same
  // wall-clock time tomorrow" — across a DST boundary those differ by an hour.
  // The API stores absolute instants, so this is the honest interpretation.
  const entries = useMemo(
    () =>
      files.map((file, i) => ({
        file,
        time: new Date(new Date(datetime).getTime() + i * staggerMin * 60_000).toISOString(),
        youtubeUrl: youtubeUrls[file] ?? '',
      })),
    [files, datetime, staggerMin, youtubeUrls],
  );

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
    // Checking the start alone is sufficient: the stagger is non-negative, so
    // every later entry is further into the future by construction.
    if (new Date(datetime).getTime() <= Date.now()) {
      setError('Schedule time must be in the future.');
      return;
    }
    if (!Number.isInteger(staggerMin) || staggerMin < 0) {
      setError('Interval must be a whole number of minutes, 0 or more.');
      return;
    }
    if (!category) {
      setError('Select a category.');
      return;
    }
    if (!linksValid) {
      setError('Every track needs a valid YouTube link.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(entries, category);
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
      transition={{ duration: s(DUR.d2), ease: [...EASE.snap] }}
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
        transition={{ duration: s(DUR.d2), ease: [...EASE.snap] }}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
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
          <WindowDots />
          <span id="schedule-modal-title" style={{ flex: 1, textAlign: 'center', color: '#ffb000' }}>
            admin.echorift.local — schedule.sh
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cur-pointer"
            style={closeBtnStyle}
          >
            <CloseIcon size={12} />
          </button>
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
          <div style={fileLabelStyle}>
            {bulk ? (
              <>
                <span style={{ color: '#8a5f00' }}>FILES: </span>
                <span style={{ color: '#ffb000', fontWeight: 700 }}>
                  {files.length} SELECTED
                </span>
              </>
            ) : (
              <>
                <span style={{ color: '#8a5f00' }}>FILE: </span>
                <span style={{ color: '#ffb000', fontWeight: 700 }}>{files[0]}</span>
              </>
            )}
          </div>

          <CrtScheduler value={datetime} onChange={setDatetime} />

          {/* 1:1 per file, unlike category/time — shown for a single file too,
              not just a bulk batch. Seeded from initialYoutubeUrls when the
              publish form already had a draft typed in. */}
          <div className="crt-file-list" role="list" aria-label="YouTube links">
            {files.map((file, i) => {
              const url = youtubeUrls[file] ?? '';
              const invalid = !isValidYoutubeUrl(url);
              return (
                <div
                  key={file}
                  role="listitem"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    padding: '0.35rem 0.6rem',
                    borderBottom: '1px solid #1a1f12',
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    fontSize: '11px',
                    color: '#ffb000',
                  }}
                >
                  <span style={{ color: '#8a5f00', minWidth: '2rem', flexShrink: 0 }}>
                    {String(i + 1).padStart(3, '0')}
                  </span>
                  <span
                    style={{
                      flex: '0 1 auto',
                      minWidth: 0,
                      maxWidth: '40%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {file}
                  </span>
                  <input
                    type="url"
                    className="crt-input"
                    placeholder="https://youtube.com/watch?v=…"
                    value={url}
                    disabled={submitting}
                    onChange={(e) =>
                      setYoutubeUrls((prev) => ({ ...prev, [file]: e.target.value }))
                    }
                    aria-label={`YouTube link for ${file}`}
                    aria-invalid={invalid}
                    style={{
                      flex: '1 1 10rem',
                      minWidth: 0,
                      padding: '0.25rem 0.4rem',
                      fontSize: 'max(11px, 16px)',
                      borderColor: invalid ? '#ff3b3b' : undefined,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {bulk && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ ...fileLabelStyle, color: '#8a5f00' }}>EVERY:</span>
                {STAGGER_PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    type="button"
                    className="crt-btn small"
                    aria-pressed={staggerMin === preset.minutes}
                    onClick={() => setStaggerMin(preset.minutes)}
                    disabled={submitting}
                    style={
                      staggerMin === preset.minutes
                        ? { borderColor: '#39ff14', color: '#39ff14' }
                        : undefined
                    }
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="crt-input"
                  value={staggerMin}
                  aria-label="Interval between releases, in minutes"
                  disabled={submitting}
                  onChange={(e) => setStaggerMin(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  style={{ width: '5rem', flex: '0 0 5rem', padding: '0.25rem 0.4rem', fontSize: 'max(11px, 16px)' }}
                />
                <span style={{ ...fileLabelStyle, color: '#8a5f00' }}>MIN</span>
              </div>

              <div className="crt-file-list" role="list" aria-label="Scheduled release times">
                {entries.map((entry, i) => (
                  <div
                    key={entry.file}
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      padding: '0.35rem 0.6rem',
                      borderBottom: '1px solid #1a1f12',
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      fontSize: '11px',
                      color: '#ffb000',
                    }}
                  >
                    <span style={{ color: '#8a5f00', minWidth: '2rem', flexShrink: 0 }}>
                      {String(i + 1).padStart(3, '0')}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.file}
                    </span>
                    <span style={{ color: '#8a5f00', fontSize: '10px', flexShrink: 0 }}>
                      {new Date(entry.time).toLocaleString()}
                    </span>
                    <Countdown time={entry.time} />
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ ...fileLabelStyle, color: '#8a5f00' }}>CATEGORY:</span>
            <CategorySelect
              categories={categories}
              value={category}
              onChange={setCategory}
              ariaLabel={bulk ? 'Category for scheduled tracks' : `Category for ${files[0]}`}
              disabled={submitting}
            />
          </div>

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
              disabled={submitting || !csrfToken || !category || !linksValid}
            >
              {submitting ? (
                <>
                  SCHEDULING<Caret speed={0.6} />
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
  fontFamily: "var(--font-jetbrains-mono), monospace",
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
  padding: '0 0.25rem',
  display: 'inline-flex',
  alignItems: 'center',
};

const fileLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: '11px',
  letterSpacing: '0.04em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
