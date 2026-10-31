'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { DUR, EASE, s } from './motion/tokens';
import type { Category, PublishedTrack } from '@echorift/shared';
import { isValidYoutubeUrl } from '@echorift/shared';
import * as api from '../lib/api';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { SearchBox } from './SearchBox';
import { CrtCheckbox } from './CrtCheckbox';
import { CrtSelectionBar } from './CrtSelectionBar';
import { CategorySelect } from './CategorySelect';
import { DragIcon } from './icons/CrtIcons';

interface Props {
  items: PublishedTrack[];
  categories: Category[];
  csrfToken: string;
  onSuccess: () => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.5rem',
  padding: '0.4rem 0.6rem',
  borderBottom: '1px solid #1a1f12',
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: '11px',
  color: '#ffb000',
  background: '#0a0b06',
  listStyle: 'none',
};

interface RowProps {
  track: PublishedTrack;
  index: number;
  categories: Category[];
  selected: boolean;
  removing: boolean;
  draggable: boolean;
  onToggle: (file: string, checked: boolean, shift: boolean) => void;
  onReassign: (file: string, category: string) => void;
  onSetYoutubeUrl: (file: string, url: string) => Promise<void>;
  onCommit: () => void;
}

/**
 * Edit control for a published track's YouTube link — click-to-edit with an
 * explicit [ SET ] commit, same "higher-stakes field gets an explicit
 * confirm" philosophy as bulk category move / unpublish below, rather than
 * the commit-on-change style the per-row category <select> uses. A mistyped
 * category is a one-click fix; a mistyped link silently breaks playback.
 */
function YoutubeLinkCell({
  file,
  url,
  onSet,
}: {
  file: string;
  url: string | null;
  onSet: (file: string, url: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Picks up a server-side change (e.g. another admin tab) while not mid-edit.
  useEffect(() => {
    if (!editing) setDraft(url ?? '');
  }, [url, editing]);

  const cancel = () => {
    setEditing(false);
    setDraft(url ?? '');
    setErr('');
  };

  const commit = async () => {
    if (!isValidYoutubeUrl(draft)) {
      setErr('Invalid link');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await onSet(file, draft);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="crt-btn small"
        onClick={() => setEditing(true)}
        aria-label={`Edit YouTube link for ${file}`}
        style={{
          flexShrink: 0,
          color: url ? '#8a5f00' : '#ff3b3b',
          borderColor: url ? undefined : '#ff3b3b',
        }}
      >
        {url ? '[ LINK ]' : '[ ⚠ NO LINK ]'}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: '1 1 100%' }}>
      <input
        type="url"
        className="crt-input"
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') cancel();
        }}
        aria-label={`YouTube link for ${file}`}
        aria-invalid={!!err}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          padding: '0.2rem 0.4rem',
          fontSize: 'max(11px, 16px)',
          borderColor: err ? '#ff3b3b' : undefined,
        }}
      />
      <button type="button" className="crt-btn small" onClick={commit} disabled={saving} style={{ flexShrink: 0 }}>
        {saving ? 'SAVING…' : '[ SET ]'}
      </button>
      <button
        type="button"
        className="crt-btn small danger"
        onClick={cancel}
        disabled={saving}
        style={{ flexShrink: 0 }}
      >
        [ CANCEL ]
      </button>
      {err && (
        <span className="crt-error" role="alert" style={{ flexBasis: '100%' }}>
          &gt; {err}
        </span>
      )}
    </div>
  );
}

/** Row body — identical whether or not the row is drag-enabled. */
function RowContent({
  track,
  index,
  categories,
  selected,
  draggable,
  onToggle,
  onReassign,
  onSetYoutubeUrl,
  onDragHandlePointerDown,
}: Omit<RowProps, 'removing' | 'onCommit'> & {
  onDragHandlePointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      {draggable ? (
        <span
          onPointerDown={onDragHandlePointerDown}
          role="button"
          tabIndex={-1}
          aria-label={`Drag ${track.file} to reorder`}
          title="Drag to reorder"
          className="cur-grab"
          style={{
            color: '#8a5f00',
            flexShrink: 0,
            padding: '0 0.2rem',
            touchAction: 'none',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <DragIcon />
        </span>
      ) : (
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: '50%', background: '#39ff14', flexShrink: 0 }}
        />
      )}
      <span style={{ color: '#8a5f00', minWidth: '2.5rem', flexShrink: 0 }}>
        {String(index + 1).padStart(3, '0')}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
        <CrtCheckbox
          checked={selected}
          onChange={(v, mods) => onToggle(track.file, v, mods.shift)}
          ariaLabel={`Select ${track.file} for unpublishing`}
          variant="red"
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.file}
        </span>
      </div>
      {!track.category && (
        <span style={{ color: '#ff3b3b', fontSize: '10px', letterSpacing: '0.06em', flexShrink: 0 }}>
          NEEDS CATEGORY
        </span>
      )}
      <YoutubeLinkCell file={track.file} url={track.youtubeUrl} onSet={onSetYoutubeUrl} />
      <CategorySelect
        categories={categories}
        value={track.category}
        onChange={(next) => onReassign(track.file, next)}
        ariaLabel={`Category for ${track.file}`}
      />
    </>
  );
}

/** Drag-enabled row. dragListener is off so only the handle starts a drag —
 *  otherwise grabbing the checkbox or the category select would drag the row. */
function DraggableRow(props: RowProps) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={props.track}
      dragListener={false}
      dragControls={controls}
      onDragEnd={props.onCommit}
      style={{ ...rowStyle, opacity: props.removing ? 0.3 : 1 }}
      whileDrag={{ boxShadow: '0 0 12px rgba(255,176,0,0.4)', zIndex: 1 }}
    >
      <RowContent {...props} onDragHandlePointerDown={(e) => controls.start(e)} />
    </Reorder.Item>
  );
}

export function AdminPublishedList({ items, categories, csrfToken, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string[]>([]);
  // Local copy so a drag renders instantly; the server is told once on drop.
  const [order, setOrder] = useState<PublishedTrack[]>(items);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setOrder(items);
  }, [items]);

  const searching = search.trim().length > 0;
  const filtered = order.filter((t) => t.file.toLowerCase().includes(search.toLowerCase()));

  const sel = useMultiSelect({
    all: order.map((t) => t.file),
    visible: (searching ? filtered : order).map((t) => t.file),
  });

  // Rows here are labelled with their global position even while filtered, so
  // the visible numbers go sparse (003, 017, 042). A typed range therefore
  // means "the visible rows whose number falls in this span" — which keeps the
  // range input usable with a filter on.
  const applyRange = (numbers: number[], additive: boolean) => {
    const wanted = new Set(numbers);
    const files = (searching ? filtered : order)
      .filter((t) => wanted.has(order.indexOf(t) + 1))
      .map((t) => t.file);
    (additive ? sel.add : sel.replace)(files);
    return { matched: files.length, missing: numbers.length - files.length };
  };

  const commitOrder = async () => {
    if (!csrfToken) {
      setError('Session expired.');
      return;
    }
    const next = orderRef.current.map((t) => t.file);
    setError('');
    try {
      await api.reorderTracks(next, csrfToken);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setOrder(items); // server rejected it — snap back to the known-good order
    }
  };

  const handleReassign = async (file: string, category: string) => {
    if (!csrfToken) {
      setError('Session expired.');
      return;
    }
    setError('');
    try {
      await api.assignCategory([file], category, csrfToken);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Throws rather than setting the page-level `error` — YoutubeLinkCell
  // catches it and shows the message inline, right next to the input that
  // caused it, rather than at the bottom of a possibly-long list.
  const handleSetYoutubeUrl = async (file: string, youtubeUrl: string) => {
    if (!csrfToken) throw new Error('Session expired.');
    await api.updateYoutubeUrl([file], youtubeUrl, csrfToken);
    onSuccess();
  };

  const toggle = (file: string, checked: boolean, shift: boolean) =>
    sel.toggle(file, checked, shift);

  const handleRemove = async () => {
    const targets = sel.selected;
    if (targets.length === 0 || !csrfToken) {
      setError(csrfToken ? 'Nothing selected.' : 'Session expired.');
      return;
    }
    setRemoving(targets);
    setTimeout(async () => {
      try {
        await api.unpublish(targets, csrfToken);
        sel.clear();
        onSuccess();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRemoving([]);
      }
    }, 350);
  };

  // Deliberately gated behind its own button rather than committing on change
  // like the per-row picker does — one stray click there would recategorise
  // every selected track.
  const handleBulkReassign = async () => {
    const targets = sel.selected;
    if (targets.length === 0 || !bulkCategory || !csrfToken) {
      setError(csrfToken ? 'Select tracks and a category first.' : 'Session expired.');
      return;
    }
    setError('');
    try {
      await api.assignCategory(targets, bulkCategory, csrfToken);
      sel.clear();
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="crt-section-title">PUBLISHED TRACKS</div>
      <SearchBox onSearch={setSearch} placeholder="Filter published..." />

      <p
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: '10px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
          margin: '0 0 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}
      >
        {searching ? (
          '> CLEAR THE FILTER TO REORDER TRACKS'
        ) : (
          <>
            {'> DRAG'}
            <DragIcon size={11} />
            {'TO REORDER — THIS IS THE ORDER VISITORS SEE'}
          </>
        )}
      </p>

      {/* Outside Reorder.Group: a non-Reorder.Item child breaks its layout
          bookkeeping and rows start jumping mid-drag. */}
      <CrtSelectionBar
        count={sel.count}
        totalVisible={searching ? filtered.length : order.length}
        allVisibleSelected={sel.allVisibleSelected}
        onSelectAll={sel.selectAll}
        onClear={sel.clear}
        onApplyRange={applyRange}
        disabled={removing.length > 0}
      />

      {filtered.length === 0 ? (
        <div className="crt-file-list" role="list" aria-label="Published tracks">
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
            &gt; NO TRACKS PUBLISHED
          </div>
        </div>
      ) : searching ? (
        // A filtered view is a subset, so dragging within it can't express a
        // position in the full list. Show it read-only until the filter clears.
        <div className="crt-file-list" role="list" aria-label="Published tracks">
          <AnimatePresence initial={false}>
            {filtered.map((track) => (
              <motion.div
                key={track.file}
                role="listitem"
                exit={{ opacity: 0, scaleY: 0, transition: { duration: s(DUR.d4), ease: [...EASE.kill] } }}
                style={{ ...rowStyle, opacity: removing.includes(track.file) ? 0.3 : 1 }}
              >
                <RowContent
                  track={track}
                  index={order.indexOf(track)}
                  categories={categories}
                  selected={sel.has(track.file)}
                  draggable={false}
                  onToggle={toggle}
                  onReassign={handleReassign}
                  onSetYoutubeUrl={handleSetYoutubeUrl}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <Reorder.Group
          as="div"
          axis="y"
          values={order}
          onReorder={setOrder}
          className="crt-file-list"
          aria-label="Published tracks — drag to reorder"
        >
          {order.map((track, i) => (
            <DraggableRow
              key={track.file}
              track={track}
              index={i}
              categories={categories}
              selected={sel.has(track.file)}
              removing={removing.includes(track.file)}
              draggable
              onToggle={toggle}
              onReassign={handleReassign}
              onSetYoutubeUrl={handleSetYoutubeUrl}
              onCommit={commitOrder}
            />
          ))}
        </Reorder.Group>
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
        <button
          className="crt-btn danger"
          onClick={handleRemove}
          disabled={!csrfToken || sel.count === 0}
        >
          [ UNPUBLISH SELECTED ]
        </button>
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '10px',
            color: '#8a5f00',
            letterSpacing: '0.08em',
          }}
        >
          MOVE INTO
        </span>
        <CategorySelect
          categories={categories}
          value={bulkCategory}
          onChange={setBulkCategory}
          ariaLabel="Category to move selected tracks into"
        />
        <button
          type="button"
          className="crt-btn"
          onClick={handleBulkReassign}
          disabled={!csrfToken || sel.count === 0 || !bulkCategory}
        >
          [ MOVE {String(sel.count).padStart(3, '0')} ]
        </button>
      </div>
    </div>
  );
}
