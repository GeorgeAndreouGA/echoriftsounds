'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category } from '@echorift/shared';
import { useCoarsePointer } from '../lib/useCoarsePointer';

interface Props {
  categories: Category[];
  /** null = no category chosen yet (shows a forced-choice placeholder) */
  value: string | null;
  onChange: (category: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

// Sentinel for the disabled placeholder row. A category is now mandatory, so
// this option can never be re-selected once a real category is picked — it only
// exists to represent the "nothing chosen yet" state.
const PLACEHOLDER = '';
const PLACEHOLDER_LABEL = '— SELECT CATEGORY —';

/**
 * Category picker.
 *
 * On touch this stays a native <select>, because the OS wheel picker is a much
 * better control than anything we'd hand-roll — that was the original reason
 * this component used a <select> at all.
 *
 * On a mouse it renders our own listbox instead. A native <select>'s dropdown
 * is drawn by the OS, outside the page, so no page CSS reaches it: the custom
 * cursor (and every other bit of CRT styling) is simply ignored while the
 * options are open. Drawing the options ourselves is the only way to keep the
 * cursor and theme consistent once the list is showing.
 */
export function CategorySelect(props: Props) {
  const coarse = useCoarsePointer();
  return coarse ? <NativeSelect {...props} /> : <CrtListbox {...props} />;
}

function NativeSelect({ categories, value, onChange, ariaLabel, disabled }: Props) {
  return (
    <select
      className="crt-select"
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? PLACEHOLDER}
      onChange={(e) => e.target.value && onChange(e.target.value)}
    >
      <option value={PLACEHOLDER} disabled>
        {PLACEHOLDER_LABEL}
      </option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function CrtListbox({ categories, value, onChange, ariaLabel, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState({ top: 0, left: 0, width: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIdx = categories.findIndex((c) => c.id === value);
  const label = selectedIdx >= 0 ? categories[selectedIdx].name : PLACEHOLDER_LABEL;

  const close = useCallback(() => setOpen(false), []);

  // The list is portalled, so it needs viewport coordinates rather than the
  // offset-parent ones a plain absolute child would get.
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 2, left: r.left, width: r.width });
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    place();
    setOpen(true);
  }, [disabled, selectedIdx, place]);

  const commit = useCallback(
    (i: number) => {
      const c = categories[i];
      if (c) onChange(c.id);
      close();
    },
    [categories, onChange, close],
  );

  // Close on outside pointerdown / Escape. pointerdown rather than click so the
  // list is gone before a click lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // listRef is checked separately: the list is portalled to <body>, so it is
      // not inside rootRef and a click on an option would read as "outside".
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Viewport coords go stale the moment anything moves, so re-place while open.
  // Scroll is captured to catch scrolling containers, not just the window.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Keep the active option in view when arrowing past the scroll edge.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, categories.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(categories.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={rootRef} className="crt-listbox" onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        className={`crt-select crt-listbox-btn${disabled ? ' cur-not-allowed' : ' cur-pointer'}`}
      >
        <span className={selectedIdx >= 0 ? undefined : 'crt-listbox-placeholder'}>{label}</span>
        <span className="crt-listbox-caret" aria-hidden />
      </button>

      {/* Portalled to <body>: the admin panels animate with a clip-path, which
          keeps clipping its subtree once the wipe settles, and cut the list off
          at the panel edge. Nothing in the subtree can escape that. */}
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="crt-listbox-list"
            style={{ top: at.top, left: at.left, minWidth: at.width }}
          >
            {categories.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                data-active={i === active}
                className="crt-listbox-opt cur-pointer"
                onPointerEnter={() => setActive(i)}
                onClick={() => commit(i)}
              >
                {c.name}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
