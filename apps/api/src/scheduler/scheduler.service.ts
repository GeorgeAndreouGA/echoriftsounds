import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StorageService } from '../storage/storage.service';
import { PeaksProgressService } from '../tracks/peaks-progress.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly peaksProgress: PeaksProgressService,
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler armed — checking every 30s');
  }

  @Cron('*/30 * * * * *')
  async releaseDueTracks(): Promise<void> {
    const now = new Date();
    const scheduled = await this.storage.scheduled.read();

    const dueFiles = scheduled
      .filter((item) => new Date(item.time) <= now)
      .map((item) => item.file);

    if (dueFiles.length === 0) return;

    // Don't move the file out of scheduled.json yet — peaks must be on disk
    // first. publishWhenReady generates the JSON, then onReady atomically
    // moves the entry from scheduled to published. Until that happens, the
    // file stays in scheduled.json so a restart can resume the work.
    // publishWhenReady dedupes by filename, so the next 30s tick won't
    // double-process anything still in flight.
    this.peaksProgress.publishWhenReady(dueFiles, async (file) => {
      await this.storage.scheduled.update((current) =>
        current.filter((item) => item.file !== file),
      );
      await this.storage.published.update((current) =>
        current.includes(file) ? current : [...current, file],
      );
      this.logger.log(`Released scheduled track: ${file}`);
    });
  }
}
