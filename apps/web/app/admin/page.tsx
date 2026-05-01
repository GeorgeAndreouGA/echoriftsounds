import { headers } from 'next/headers';
import { AdminClient } from './AdminClient';

// `'use client'` pages get statically prerendered by default, which means the
// per-request nonce from middleware.ts can't be stamped into the HTML.
// Reading headers() opts this route into dynamic rendering so Next.js applies
// the nonce to its bootstrap script tags on every request.
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await headers();
  return <AdminClient />;
}
