import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorageService } from '../storage/storage.service';

@ApiTags('tracks')
@Controller('tracks')
export class TracksController {
  constructor(private readonly storage: StorageService) {}

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List published tracks' })
  @ApiOkResponse({ description: 'Array of published audio filenames', type: [String] })
  async getPublished(): Promise<string[]> {
    return this.storage.published.read();
  }
}
