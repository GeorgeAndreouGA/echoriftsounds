import { z } from 'zod';

export type Track = string;

export type CategoryId = string;

export type Category = {
  id: CategoryId;
  name: string;
};

export type PublishedTrack = {
  file: string;
  category: CategoryId | null;
  /**
   * Explicit display order, 0-based and contiguous. The admin arranges tracks
   * by hand, so this — not the filename — is the source of truth for order.
   * Normalised on every read by migratePublished.
   */
  position: number;
  /**
   * The YouTube video that actually plays for this track. Playback is
   * YouTube-backed, not streamed off disk — this is the one thing that makes
   * a track playable. `null` only for data migrated from before this field
   * existed; a track in that state is published (and downloadable) but
   * publicly shows as unplayable until the admin backfills a link via the
   * published-list edit action. Publishing/scheduling a NEW track always
   * requires a valid one — see isValidYoutubeUrl.
   */
  youtubeUrl: string | null;
};

export type ScheduledTrack = {
  file: string;
  time: string;
  category?: CategoryId | null;
  /** Same requirement as PublishedTrack.youtubeUrl, carried across on release. */
  youtubeUrl?: string | null;
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

// YouTube's video ids are always exactly 11 characters from this alphabet —
// true for every current URL shape (watch, youtu.be, shorts, embed). Anchored
// full-match: a prefix match would accept "ID_PLUS_GARBAGE" and quietly embed
// the wrong video.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pull the 11-character video id out of whatever shape of YouTube URL an
 * admin pastes, or null if none can be found. Deliberately permissive on
 * input (scheme optional, `www.`/`m.`/`music.` optional, any extra query
 * params or a `#t=` fragment ignored) because the only thing that matters is
 * whether a real video id comes out the other end — which is then validated
 * strictly against YOUTUBE_ID_RE regardless of how it was found.
 *
 * Callers must always re-derive the id from the stored URL via this function
 * when building an embed — never interpolate the raw stored string into an
 * iframe src or any other DOM sink.
 */
export function extractYoutubeVideoId(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;

  let candidate: string | null = null;

  // youtu.be/<id>
  const short = /youtu\.be\/([^?&/#]+)/.exec(url);
  if (short) candidate = short[1];

  // youtube.com/watch?v=<id> (v can be anywhere in the query string)
  if (!candidate) {
    const watch = /[?&]v=([^?&#]+)/.exec(url);
    if (watch) candidate = watch[1];
  }

  // youtube.com/shorts/<id> or youtube.com/embed/<id>
  if (!candidate) {
    const path = /youtube(?:-nocookie)?\.com\/(?:shorts|embed|live)\/([^?&/#]+)/.exec(url);
    if (path) candidate = path[1];
  }

  if (!candidate) return null;
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

export function isValidYoutubeUrl(url: unknown): boolean {
  return extractYoutubeVideoId(url) !== null;
}

export const CATEGORY_NAME_MAX = 64;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function isValidCategoryName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.trim().length <= CATEGORY_NAME_MAX &&
    !CONTROL_CHARS.test(name)
  );
}

/**
 * Category display name -> stable id. Ids are what tracks reference, so a
 * rename keeps the id and only swaps the name.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATEGORY_NAME_MAX);
}

// Built once: constructing a Collator is expensive and a sort invokes the
// comparator O(n log n) times.
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Alphanumeric-aware comparison: "ASOT 900" sorts before "ASOT 1000", which a
 * plain string comparison gets backwards. Display order is now the admin's
 * manual arrangement (PublishedTrack.position); this is the fallback used to
 * seed that order for tracks that don't have one yet.
 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function sortTracks<T extends { file: string }>(tracks: T[]): T[] {
  return [...tracks].sort((a, b) => naturalCompare(a.file, b.file));
}

export interface RowRangeResult {
  /** Row numbers named by the expression — de-duplicated, ascending. */
  numbers: number[];
  ok: boolean;
  /** Terminal-style message for the error line; '' when ok. */
  error: string;
  /** Leading '+' — the caller should union rather than replace. */
  additive: boolean;
}

// A range wider than this is a typo, not an intent. Bounds the work done per
// keystroke, since the admin panel re-parses live as you type.
const MAX_ROW_NUMBERS = 10_000;

/**
 * Parse an admin row-range expression like `1-4,7,9` into row numbers.
 *
 * Grammar: `['+'] term (',' term)*` where `term := N | N '-' N`. Whitespace is
 * ignored anywhere and leading zeros are accepted, so `003-007` matches the
 * zero-padded labels the lists actually render.
 *
 * Deliberately takes no upper bound: the published list numbers rows by their
 * global position, so while a filter is active its visible numbers are sparse
 * (3, 17, 42) and no single max describes them. Resolving numbers to files —
 * and reporting the ones that don't land on a visible row — belongs to the
 * caller, which is the only thing that knows its own numbering.
 */
export function parseRowRange(input: string): RowRangeResult {
  const bad = (error: string): RowRangeResult => ({
    numbers: [],
    ok: false,
    error,
    additive: false,
  });

  const compact = input.replace(/\s+/g, '');
  const additive = compact.startsWith('+');
  const body = additive ? compact.slice(1) : compact;

  const found = new Set<number>();

  for (const token of body.split(',')) {
    // Empty tokens are a normal intermediate typing state ("1-4," mid-entry),
    // not an error.
    if (token === '') continue;

    const single = /^\d+$/.exec(token);
    const span = /^(\d+)-(\d+)$/.exec(token);
    if (!single && !span) return bad(`BAD RANGE "${token}"`);

    const from = Number(single ? single[0] : span![1]);
    const to = Number(single ? single[0] : span![2]);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
      return bad(`BAD RANGE "${token}"`);
    }
    if (from < 1 || to < 1) return bad('ROWS START AT 1');

    // Reversed spans normalise, matching shift-click being direction-agnostic.
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    if (hi - lo + 1 > MAX_ROW_NUMBERS) return bad('RANGE TOO LARGE');

    for (let n = lo; n <= hi; n++) {
      found.add(n);
      if (found.size > MAX_ROW_NUMBERS) return bad('RANGE TOO LARGE');
    }
  }

  return {
    numbers: [...found].sort((a, b) => a - b),
    ok: true,
    error: '',
    additive,
  };
}

/**
 * published.json was originally a bare string[], then gained categories, and
 * now carries an explicit `position`. Normalise every historical shape to
 * PublishedTrack[] so old data on disk keeps working without a migration
 * script. Unknown/corrupt entries are dropped rather than crashing the API on
 * boot.
 *
 * Ordering rules, applied on every read so the result is always sorted and
 * renumbered 0..n-1:
 *  - Entries that already have a position keep their relative order. Once the
 *    admin has arranged the list, that arrangement wins.
 *  - Entries without one (legacy data, or a track written by an older build)
 *    are appended after them in natural filename order. For a wholly legacy
 *    file that reproduces exactly the alphabetical order the API used to apply
 *    on read, so nothing visibly moves on upgrade.
 */
export function migratePublished(raw: unknown): PublishedTrack[] {
  if (!Array.isArray(raw)) return [];
  type Partial = {
    file: string;
    category: CategoryId | null;
    youtubeUrl: string | null;
    position?: number;
  };
  const parsed: Partial[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      parsed.push({ file: entry, category: null, youtubeUrl: null });
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as PublishedTrack).file === 'string'
    ) {
      const { file, category, position, youtubeUrl } = entry as PublishedTrack;
      parsed.push({
        file,
        category: typeof category === 'string' ? category : null,
        // Predates the YouTube field entirely, or was written with a corrupt
        // value — either way default to null rather than dropping the whole
        // entry. A null youtubeUrl just means the track shows as unplayable
        // (publicly) until the admin backfills it from the published list.
        youtubeUrl: typeof youtubeUrl === 'string' ? youtubeUrl : null,
        position: Number.isFinite(position) ? position : undefined,
      });
    }
  }

  const positioned = parsed.filter((t) => t.position !== undefined);
  const unpositioned = parsed.filter((t) => t.position === undefined);
  positioned.sort((a, b) => a.position! - b.position!);
  unpositioned.sort((a, b) => naturalCompare(a.file, b.file));

  return [...positioned, ...unpositioned].map((t, i) => ({
    file: t.file,
    category: t.category,
    youtubeUrl: t.youtubeUrl,
    position: i,
  }));
}

/**
 * scheduled.json entries predating categories have no `category` field;
 * entries predating the YouTube requirement have no `youtubeUrl` field.
 * Both default to null rather than dropping the entry — a scheduled track
 * missing its link still releases on time, it just can't play until fixed.
 */
export function migrateScheduled(raw: unknown): ScheduledTrack[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledTrack[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as ScheduledTrack).file === 'string' &&
      typeof (entry as ScheduledTrack).time === 'string'
    ) {
      const { file, time, category, youtubeUrl } = entry as ScheduledTrack;
      out.push({
        file,
        time,
        category: typeof category === 'string' ? category : null,
        youtubeUrl: typeof youtubeUrl === 'string' ? youtubeUrl : null,
      });
    }
  }
  return out;
}

export function migrateCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Category).id === 'string' &&
      typeof (entry as Category).name === 'string'
    ) {
      const { id, name } = entry as Category;
      out.push({ id, name });
    }
  }
  return out;
}
