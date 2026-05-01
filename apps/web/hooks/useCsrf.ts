'use client';

import { useEffect, useCallback } from 'react';

export function useCsrf(authed: boolean, setToken: (token: string) => void) {
  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch('/api/admin/csrf', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { csrfToken: string };
        setToken(data.csrfToken);
      }
    } catch {
      // silently ignore
    }
  }, [authed, setToken]);

  useEffect(() => {
    if (!authed) return;
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [authed, refresh]);

  return { refresh };
}
