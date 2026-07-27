import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isValidFilename } from '@echorift/shared';
import { FfmpegSlotsService } from './ffmpeg-slots.service';

export interface PeaksFile {
  version: 1;
  file: string;
  duration: number;
  peaks: number[];
}

// Decode audio to mono s16le at this sample rate, then bucket into windows.
const DECODE_RATE = 8000; // Hz — low enough to keep memory tiny, high enough for detail
const SAMPLES_PER_WINDOW = DECODE_RATE; // 1 window = 1 second

// How far the decoded waveform may diverge from the duration ffprobe read from
// the container before we call the result untrustworthy. One window is one
// second, so this is "2 seconds, or 1% of the track, whichever is larger" —
// loose enough to absorb encoder padding and the partial final window, tight
// enough that the 53% shortfall of a truncated file is nowhere near it.
const DURATION_TOLERANCE_S = 2;
const DURATION_TOLERANCE_RATIO = 0.01;

@Injectable()
export class PeaksService implements OnModuleInit {
  private readonly logger = new Logger(PeaksService.name);
  private readonly inflight = new Map<string, Promise<PeaksFile>>();

  private readonly musicDir = process.env.MUSIC_DIR || '/app/music';
  private readonly peaksDir = path.join(
    process.env.DATA_DIR || './data',
    'peaks',
  );

  constructor(private readonly slots: FfmpegSlotsService) {}

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.peaksDir, { recursive: true });
  }

  /** Does the source audio exist in the music dir? */
  async sourceExists(file: string): Promise<boolean> {
    if (!isValidFilename(file)) return false;
    return fs
      .stat(path.join(this.musicDir, file))
      .then((s) => s.isFile())
      .catch(() => false);
  }

  peaksPath(file: string): string {
    const id = crypto.createHash('sha1').update(file).digest('hex');
    return path.join(this.peaksDir, `${id}.json`);
  }

  /**
   * Returns peaks JSON for a file, generating it on demand if missing or
   * stale. Concurrent calls for the same file share a single in-flight promise.
   */
  async ensure(file: string): Promise<PeaksFile> {
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

  private async ensureUncached(file: string): Promise<PeaksFile> {
    const audioPath = path.join(this.musicDir, file);
    const outPath = this.peaksPath(file);

    const audioStat = await fs.stat(audioPath).catch(() => null);
    if (!audioStat) throw new Error(`Audio not found: ${file}`);

    const peaksStat = await fs.stat(outPath).catch(() => null);
    if (peaksStat && peaksStat.mtimeMs >= audioStat.mtimeMs) {
      const raw = await fs.readFile(outPath, 'utf-8');
      return JSON.parse(raw) as PeaksFile;
    }

    return this.generate(file, audioPath, outPath);
  }

  /**
   * Remove the cached peaks JSON for a file. Used on unpublish so a future
   * republish runs through the full generation flow again. ENOENT is a no-op
   * (peaks may never have been generated, e.g. for never-released tracks).
   */
  async delete(file: string): Promise<void> {
    if (!isValidFilename(file)) return;
    const out = this.peaksPath(file);
    try {
      await fs.unlink(out);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `failed to delete peaks for ${file}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Try to read existing peaks without triggering generation. */
  async readIfFresh(file: string): Promise<PeaksFile | null> {
    if (!isValidFilename(file)) return null;
    const audioPath = path.join(this.musicDir, file);
    const outPath = this.peaksPath(file);
    const [audioStat, peaksStat] = await Promise.all([
      fs.stat(audioPath).catch(() => null),
      fs.stat(outPath).catch(() => null),
    ]);
    if (!audioStat || !peaksStat) return null;
    if (peaksStat.mtimeMs < audioStat.mtimeMs) return null;
    try {
      const raw = await fs.readFile(outPath, 'utf-8');
      return JSON.parse(raw) as PeaksFile;
    } catch {
      return null;
    }
  }

  private async generate(
    file: string,
    audioPath: string,
    outPath: string,
  ): Promise<PeaksFile> {
    const t0 = Date.now();

    // Both spawn a process, so both belong inside the slot. ffprobe only reads
    // container metadata and returns in milliseconds; it rides along rather than
    // taking a slot of its own, which would let a burst of probes lock out the
    // decodes they exist to describe.
    const [duration, peaks] = await this.slots.run(() =>
      Promise.all([this.getDuration(audioPath), this.decodePeaks(audioPath)]),
    );

    // The waveform and the duration have to describe the same audio, because
    // the player draws one and seeks against the other. Any disagreement is a
    // seek bar that lies, and both directions happen for real:
    //
    //   short — a file whose header still claims 2 hours but whose bytes stop
    //     at 60%. ffmpeg decodes it happily and just stops early, so a check
    //     that only asks "did we get ANY peaks?" passes and serves a waveform
    //     ending partway along the bar as 200 OK.
    //   long — a header that under-reports, so the drawn waveform is complete
    //     but every position maps to the wrong time.
    //
    // One window is one second, so comparing the two directly is the whole
    // test, and failing turns a silent corruption into an ordinary failure the
    // retry loop and the admin panel already know how to show.
    const tolerance = Math.max(
      DURATION_TOLERANCE_S,
      duration * DURATION_TOLERANCE_RATIO,
    );
    if (Math.abs(peaks.length - duration) > tolerance) {
      const pct = ((peaks.length / duration) * 100).toFixed(1);
      throw new Error(
        `decode does not match container duration for ${file}: ` +
          `${peaks.length} windows for a ${duration.toFixed(1)}s file (${pct}% — ` +
          `source is likely truncated or its header is wrong)`,
      );
    }

    const out: PeaksFile = { version: 1, file, duration, peaks };
    const tmp = `${outPath}.tmp.${process.hrtime.bigint().toString()}`;
    await fs.writeFile(tmp, JSON.stringify(out), 'utf-8');
    await fs.rename(tmp, outPath);

    this.logger.log(
      `peaks generated for ${file} (windows=${peaks.length}, dur=${duration.toFixed(1)}s, ${Date.now() - t0}ms)`,
    );
    return out;
  }

  /**
   * Get duration via ffprobe (fast — reads container metadata only).
   */
  private getDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'ffprobe',
        [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'csv=p=0',
          audioPath,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '';
      proc.stdout.on('data', (b: Buffer) => (out += b.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        const n = parseFloat(out.trim());
        if (code !== 0 || isNaN(n)) {
          reject(new Error(`ffprobe failed (exit ${code}): ${out.trim()}`));
        } else {
          resolve(n);
        }
      });
    });
  }

  /**
   * Decode audio to mono s16le at DECODE_RATE via ffmpeg, bucket samples into
   * 1-second windows and return the peak amplitude (0..1) per window.
   *
   * Memory usage: only a streaming buffer of incoming chunks is kept in memory,
   * never the full decoded file.
   */
  private decodePeaks(audioPath: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
        [
          '-i', audioPath,
          '-ac', '1',
          '-ar', String(DECODE_RATE),
          '-f', 's16le',
          '-',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      const peaks: number[] = [];
      let windowPeak = 0;
      let windowCount = 0;
      // Carry over an odd byte between chunks (s16le = 2 bytes per sample)
      let carryByte: number | null = null;

      proc.stdout.on('data', (chunk: Buffer) => {
        let offset = 0;

        // If we carried an odd byte from last chunk, complete the sample now
        if (carryByte !== null) {
          const hi = chunk[0];
          offset = 1;
          const sample = (carryByte | (hi << 8)) << 16 >> 16; // sign-extend
          const abs = Math.abs(sample);
          if (abs > windowPeak) windowPeak = abs;
          windowCount++;
          if (windowCount >= SAMPLES_PER_WINDOW) {
            peaks.push(windowPeak / 32768);
            windowPeak = 0;
            windowCount = 0;
          }
          carryByte = null;
        }

        while (offset + 1 < chunk.length) {
          const sample = chunk.readInt16LE(offset);
          offset += 2;
          const abs = Math.abs(sample);
          if (abs > windowPeak) windowPeak = abs;
          windowCount++;
          if (windowCount >= SAMPLES_PER_WINDOW) {
            peaks.push(windowPeak / 32768);
            windowPeak = 0;
            windowCount = 0;
          }
        }

        if (offset < chunk.length) {
          carryByte = chunk[offset];
        }
      });

      let ffmpegError = '';
      proc.stderr.on('data', (b: Buffer) => (ffmpegError += b.toString()));

      proc.stdout.on('end', () => {
        // Flush final partial window (last few seconds of audio)
        if (windowCount > 0) {
          peaks.push(windowPeak / 32768);
        }
        resolve(peaks);
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0 && peaks.length === 0) {
          reject(new Error(`ffmpeg exited ${code}: ${ffmpegError.slice(-200)}`));
        }
      });
    });
  }
}
