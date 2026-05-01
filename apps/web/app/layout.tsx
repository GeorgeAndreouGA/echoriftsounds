import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { CrtShell } from '../components/chrome/CrtShell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: process.env.SITE_NAME ?? 'EchoRiftSounds',
  description: `${process.env.SITE_NAME ?? 'EchoRiftSounds'} – Retro Audio Archive`,
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
  manifest: '/manifest.webmanifest',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=IBM+Plex+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
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
