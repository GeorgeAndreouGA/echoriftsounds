import { Controller, Get, MessageEvent, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, concat, defer, map, merge, of, interval } from 'rxjs';
import { PublishedTrack } from '@echorift/shared';
import { StorageService } from '../storage/storage.service';
import { ChangesService } from '../storage/changes.service';

// Periodic traffic keeps the connection warm through proxies that drop idle
// sockets. Sent as a named 'ping' event, which a client only receives if it
// explicitly listens for it — so a heartbeat can never be mistaken for a change.
const HEARTBEAT_MS = 25_000;

@ApiTags('tracks')
@Controller('tracks')
export class TracksController {
  constructor(
    private readonly storage: StorageService,
    private readonly changes: ChangesService,
  ) {}

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List published tracks in the admin-defined order' })
  @ApiOkResponse({ description: 'Array of { file, category, position }' })
  async getPublished(): Promise<PublishedTrack[]> {
    // Display order is whatever the admin arranged: migratePublished sorts by
    // `position` on read, so the stored order is already the right one.
    return this.storage.published.read();
  }

  /**
   * Live change notifications. Carries no data — just a tick telling clients to
   * refetch — so it's safe to serve publicly and cheap to hold open. Public
   * pages and the admin panel both listen and reload their own data.
   */
  @SkipThrottle()
  @Sse('stream')
  @ApiOperation({ summary: 'Live notification that tracks/categories changed (SSE)' })
  stream(): Observable<MessageEvent> {
    return merge(
      // An immediate first event lets a client confirm the stream is live.
      concat(
        defer(() => of(Date.now())),
        this.changes.stream$,
      ).pipe(map((at) => ({ type: 'change', data: { at } }) as MessageEvent)),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent)),
    );
  }
}
