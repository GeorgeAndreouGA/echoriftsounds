import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StorageService } from '../storage/storage.service';
import { PeaksService } from './peaks.service';

/**
 * One-shot CLI: ensure peaks JSON exists for every published track.
 * Usage: docker compose exec api node dist/tracks/backfill-peaks.js
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const storage = app.get(StorageService);
  const peaks = app.get(PeaksService);

  const files = await storage.published.read();
  console.log(`[backfill-peaks] ${files.length} published tracks`);

  let ok = 0;
  let fail = 0;
  for (const file of files) {
    try {
      const t0 = Date.now();
      await peaks.ensure(file);
      ok++;
      console.log(`[backfill-peaks] ${file} (${Date.now() - t0}ms)`);
    } catch (err) {
      fail++;
      console.warn(`[backfill-peaks] FAIL ${file}: ${(err as Error).message}`);
    }
  }

  console.log(`[backfill-peaks] done: ${ok} ok, ${fail} failed`);
  await app.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[backfill-peaks] fatal:', err);
  process.exit(1);
});
