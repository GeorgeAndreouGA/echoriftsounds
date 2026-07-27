import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { CategoryId, ScheduledTrack, isValidFilename } from '@echorift/shared';
import { StorageService } from '../storage/storage.service';
import { CategoriesService } from '../categories/categories.service';
import { PeaksService } from '../tracks/peaks.service';
import { PeaksProgressService } from '../tracks/peaks-progress.service';
import { TranscodeService } from '../tracks/transcode.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly categories: CategoriesService,
    private readonly peaks: PeaksService,
    private readonly peaksProgress: PeaksProgressService,
    private readonly transcode: TranscodeService,
  ) {}

  async listFiles(): Promise<string[]> {
    const musicDir = process.env.MUSIC_DIR || '/app/music';
    let files: string[];
    try {
      files = await fs.readdir(musicDir);
    } catch {
      return [];
    }
    return files.filter((f) => /\.(mp3|wav|flac)$/i.test(f));
  }

  async publish(
    files: string[],
    scheduled: ScheduledTrack[],
    category: CategoryId | null = null,
  ): Promise<void> {
    const invalidFiles = files.filter((f) => !isValidFilename(f));
    if (invalidFiles.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalidFiles.join(', ')}`);
    }

    const invalidScheduled = scheduled.filter(
      (item) =>
        !item?.file ||
        !item?.time ||
        !isValidFilename(item.file) ||
        isNaN(new Date(item.time).getTime()),
    );
    if (invalidScheduled.length > 0) {
      throw new BadRequestException('Invalid scheduled items');
    }

    // Every track must land in a category — uncategorized publishing is no
    // longer allowed. Enforce presence first, then verify the id still refers
    // to a real category (it may have been deleted between the panel rendering
    // and this submit).
    if (files.length > 0 && !category) {
      throw new BadRequestException('A category is required to publish.');
    }
    for (const item of scheduled) {
      if (!(item.category ?? category)) {
        throw new BadRequestException('A category is required to schedule a track.');
      }
    }

    await this.categories.assertExists(category);
    for (const item of scheduled) {
      await this.categories.assertExists(item.category ?? category ?? null);
    }

    const t0 = Date.now();
    if (scheduled.length > 0) {
      // Whitelist the persisted shape explicitly rather than spreading `{...item}`:
      // the body is untyped, so any extra properties a client sends (e.g. `evil`,
      // `position`) would otherwise be written verbatim into scheduled.json. Only
      // file, time and the resolved category are ours to store.
      const withCategory = scheduled.map((item) => ({
        file: item.file,
        time: item.time,
        category: item.category ?? category ?? null,
      }));
      await this.storage.scheduled.update((current) => [...current, ...withCategory]);
    }

    // For instant publishes the file is NOT added to published.json upfront.
    // PeaksProgressService generates the waveform JSON first, then invokes
    // the onReady callback to atomically append the file to the published
    // list. Failures retry forever until the file is forgotten (unpublish).
    // The result: the public site never sees a track without its peaks.
    //
    // New tracks land at the bottom of the admin's arrangement, so publishing
    // never reshuffles a list that was ordered by hand. onReady fires in ffmpeg
    // completion order, so a batch's relative order among itself is arbitrary —
    // the admin drags them where they belong afterwards.
    if (files.length > 0) {
      this.peaksProgress.publishWhenReady(files, async (file) => {
        // Generate the playback stream before the track goes public, so the
        // first visitor already gets the fast /stream/<file> proxy. Runs inside
        // the peaks retry/semaphore, so a transcode failure retries too and the
        // track isn't published until both peaks and stream exist.
        await this.transcode.ensure(file);
        await this.storage.published.update((current) =>
          current.some((t) => t.file === file)
            ? current
            : [...current, { file, category, position: current.length }],
        );
      });
    }
    this.logger.log(
      `publish() completed in ${Date.now() - t0}ms (files=${files.length}, scheduled=${scheduled.length}, category=${category ?? 'none'})`,
    );
  }

  async unpublish(filesToDelete: string[]): Promise<void> {
    const invalid = filesToDelete.filter((f) => !isValidFilename(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalid.join(', ')}`);
    }
    await this.storage.published.update((current) =>
      current.filter((t) => !filesToDelete.includes(t.file)),
    );

    // Drop the cached peaks JSON so a future republish goes through the full
    // generation pipeline again, and clear any progress entries so the admin
    // UI doesn't keep showing rows for the now-removed tracks.
    await Promise.all(
      filesToDelete.flatMap((f) => [this.peaks.delete(f), this.transcode.delete(f)]),
    );
    this.peaksProgress.forget(filesToDelete);
  }

  async removeScheduled(filesToDelete: string[]): Promise<void> {
    const invalid = filesToDelete.filter((f) => !isValidFilename(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalid.join(', ')}`);
    }
    await this.storage.scheduled.update((current) =>
      current.filter((item) => !filesToDelete.includes(item.file)),
    );

    // If the cron has already fired and a peaks job is in flight for one of
    // these files, abort it so it never lands in published.json.
    this.peaksProgress.forget(filesToDelete);
  }

  /**
   * Rewrite the display order of published tracks. `files` must be exactly the
   * currently-published set, in the desired order — requiring a full permutation
   * (rather than a "move X to index N" op) means a stale admin panel can't
   * silently drop or duplicate a track that changed underneath it.
   */
  async reorder(files: string[]): Promise<void> {
    const invalid = files.filter((f) => !isValidFilename(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalid.join(', ')}`);
    }
    if (new Set(files).size !== files.length) {
      throw new BadRequestException('Duplicate files in order');
    }

    await this.storage.published.update((current) => {
      const byFile = new Map(current.map((t) => [t.file, t]));
      if (files.length !== byFile.size || files.some((f) => !byFile.has(f))) {
        throw new BadRequestException(
          'Track order is out of date — refresh the panel and try again.',
        );
      }
      return files.map((file, i) => ({ ...byFile.get(file)!, position: i }));
    });

    this.logger.log(`reordered ${files.length} published tracks`);
  }

  /** Move already-published tracks into a category. A real category is required
   * (there is no "uncategorized" target anymore); this is also how legacy
   * null-category tracks get fixed. */
  async assignCategory(files: string[], category: CategoryId | null): Promise<void> {
    const invalid = files.filter((f) => !isValidFilename(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalid.join(', ')}`);
    }
    if (!category) {
      throw new BadRequestException('A category is required.');
    }
    await this.categories.assertExists(category);

    const targets = new Set(files);
    await this.storage.published.update((current) =>
      current.map((t) => (targets.has(t.file) ? { ...t, category } : t)),
    );
  }
}
