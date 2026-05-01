'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledTrack } from '@echorift/shared';
import { useCsrf } from '../../hooks/useCsrf';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import * as api from '../../lib/api';
import { LoginForm } from '../../components/LoginForm';
import { AdminPublishForm } from '../../components/AdminPublishForm';
import { AdminScheduledList } from '../../components/AdminScheduledList';
import { AdminPublishedList } from '../../components/AdminPublishedList';
import { AdminPeaksProgress } from '../../components/AdminPeaksProgress';
import { WindowChrome } from '../../components/chrome/WindowChrome';

export function AdminClient() {
  const { authed, csrfToken, setCsrfToken, login, logout } = useAdminAuth();
  useCsrf(authed, setCsrfToken);
  useIdleLogout(15 * 60 * 1000, logout);

  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [published, setPublished] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [f, p, s] = await Promise.all([
        api.adminFiles(),
        api.adminPublished(),
        api.adminScheduled(),
      ]);
      setAllFiles(f);
      setPublished(p);
      setScheduled(s);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('401')) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (csrfToken) refresh();
  }, [csrfToken, refresh]);

  if (!authed) return <LoginForm onLogin={login} />;

  const available = allFiles.filter(
    (f) => !published.includes(f) && !scheduled.some((s) => s.file === f),
  );

  return (
    <main id="main-content" className="crt-container">
      {/* Page header */}
      <header style={{ padding: '1.5rem 0 1rem', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#8a5f00',
            letterSpacing: '0.1em',
            marginBottom: '0.5rem',
          }}
        >
          ┌──────────────────────────────────────────────────┐
        </div>
        <h1
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '18px',
            fontWeight: 700,
            color: '#ffb000',
            letterSpacing: '0.12em',
          }}
        >
          ADMIN PANEL
        </h1>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#8a5f00',
            letterSpacing: '0.1em',
            marginTop: '0.5rem',
          }}
        >
          └──────────────────────────────────────────────────┘
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="crt-btn small danger"
            onClick={logout}
            aria-label="Logout"
          >
            [ LOGOUT ]
          </button>
        </div>
      </header>

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            color: '#8a5f00',
            letterSpacing: '0.06em',
          }}
          role="status"
        >
          &gt; LOADING
          <span aria-hidden="true" style={{ animation: 'blink 0.8s step-start infinite' }}>▮</span>
        </div>
      ) : (
        <>
          <WindowChrome title="publish.sh" delay={0}>
            <AdminPublishForm
              files={available}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>

          <WindowChrome title="peaks.sh" delay={0.08}>
            <AdminPeaksProgress
              authed={authed}
              csrfToken={csrfToken}
              onComplete={refresh}
            />
          </WindowChrome>

          <WindowChrome title="scheduler.sh" delay={0.16}>
            <AdminScheduledList
              items={scheduled}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>

          <WindowChrome title="published.sh" delay={0.24}>
            <AdminPublishedList
              items={published}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>
        </>
      )}
    </main>
  );
}
