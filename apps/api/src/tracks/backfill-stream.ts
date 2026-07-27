import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StorageService } from '../storage/storage.service';
import { TranscodeService } from './transcode.service';

/**
 * One-shot CLI: ensure the compressed playback stream (AAC/M4A) exists for
 * every published track. New tracks get theirs at publish time; this backfills
 * tracks published before the streaming pipeline existed.
 * Usage: docker compose exec api node dist/tracks/backfill-stream.js
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const storage = app.get(StorageService);
  const transcode = app.get(TranscodeService);

  const tracks = await storage.published.read();
  console.log(`[backfill-stream] ${tracks.length} published tracks`);

  let ok = 0;
  let fail = 0;
  for (const { file } of tracks) {
    try {
      const t0 = Date.now();
      await transcode.ensure(file);
      ok++;
      console.log(`[backfill-stream] ${file} (${Date.now() - t0}ms)`);
    } catch (err) {
      fail++;
      console.warn(`[backfill-stream] FAIL ${file}: ${(err as Error).message}`);
    }
  }

  console.log(`[backfill-stream] done: ${ok} ok, ${fail} failed`);
  await app.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[backfill-stream] fatal:', err);
  process.exit(1);
});
