import type { MetadataRoute } from 'next';

// Emitted at <basePath>/manifest.webmanifest and auto-linked by Next. The
// internal URLs (start_url, scope, icon src) must carry the subpath manually —
// Next prefixes the route itself but not the values inside the JSON.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EchoRiftSounds',
    short_name: 'EchoRift',
    description: 'Retro Audio Archive',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0b06',
    theme_color: '#ffb000',
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${BASE_PATH}/icon-maskable.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
