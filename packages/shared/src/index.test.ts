import { describe, expect, it } from 'vitest';
import {
  isValidCategoryName,
  migrateCategories,
  migratePublished,
  migrateScheduled,
  naturalCompare,
  parseRowRange,
  slugify,
  sortTracks,
} from './index';

describe('naturalCompare', () => {
  it('orders embedded numbers by value, not lexically', () => {
    // The whole point: a plain string sort puts "ASOT 1000" before "ASOT 900".
    const sorted = ['ASOT 1000.flac', 'ASOT 900.flac', 'ASOT 1001.flac'].sort(naturalCompare);
    expect(sorted).toEqual(['ASOT 900.flac', 'ASOT 1000.flac', 'ASOT 1001.flac']);
  });

  it('is case-insensitive', () => {
    expect(naturalCompare('alpha.mp3', 'ALPHA.mp3')).toBe(0);
  });

  it('is symmetric', () => {
    expect(naturalCompare('a.mp3', 'b.mp3')).toBeLessThan(0);
    expect(naturalCompare('b.mp3', 'a.mp3')).toBeGreaterThan(0);
  });
});

describe('sortTracks', () => {
  it('sorts by filename regardless of the order tracks were published in', () => {
    // Mimics the peaks race: a short track 3 finishes ffmpeg first and lands
    // in published.json ahead of the longer tracks 1 and 2.
    const asPublished = [
      { file: 'mix 3.flac', category: null },
      { file: 'mix 1.flac', category: 'trance' },
      { file: 'mix 2.flac', category: null },
    ];
    expect(sortTracks(asPublished).map((t) => t.file)).toEqual([
      'mix 1.flac',
      'mix 2.flac',
      'mix 3.flac',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [{ file: 'b.mp3', category: null }, { file: 'a.mp3', category: null }];
    sortTracks(input);
    expect(input[0].file).toBe('b.mp3');
  });
});

describe('migratePublished', () => {
  it('upgrades the legacy string[] shape to PublishedTrack[]', () => {
    expect(migratePublished(['a.flac', 'b.mp3'])).toEqual([
      { file: 'a.flac', category: null, position: 0 },
      { file: 'b.mp3', category: null, position: 1 },
    ]);
  });

  it('keeps already-migrated entries, adding the position they now carry', () => {
    expect(migratePublished([{ file: 'a.flac', category: 'pure-trance' }])).toEqual([
      { file: 'a.flac', category: 'pure-trance', position: 0 },
    ]);
  });

  it('tolerates a mixed-shape file mid-migration', () => {
    expect(migratePublished(['a.flac', { file: 'b.flac', category: 'hardcore' }])).toEqual([
      { file: 'a.flac', category: null, position: 0 },
      { file: 'b.flac', category: 'hardcore', position: 1 },
    ]);
  });

  it('drops corrupt entries instead of crashing the API on boot', () => {
    expect(migratePublished([null, 42, {}, { file: 'ok.flac' }])).toEqual([
      { file: 'ok.flac', category: null, position: 0 },
    ]);
  });

  it('returns an empty list for a non-array file', () => {
    expect(migratePublished(null)).toEqual([]);
    expect(migratePublished({})).toEqual([]);
  });

  // Ordering: `position` is the source of display order once it exists, and is
  // seeded from natural filename order for data that predates it — so upgrading
  // an existing install doesn't visibly shuffle the site.
  it('seeds legacy data with the natural filename order it used to be shown in', () => {
    expect(migratePublished(['mix 3.flac', 'mix 1.flac', 'mix 20.flac']).map((t) => t.file)).toEqual(
      ['mix 1.flac', 'mix 3.flac', 'mix 20.flac'],
    );
  });

  it('honours an explicit position over filename order', () => {
    const raw = [
      { file: 'a.flac', category: null, position: 2 },
      { file: 'b.flac', category: null, position: 0 },
      { file: 'c.flac', category: null, position: 1 },
    ];
    expect(migratePublished(raw).map((t) => t.file)).toEqual(['b.flac', 'c.flac', 'a.flac']);
  });

  it('renumbers sparse positions to a contiguous 0..n-1', () => {
    const raw = [
      { file: 'a.flac', category: null, position: 70 },
      { file: 'b.flac', category: null, position: 5 },
    ];
    expect(migratePublished(raw)).toEqual([
      { file: 'b.flac', category: null, position: 0 },
      { file: 'a.flac', category: null, position: 1 },
    ]);
  });

  it('appends entries lacking a position after the arranged ones', () => {
    const raw = [
      { file: 'zz-new.flac', category: null },
      { file: 'arranged.flac', category: null, position: 0 },
      { file: 'aa-new.flac', category: null },
    ];
    // The arranged track holds its spot; the two newcomers follow in natural order.
    expect(migratePublished(raw).map((t) => t.file)).toEqual([
      'arranged.flac',
      'aa-new.flac',
      'zz-new.flac',
    ]);
  });
});

describe('migrateScheduled', () => {
  it('defaults a missing category to null', () => {
    expect(migrateScheduled([{ file: 'a.flac', time: '2026-01-01T00:00:00Z' }])).toEqual([
      { file: 'a.flac', time: '2026-01-01T00:00:00Z', category: null },
    ]);
  });

  it('drops entries missing a time', () => {
    expect(migrateScheduled([{ file: 'a.flac' }])).toEqual([]);
  });
});

describe('migrateCategories', () => {
  it('keeps well-formed categories and drops malformed ones', () => {
    expect(migrateCategories([{ id: 'pure-trance', name: 'Pure Trance' }, { id: 'x' }])).toEqual([
      { id: 'pure-trance', name: 'Pure Trance' },
    ]);
  });
});

describe('slugify', () => {
  it('turns a display name into a url-safe id', () => {
    expect(slugify('Hardcore Ultimate Mix')).toBe('hardcore-ultimate-mix');
  });

  it('collapses punctuation and trims stray separators', () => {
    expect(slugify('  Pure   Trance!! ')).toBe('pure-trance');
  });

  it('strips accents rather than dropping the letters', () => {
    expect(slugify('Trance Éxtasis')).toBe('trance-extasis');
  });
});

describe('isValidCategoryName', () => {
  it('accepts ordinary names', () => {
    expect(isValidCategoryName('Pure Trance')).toBe(true);
  });

  it('rejects empty, whitespace-only, and over-long names', () => {
    expect(isValidCategoryName('')).toBe(false);
    expect(isValidCategoryName('   ')).toBe(false);
    expect(isValidCategoryName('x'.repeat(65))).toBe(false);
  });

  it('rejects control characters and non-strings', () => {
    expect(isValidCategoryName('bad\u0000name')).toBe(false);
    expect(isValidCategoryName('bad\nname')).toBe(false);
    expect(isValidCategoryName(42)).toBe(false);
    expect(isValidCategoryName(null)).toBe(false);
  });
});

describe('parseRowRange', () => {
  const nums = (input: string) => parseRowRange(input).numbers;

  it('expands spans and singles, deduped and ascending', () => {
    expect(nums('1-4,7,9')).toEqual([1, 2, 3, 4, 7, 9]);
    expect(nums('9,7,1-4')).toEqual([1, 2, 3, 4, 7, 9]);
    expect(nums('1-4,3')).toEqual([1, 2, 3, 4]);
  });

  it('normalises reversed spans, matching direction-agnostic shift-click', () => {
    expect(nums('9-5')).toEqual(nums('5-9'));
  });

  it('ignores whitespace and leading zeros so padded labels can be typed back', () => {
    // The lists render "003", "007" — typing what you see has to work.
    expect(nums(' 003 - 007 ')).toEqual([3, 4, 5, 6, 7]);
    expect(nums('1 - 2, 5')).toEqual([1, 2, 5]);
  });

  it('treats a trailing comma as mid-typing, not an error', () => {
    const r = parseRowRange('1-4,');
    expect(r.ok).toBe(true);
    expect(r.numbers).toEqual([1, 2, 3, 4]);
  });

  it('reports a leading + as additive without keeping it in the numbers', () => {
    const r = parseRowRange('+7,9');
    expect(r.additive).toBe(true);
    expect(r.numbers).toEqual([7, 9]);
    expect(parseRowRange('7,9').additive).toBe(false);
  });

  it('is empty and ok for empty input', () => {
    expect(parseRowRange('')).toEqual({ numbers: [], ok: true, error: '', additive: false });
  });

  it('rejects row 0 — rows are 1-based on screen', () => {
    expect(parseRowRange('0').error).toBe('ROWS START AT 1');
    expect(parseRowRange('1-0').error).toBe('ROWS START AT 1');
  });

  it('rejects malformed tokens and names the offender', () => {
    expect(parseRowRange('4-').error).toBe('BAD RANGE "4-"');
    expect(parseRowRange('-4').error).toBe('BAD RANGE "-4"');
    expect(parseRowRange('1--4').error).toBe('BAD RANGE "1--4"');
    expect(parseRowRange('1-2-3').error).toBe('BAD RANGE "1-2-3"');
    expect(parseRowRange('a').error).toBe('BAD RANGE "a"');
    expect(parseRowRange('1,,,2').ok).toBe(true); // empty tokens are still fine
  });

  it('caps absurd ranges instead of building a huge array', () => {
    expect(parseRowRange('1-99999999').error).toBe('RANGE TOO LARGE');
    // Accumulated across tokens, not just within one.
    expect(parseRowRange('1-9000,20000-29000').error).toBe('RANGE TOO LARGE');
  });

  it('returns no numbers whenever it reports an error', () => {
    for (const bad of ['0', '4-', 'a', '1-99999999']) {
      const r = parseRowRange(bad);
      expect(r.ok).toBe(false);
      expect(r.numbers).toEqual([]);
    }
  });
});
