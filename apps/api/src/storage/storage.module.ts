import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ChangesService } from './changes.service';

@Global()
@Module({
  providers: [StorageService, ChangesService],
  exports: [StorageService, ChangesService],
})
export class StorageModule {}
