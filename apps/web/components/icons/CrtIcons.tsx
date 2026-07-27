/**
 * Icons drawn as inline SVG rather than Unicode glyphs.
 *
 * The glyphs these replace (⏮ ❚❚ ▶ ⏭ ⬇ ⠿ ✕) aren't in JetBrains Mono, so each
 * one fell back to a different per-OS font: ⏮/⏭/⬇ carry the Unicode Emoji
 * property and rendered as full-colour emoji in Chrome on Windows, and ⠿ was
 * tofu wherever no braille font was installed.
 *
 * Square caps and miter joins are deliberate — they keep the icons reading as
 * CRT rather than as generic modern iconography. Every icon inherits its
 * colour via currentColor and is aria-hidden: the buttons that host them
 * already carry aria-labels, so the icons are purely decorative.
 */

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 14,
  className,
  children,
  stroked,
}: IconProps & { children: React.ReactNode; stroked?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={stroked ? 'none' : 'currentColor'}
      stroke={stroked ? 'currentColor' : undefined}
      strokeWidth={stroked ? 2 : undefined}
      strokeLinecap={stroked ? 'square' : undefined}
      strokeLinejoin={stroked ? 'miter' : undefined}
      className={className}
      /* The controls sit in an 11px line box; block display keeps the SVG out
         of the baseline so swapping play/pause can't reflow the row. */
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4 L20 12 L6 20 Z" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4 H10 V20 H6 Z M14 4 H18 V20 H14 Z" />
    </Svg>
  );
}

export function PrevIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4 H8 V20 H5 Z M20 4 L20 20 L9 12 Z" />
    </Svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 4 H19 V20 H16 Z M4 4 L15 12 L4 20 Z" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props} stroked>
      <path d="M12 3 V15" />
      <path d="M6 10 L12 16 L18 10" />
      <path d="M4 20 H20" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props} stroked>
      <path d="M5 5 L19 19" />
      <path d="M19 5 L5 19" />
    </Svg>
  );
}

/**
 * ▮ — the blinking terminal caret.
 *
 * Drawn in CSS because U+25AE is not in JetBrains Mono at *any* subset — not
 * even the full upstream font — so as text it could only ever come from a
 * per-OS fallback font and could never be made consistent.
 */
export function Caret({ speed = 0.8 }: { speed?: number }) {
  return (
    <span
      className="crt-caret"
      style={{ animationDuration: `${speed}s` }}
      aria-hidden="true"
    />
  );
}

/**
 * ▮▮▮▯▯ — the signal meter. Same story as [Caret]: ▮/▯ aren't in the font, and
 * as text their widths diverged per fallback font, which shifted the meter's
 * total width between browsers.
 */
export function MeterBar({
  filled,
  total,
  className,
}: {
  filled: number;
  total: number;
  className?: string;
}) {
  return (
    <span className={`crt-meter${className ? ` ${className}` : ''}`} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`crt-meter-cell${i < filled ? ' on' : ''}`} />
      ))}
    </span>
  );
}

/**
 * ◉ — a ring with a centre pip. CSS-drawn rather than SVG: it's a decorative
 * status LED, and this reuses the .crt-status-dot treatment already in
 * globals.css.
 */
export function StatusDot({ className }: { className?: string }) {
  return (
    <span className={`crt-dot ring${className ? ` ${className}` : ''}`} aria-hidden />
  );
}

/** ● ○ ○ — the fake window traffic lights in the terminal chrome. */
export function WindowDots({ className }: { className?: string }) {
  return (
    <span className={`crt-window-dots${className ? ` ${className}` : ''}`} aria-hidden>
      <span className="crt-dot filled" />
      <span className="crt-dot hollow" />
      <span className="crt-dot hollow" />
    </span>
  );
}

/** Replaces the ⠿ braille drag handle — a 2x3 dot grid. */
export function DragIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="4" width="3" height="3" />
      <rect x="14" y="4" width="3" height="3" />
      <rect x="8" y="10" width="3" height="3" />
      <rect x="14" y="10" width="3" height="3" />
      <rect x="8" y="16" width="3" height="3" />
      <rect x="14" y="16" width="3" height="3" />
    </Svg>
  );
}
