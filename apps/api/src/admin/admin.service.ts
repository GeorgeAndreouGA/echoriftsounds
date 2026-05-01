import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { isValidFilename, ScheduledTrack } from '@echorift/shared';
import { StorageService } from '../storage/storage.service';
import { PeaksService } from '../tracks/peaks.service';
import { PeaksProgressService } from '../tracks/peaks-progress.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly peaks: PeaksService,
    private readonly peaksProgress: PeaksProgressService,
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

  async publish(files: string[], scheduled: ScheduledTrack[]): Promise<void> {
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

    const t0 = Date.now();
    if (scheduled.length > 0) {
      await this.storage.scheduled.update((current) => [...current, ...scheduled]);
    }

    // For instant publishes the file is NOT added to published.json upfront.
    // PeaksProgressService generates the waveform JSON first, then invokes
    // the onReady callback to atomically append the file to the published
    // list. Failures retry forever until the file is forgotten (unpublish).
    // The result: the public site never sees a track without its peaks.
    if (files.length > 0) {
      this.peaksProgress.publishWhenReady(files, (file) =>
        this.storage.published
          .update((current) =>
            current.includes(file) ? current : [...current, file],
          )
          .then(() => undefined),
      );
    }
    this.logger.log(`publish() completed in ${Date.now() - t0}ms (files=${files.length}, scheduled=${scheduled.length})`);
  }

  async unpublish(filesToDelete: string[]): Promise<void> {
    const invalid = filesToDelete.filter((f) => !isValidFilename(f));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid filenames: ${invalid.join(', ')}`);
    }
    await this.storage.published.update((current) =>
      current.filter((f) => !filesToDelete.includes(f)),
    );

    // Drop the cached peaks JSON so a future republish goes through the full
    // generation pipeline again, and clear any progress entries so the admin
    // UI doesn't keep showing rows for the now-removed tracks.
    await Promise.all(filesToDelete.map((f) => this.peaks.delete(f)));
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
}
