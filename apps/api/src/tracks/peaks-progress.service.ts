import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PeaksService } from './peaks.service';

export type PeaksJobStatus = 'queued' | 'running' | 'retrying' | 'done';

export interface PeaksJob {
  file: string;
  status: PeaksJobStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  attempt?: number;
  retryAt?: number;
}

export interface PeaksProgressSnapshot {
  jobs: PeaksJob[];
  active: number;
  queued: number;
  concurrency: number;
}

export type OnReady = (file: string) => Promise<void>;

// Two parallel ffmpegs is the sweet spot for the Pi 4: it overlaps NAS read
// latency with CPU decode without starving the api event loop or the other
// container's CPU share.
const CONCURRENCY = 2;

// Keep DONE jobs visible briefly so the admin UI can show "DONE" before they
// fade out. Aborted jobs vanish immediately; retrying jobs persist until they
// succeed or are forgotten.
const TERMINAL_TTL_MS = 30_000;

// Backoff schedule between retries: 1s, 2s, 4s, … capped at 5 minutes.
const RETRY_CAP_MS = 5 * 60_000;

@Injectable()
export class PeaksProgressService {
  private readonly logger = new Logger(PeaksProgressService.name);
  private readonly jobs = new Map<string, PeaksJob>();
  private readonly subject = new Subject<PeaksProgressSnapshot>();
  private readonly pruneTimers = new Map<string, NodeJS.Timeout>();
  private readonly aborted = new Set<string>();
  private active = 0;
  private waitQueue: Array<() => void> = [];

  constructor(private readonly peaks: PeaksService) {}

  get stream$() {
    return this.subject.asObservable();
  }

  snapshot(): PeaksProgressSnapshot {
    const jobs = Array.from(this.jobs.values());
    return {
      jobs,
      active: jobs.filter((j) => j.status === 'running').length,
      queued: jobs.filter((j) => j.status === 'queued').length,
      concurrency: CONCURRENCY,
    };
  }

  /**
   * Generate peaks for each file, then call `onReady(file)` once the JSON is
   * fully on disk. The track only becomes "published" inside onReady — so
   * the public site never sees a track without its waveform. Failures (peaks
   * generation OR onReady itself) trigger an exponential-backoff retry that
   * continues until the file succeeds or is forgotten via `forget()`.
   *
   * Fire-and-forget: returns immediately; observe progress via `stream$`.
   * Re-issuing the same file while it is already in-flight is a no-op.
   */
  publishWhenReady(files: string[], onReady: OnReady): void {
    for (const file of files) {
      if (this.isActive(file)) continue;
      this.aborted.delete(file);
      this.cancelPrune(file);
      this.jobs.set(file, { file, status: 'queued', attempt: 0 });
      this.emit();
      void this.runWithRetry(file, onReady);
    }
  }

  /**
   * Drop tracking for the given files immediately. Any in-flight retry loop
   * sees the abort flag at its next checkpoint and exits without calling
   * onReady; orphaned peaks JSON written by an in-progress ffmpeg gets
   * cleaned up after it finishes. Used on unpublish and remove-scheduled.
   */
  forget(files: string[]): void {
    let changed = false;
    for (const file of files) {
      this.cancelPrune(file);
      this.aborted.add(file);
      if (this.jobs.delete(file)) changed = true;
    }
    if (changed) this.emit();
  }

  private isActive(file: string): boolean {
    const job = this.jobs.get(file);
    return !!job && job.status !== 'done';
  }

  private async runWithRetry(file: string, onReady: OnReady): Promise<void> {
    let attempt = 0;
    let publishedOk = false;

    while (!publishedOk && !this.aborted.has(file)) {
      attempt++;
      await this.acquire();

      if (this.aborted.has(file)) {
        this.release();
        break;
      }

      let error: string | undefined;
      try {
        this.jobs.set(file, {
          file,
          status: 'running',
          startedAt: Date.now(),
          attempt,
        });
        this.emit();

        await this.peaks.ensure(file);

        if (this.aborted.has(file)) {
          // Generation succeeded but a forget() landed before publish.
          // The aborted-cleanup path below removes the orphan JSON.
          break;
        }

        await onReady(file);
        publishedOk = true;
      } catch (err) {
        error = (err as Error)?.message ?? String(err);
        this.logger.warn(
          `peaks/publish failed for ${file} (attempt ${attempt}): ${error}`,
        );
      } finally {
        this.release();
      }

      if (publishedOk) {
        this.jobs.set(file, {
          file,
          status: 'done',
          finishedAt: Date.now(),
          attempt,
        });
        this.emit();
        this.schedulePrune(file);
        return;
      }

      const backoffMs = Math.min(RETRY_CAP_MS, 1000 * 2 ** Math.min(attempt, 8));
      this.jobs.set(file, {
        file,
        status: 'retrying',
        error,
        attempt,
        retryAt: Date.now() + backoffMs,
      });
      this.emit();
      await this.sleepUnlessAborted(file, backoffMs);
    }

    if (this.aborted.has(file)) {
      // Best-effort cleanup of any orphan peaks JSON ffmpeg may have written
      // before we noticed the abort. delete() swallows ENOENT.
      await this.peaks.delete(file).catch(() => undefined);
      this.jobs.delete(file);
      this.aborted.delete(file);
      this.emit();
    }
  }

  private async sleepUnlessAborted(file: string, ms: number): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (this.aborted.has(file)) return;
      const remaining = deadline - Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining)));
    }
  }

  private schedulePrune(file: string): void {
    this.cancelPrune(file);
    const timer = setTimeout(() => {
      this.jobs.delete(file);
      this.pruneTimers.delete(file);
      this.emit();
    }, TERMINAL_TTL_MS);
    this.pruneTimers.set(file, timer);
  }

  private cancelPrune(file: string): void {
    const timer = this.pruneTimers.get(file);
    if (timer) {
      clearTimeout(timer);
      this.pruneTimers.delete(file);
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < CONCURRENCY) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private emit(): void {
    this.subject.next(this.snapshot());
  }
}
