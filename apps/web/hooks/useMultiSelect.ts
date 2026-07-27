'use client';

import { useCallback, useRef, useState } from 'react';

export interface MultiSelectApi {
  /**
   * Selected ids in dataset order — never click order — with ids that have
   * since left the dataset pruned out. Safe to hand straight to an api.* call.
   *
   * A new array identity every render: never put it in a useEffect dep array.
   * Use `count` instead.
   */
  selected: string[];
  count: number;
  has: (id: string) => boolean;
  /** CrtCheckbox onChange target. `shift` extends from the anchor instead. */
  toggle: (id: string, next: boolean, shift?: boolean) => void;
  /** Adds every visible id. With a filter on, that is the filtered subset. */
  selectAll: () => void;
  /** Drops everything, including selections scrolled or filtered off screen. */
  clear: () => void;
  /** Wholesale replace — the range input's default mode. */
  replace: (ids: string[]) => void;
  /** Union — the range input's `+1-4` additive mode. */
  add: (ids: string[]) => void;
  allVisibleSelected: boolean;
}

// Shared so clearing an already-empty selection is identity-stable and React
// can bail out of the re-render.
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Multi-row selection for the admin lists: per-row toggle, shift-click ranges,
 * select-all, and bulk replace/add for the typed range input.
 *
 * `all` is every id in the dataset (display order); `visible` is what is
 * actually rendered. Selection is stored as a Set of ids and *pruned at read
 * time* rather than in an effect — every consumer rebuilds `all` as a fresh
 * array literal each render, so an effect keyed on it would fire constantly
 * and wipe the selection. That is exactly the bug this replaces.
 */
export function useMultiSelect({
  all,
  visible,
}: {
  all: string[];
  visible: string[];
}): MultiSelectApi {
  const [raw, setRaw] = useState<ReadonlySet<string>>(EMPTY);

  // Anchor for shift-ranges, plus the selection as it stood before the current
  // shift gesture began — so extending and then shrinking a range releases the
  // rows it no longer covers instead of leaving them stuck on.
  const anchorRef = useRef<string | null>(null);
  const rangeBaseRef = useRef<readonly string[] | null>(null);

  // Latest-value refs so the callbacks below can stay dependency-free despite
  // `all`/`visible` changing identity every render. Same pattern as orderRef
  // in AdminPublishedList.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Pruning and ordering in one pass. Ids that left the dataset stay in `raw`
  // but can never surface through here, and the set is bounded by the number of
  // distinct filenames the session has seen.
  const selected = all.filter((id) => raw.has(id));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const resetGesture = () => {
    anchorRef.current = null;
    rangeBaseRef.current = null;
  };

  const toggle = useCallback((id: string, next: boolean, shift = false) => {
    const vis = visibleRef.current;
    const anchor = anchorRef.current;

    if (shift && anchor !== null) {
      const from = vis.indexOf(anchor);
      const to = vis.indexOf(id);
      // A filtered-out anchor has no position to extend from, so fall through
      // and treat this as a plain toggle.
      if (from >= 0 && to >= 0) {
        const base = (rangeBaseRef.current ??= selectedRef.current);
        const span = vis.slice(Math.min(from, to), Math.max(from, to) + 1);
        setRaw(new Set([...base, ...span]));
        return;
      }
    }

    anchorRef.current = id;
    rangeBaseRef.current = null;
    setRaw((prev) => {
      const out = new Set(prev);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });
  }, []);

  const selectAll = useCallback(() => {
    resetGesture();
    setRaw((prev) => new Set([...prev, ...visibleRef.current]));
  }, []);

  const clear = useCallback(() => {
    resetGesture();
    setRaw(EMPTY);
  }, []);

  const replace = useCallback((ids: string[]) => {
    resetGesture();
    setRaw(new Set(ids));
  }, []);

  const add = useCallback((ids: string[]) => {
    resetGesture();
    setRaw((prev) => new Set([...prev, ...ids]));
  }, []);

  return {
    selected,
    count: selected.length,
    has: (id: string) => raw.has(id),
    toggle,
    selectAll,
    clear,
    replace,
    add,
    allVisibleSelected: visible.length > 0 && visible.every((id) => raw.has(id)),
  };
}
