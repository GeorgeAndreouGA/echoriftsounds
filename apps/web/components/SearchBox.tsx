'use client';

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBox({ onSearch, placeholder = 'SEARCH...' }: Props) {
  return (
    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#ffb000',
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: '13px',
          pointerEvents: 'none',
          lineHeight: 1,
        }}
      >
        &gt;
      </span>
      <input
        type="text"
        className="crt-input"
        placeholder={placeholder}
        aria-label="Search tracks"
        onChange={(e) => onSearch(e.target.value)}
        style={{ paddingLeft: '1.75rem' }}
      />
    </div>
  );
}
