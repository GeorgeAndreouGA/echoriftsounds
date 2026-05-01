'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ScheduledTrack } from '@echorift/shared';
import * as api from '../lib/api';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';
import { Countdown } from './Countdown';

interface Props {
  items: ScheduledTrack[];
  csrfToken: string;
  onSuccess: () => void;
}


export function AdminScheduledList({ items, csrfToken, onSuccess }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string[]>([]);

  const filtered = items.filter((item) => item.file.toLowerCase().includes(search.toLowerCase()));

  const toggle = (file: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, file] : prev.filter((f) => f !== file)));

  const handleRemove = async () => {
    if (selected.length === 0 || !csrfToken) {
      setError(csrfToken ? 'Nothing selected.' : 'Session expired.');
      return;
    }
    setRemoving(selected);
    setTimeout(async () => {
      try {
        await api.removeScheduled(selected, csrfToken);
        setSelected([]);
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

      <div className="crt-file-list" role="list" aria-label="Scheduled tracks">
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
            &gt; NO TRACKS SCHEDULED
          </div>
        )}
        <AnimatePresence>
          {filtered.map((item) => (
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
              exit={{ opacity: 0, scaleY: 0, filter: 'saturate(4) hue-rotate(90deg)', transition: { duration: 0.3 } }}
              transition={{ duration: 0.2 }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                <CrtCheckbox
                  checked={selected.includes(item.file)}
                  onChange={(v) => toggle(item.file, v)}
                  ariaLabel={`Select ${item.file} for removal`}
                  variant="red"
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file}
                </span>
              </div>
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
          disabled={!csrfToken || selected.length === 0}
        >
          [ REMOVE SELECTED ]
        </button>
      </div>
    </div>
  );
}
