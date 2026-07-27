import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Subscription } from 'rxjs';
import { StorageService } from '../storage/storage.service';
import { ChangesService } from '../storage/changes.service';

// Playback streams are named `<source>.m4a` by TranscodeService, so the /stream
// route carries the source filename plus this suffix. Everything else — /audio,
// the published index, the peaks route — is keyed by the bare source filename.
const STREAM_SUFFIX = '.m4a';

/**
 * The gate that makes "published" mean something on the public byte routes.
 *
 * `/audio/*` and `/stream/*` are plain static mounts over the whole music and
 * stream dirs, and `GET /tracks/:file/peaks` only checks that a source exists —
 * so before this, any file on disk was fetchable by name whether or not it had
 * been released. That defeats scheduled releases: a guessed filename downloads
 * the track early, and the peaks route's 404-vs-202 answer is a filename oracle.
 *
 * This holds an in-memory set of the currently-published source filenames,
 * refreshed whenever a store write broadcasts a change, and exposes it two ways:
 * an Express middleware for the static mounts (which are wired in main.ts, below
 * the Nest layer) and `isPublished()` for the peaks controller. Reading a cached
 * set keeps this off the disk on every Range request — a long track is many
 * requests per seek — while a change (publish/unpublish) is reflected on the
 * next tick.
 */
@Injectable()
export class PublishedAccessService implements OnModuleInit {
  private readonly logger = new Logger(PublishedAccessService.name);
  private published = new Set<string>();
  private sub?: Subscription;

  constructor(
    private readonly storage: StorageService,
    private readonly changes: ChangesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    // Every store write broadcasts here, so an unpublish/publish updates the set
    // on the next event rather than needing its own hook.
    this.sub = this.changes.stream$.subscribe(() => {
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.storage.published.read();
      this.published = new Set(rows.map((t) => t.file));
    } catch (err) {
      // Keep the last-known set rather than failing open to "everything" or
      // closed to "nothing" on a transient read error.
      this.logger.warn(
        `failed to refresh published index: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  /** Is this source filename currently published? */
  isPublished(file: string): boolean {
    return this.published.has(file);
  }

  /**
   * Express middleware for a static mount. `kind` selects how the request path
   * maps back to a source filename: /audio carries it verbatim, /stream appends
   * `.m4a`. Unpublished (or unknown) names get a 404 — the same answer a missing
   * file gives, so the gate leaks nothing about what exists on disk.
   *
   * Mounted with the same prefix as the static handler, so `req.path` here is
   * relative to that prefix: `/<encoded filename>`.
   */
  gate(kind: 'audio' | 'stream') {
    return (req: Request, res: Response, next: NextFunction): void => {
      let name: string;
      try {
        name = decodeURIComponent(req.path.replace(/^\/+/, ''));
      } catch {
        res.status(404).end();
        return;
      }

      const source =
        kind === 'stream' && name.endsWith(STREAM_SUFFIX)
          ? name.slice(0, -STREAM_SUFFIX.length)
          : name;

      if (!source || !this.isPublished(source)) {
        res.status(404).end();
        return;
      }
      next();
    };
  }
}
