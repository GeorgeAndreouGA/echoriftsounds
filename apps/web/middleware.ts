import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap script load chunks without
    // each chunk needing 'self'. Older browsers fall back to 'self' + nonce.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
    // Skip Next internals and static assets — they're served verbatim and
    // don't need a per-request nonce.
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
