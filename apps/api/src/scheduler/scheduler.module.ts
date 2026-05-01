import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { TracksModule } from '../tracks/tracks.module';

@Module({
  imports: [ScheduleModule.forRoot(), TracksModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
