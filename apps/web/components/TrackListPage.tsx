'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchBox } from './SearchBox';
import { TrackCard } from './TrackCard';
import { Hero } from './hero/Hero';
import { useActiveTrack } from '../lib/activeTrack';
import { staggerContainer } from './motion/glitch';

interface Props {
  tracks: string[];
  siteName: string;
  youtubeUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  year: number;
}

export function TrackListPage({ tracks, siteName, youtubeUrl, instagramUrl, facebookUrl, year }: Props) {
  const [query, setQuery] = useState('');
  const { setFilteredFiles } = useActiveTrack();
  const filtered = tracks.filter((f) => f.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    setFilteredFiles(filtered);
  }, [filtered.join(',')]);

  return (
    <main id="main-content" className="crt-container">
      <Hero trackCount={tracks.length} />

      <SearchBox onSearch={setQuery} placeholder="SEARCH TRACKS..." />

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
            fontFamily: "'JetBrains Mono', monospace",
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

        <AnimatePresence initial={false}>
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#8a5f00',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
              }}
              role="status"
            >
              &gt; NO TRACKS FOUND.
            </motion.div>
          ) : (
            <motion.div
              key="list"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              role="list"
            >
              {filtered.map((file, i) => (
                <div key={file} role="listitem">
                  <TrackCard file={file} index={i + 1} />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer
        style={{
          marginTop: '2rem',
          textAlign: 'center',
          fontFamily: "'JetBrains Mono', monospace",
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
