import { Injectable } from '@nestjs/common';

/**
 * Global cap on concurrently running ffmpeg processes.
 *
 * Two is the sweet spot for the Pi 4: it overlaps NAS read latency with CPU
 * decode without starving the api event loop or the other container's CPU
 * share. Measured on 2-hour tracks, ffmpeg saturates all 2.5 available CPUs
 * well before it runs short of memory, so this — not the 512 MB limit — is the
 * knob that decides whether the box stays responsive under load.
 */
export const FFMPEG_CONCURRENCY = 2;

/**
 * The single gate every ffmpeg spawn in the app passes through — currently
 * just peaks decode, whether the caller is the publish pipeline or an
 * anonymous HTTP request.
 *
 * It exists because bounding only the publish pipeline is not enough: the
 * public peaks endpoint used to call into generation directly, so 8 concurrent
 * requests for 8 distinct 2-hour files span 8 concurrent ffmpegs, pinned the
 * container at 250 % CPU for 88 s, and turned an 12 s job into an 88 s one for
 * every one of them. Putting the limit next to the spawn rather than next to
 * one of the callers is what makes that unreachable by construction.
 *
 * FIFO: waiters are woken in arrival order, so a queued job cannot be starved
 * by a steady stream of newcomers.
 */
@Injectable()
export class FfmpegSlotsService {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  /** Currently running ffmpeg processes. */
  get inUse(): number {
    return this.active;
  }

  /** Callers parked waiting for a slot. */
  get waitingCount(): number {
    return this.waiting.length;
  }

  /** Run `fn` holding a slot, releasing it however `fn` settles. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < FFMPEG_CONCURRENCY) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }
}
