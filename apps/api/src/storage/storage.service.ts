import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import {
  Category,
  PublishedTrack,
  ScheduledTrack,
  migrateCategories,
  migratePublished,
  migrateScheduled,
} from '@echorift/shared';
import { JsonStore } from './json-store';
import { ChangesService } from './changes.service';

@Injectable()
export class StorageService implements OnModuleInit {
  readonly published: JsonStore<PublishedTrack[]>;
  readonly scheduled: JsonStore<ScheduledTrack[]>;
  readonly categories: JsonStore<Category[]>;

  constructor(private readonly changes: ChangesService) {
    const dataDir = process.env.DATA_DIR || './data';
    // Every store broadcasts on write, so connected admin panels and visitors
    // refresh themselves without polling.
    const announce = () => this.changes.emit();
    // The migrate hooks normalise older on-disk shapes (published.json was
    // originally a bare string[]) on every read, so the upgrade needs no
    // migration script and no downtime.
    this.published = new JsonStore<PublishedTrack[]>(
      path.join(dataDir, 'published.json'),
      [],
      migratePublished,
      announce,
    );
    this.scheduled = new JsonStore<ScheduledTrack[]>(
      path.join(dataDir, 'scheduled.json'),
      [],
      migrateScheduled,
      announce,
    );
    this.categories = new JsonStore<Category[]>(
      path.join(dataDir, 'categories.json'),
      [],
      migrateCategories,
      announce,
    );
  }

  async onModuleInit() {
    await Promise.all([
      this.published.ensureFile(),
      this.scheduled.ensureFile(),
      this.categories.ensureFile(),
    ]);
  }
}
