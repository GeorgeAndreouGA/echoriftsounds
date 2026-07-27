import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as crypto from 'crypto';
import { isValidFilename } from '@echorift/shared';
import { PeaksService } from './peaks.service';
import { PublishedAccessService } from './published-access.service';

// How long a client should wait before asking again after a 202. Generating a
// 2-hour waveform is ~12 s of decode plus however long it waits for an ffmpeg
// slot, so this is a poll interval, not an ETA.
const RETRY_AFTER_S = 5;

@ApiTags('tracks')
@Controller('tracks')
export class PeaksController {
  private readonly logger = new Logger(PeaksController.name);

  constructor(
    private readonly peaks: PeaksService,
    private readonly access: PublishedAccessService,
  ) {}

  /**
   * Serve the waveform for a track, and never block on generating it.
   *
   * This endpoint is public, unauthenticated, and hit once per track load. It
   * used to call generation inline, which meant an anonymous request could hold
   * an ffmpeg for the ~12 s a 2-hour decode takes — and 8 requests for 8
   * distinct files held 8 of them at once, saturating the container for 88 s
   * with every request kept open the whole time (`requestTimeout` is 0, so
   * nothing would have cut them off).
   *
   * Published tracks always have their peaks written before they go live, so
   * the cache hit below is the normal path. Generation is the self-healing path
   * for a backfill gap or a deleted cache file, and it belongs in the
   * background behind the shared ffmpeg gate, not on the request.
   */
  @Get(':file/peaks')
  @ApiOperation({ summary: 'Get waveform peaks for a track' })
  @ApiParam({ name: 'file', description: 'Audio filename' })
  @ApiOkResponse({ description: 'JSON waveform data (immutably cached by ETag)' })
  @ApiResponse({
    status: 202,
    description: 'Peaks are being generated; retry after Retry-After seconds',
  })
  async getPeaks(
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isValidFilename(file)) {
      throw new BadRequestException('Invalid filename');
    }

    // Only published tracks have public peaks. Gating here (not just on
    // sourceExists) stops this route from being a filename oracle over the whole
    // music dir, and from spawning an ffmpeg decode for an unreleased file. An
    // unpublished name gets the same 404 a missing one does, so it leaks nothing.
    if (!this.access.isPublished(file)) {
      throw new NotFoundException('Peaks unavailable');
    }

    const data = await this.peaks.readIfFresh(file);

    if (!data) {
      if (!(await this.peaks.sourceExists(file))) {
        throw new NotFoundException('Peaks unavailable');
      }
      // Kick generation off and answer now. `ensure` dedupes by filename, so a
      // client polling this — or every listener on the same track at once —
      // collapses onto a single job rather than queueing one per request.
      //
      // The failure is logged rather than swallowed: this is the only place a
      // permanently-undecodable public track announces itself. Without it, a
      // truncated source just returns 202 forever and nothing says why.
      void this.peaks.ensure(file).catch((err: unknown) => {
        this.logger.warn(
          `on-demand peaks failed for ${file}: ${(err as Error)?.message ?? String(err)}`,
        );
      });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', String(RETRY_AFTER_S));
      res.status(202).json({ status: 'generating', retryAfter: RETRY_AFTER_S });
      return;
    }

    const body = JSON.stringify(data);
    const etag = `"${crypto.createHash('sha1').update(body).digest('hex')}"`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    if (res.req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(body);
  }
}
