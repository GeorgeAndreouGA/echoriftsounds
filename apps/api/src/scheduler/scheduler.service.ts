import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StorageService } from '../storage/storage.service';
import { PeaksProgressService } from '../tracks/peaks-progress.service';
import { TranscodeService } from '../tracks/transcode.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly peaksProgress: PeaksProgressService,
    private readonly transcode: TranscodeService,
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler armed — checking every 30s');
  }

  @Cron('*/30 * * * * *')
  async releaseDueTracks(): Promise<void> {
    const now = new Date();
    const scheduled = await this.storage.scheduled.read();

    const due = scheduled.filter((item) => new Date(item.time) <= now);
    if (due.length === 0) return;

    // The category is chosen when the track is scheduled, so carry it across
    // to the published entry on release. Captured here rather than re-read in
    // onReady, which runs after the scheduled entry has already been removed.
    const categoryByFile = new Map(due.map((item) => [item.file, item.category ?? null]));

    // Don't move the file out of scheduled.json yet — peaks must be on disk
    // first. publishWhenReady generates the JSON, then onReady atomically
    // moves the entry from scheduled to published. Until that happens, the
    // file stays in scheduled.json so a restart can resume the work.
    // publishWhenReady dedupes by filename, so the next 30s tick won't
    // double-process anything still in flight.
    this.peaksProgress.publishWhenReady(
      due.map((item) => item.file),
      async (file) => {
        // Generate the playback stream before the track goes public (same gate
        // as instant publishes), then move it from scheduled to published.
        await this.transcode.ensure(file);
        await this.storage.scheduled.update((current) =>
          current.filter((item) => item.file !== file),
        );
        await this.storage.published.update((current) =>
          current.some((t) => t.file === file)
            ? current
            : [
                ...current,
                {
                  file,
                  category: categoryByFile.get(file) ?? null,
                  position: current.length,
                },
              ],
        );
        this.logger.log(`Released scheduled track: ${file}`);
      },
    );
  }
}
