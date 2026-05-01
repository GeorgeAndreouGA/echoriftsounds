'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ActiveTrackProvider } from '../lib/activeTrack';
import { BootSequence } from '../components/chrome/BootSequence';
import { signalLoss } from '../components/motion/glitch';

function SaveDataGuard() {
  useEffect(() => {
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) {
      document.documentElement.classList.add('save-data');
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <ActiveTrackProvider>
        <SaveDataGuard />
        <BootSequence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              variants={signalLoss}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ minHeight: '100vh' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </BootSequence>
      </ActiveTrackProvider>
    </MotionConfig>
  );
}
