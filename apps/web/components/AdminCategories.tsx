'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DUR, EASE, s } from './motion/tokens';
import type { Category } from '@echorift/shared';
import * as api from '../lib/api';

interface Props {
  items: Category[];
  /** Published track count per category id — shown so a delete isn't a blind action. */
  counts: Record<string, number>;
  csrfToken: string;
  onSuccess: () => Promise<void> | void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.6rem',
  borderBottom: '1px solid #1a1f12',
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: '11px',
  color: '#ffb000',
};

export function AdminCategories({ items, counts, csrfToken, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    if (!csrfToken) {
      setError('Session expired. Please reload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await fn();
      await onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    await run(async () => {
      await api.createCategory(name.trim(), csrfToken);
      setName('');
    });
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    await run(async () => {
      await api.renameCategory(id, editingName.trim(), csrfToken);
      setEditingId(null);
      setEditingName('');
    });
  };

  const handleDelete = async (cat: Category) => {
    // A category with tracks can't be deleted (the server enforces this too);
    // the button is disabled in that case, so this is the empty-category path.
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    await run(() => api.deleteCategories([cat.id], csrfToken));
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="crt-section-title">CATEGORIES</div>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          className="crt-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NEW CATEGORY NAME..."
          aria-label="New category name"
          maxLength={64}
        />
        <button type="submit" className="crt-btn small" disabled={busy || !csrfToken}>
          [ CREATE ]
        </button>
      </form>

      <div className="crt-file-list" role="list" aria-label="Categories">
        {items.length === 0 && (
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
            &gt; NO CATEGORIES YET
          </div>
        )}
        <AnimatePresence>
          {items.map((cat) => (
            <motion.div
              key={cat.id}
              role="listitem"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scaleY: 0, filter: 'saturate(4) hue-rotate(90deg)' }}
              transition={{ duration: s(DUR.d3), ease: [...EASE.snap] }}
              style={rowStyle}
            >
              {editingId === cat.id ? (
                <>
                  <input
                    className="crt-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    aria-label={`Rename ${cat.name}`}
                    maxLength={64}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(cat.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    className="crt-btn small"
                    onClick={() => handleRename(cat.id)}
                    disabled={busy}
                  >
                    [ SAVE ]
                  </button>
                  <button
                    type="button"
                    className="crt-btn small danger"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                  >
                    [ CANCEL ]
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.name}
                  </span>
                  <span style={{ color: '#8a5f00', fontSize: '10px', flexShrink: 0 }}>
                    {counts[cat.id] ?? 0} TRACKS
                  </span>
                  <button
                    type="button"
                    className="crt-btn small"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditingName(cat.name);
                    }}
                    disabled={busy}
                    aria-label={`Rename ${cat.name}`}
                    style={{ flexShrink: 0 }}
                  >
                    [ RENAME ]
                  </button>
                  <button
                    type="button"
                    className="crt-btn small danger"
                    onClick={() => handleDelete(cat)}
                    disabled={busy || (counts[cat.id] ?? 0) > 0}
                    aria-label={`Delete ${cat.name}`}
                    title={
                      (counts[cat.id] ?? 0) > 0
                        ? 'Reassign or unpublish its tracks first'
                        : undefined
                    }
                    style={{ flexShrink: 0 }}
                  >
                    [ DELETE ]
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && (
        <p className="crt-error" role="alert" style={{ marginTop: '0.5rem' }}>
          &gt; {error}
        </p>
      )}
    </div>
  );
}
