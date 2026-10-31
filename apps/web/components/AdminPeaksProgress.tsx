'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE, s } from './motion/tokens';
import * as api from '../lib/api';
import { Caret } from './icons/CrtIcons';

type JobStatus = 'queued' | 'running' | 'retrying' | 'done' | 'failed';

interface PeaksJob {
  file: string;
  status: JobStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  attempt?: number;
  retryAt?: number;
}

interface Snapshot {
  jobs: PeaksJob[];
  active: number;
  queued: number;
  concurrency: number;
}

interface Props {
  authed: boolean;
  csrfToken: string;
  onComplete?: () => void;
}

const STATUS_COLOR: Record<JobStatus, string> = {
  queued: '#8a5f00',
  running: '#ffb000',
  retrying: '#ff9933',
  done: '#39ff14',
  failed: '#ff3b3b',
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  retrying: 'RETRYING',
  done: 'DONE',
  failed: 'FAILED',
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

function jobMeta(job: PeaksJob, now: number): string {
  if (job.status === 'running' && job.startedAt) {
    return fmtDuration(now - job.startedAt);
  }
  if (job.status === 'retrying' && job.retryAt) {
    const remaining = Math.max(0, job.retryAt - now);
    return `retry in ${fmtDuration(remaining)}`;
  }
  if (job.status === 'done' && job.startedAt && job.finishedAt) {
    return fmtDuration(job.finishedAt - job.startedAt);
  }
  if (job.status === 'failed') {
    return `gave up after ${job.attempt ?? 0}`;
  }
  return '';
}

export function AdminPeaksProgress({ authed, csrfToken, onComplete }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [cancelling, setCancelling] = useState<string[]>([]);

  useEffect(() => {
    if (!authed) return;
    const es = new EventSource(api.withBase('/api/admin/peaks-progress'), {
      withCredentials: true,
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        setSnapshot(JSON.parse(e.data) as Snapshot);
      } catch {
        // ignore malformed event
      }
    };
    return () => {
      es.close();
    };
  }, [authed]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const total = snapshot?.jobs.length ?? 0;
  // `failed` is terminal, like `done` — a parked job is waiting on a human, not
  // on the pipeline, so it must not hold the run open forever.
  const inProgress = (snapshot?.jobs ?? []).filter(
    (j) => j.status !== 'done' && j.status !== 'failed',
  ).length;
  useEffect(() => {
    if (!onComplete) return;
    if (total > 0 && inProgress === 0) onComplete();
  }, [total, inProgress, onComplete]);

  const handleCancel = async (file: string) => {
    if (!csrfToken) return;
    setCancelling((prev) => [...prev, file]);
    try {
      await api.cancelPeaks([file], csrfToken);
    } catch {
      // SSE will reflect actual state; nothing to do here
    } finally {
      setCancelling((prev) => prev.filter((f) => f !== file));
    }
  };

  const jobs = snapshot?.jobs ?? [];
  const sorted = [...jobs].sort((a, b) => {
    const order: Record<JobStatus, number> = {
      failed: 0,
      running: 1,
      retrying: 2,
      queued: 3,
      done: 4,
    };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return (b.finishedAt ?? b.startedAt ?? 0) - (a.finishedAt ?? a.startedAt ?? 0);
  });

  return (
    <div style={{ padding: '1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <div className="crt-section-title" style={{ margin: 0 }}>
          MEDIA PROCESSING
        </div>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#39ff14' : '#8a5f00',
            boxShadow: connected ? '0 0 6px #39ff14' : 'none',
          }}
        />
        <span
          style={{
            color: '#8a5f00',
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '10px',
            letterSpacing: '0.06em',
          }}
        >
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
        <span style={{ flex: 1 }} />
        {snapshot && (
          <span
            style={{
              color: '#8a5f00',
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            {snapshot.active}/{snapshot.concurrency} ACTIVE · {snapshot.queued} QUEUED
          </span>
        )}
      </div>

      <div className="crt-file-list" role="list" aria-label="Media processing jobs">
        {sorted.length === 0 && (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#8a5f00',
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '11px',
            }}
            role="status"
          >
            &gt; IDLE — NO JOBS
          </div>
        )}
        <AnimatePresence initial={false}>
          {sorted.map((job) => {
            const isCancelling = cancelling.includes(job.file);
            const cancellable = job.status !== 'done';
            // A failed job isn't cancelled, it's acknowledged — same call,
            // different word, because there is nothing left running to stop.
            const actionLabel = job.status === 'failed' ? 'DISMISS' : 'CANCEL';
            return (
              <motion.div
                key={job.file}
                role="listitem"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: isCancelling ? 0.4 : 1, x: 0 }}
                exit={{ opacity: 0, scaleY: 0 }}
                transition={{ duration: s(DUR.d3), ease: [...EASE.snap] }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.6rem',
                  borderBottom: '1px solid #1a1f12',
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: '11px',
                }}
              >
                <span
                  style={{
                    minWidth: '5rem',
                    color: STATUS_COLOR[job.status],
                    letterSpacing: '0.06em',
                    fontWeight: 700,
                  }}
                  aria-label={`Status: ${STATUS_LABEL[job.status]}`}
                >
                  {job.status === 'running' ? (
                    <>
                      {STATUS_LABEL[job.status]}
                      <Caret speed={0.6} />
                    </>
                  ) : (
                    STATUS_LABEL[job.status]
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#ffb000',
                  }}
                  title={job.error ?? job.file}
                >
                  {job.file}
                  {job.attempt && job.attempt > 1 && (
                    <span style={{ color: '#8a5f00', marginLeft: '0.4rem' }}>
                      [#{job.attempt}]
                    </span>
                  )}
                  {/* On a parked job the reason IS the content — a hover title
                      is no use to someone scanning for what broke. */}
                  {job.status === 'failed' && job.error && (
                    <span style={{ color: '#ff3b3b', marginLeft: '0.4rem' }}>
                      — {job.error}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    color: '#8a5f00',
                    fontSize: '10px',
                    minWidth: '7rem',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {jobMeta(job, now)}
                </span>
                {cancellable && (
                  <button
                    type="button"
                    className="crt-btn small danger"
                    onClick={() => handleCancel(job.file)}
                    disabled={isCancelling || !csrfToken}
                    aria-label={`${actionLabel} ${job.file}`}
                    style={{ flexShrink: 0 }}
                  >
                    [ {actionLabel} ]
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
