import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  Post,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Observable, concat, defer, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ScheduledTrack } from '@echorift/shared';
import { IpWhitelistGuard } from '../auth/ip-whitelist.guard';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { SessionGuard, SESSION_COOKIE } from '../auth/session.guard';
import { Public } from '../auth/public.decorator';
import { generateCsrfToken } from '../auth/csrf';
import { AdminService } from './admin.service';
import { StorageService } from '../storage/storage.service';
import {
  PeaksProgressService,
  PeaksProgressSnapshot,
} from '../tracks/peaks-progress.service';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

// `secure` is computed from `req.secure` (driven by X-Forwarded-Proto via the
// trust-proxy chain in main.ts) rather than NODE_ENV. Plain-HTTP deployments
// (LAN-only behind a private allowlist) get usable cookies; HTTPS deployments
// still get the secure flag automatically.
function sessionCookieOpts(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict' as const,
    signed: true,
    path: '/api/admin',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

@ApiTags('admin')
@ApiCookieAuth('session')
@UseGuards(IpWhitelistGuard, SessionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly storage: StorageService,
    private readonly peaksProgress: PeaksProgressService,
  ) {}

  // Server-Sent Events stream of peaks-generation progress. The first event
  // pushed to a new subscriber is the current snapshot, so a freshly-opened
  // EventSource always renders the up-to-date state without any extra fetch.
  @Sse('peaks-progress')
  @ApiOperation({ summary: 'Live stream of peaks-generation progress (SSE)' })
  peaksProgressStream(): Observable<MessageEvent> {
    return concat(
      defer(() => of(this.peaksProgress.snapshot())),
      this.peaksProgress.stream$,
    ).pipe(
      map((snapshot: PeaksProgressSnapshot) => ({ data: snapshot } as MessageEvent)),
    );
  }

  @Post('login')
  @Public()
  // 5 attempts in 5 minutes, then a hard 5-minute lockout. blockDuration
  // makes the cooldown deterministic and lets the client display a precise
  // countdown via the Retry-After header.
  @Throttle({ default: { limit: 5, ttl: 300_000, blockDuration: 300_000 } })
  @UseGuards(BasicAuthGuard)
  @ApiOperation({ summary: 'Login with Basic auth — sets session cookie and returns CSRF token' })
  @ApiOkResponse({ description: '{ ok: true, csrfToken: string }' })
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.cookie(SESSION_COOKIE, 'ok', sessionCookieOpts(req));
    const csrfToken = generateCsrfToken(req, res, { secure: req.secure });
    return { ok: true, csrfToken };
  }

  @Post('logout')
  @Public()
  @ApiOperation({ summary: 'Logout — clears session cookie' })
  @ApiOkResponse({ description: '{ ok: true }' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/api/admin' });
    return { ok: true };
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Get CSRF token for the current session' })
  @ApiOkResponse({ description: '{ csrfToken: string }' })
  getCsrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const csrfToken = generateCsrfToken(req, res, { secure: req.secure });
    return { csrfToken };
  }

  @Get('files')
  @ApiOperation({ summary: 'List all audio files available in MUSIC_DIR' })
  @ApiOkResponse({ description: 'Array of filenames', type: [String] })
  listFiles() {
    return this.adminService.listFiles();
  }

  @Post('publish')
  @ApiOperation({ summary: 'Publish files immediately or schedule them for a future release' })
  @ApiBody({ schema: { properties: { files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, scheduled: { description: 'ScheduledTrack or array' } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async publish(
    @Body()
    body: {
      files?: string | string[];
      scheduled?: ScheduledTrack | ScheduledTrack[];
    },
  ) {
    if (!body.files && !body.scheduled) {
      throw new BadRequestException('No files to publish or schedule');
    }

    const immed = body.files ? (Array.isArray(body.files) ? body.files : [body.files]) : [];
    const sched = body.scheduled
      ? Array.isArray(body.scheduled)
        ? body.scheduled
        : [body.scheduled]
      : [];

    await this.adminService.publish(immed, sched);
    return { ok: true };
  }

  @Post('delete')
  @ApiOperation({ summary: 'Unpublish (remove) tracks from the published list' })
  @ApiBody({ schema: { properties: { filesToDelete: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async unpublish(@Body() body: { filesToDelete?: string | string[] }) {
    const toDelete = body.filesToDelete
      ? Array.isArray(body.filesToDelete)
        ? body.filesToDelete
        : [body.filesToDelete]
      : [];
    await this.adminService.unpublish(toDelete);
    return { ok: true };
  }

  @Post('scheduled/delete')
  @ApiOperation({ summary: 'Remove tracks from the scheduled release queue' })
  @ApiBody({ schema: { properties: { scheduledToDelete: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async removeScheduled(@Body() body: { scheduledToDelete?: string | string[] }) {
    const toDelete = body.scheduledToDelete
      ? Array.isArray(body.scheduledToDelete)
        ? body.scheduledToDelete
        : [body.scheduledToDelete]
      : [];
    await this.adminService.removeScheduled(toDelete);
    return { ok: true };
  }

  @Post('peaks/cancel')
  @ApiOperation({ summary: 'Abort an in-flight or retrying peaks-generation job' })
  @ApiBody({ schema: { properties: { files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async cancelPeaks(@Body() body: { files?: string | string[] }) {
    const files = body.files
      ? Array.isArray(body.files)
        ? body.files
        : [body.files]
      : [];
    this.peaksProgress.forget(files);
    return { ok: true };
  }

  @Get('scheduled')
  @ApiOperation({ summary: 'Get all scheduled tracks with their release times' })
  @ApiOkResponse({ description: 'Array of { file: string, time: ISO8601 }' })
  async getScheduled() {
    return this.storage.scheduled.read();
  }

  @Get('published')
  @ApiOperation({ summary: 'Get the list of currently published tracks' })
  @ApiOkResponse({ description: 'Array of published filenames', type: [String] })
  async getPublished() {
    return this.storage.published.read();
  }
}
