import { z } from 'zod';

export type Track = string;

export type ScheduledTrack = {
  file: string;
  time: string;
};

export const TrackSchema = z.string().min(1).max(255);

export const ScheduledTrackSchema = z.object({
  file: z.string().min(1).max(255),
  time: z.string().datetime({ offset: true }).or(z.string().refine((v) => !isNaN(Date.parse(v)))),
});

export function isValidFilename(filename: string): boolean {
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 255 &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('..') &&
    !filename.includes('\0') &&
    /\.(mp3|wav|flac)$/i.test(filename)
  );
}
