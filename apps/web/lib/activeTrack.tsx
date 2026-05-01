'use client';

import { createContext, useContext, useState } from 'react';

// One-shot signal between two WaveformPlayerInner instances during a LOOP ALL
// auto-advance: the finishing player sets it before triggering the track
// change, the next player consumes it on 'ready' and clears it. Module-level
// because the unmount/remount discards component-local state.
export const autoPlayOnNext = { pending: false };

interface ActiveTrackCtx {
  activeFile: string | null;
  filteredFiles: string[];
  setActiveFile: (file: string | null) => void;
  setFilteredFiles: (files: string[]) => void;
}

const ActiveTrackContext = createContext<ActiveTrackCtx>({
  activeFile: null,
  filteredFiles: [],
  setActiveFile: () => {},
  setFilteredFiles: () => {},
});

export function ActiveTrackProvider({ children }: { children: React.ReactNode }) {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<string[]>([]);

  return (
    <ActiveTrackContext.Provider value={{ activeFile, filteredFiles, setActiveFile, setFilteredFiles }}>
      {children}
    </ActiveTrackContext.Provider>
  );
}

export function useActiveTrack() {
  return useContext(ActiveTrackContext);
}
