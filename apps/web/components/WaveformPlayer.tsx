'use client';

import dynamic from 'next/dynamic';
import { Caret } from './icons/CrtIcons';

const WaveformPlayerInner = dynamic(
  () => import('./WaveformPlayerInner').then((m) => m.WaveformPlayerInner),
  {
    ssr: false,
    loading: () => (
      <div className="crt-player-frame">
        <div className="crt-player-header">
          <span>LOADING</span>
          <Caret speed={0.8} />
        </div>
        <div style={{ padding: '1rem', color: '#8a5f00', fontSize: '12px', fontFamily: "var(--font-jetbrains-mono), monospace" }}>
          &gt; INITIALIZING PLAYER...
        </div>
      </div>
    ),
  },
);

export function WaveformPlayer({
  file,
  youtubeUrl,
}: {
  file: string;
  youtubeUrl: string | null;
}) {
  return <WaveformPlayerInner file={file} youtubeUrl={youtubeUrl} />;
}
