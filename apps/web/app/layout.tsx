import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { IBM_Plex_Mono } from 'next/font/google';
import '../styles/globals.css';
import { CrtShell } from '../components/chrome/CrtShell';
import { Providers } from './providers';
import { withBase } from '../lib/api';

/**
 * Self-hosted rather than pulled from Google Fonts, because Google only serves
 * JetBrains Mono in latin/latin-ext/cyrillic/greek/vietnamese subsets. The box
 * drawing, block, geometric and arrow glyphs this UI draws with (┌ ─ █ ▲ ▼ ◀ ▶ →)
 * are in none of those, so every one of them silently fell back to a different
 * per-OS font — DejaVu on Linux, Segoe UI Symbol on Windows, Menlo on macOS.
 *
 * These files are the upstream JetBrains Mono subset to latin-1 plus exactly
 * those four symbol blocks, which keeps them ~40KB each. See app/fonts/OFL.txt.
 */
const jetbrainsMono = localFont({
  src: [
    { path: './fonts/JetBrainsMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/JetBrainsMono-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  // Matches the ui-monospace fallback so a swap doesn't reflow the ASCII art.
  fallback: ['ui-monospace', 'monospace'],
});

/**
 * Body copy only, and only ever ASCII — Google's latin subset covers it, so
 * unlike JetBrains Mono there's nothing to self-host by hand. next/font fetches
 * it at build time and serves it from our own origin, so there's no runtime
 * request to Google. Any symbol glyph reaching this stack falls through to
 * JetBrains Mono above, which now actually has them.
 */
const ibmPlexMono = IBM_Plex_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});

export const metadata: Metadata = {
  title: process.env.SITE_NAME ?? 'EchoRiftSounds',
  description: `${process.env.SITE_NAME ?? 'EchoRiftSounds'} – Retro Audio Archive`,
  // Asset paths must carry the subpath; Next doesn't auto-prefix metadata URLs.
  // The web manifest is emitted by app/manifest.ts (file-based, auto-linked).
  icons: { icon: withBase('/favicon.ico'), apple: withBase('/icon-192.png') },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EchoRift',
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffb000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${ibmPlexMono.variable}`}>
      <body>
        <a href="#main-content" className="crt-btn" style={{ position: 'absolute', left: '-9999px', top: 4, zIndex: 10000 }}>
          Skip to content
        </a>
        <CrtShell>
          <Providers>{children}</Providers>
        </CrtShell>
      </body>
    </html>
  );
}
