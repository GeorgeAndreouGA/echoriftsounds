'use client';

import { useState } from 'react';
import { parseRowRange } from '@echorift/shared';

interface Props {
  count: number;
  totalVisible: number;
  allVisibleSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  /**
   * Resolve typed row numbers against this list's own numbering and apply them.
   * Returns how many landed on a visible row so the bar can report the rest —
   * the bar deliberately never learns whether numbers are filtered-relative or
   * global positions.
   */
  onApplyRange: (numbers: number[], additive: boolean) => { matched: number; missing: number };
  /** True while an optimistic removal animation is in flight. */
  disabled?: boolean;
}

const label: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: '10px',
  color: '#8a5f00',
  letterSpacing: '0.08em',
  flexShrink: 0,
};

const feedback: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: '10px',
  letterSpacing: '0.06em',
  margin: '0.35rem 0 0',
  minHeight: '1em',
};

/**
 * Row-range selector shared by the three admin lists.
 *
 * Shift-click is mouse-only and impossible on touch, so this typed input is the
 * keyboard and touch path to a range, not a decoration.
 */
export function CrtSelectionBar({
  count,
  totalVisible,
  allVisibleSelected,
  onSelectAll,
  onClear,
  onApplyRange,
  disabled = false,
}: Props) {
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');

  const parsed = parseRowRange(text);
  const typing = text.trim().length > 0;

  const apply = () => {
    if (!parsed.ok || parsed.numbers.length === 0) return;
    const { matched, missing } = onApplyRange(parsed.numbers, parsed.additive);
    setApplied(
      matched === 0
        ? '> NO MATCHING ROWS'
        : missing > 0
          ? `> ${missing} OF ${parsed.numbers.length} ROWS NOT ON SCREEN`
          : `> ${matched} ROW${matched !== 1 ? 'S' : ''} SELECTED`,
    );
  };

  // Live count while typing, the last apply result once you stop, idle hint
  // otherwise. Errors always win.
  const [message, tone] = !parsed.ok
    ? [`> ${parsed.error}`, '#ff3b3b']
    : typing
      ? [`> ${parsed.numbers.length} ROW${parsed.numbers.length !== 1 ? 'S' : ''}`, '#39ff14']
      : applied
        ? [applied, '#39ff14']
        : ['> TYPE A RANGE E.G. 1-4,7 — PREFIX + TO ADD', '#8a5f00'];

  return (
    <div style={{ margin: '0 0 0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={label}>&gt; SEL</span>
        <input
          type="text"
          className="crt-input"
          value={text}
          placeholder="1-4,7"
          aria-label="Select rows by number, e.g. 1-4,7"
          aria-invalid={!parsed.ok}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setApplied('');
          }}
          onKeyDown={(e) => {
            // The publish list wraps its rows in a <form>, so an unhandled
            // Enter here would submit it and publish.
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setText('');
              setApplied('');
            }
          }}
          style={{
            // .crt-input is width:100%; the max() font floor stays or iOS zooms
            // the page on focus.
            width: '9rem',
            flex: '0 1 9rem',
            padding: '0.25rem 0.5rem',
            fontSize: 'max(11px, 16px)',
          }}
        />
        <button
          type="button"
          className="crt-btn small"
          onClick={apply}
          disabled={disabled || !parsed.ok || parsed.numbers.length === 0}
        >
          [ APPLY ]
        </button>
        <button
          type="button"
          className="crt-btn small"
          onClick={onSelectAll}
          disabled={disabled || totalVisible === 0 || allVisibleSelected}
        >
          [ ALL ]
        </button>
        <button
          type="button"
          className="crt-btn small"
          onClick={() => {
            onClear();
            setApplied('');
          }}
          disabled={disabled || count === 0}
        >
          [ NONE ]
        </button>
        <span
          role="status"
          aria-live="polite"
          style={{
            ...label,
            marginLeft: 'auto',
            color: count > 0 ? '#ffb000' : '#8a5f00',
          }}
        >
          {String(count).padStart(3, '0')} SELECTED
        </span>
      </div>
      <p style={{ ...feedback, color: tone }} role={parsed.ok ? undefined : 'alert'}>
        {message}
      </p>
    </div>
  );
}
