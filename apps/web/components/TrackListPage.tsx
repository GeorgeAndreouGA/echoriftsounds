'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category, PublishedTrack } from '@echorift/shared';
import * as api from '../lib/api';
import { SearchBox } from './SearchBox';
import { TrackCard } from './TrackCard';
import { CategoryTabs, ALL_CATEGORIES } from './CategoryTabs';
import { Hero } from './hero/Hero';
import { useActiveTrack } from '../lib/activeTrack';
import { useLiveChanges } from '../hooks/useLiveChanges';
import { useStaggeredVariants, useVariants } from './motion/variants';

interface Props {
  tracks: PublishedTrack[];
  categories: Category[];
  siteName: string;
  youtubeUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  year: number;
}

export function TrackListPage({
  tracks: initialTracks,
  categories: initialCategories,
  siteName,
  youtubeUrl,
  instagramUrl,
  facebookUrl,
  year,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const { setFilteredFiles } = useActiveTrack();
  const channelRoll = useVariants('channelRoll');
  const rowScan = useStaggeredVariants('typeScan');

  // Seeded by the server render, then kept current from the live stream so a
  // tab left open picks up new/reordered tracks without a refresh.
  const [tracks, setTracks] = useState(initialTracks);
  const [categories, setCategories] = useState(initialCategories);
  useEffect(() => setTracks(initialTracks), [initialTracks]);
  useEffect(() => setCategories(initialCategories), [initialCategories]);

  const reload = useCallback(async () => {
    const [t, c] = await Promise.all([api.getTracks(), api.getCategories()]);
    setTracks(t);
    setCategories(c);
  }, []);
  useLiveChanges(reload);

  const filtered = useMemo(
    () =>
      tracks.filter(
        (t) =>
          (category === ALL_CATEGORIES || t.category === category) &&
          t.file.toLowerCase().includes(query.toLowerCase()),
      ),
    [tracks, category, query],
  );

  // Counts are of the category as a whole, not of the current search — a tab
  // reading "0" only because of an unrelated search term would be misleading.
  const counts = useMemo(() => {
    const acc: Record<string, number> = { [ALL_CATEGORIES]: tracks.length };
    for (const c of categories) acc[c.id] = 0;
    for (const t of tracks) {
      if (t.category && acc[t.category] !== undefined) acc[t.category] += 1;
    }
    return acc;
  }, [tracks, categories]);

  // Drives next/prev and LOOP ALL in the player, so it has to be the same list
  // the visitor can actually see — otherwise auto-advance jumps to a track
  // that isn't on screen.
  const filteredFiles = useMemo(() => filtered.map((t) => t.file), [filtered]);
  useEffect(() => {
    setFilteredFiles(filteredFiles);
  }, [filteredFiles, setFilteredFiles]);

  return (
    <main id="main-content" className="crt-container">
      <Hero trackCount={tracks.length} />

      <SearchBox onSearch={setQuery} placeholder="SEARCH TRACKS..." />

      <CategoryTabs
        categories={categories}
        active={category}
        onChange={setCategory}
        counts={counts}
      />

      {(youtubeUrl || instagramUrl || facebookUrl) && (
        <div className="crt-social-bar">
          {youtubeUrl && (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="crt-btn"
              aria-label="Visit our YouTube channel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YOUTUBE
            </a>
          )}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="crt-btn"
              aria-label="Visit our Instagram profile"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
              </svg>
              INSTAGRAM
            </a>
          )}
          {facebookUrl && (
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="crt-btn"
              aria-label="Visit our Facebook page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.79 8.43-4.94 8.43-9.94z" />
              </svg>
              FACEBOOK
            </a>
          )}
        </div>
      )}

      {/* Track list */}
      <div
        className="crt-panel"
        style={{ padding: 0 }}
        role="list"
        aria-label="Track list"
      >
        {/* Header row */}
        <div
          aria-hidden
          style={{
            display: 'flex',
            gap: '0.75rem',
            padding: '0.4rem 0.75rem',
            borderBottom: '1px solid #8a5f00',
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '10px',
            color: '#8a5f00',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: '#0a0b06',
          }}
        >
          <span style={{ minWidth: '2.5rem' }}>#</span>
          <span style={{ flex: 1 }}>FILENAME</span>
          <span>STATUS</span>
        </div>

        {/* Two levels of presence, doing two different jobs — don't merge them:
            - OUTER, keyed on category: one channel-roll for the whole field, so
              switching category reads as a single event instead of N rows each
              exiting on their own.
            - INNER, keyed on file: per-row exits while the search query narrows
              the list, where a whole-field roll would be far too much.

            The outer wrapper MUST define its own `exit` (channelRoll does). The
            note that used to be here was earned: staggerContainer defines no
            exit, so wrapping the list in an AnimatePresence left framer waiting
            forever on an exit that never resolved, and rows stuck in the DOM.
            That is why the roll is a separate wrapper around staggerContainer
            rather than staggerContainer itself. */}
        {/* No `initial={false}` on this one either. AnimatePresence propagates it
            through PresenceContext to every descendant, not just direct children —
            so while it was set here, the row cascade below stayed suppressed no
            matter what the inner AnimatePresence said. Letting it run means the
            field also rolls in once on arrival, which is the effect you want on a
            CRT anyway: the channel tuning in. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={category}
            variants={channelRoll}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Plain div: this used to carry `staggerContainer`, but its
                staggerChildren never reached the rows through the AnimatePresence
                below, so it orchestrated nothing. The cascade is an explicit
                per-row delay now — see the transition on each listitem. */}
            <div role="list">
              {/* No `initial={false}` here on purpose. It used to suppress the
                  rows' enter animation on first mount, so the main content of the
                  page — the list itself — appeared instantly and the site read as
                  completely static. Rows now cascade in on load. Later adds
                  (search narrowing, live changes) animate either way; this only
                  changes the first render. */}
              <AnimatePresence>
                {filtered.map((track, i) => (
                  // typeScan lives HERE rather than inside TrackCard: variant
                  // labels do not survive the trip down through this
                  // AnimatePresence into a plain child component, so when the
                  // variants sat on TrackCard's <article> the rows rendered with
                  // no clip-path at all.
                  <motion.div
                    key={track.file}
                    role="listitem"
                    variants={rowScan}
                    // `custom` feeds the row index to the variant, which is where
                    // the stagger delay has to live — see useStaggeredVariants.
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <TrackCard file={track.file} index={i + 1} youtubeUrl={track.youtubeUrl} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#8a5f00',
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: '12px',
            }}
            role="status"
          >
            &gt; NO TRACKS FOUND.
          </motion.div>
        )}
      </div>

      <footer
        style={{
          marginTop: '2rem',
          textAlign: 'center',
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: '10px',
          color: '#8a5f00',
          letterSpacing: '0.08em',
          paddingBottom: '1rem',
        }}
      >
        &copy; {year} {siteName} — ALL RIGHTS RESERVED
      </footer>
    </main>
  );
}
