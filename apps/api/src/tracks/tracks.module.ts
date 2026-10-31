import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { PeaksController } from './peaks.controller';
import { PeaksService } from './peaks.service';
import { PeaksProgressService } from './peaks-progress.service';
import { FfmpegSlotsService } from './ffmpeg-slots.service';
import { PublishedAccessService } from './published-access.service';

@Module({
  controllers: [TracksController, PeaksController],
  providers: [PeaksService, PeaksProgressService, FfmpegSlotsService, PublishedAccessService],
  exports: [PeaksService, PeaksProgressService, PublishedAccessService],
})
export class TracksModule {}
