'use client';

import { useState, useCallback, useEffect } from 'react';
import { withBase } from '../lib/api';

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'rate-limit'; retryAfterSec: number }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'network' };

interface AuthState {
  authed: boolean;
  /** True until the initial session probe resolves — render nothing decisive yet. */
  checking: boolean;
  csrfToken: string;
  setCsrfToken: (token: string) => void;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): AuthState {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [csrfToken, setCsrfToken] = useState('');

  // The session cookie is HttpOnly, so JS can't read it — after a reload the
  // only way to know whether the (up to 8h) session is still alive is to ask.
  // /api/admin/csrf is session-guarded, so a 200 means we're still logged in
  // and hands back the token we need anyway. Without this the panel always
  // rendered the login form on refresh even though the cookie was still valid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withBase('/api/admin/csrf'), { credentials: 'include' });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { csrfToken?: string };
          if (data.csrfToken) setCsrfToken(data.csrfToken);
          setAuthed(true);
        }
      } catch {
        // offline or API down — treat as logged out
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const header = 'Basic ' + btoa(`${username}:${password}`);
    let res: Response;
    try {
      res = await fetch(withBase('/api/admin/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: header },
      });
    } catch {
      return { ok: false, reason: 'network' };
    }

    if (res.ok) {
      const data = (await res.json()) as { csrfToken?: string };
      if (data.csrfToken) setCsrfToken(data.csrfToken);
      setAuthed(true);
      return { ok: true };
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '300', 10);
      return { ok: false, reason: 'rate-limit', retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : 300 };
    }
    if (res.status === 403) return { ok: false, reason: 'forbidden' };
    return { ok: false, reason: 'invalid' };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(withBase('/api/admin/logout'), { method: 'POST', credentials: 'include' });
    } catch {
      // best effort — clear local state regardless
    }
    setAuthed(false);
    setCsrfToken('');
  }, []);

  return { authed, checking, csrfToken, setCsrfToken, login, logout };
}
