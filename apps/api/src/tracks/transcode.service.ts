import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isValidFilename } from '@echorift/shared';
import { FfmpegSlotsService } from './ffmpeg-slots.service';

// Playback stream format. Long lossless masters (1–2 hr FLAC/WAV, ~1 GB) make
// every seek a large byte-range fetch. A ~128 kbps AAC/M4A proxy is ~10× smaller
// (~115 MB for 2 hr), so seeks pull ~1/10 the bytes. AAC-LC in MP4 with the moov
// atom relocated to the front (+faststart) plays and seeks in every browser
// (incl. Safari/iOS) via the container sample table. Swap to Opus here later if
// broad browser support is confirmed.
const AUDIO_BITRATE = '128k';
const TARGET_BPS = 128_000;
const STREAM_EXT = '.m4a';

// Transcoding a source that is already small and already browser-playable is
// pure loss: a 2 hr 128 kbps MP3 (110 MB) spends ~60 s of CPU and 113 MB of disk
// to produce a proxy that is *larger* than the original, for a seek cost that
// was never a problem. Skip when there is no headroom left to win — 10% over
// target, since re-encoding a 135 kbps source to 128 kbps saves nothing either
// and only costs a generation loss.
const SKIP_ABOVE_BPS = TARGET_BPS * 1.1;

// Codecs every target browser plays natively from a plain <audio> element, keyed
// by the extension that makes the server send the right Content-Type. Both must
// agree: AAC inside a .mkv is playable data in an unplayable wrapper, and the
// point of the proxy is that the browser can just play the file.
const DIRECT_PLAYABLE: Record<string, readonly string[]> = {
  '.mp3': ['mp3'],
  '.m4a': ['aac'],
  '.mp4': ['aac'],
  '.aac': ['aac'],
};

@Injectable()
export class TranscodeService implements OnModuleInit {
  private readonly logger = new Logger(TranscodeService.name);
  private readonly inflight = new Map<string, Promise<string | null>>();

  private readonly musicDir = process.env.MUSIC_DIR || '/app/music';
  private readonly streamDir = path.join(
    process.env.DATA_DIR || './data',
    'stream',
  );

  constructor(private readonly slots: FfmpegSlotsService) {}

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.streamDir, { recursive: true });
  }

  /**
   * On-disk path of the transcoded stream for a source file. Named by the
   * original filename + .m4a (filenames are unique in the music dir) so it maps
   * 1:1 to its /stream/<file>.m4a static URL.
   */
  streamPath(file: string): string {
    return path.join(this.streamDir, `${file}${STREAM_EXT}`);
  }

  /**
   * Returns the path to the playback stream for a file, generating it on demand
   * if missing or stale. Concurrent calls for the same file share one in-flight
   * promise.
   *
   * Returns `null` when the source needs no proxy — it is already compressed,
   * already small, and already playable, so the browser should fetch it
   * directly. The player falls back to `/audio/<file>` whenever the `.m4a` is
   * absent, which is the same path a not-yet-transcoded track takes.
   */
  async ensure(file: string): Promise<string | null> {
    if (!isValidFilename(file)) {
      throw new Error(`Invalid filename: ${file}`);
    }
    const cached = this.inflight.get(file);
    if (cached) return cached;

    const work = this.ensureUncached(file).finally(() =>
      this.inflight.delete(file),
    );
    this.inflight.set(file, work);
    return work;
  }

  private async ensureUncached(file: string): Promise<string | null> {
    const audioPath = path.join(this.musicDir, file);
    const outPath = this.streamPath(file);

    const audioStat = await fs.stat(audioPath).catch(() => null);
    if (!audioStat) throw new Error(`Audio not found: ${file}`);

    const outStat = await fs.stat(outPath).catch(() => null);
    if (outStat && outStat.mtimeMs >= audioStat.mtimeMs) {
      return outPath;
    }

    if (await this.isAlreadyStreamable(file, audioPath)) return null;

    return this.generate(file, audioPath, outPath);
  }

  /**
   * Would the proxy be worth making? Only if the source is either not directly
   * playable in a browser, or big enough that a 128 kbps re-encode meaningfully
   * shrinks the bytes a seek has to pull.
   *
   * Probe failures answer "no" — an unreadable source is not something to skip
   * work over. Let `generate` run and surface the real error.
   */
  private async isAlreadyStreamable(
    file: string,
    audioPath: string,
  ): Promise<boolean> {
    const ext = path.extname(file).toLowerCase();
    const playableCodecs = DIRECT_PLAYABLE[ext];
    if (!playableCodecs) return false;

    const probe = await this.probe(audioPath).catch(() => null);
    if (!probe || !playableCodecs.includes(probe.codec)) return false;
    if (!probe.bitrate || probe.bitrate > SKIP_ABOVE_BPS) return false;

    this.logger.log(
      `stream skipped for ${file} — source is already ${probe.codec} @ ` +
        `${Math.round(probe.bitrate / 1000)} kbps; serving it directly`,
    );
    return true;
  }

  /** Audio codec and bitrate of the first audio stream, via ffprobe. */
  private probe(
    audioPath: string,
  ): Promise<{ codec: string; bitrate: number | null }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'ffprobe',
        [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_name,bit_rate:format=bit_rate',
          '-of', 'json',
          audioPath,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '';
      proc.stdout.on('data', (b: Buffer) => (out += b.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed (exit ${code})`));
          return;
        }
        try {
          const parsed = JSON.parse(out) as {
            streams?: Array<{ codec_name?: string; bit_rate?: string }>;
            format?: { bit_rate?: string };
          };
          const stream = parsed.streams?.[0];
          if (!stream?.codec_name) {
            reject(new Error('ffprobe reported no audio stream'));
            return;
          }
          // Stream bitrate is the honest number, but containers like MP4 often
          // omit it per-stream; the format-level figure is then the whole file,
          // which for an audio-only file is the same thing plus container
          // overhead — close enough to compare against a 10% margin.
          const raw = stream.bit_rate ?? parsed.format?.bit_rate;
          const bitrate = raw ? Number(raw) : NaN;
          resolve({
            codec: stream.codec_name,
            bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null,
          });
        } catch (err) {
          reject(err as Error);
        }
      });
    });
  }

  /** Best-effort: does a fresh stream already exist for this file? */
  async readIfFresh(file: string): Promise<string | null> {
    if (!isValidFilename(file)) return null;
    const audioPath = path.join(this.musicDir, file);
    const outPath = this.streamPath(file);
    const [audioStat, outStat] = await Promise.all([
      fs.stat(audioPath).catch(() => null),
      fs.stat(outPath).catch(() => null),
    ]);
    if (!audioStat || !outStat) return null;
    if (outStat.mtimeMs < audioStat.mtimeMs) return null;
    return outPath;
  }

  /**
   * Remove the cached stream for a file. Used on unpublish so a future
   * republish re-transcodes. ENOENT is a no-op.
   */
  async delete(file: string): Promise<void> {
    if (!isValidFilename(file)) return;
    const out = this.streamPath(file);
    try {
      await fs.unlink(out);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `failed to delete stream for ${file}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async generate(
    file: string,
    audioPath: string,
    outPath: string,
  ): Promise<string> {
    const t0 = Date.now();
    const tmp = `${outPath}.tmp.${process.hrtime.bigint().toString()}${STREAM_EXT}`;

    await this.slots
      .run(
        () =>
          new Promise<void>((resolve, reject) => {
            const proc = spawn(
              'ffmpeg',
              [
                '-i', audioPath,
                '-vn', // drop any cover-art / video stream
                '-c:a', 'aac',
                '-b:a', AUDIO_BITRATE,
                '-movflags', '+faststart',
                '-y',
                tmp,
              ],
              { stdio: ['ignore', 'ignore', 'pipe'] },
            );
            let stderr = '';
            proc.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
            proc.on('error', reject);
            proc.on('close', (code) => {
              if (code === 0) resolve();
              else
                reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-200)}`));
            });
          }),
      )
      .catch(async (err) => {
        await fs.unlink(tmp).catch(() => undefined);
        throw err;
      });

    await fs.rename(tmp, outPath);

    const size = await fs.stat(outPath).then((s) => s.size).catch(() => 0);
    this.logger.log(
      `stream generated for ${file} (${(size / 1_048_576).toFixed(1)} MB, ${Date.now() - t0}ms)`,
    );
    return outPath;
  }
}
