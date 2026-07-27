import { headers } from 'next/headers';
import { AdminClient } from './AdminClient';

// `'use client'` pages get statically prerendered by default, which means the
// per-request nonce from middleware.ts can't be stamped into the HTML.
// Reading headers() opts this route into dynamic rendering so Next.js applies
// the nonce to its bootstrap script tags on every request.
export const dynamic = 'force-dynamic';

// Minutes of no mouse/key/click activity before the panel logs itself out.
// Read per-request (this route is force-dynamic), so changing IDLE_MINUTES in
// .env takes effect on container restart — no web rebuild needed. Falls back to
// 15 if unset or not a positive number, so a typo can't disable the timeout.
function idleMinutes(): number {
  const parsed = Number(process.env.IDLE_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

export default async function AdminPage() {
  await headers();
  return <AdminClient idleMinutes={idleMinutes()} />;
}
