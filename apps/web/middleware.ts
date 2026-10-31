import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap script load chunks without
    // each chunk needing 'self'. It also covers the YouTube IFrame API script
    // (lib/youtube.ts inserts it dynamically) in browsers that honor
    // strict-dynamic; 'https://www.youtube.com' is the fallback host-source for
    // the rest — host-sources are simply ignored where strict-dynamic applies,
    // so this is additive, not a downgrade. Older browsers fall back to 'self' + nonce.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.youtube.com`,
    // Tailwind + framer-motion emit inline styles; we accept that trade-off.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data:`,
    // wavesurfer wraps the decoded audio in a blob: URL before assigning it
    // to its internal <audio> element, so blob: must be allowed here too.
    `media-src 'self' blob:`,
    `connect-src 'self'`,
    // wavesurfer.js can spawn blob: workers for decoding.
    `worker-src 'self' blob:`,
    // The YouTube player embed — playback is YouTube-backed, not streamed off
    // disk. youtube-nocookie.com is what the embed is actually built against
    // (see lib/youtube.ts); the IFrame API also redirects through youtube.com
    // internally for some players.
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  // Next.js reads x-nonce when rendering and applies it to its bootstrap scripts.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // The index route explicitly. Under a basePath the negative-lookahead
    // matcher below compiles to `/<base>/…` and requires a trailing segment, so
    // it never fired for the bare `/<base>` homepage — which shipped with no CSP
    // and no script nonce while every sub-route was protected. Listing '/' on
    // its own closes that gap.
    '/',
    // Everything else, skipping Next internals and static assets — they're
    // served verbatim and don't need a per-request nonce.
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
