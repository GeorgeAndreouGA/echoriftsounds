import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SessionStore } from '../auth/session-store.service';
import { TracksModule } from '../tracks/tracks.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TracksModule, CategoriesModule],
  controllers: [AdminController],
  // SessionStore is a singleton backing both the login/logout controller and
  // the SessionGuard instantiated for this controller — both resolve it here.
  providers: [AdminService, SessionStore],
  exports: [AdminService],
})
export class AdminModule {}
