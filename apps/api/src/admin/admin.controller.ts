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
import { IpWhitelistGuard } from '../auth/ip-whitelist.guard';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { SessionGuard, SESSION_COOKIE } from '../auth/session.guard';
import { SessionStore } from '../auth/session-store.service';
import { Public } from '../auth/public.decorator';
import { generateCsrfToken } from '../auth/csrf';
import { AdminService } from './admin.service';
import {
  AssignCategoryDto,
  CancelPeaksDto,
  CreateCategoryDto,
  DeleteCategoriesDto,
  DeleteDto,
  PublishDto,
  RenameCategoryDto,
  ReorderDto,
  ScheduledDeleteDto,
  UpdateYoutubeUrlDto,
} from './admin.dto';
import { CategoriesService } from '../categories/categories.service';
import { StorageService } from '../storage/storage.service';
import {
  PeaksProgressService,
  PeaksProgressSnapshot,
} from '../tracks/peaks-progress.service';

// How long a login lasts before the cookie expires and the admin must sign in
// again. Tunable via SESSION_HOURS in .env; falls back to 2h if unset or not a
// positive number (a typo must not silently mint an eternal session).
const SESSION_MAX_AGE_MS = (() => {
  const hours = Number(process.env.SESSION_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 2) * 60 * 60 * 1000;
})();

// Scope the session cookie to the admin API under the configured subpath
// (e.g. '/music/api/admin'). Must match the path the browser actually hits, or
// the cookie is never sent back. Mirrors BASE_PATH used in main.ts.
const COOKIE_PATH = `${(process.env.BASE_PATH || '').replace(/\/+$/, '')}/api/admin`;

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
    path: COOKIE_PATH,
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
    private readonly categories: CategoriesService,
    private readonly storage: StorageService,
    private readonly peaksProgress: PeaksProgressService,
    private readonly sessions: SessionStore,
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
    // Mint a server-side session; the cookie carries its random id, not a
    // constant, so it can be revoked on logout and dies on restart.
    const sessionId = this.sessions.create(SESSION_MAX_AGE_MS);
    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOpts(req));
    const csrfToken = generateCsrfToken(req, res, { secure: req.secure });
    return { ok: true, csrfToken };
  }

  @Post('logout')
  @Public()
  @ApiOperation({ summary: 'Logout — clears session cookie' })
  @ApiOkResponse({ description: '{ ok: true }' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Revoke server-side first, so the cookie is dead even if the client keeps a
    // copy — clearCookie alone left a captured cookie valid until it expired.
    const value = req.signedCookies?.[SESSION_COOKIE];
    if (typeof value === 'string') this.sessions.destroy(value);
    res.clearCookie(SESSION_COOKIE, { path: COOKIE_PATH });
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
  @ApiBody({ schema: { properties: { files: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, youtubeUrl: { type: 'string' } } } }, scheduled: { description: 'ScheduledTrack (with youtubeUrl) or array' }, category: { type: 'string', nullable: true, description: 'Category id applied to the whole batch' } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async publish(@Body() body: PublishDto) {
    if (!body.files && !body.scheduled) {
      throw new BadRequestException('No files to publish or schedule');
    }

    const immed = body.files ? (Array.isArray(body.files) ? body.files : [body.files]) : [];
    const sched = body.scheduled
      ? Array.isArray(body.scheduled)
        ? body.scheduled
        : [body.scheduled]
      : [];

    await this.adminService.publish(immed, sched, body.category ?? null);
    return { ok: true };
  }

  @Post('delete')
  @ApiOperation({ summary: 'Unpublish (remove) tracks from the published list' })
  @ApiBody({ schema: { properties: { filesToDelete: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async unpublish(@Body() body: DeleteDto) {
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
  async removeScheduled(@Body() body: ScheduledDeleteDto) {
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
  async cancelPeaks(@Body() body: CancelPeaksDto) {
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
  @ApiOperation({ summary: 'Get the currently published tracks, in display order' })
  @ApiOkResponse({ description: 'Array of { file, category, position }' })
  async getPublished() {
    // Already ordered by `position` via migratePublished — re-sorting here would
    // fight the admin's manual arrangement.
    return this.storage.published.read();
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories' })
  @ApiOkResponse({ description: 'Array of { id, name }' })
  async getCategories() {
    return this.categories.list();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a category' })
  @ApiBody({ schema: { properties: { name: { type: 'string' } } } })
  @ApiOkResponse({ description: 'The created { id, name }' })
  async createCategory(@Body() body: CreateCategoryDto) {
    if (!body?.name) {
      throw new BadRequestException('Category name is required');
    }
    return this.categories.create(body.name);
  }

  @Post('categories/rename')
  @ApiOperation({ summary: 'Rename a category (its id, and so its track links, are preserved)' })
  @ApiBody({ schema: { properties: { id: { type: 'string' }, name: { type: 'string' } } } })
  @ApiOkResponse({ description: 'The updated { id, name }' })
  async renameCategory(@Body() body: RenameCategoryDto) {
    if (!body?.id || !body?.name) {
      throw new BadRequestException('Category id and name are required');
    }
    return this.categories.rename(body.id, body.name);
  }

  @Post('categories/delete')
  @ApiOperation({ summary: 'Delete categories; refused if any still has tracks' })
  @ApiBody({ schema: { properties: { ids: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async deleteCategories(@Body() body: DeleteCategoriesDto) {
    const ids = body.ids ? (Array.isArray(body.ids) ? body.ids : [body.ids]) : [];
    await this.categories.remove(ids);
    return { ok: true };
  }

  @Post('tracks/category')
  @ApiOperation({ summary: 'Move published tracks into a category (required)' })
  @ApiBody({ schema: { properties: { files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, category: { type: 'string' } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async assignCategory(@Body() body: AssignCategoryDto) {
    const files = body.files ? (Array.isArray(body.files) ? body.files : [body.files]) : [];
    if (files.length === 0) {
      throw new BadRequestException('No files given');
    }
    await this.adminService.assignCategory(files, body.category ?? null);
    return { ok: true };
  }

  @Post('tracks/reorder')
  @ApiOperation({ summary: 'Set the display order of published tracks' })
  @ApiBody({ schema: { properties: { files: { type: 'array', items: { type: 'string' } } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async reorder(@Body() body: ReorderDto) {
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) {
      throw new BadRequestException('No files given');
    }
    await this.adminService.reorder(files);
    return { ok: true };
  }

  @Post('tracks/youtube')
  @ApiOperation({ summary: 'Set/fix the YouTube link a published track plays through' })
  @ApiBody({ schema: { properties: { files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, youtubeUrl: { type: 'string' } } } })
  @ApiOkResponse({ description: '{ ok: true }' })
  async updateYoutubeUrl(@Body() body: UpdateYoutubeUrlDto) {
    const files = body.files ? (Array.isArray(body.files) ? body.files : [body.files]) : [];
    if (files.length === 0) {
      throw new BadRequestException('No files given');
    }
    if (!body.youtubeUrl) {
      throw new BadRequestException('A YouTube link is required.');
    }
    await this.adminService.updateYoutubeUrl(files, body.youtubeUrl);
    return { ok: true };
  }
}
