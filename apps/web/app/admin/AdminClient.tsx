'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Category, PublishedTrack, ScheduledTrack } from '@echorift/shared';
import { useCsrf } from '../../hooks/useCsrf';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useIdleLogout } from '../../hooks/useIdleLogout';
import { useLiveChanges } from '../../hooks/useLiveChanges';
import * as api from '../../lib/api';
import { LoginForm } from '../../components/LoginForm';
import { AdminPublishForm } from '../../components/AdminPublishForm';
import { AdminCategories } from '../../components/AdminCategories';
import { AdminScheduledList } from '../../components/AdminScheduledList';
import { AdminPublishedList } from '../../components/AdminPublishedList';
import { AdminPeaksProgress } from '../../components/AdminPeaksProgress';
import { WindowChrome } from '../../components/chrome/WindowChrome';
import { Caret } from '../../components/icons/CrtIcons';

interface Props {
  /** Minutes of inactivity before auto-logout. Supplied by the server from IDLE_MINUTES. */
  idleMinutes: number;
}

export function AdminClient({ idleMinutes }: Props) {
  const { authed, checking, csrfToken, setCsrfToken, login, logout } = useAdminAuth();
  useCsrf(authed, setCsrfToken);
  useIdleLogout(idleMinutes * 60 * 1000, logout);

  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [published, setPublished] = useState<PublishedTrack[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledTrack[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [f, p, s, c] = await Promise.all([
        api.adminFiles(),
        api.adminPublished(),
        api.adminScheduled(),
        api.adminCategories(),
      ]);
      setAllFiles(f);
      setPublished(p);
      setScheduled(s);
      setCategories(c);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('401')) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (csrfToken) refresh();
  }, [csrfToken, refresh]);

  // Pick up changes made elsewhere — another admin tab, or the scheduler
  // releasing a due track — without needing a manual refresh.
  useLiveChanges(refresh, authed);

  // Tracks per category (published + scheduled) — the categories panel disables
  // deletion of any category that still has tracks, matching the server guard.
  const categoryCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of categories) acc[c.id] = 0;
    for (const t of [...published, ...scheduled]) {
      if (t.category && acc[t.category] !== undefined) acc[t.category] += 1;
    }
    return acc;
  }, [categories, published, scheduled]);

  // Don't decide between panel and login form until the session probe answers,
  // otherwise a valid session flashes the login form on every refresh.
  if (checking) {
    return (
      <main id="main-content" className="crt-container">
        <p
          role="status"
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#8a5f00',
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '12px',
            letterSpacing: '0.08em',
          }}
        >
          &gt; RESTORING SESSION<Caret speed={0.6} />
        </p>
      </main>
    );
  }

  if (!authed) return <LoginForm onLogin={login} />;

  const publishedFiles = new Set(published.map((t) => t.file));
  const available = allFiles.filter(
    (f) => !publishedFiles.has(f) && !scheduled.some((s) => s.file === f),
  );

  return (
    <main id="main-content" className="crt-container">
      {/* Page header */}
      <header style={{ padding: '1.5rem 0 1rem', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-jetbrains-mono), monospace",
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
            fontFamily: "var(--font-jetbrains-mono), monospace",
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
            fontFamily: "var(--font-jetbrains-mono), monospace",
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
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '13px',
            color: '#8a5f00',
            letterSpacing: '0.06em',
          }}
          role="status"
        >
          &gt; LOADING
          <Caret speed={0.8} />
        </div>
      ) : (
        <>
          <WindowChrome title="publish.sh" delay={0}>
            <AdminPublishForm
              files={available}
              categories={categories}
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

          <WindowChrome title="categories.sh" delay={0.16}>
            <AdminCategories
              items={categories}
              counts={categoryCounts}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>

          <WindowChrome title="scheduler.sh" delay={0.24}>
            <AdminScheduledList
              items={scheduled}
              categories={categories}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>

          <WindowChrome title="published.sh" delay={0.32}>
            <AdminPublishedList
              items={published}
              categories={categories}
              csrfToken={csrfToken}
              onSuccess={refresh}
            />
          </WindowChrome>
        </>
      )}
    </main>
  );
}
