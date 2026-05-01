import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as crypto from 'crypto';
import { isValidFilename } from '@echorift/shared';
import { PeaksService } from './peaks.service';

@ApiTags('tracks')
@Controller('tracks')
export class PeaksController {
  constructor(private readonly peaks: PeaksService) {}

  @SkipThrottle()
  @Get(':file/peaks')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @ApiOperation({ summary: 'Get waveform peaks for a track' })
  @ApiParam({ name: 'file', description: 'Audio filename' })
  @ApiOkResponse({ description: 'JSON waveform data (immutably cached by ETag)' })
  async getPeaks(
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isValidFilename(file)) {
      throw new BadRequestException('Invalid filename');
    }
    let data;
    try {
      data = await this.peaks.ensure(file);
    } catch {
      throw new NotFoundException('Peaks unavailable');
    }
    const body = JSON.stringify(data);
    const etag = `"${crypto.createHash('sha1').update(body).digest('hex')}"`;
    res.setHeader('ETag', etag);
    if (res.req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(body);
  }
}
