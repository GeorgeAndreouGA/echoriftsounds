import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { ScheduledTrack } from '@echorift/shared';
import { JsonStore } from './json-store';

@Injectable()
export class StorageService implements OnModuleInit {
  readonly published: JsonStore<string[]>;
  readonly scheduled: JsonStore<ScheduledTrack[]>;

  constructor() {
    const dataDir = process.env.DATA_DIR || './data';
    this.published = new JsonStore<string[]>(path.join(dataDir, 'published.json'), []);
    this.scheduled = new JsonStore<ScheduledTrack[]>(path.join(dataDir, 'scheduled.json'), []);
  }

  async onModuleInit() {
    await Promise.all([
      this.published.ensureFile(),
      this.scheduled.ensureFile(),
    ]);
  }
}
