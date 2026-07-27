import path from 'path';
import type { NextConfig } from 'next';

// CSP is set per-request by middleware.ts so each response gets a fresh nonce
// for Next's inline bootstrap scripts. The static headers below are constant
// across requests.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// Subpath the whole app is served under (e.g. '/music'). Baked into the build:
// it rewrites every page/asset URL Next emits, so changing it requires a web
// image rebuild. Empty string serves the app at the domain root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(basePath ? { basePath } : {}),
  // Trace files from the monorepo root so pnpm workspace deps are included.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  async rewrites() {
    // Dev-only fallback: in production the reverse proxy routes /<base>/api and
    // /<base>/music straight to the API. `source` is auto-prefixed with basePath
    // by Next; the destination must include basePath because the API serves its
    // routes under the same subpath.
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiUrl}${basePath}/api/:path*` },
      { source: '/audio/:path*', destination: `${apiUrl}${basePath}/audio/:path*` },
      { source: '/stream/:path*', destination: `${apiUrl}${basePath}/stream/:path*` },
    ];
  },
};

export default nextConfig;
