'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../lib/api';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';

interface Props {
  items: string[];
  csrfToken: string;
  onSuccess: () => void;
}

export function AdminPublishedList({ items, csrfToken, onSuccess }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string[]>([]);

  const filtered = items.filter((f) => f.toLowerCase().includes(search.toLowerCase()));

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
        await api.unpublish(selected, csrfToken);
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
      <div className="crt-section-title">PUBLISHED TRACKS</div>
      <SearchBox onSearch={setSearch} placeholder="Filter published..." />

      <div className="crt-file-list" role="list" aria-label="Published tracks">
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
            &gt; NO TRACKS PUBLISHED
          </div>
        )}
        <AnimatePresence>
          {filtered.map((file, i) => (
            <motion.div
              key={file}
              role="listitem"
              initial={{ opacity: 0, x: 12 }}
              animate={{
                opacity: removing.includes(file) ? 0 : 1,
                scaleY: removing.includes(file) ? 0 : 1,
                x: 0,
                filter: removing.includes(file) ? 'saturate(4) hue-rotate(90deg)' : 'none',
              }}
              exit={{ opacity: 0, scaleY: 0, filter: 'saturate(4) hue-rotate(90deg)', transition: { duration: 0.3 } }}
              transition={{ duration: 0.18, delay: i * 0.02 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                borderBottom: '1px solid #1a1f12',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                color: '#ffb000',
              }}
            >
              {/* New-row indicator */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#39ff14',
                  boxShadow: '0 0 4px #39ff14',
                  flexShrink: 0,
                  animation: 'pulse-dot 2.5s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }}
                aria-hidden
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                <CrtCheckbox
                  checked={selected.includes(file)}
                  onChange={(v) => toggle(file, v)}
                  ariaLabel={`Select ${file} for unpublishing`}
                  variant="red"
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file}
                </span>
              </div>
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
          [ UNPUBLISH SELECTED ]
        </button>
      </div>
    </div>
  );
}
