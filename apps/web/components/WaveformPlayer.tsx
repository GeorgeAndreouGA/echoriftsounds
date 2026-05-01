'use client';

import dynamic from 'next/dynamic';

const WaveformPlayerInner = dynamic(
  () => import('./WaveformPlayerInner').then((m) => m.WaveformPlayerInner),
  {
    ssr: false,
    loading: () => (
      <div className="crt-player-frame">
        <div className="crt-player-header">
          <span>LOADING</span>
          <span aria-hidden="true" style={{ animation: 'blink 0.8s step-start infinite' }}>▮</span>
        </div>
        <div style={{ padding: '1rem', color: '#8a5f00', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}>
          &gt; INITIALIZING PLAYER...
        </div>
      </div>
    ),
  },
);

export function WaveformPlayer({ file }: { file: string }) {
  return <WaveformPlayerInner file={file} />;
}
