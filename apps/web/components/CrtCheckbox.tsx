'use client';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
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
      onClick={() => onChange(!checked)}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        color,
        lineHeight: 1,
        letterSpacing: '0.04em',
        outline: 'none',
        flexShrink: 0,
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
