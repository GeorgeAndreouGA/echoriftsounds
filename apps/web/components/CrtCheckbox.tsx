'use client';

interface Props {
  checked: boolean;
  /** `mods.shift` is true for Shift+click and Shift+Space/Enter — callers that
   *  don't do ranges can ignore the second argument entirely. */
  onChange: (checked: boolean, mods: { shift: boolean }) => void;
  ariaLabel: string;
  variant?: 'amber' | 'red';
}

export function CrtCheckbox({ checked, onChange, ariaLabel, variant = 'amber' }: Props) {
  const color = variant === 'red' ? '#ff3b3b' : '#ffb000';
  const glow = variant === 'red' ? 'rgba(255,59,59,0.4)' : 'rgba(255,176,0,0.4)';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-keyshortcuts="Shift+Space"
      onClick={(e) => onChange(!checked, { shift: e.shiftKey })}
      // Shift+click natively extends the document text selection, which paints
      // the whole row list highlighted the moment you start a range. Suppressing
      // it on mousedown does not stop the click that follows.
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
      // The keyboard equivalent of a shift-click. Handled explicitly rather than
      // relying on the synthesized click carrying the modifier, which Safari has
      // historically not done; preventDefault stops the double toggle.
      onKeyDown={(e) => {
        if (e.shiftKey && !e.repeat && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onChange(!checked, { shift: true });
        }
      }}
      className="cur-pointer"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: '11px',
        color,
        lineHeight: 1,
        letterSpacing: '0.04em',
        outline: 'none',
        flexShrink: 0,
        userSelect: 'none',
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.outline = `1px solid ${color}`;
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.outline = 'none';
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 6px ${glow}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {checked ? '[█]' : '[ ]'}
    </button>
  );
}
