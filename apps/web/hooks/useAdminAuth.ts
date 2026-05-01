'use client';

import { useState, useCallback } from 'react';

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'rate-limit'; retryAfterSec: number }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'network' };

interface AuthState {
  authed: boolean;
  csrfToken: string;
  setCsrfToken: (token: string) => void;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): AuthState {
  const [authed, setAuthed] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const header = 'Basic ' + btoa(`${username}:${password}`);
    let res: Response;
    try {
      res = await fetch('/api/admin/login', {
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
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // best effort — clear local state regardless
    }
    setAuthed(false);
    setCsrfToken('');
  }, []);

  return { authed, csrfToken, setCsrfToken, login, logout };
}
