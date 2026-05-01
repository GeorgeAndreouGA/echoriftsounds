'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import * as api from '../lib/api';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';
import { ScheduleModal } from './ScheduleModal';

interface FileChoice {
  file: string;
  publish: boolean;
}

interface Props {
  files: string[];
  csrfToken: string;
  onSuccess: () => Promise<void> | void;
}

export function AdminPublishForm({ files, csrfToken, onSuccess }: Props) {
  const [choices, setChoices] = useState<FileChoice[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setChoices(files.map((file) => ({ file, publish: false })));
  }, [files]);

  const togglePublish = (file: string, value: boolean) =>
    setChoices((prev) => prev.map((c) => (c.file === file ? { ...c, publish: value } : c)));

  const filtered = choices.filter((c) => c.file.toLowerCase().includes(search.toLowerCase()));

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken) { setError('Session expired. Please reload.'); return; }

    const toPublish = choices.filter((c) => c.publish).map((c) => c.file);
    if (toPublish.length === 0) {
      setError('Select at least one file to publish.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.publish(toPublish, [], csrfToken);
      setChoices((prev) => prev.map((c) => ({ ...c, publish: false })));
      await onSuccess();
      showSuccess(`> PUBLISHED ${toPublish.length} TRACK${toPublish.length !== 1 ? 'S' : ''}`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes('timeout') || msg.includes('abort') ? 'Request timed out' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleConfirm = async (timeIso: string) => {
    if (!scheduleTarget) return;
    await api.publish([], [{ file: scheduleTarget, time: timeIso }], csrfToken);
    setScheduleTarget(null);
    await onSuccess();
    showSuccess(`> SCHEDULED 1 TRACK`);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="crt-section-title">PUBLISH / SCHEDULE TRACKS</div>
      <SearchBox onSearch={setSearch} placeholder="Filter files..." />
      <form onSubmit={handleSubmit}>
        <div className="crt-file-list" role="list" aria-label="Available tracks">
          {filtered.length === 0 && (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                color: '#8a5f00',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
              }}
              role="status"
            >
              &gt; NO UNPUBLISHED TRACKS
            </div>
          )}
          {filtered.map((choice, i) => (
            <div
              key={choice.file}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                borderBottom: '1px solid #1a1f12',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                color: '#ffb000',
              }}
            >
              <span style={{ color: '#8a5f00', minWidth: '2rem', flexShrink: 0 }}>
                {String(i + 1).padStart(3, '0')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                <CrtCheckbox
                  checked={choice.publish}
                  onChange={(v) => togglePublish(choice.file, v)}
                  ariaLabel={`Publish ${choice.file}`}
                  variant="amber"
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {choice.file}
                </span>
              </div>
              <button
                type="button"
                className="crt-btn small"
                onClick={() => setScheduleTarget(choice.file)}
                aria-label={`Schedule ${choice.file}`}
                style={{ flexShrink: 0 }}
              >
                [ SCHEDULE ]
              </button>
            </div>
          ))}
        </div>

        {successMsg && (
          <p style={{ marginTop: '0.5rem', color: '#39ff14', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }} role="status">
            {successMsg}
          </p>
        )}

        {error && (
          <p className="crt-error" role="alert" style={{ marginTop: '0.5rem' }}>
            &gt; {error}
          </p>
        )}

        <div style={{ marginTop: '0.75rem' }}>
          <button type="submit" className="crt-btn" disabled={submitting || !csrfToken}>
            {submitting ? (
              <>
                PUBLISHING<span aria-hidden="true" style={{ animation: 'blink 0.6s step-start infinite' }}>▮</span>
              </>
            ) : (
              '[ PUBLISH NOW ]'
            )}
          </button>
        </div>
      </form>

      <AnimatePresence>
        {scheduleTarget && (
          <ScheduleModal
            file={scheduleTarget}
            csrfToken={csrfToken}
            onClose={() => setScheduleTarget(null)}
            onConfirm={handleScheduleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
