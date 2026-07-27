'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ActiveTrackProvider } from '../lib/activeTrack';
import { MotionTierSync } from '../lib/motion/useMotionTier';
import { BootSequence } from '../components/chrome/BootSequence';
import { useVariants } from '../components/motion/variants';

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const signalLoss = useVariants('signalLoss');

  return (
    <MotionConfig reducedMotion="user">
      <ActiveTrackProvider>
        <MotionTierSync />
        <BootSequence>
          {/* `initial={false}` used to be here, and it was the single reason the
              app looked static. AnimatePresence hands that flag to every
              descendant through PresenceContext — not just its own children — so
              it silently cancelled the first-mount animation of the entire tree
              below it: the route power-on, the channel roll, and every track row.
              Nothing on the page animated on arrival, and the only motion left was
              the player's looping loader.

              Letting it run means the screen powers on the way a CRT does. */}
          <AnimatePresence mode="wait">
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
