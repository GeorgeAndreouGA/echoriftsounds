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

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace files from the monorepo root so pnpm workspace deps are included.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/music/:path*', destination: `${apiUrl}/music/:path*` },
    ];
  },
};

export default nextConfig;
