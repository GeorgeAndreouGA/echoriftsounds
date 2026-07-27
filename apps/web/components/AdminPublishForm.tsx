'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Category } from '@echorift/shared';
import * as api from '../lib/api';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';
import { CrtSelectionBar } from './CrtSelectionBar';
import { CategorySelect } from './CategorySelect';
import { ScheduleModal } from './ScheduleModal';
import { Caret } from './icons/CrtIcons';

interface Props {
  files: string[];
  categories: Category[];
  csrfToken: string;
  onSuccess: () => Promise<void> | void;
}

export function AdminPublishForm({ files, categories, csrfToken, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [scheduleFiles, setScheduleFiles] = useState<string[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A category is mandatory. When there's exactly one, preselect it so the
  // common case needs no extra click; otherwise force a conscious choice.
  useEffect(() => {
    if (categories.length === 1) setCategory((prev) => prev ?? categories[0].id);
  }, [categories]);

  const filtered = files.filter((file) => file.toLowerCase().includes(search.toLowerCase()));

  // Selection lives in the hook, which prunes against `files` on read. It used
  // to be local state seeded by an effect keyed on `files` — and since the
  // parent rebuilds that array every render, every SSE tick silently cleared
  // every checkbox mid-selection.
  const sel = useMultiSelect({ all: files, visible: filtered });

  // Rows are numbered 1..N over the filtered view, so a typed range means the
  // numbers actually rendered beside the rows.
  const applyRange = (numbers: number[], additive: boolean) => {
    const picked = numbers
      .map((n) => filtered[n - 1])
      .filter((f): f is string => f !== undefined);
    (additive ? sel.add : sel.replace)(picked);
    return { matched: picked.length, missing: numbers.length - picked.length };
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken) { setError('Session expired. Please reload.'); return; }

    const toPublish = sel.selected;
    if (toPublish.length === 0) {
      setError('Select at least one file to publish.');
      return;
    }
    if (!category) {
      setError('Select a category.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.publish(toPublish, [], csrfToken, category);
      sel.clear();
      await onSuccess();
      showSuccess(`> PUBLISHED ${toPublish.length} TRACK${toPublish.length !== 1 ? 'S' : ''}`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes('timeout') || msg.includes('abort') ? 'Request timed out' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleConfirm = async (
    entries: { file: string; time: string }[],
    scheduleCategory: string | null,
  ) => {
    await api.publish(
      [],
      entries.map((entry) => ({ ...entry, category: scheduleCategory })),
      csrfToken,
    );
    setScheduleFiles(null);
    sel.clear();
    await onSuccess();
    showSuccess(`> SCHEDULED ${entries.length} TRACK${entries.length !== 1 ? 'S' : ''}`);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="crt-section-title">PUBLISH / SCHEDULE TRACKS</div>
      <SearchBox onSearch={setSearch} placeholder="Filter files..." />

      {/* Outside the <form> on purpose: Enter inside the range input would
          otherwise submit it and publish. */}
      <CrtSelectionBar
        count={sel.count}
        totalVisible={filtered.length}
        allVisibleSelected={sel.allVisibleSelected}
        onSelectAll={sel.selectAll}
        onClear={sel.clear}
        onApplyRange={applyRange}
        disabled={submitting}
      />

      <form onSubmit={handleSubmit}>
        <div className="crt-file-list" role="list" aria-label="Available tracks">
          {filtered.length === 0 && (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                color: '#8a5f00',
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: '11px',
              }}
              role="status"
            >
              &gt; NO UNPUBLISHED TRACKS
            </div>
          )}
          {filtered.map((file, i) => (
            <div
              key={file}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                borderBottom: '1px solid #1a1f12',
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: '11px',
                color: '#ffb000',
              }}
            >
              <span style={{ color: '#8a5f00', minWidth: '2rem', flexShrink: 0 }}>
                {String(i + 1).padStart(3, '0')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                <CrtCheckbox
                  checked={sel.has(file)}
                  onChange={(v, mods) => sel.toggle(file, v, mods.shift)}
                  ariaLabel={`Publish ${file}`}
                  variant="amber"
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file}
                </span>
              </div>
              <button
                type="button"
                className="crt-btn small"
                onClick={() => setScheduleFiles([file])}
                aria-label={`Schedule ${file}`}
                style={{ flexShrink: 0 }}
              >
                [ SCHEDULE ]
              </button>
            </div>
          ))}
        </div>

        {successMsg && (
          <p style={{ marginTop: '0.5rem', color: '#39ff14', fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: '11px' }} role="status">
            {successMsg}
          </p>
        )}

        {error && (
          <p className="crt-error" role="alert" style={{ marginTop: '0.5rem' }}>
            &gt; {error}
          </p>
        )}

        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <button type="submit" className="crt-btn" disabled={submitting || !csrfToken || !category}>
            {submitting ? (
              <>
                PUBLISHING<Caret speed={0.6} />
              </>
            ) : (
              '[ PUBLISH NOW ]'
            )}
          </button>
          <button
            type="button"
            className="crt-btn"
            onClick={() => setScheduleFiles(sel.selected)}
            disabled={submitting || !csrfToken || sel.count === 0}
          >
            [ SCHEDULE SELECTED ]
          </button>
          {/* Applies to every file in this publish batch. */}
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '10px',
              color: '#8a5f00',
              letterSpacing: '0.08em',
            }}
          >
            INTO
          </span>
          <CategorySelect
            categories={categories}
            value={category}
            onChange={setCategory}
            ariaLabel="Category for published tracks"
            disabled={submitting}
          />
        </div>
      </form>

      <AnimatePresence>
        {scheduleFiles && scheduleFiles.length > 0 && (
          <ScheduleModal
            files={scheduleFiles}
            categories={categories}
            defaultCategory={category}
            csrfToken={csrfToken}
            onClose={() => setScheduleFiles(null)}
            onConfirm={handleScheduleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
