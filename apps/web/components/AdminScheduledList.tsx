'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DUR, EASE, s } from './motion/tokens';
import type { Category, ScheduledTrack } from '@echorift/shared';
import * as api from '../lib/api';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';
import { CrtSelectionBar } from './CrtSelectionBar';
import { Countdown } from './Countdown';

interface Props {
  items: ScheduledTrack[];
  categories: Category[];
  csrfToken: string;
  onSuccess: () => void;
}


export function AdminScheduledList({ items, categories, csrfToken, onSuccess }: Props) {
  const categoryName = (id: string | null | undefined) =>
    (id && categories.find((c) => c.id === id)?.name) || 'NEEDS CATEGORY';

  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string[]>([]);

  const filtered = items.filter((item) => item.file.toLowerCase().includes(search.toLowerCase()));

  const sel = useMultiSelect({
    all: items.map((item) => item.file),
    visible: filtered.map((item) => item.file),
  });

  // Scheduled entries have no stored position — the array is append order — so
  // rows are numbered 1..N over what is currently on screen, and a typed range
  // means exactly the numbers rendered beside those rows.
  const applyRange = (numbers: number[], additive: boolean) => {
    const files = numbers
      .map((n) => filtered[n - 1]?.file)
      .filter((f): f is string => f !== undefined);
    (additive ? sel.add : sel.replace)(files);
    return { matched: files.length, missing: numbers.length - files.length };
  };

  const handleRemove = async () => {
    const targets = sel.selected;
    if (targets.length === 0 || !csrfToken) {
      setError(csrfToken ? 'Nothing selected.' : 'Session expired.');
      return;
    }
    setRemoving(targets);
    setTimeout(async () => {
      try {
        await api.removeScheduled(targets, csrfToken);
        sel.clear();
        onSuccess();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRemoving([]);
      }
    }, 350);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="crt-section-title">SCHEDULED TRACKS</div>
      <SearchBox onSearch={setSearch} placeholder="Filter scheduled..." />

      <CrtSelectionBar
        count={sel.count}
        totalVisible={filtered.length}
        allVisibleSelected={sel.allVisibleSelected}
        onSelectAll={sel.selectAll}
        onClear={sel.clear}
        onApplyRange={applyRange}
        disabled={removing.length > 0}
      />

      <div className="crt-file-list" role="list" aria-label="Scheduled tracks">
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
            &gt; NO TRACKS SCHEDULED
          </div>
        )}
        <AnimatePresence>
          {filtered.map((item, i) => (
            <motion.div
              key={item.file}
              role="listitem"
              initial={{ opacity: 0, x: -8 }}
              animate={{
                opacity: removing.includes(item.file) ? 0 : 1,
                scaleY: removing.includes(item.file) ? 0 : 1,
                x: 0,
                filter: removing.includes(item.file) ? 'saturate(4) hue-rotate(90deg)' : 'none',
              }}
              exit={{ opacity: 0, scaleY: 0, filter: 'saturate(4) hue-rotate(90deg)', transition: { duration: s(DUR.d4), ease: [...EASE.kill] } }}
              transition={{ duration: s(DUR.d3), ease: [...EASE.snap] }}
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
                  checked={sel.has(item.file)}
                  onChange={(v, mods) => sel.toggle(item.file, v, mods.shift)}
                  ariaLabel={`Select ${item.file} for removal`}
                  variant="red"
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file}
                </span>
              </div>
              <span
                style={{
                  color: item.category ? '#8a5f00' : '#ff3b3b',
                  fontSize: '10px',
                  flexShrink: 0,
                  letterSpacing: '0.06em',
                }}
              >
                {categoryName(item.category).toUpperCase()}
              </span>
              <Countdown time={item.time} />
              <span style={{ color: '#8a5f00', fontSize: '10px', flexShrink: 0 }}>
                {new Date(item.time).toLocaleString()}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && (
        <p className="crt-error" role="alert" style={{ marginTop: '0.5rem' }}>
          &gt; {error}
        </p>
      )}

      <div style={{ marginTop: '0.75rem' }}>
        <button
          className="crt-btn danger"
          onClick={handleRemove}
          disabled={!csrfToken || sel.count === 0}
        >
          [ REMOVE SELECTED ]
        </button>
      </div>
    </div>
  );
}
