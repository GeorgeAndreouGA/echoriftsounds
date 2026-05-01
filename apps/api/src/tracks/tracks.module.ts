import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { PeaksController } from './peaks.controller';
import { PeaksService } from './peaks.service';
import { PeaksProgressService } from './peaks-progress.service';

@Module({
  controllers: [TracksController, PeaksController],
  providers: [PeaksService, PeaksProgressService],
  exports: [PeaksService, PeaksProgressService],
})
export class TracksModule {}
