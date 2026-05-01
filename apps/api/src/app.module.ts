import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from './storage/storage.module';
import { TracksModule } from './tracks/tracks.module';
import { AdminModule } from './admin/admin.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HeaderedThrottlerGuard } from './auth/throttler.guard';

@Module({
  imports: [
    // Global default: permissive DoS limit. The login route overrides this
    // with a tight per-IP brute-force cap via its own @Throttle decorator.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    StorageModule,
    TracksModule,
    AdminModule,
    SchedulerModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: HeaderedThrottlerGuard }],
})
export class AppModule {}
