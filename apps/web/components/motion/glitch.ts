import type { Variants } from 'framer-motion';

export const typeScan: Variants = {
  hidden: {
    opacity: 0,
    clipPath: 'inset(0 100% 0 0)',
  },
  visible: {
    opacity: 1,
    clipPath: 'inset(0 0% 0 0)',
    transition: { duration: 0.28, ease: 'linear' },
  },
  exit: {
    opacity: 0,
    scaleY: 0,
    filter: 'saturate(4) hue-rotate(60deg) brightness(2)',
    transition: { duration: 0.12, ease: 'easeIn' },
  },
};

export const glitch: Variants = {
  hidden: { opacity: 0, skewX: -3, filter: 'blur(1px)' },
  visible: {
    opacity: 1,
    skewX: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.18 },
  },
  exit: {
    opacity: 0,
    scaleY: 0,
    skewX: 4,
    filter: 'saturate(5) hue-rotate(90deg)',
    transition: { duration: 0.1 },
  },
};

export const scanWipe: Variants = {
  hidden: { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
  visible: {
    clipPath: 'inset(0 0 0% 0)',
    opacity: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    clipPath: 'inset(100% 0 0 0)',
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export const signalLoss: Variants = {
  hidden: {
    opacity: 0,
    scaleY: 0.04,
    filter: 'brightness(4) contrast(8) saturate(0)',
  },
  visible: {
    opacity: 1,
    scaleY: 1,
    filter: 'brightness(1) contrast(1) saturate(1)',
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scaleY: 0.04,
    filter: 'brightness(4) contrast(8) saturate(0)',
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

export const fadeSlide: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};
