/**
 * motion/index.ts
 *
 * The public animation API for Ledger.
 *
 * All components and pages should import animation utilities
 * from this barrel rather than directly from `motion/react`,
 * so that the animation language stays consistent.
 */

export {
  motion,
  AnimatePresence,
  LayoutGroup,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useAnimate,
} from 'motion/react';
export type { Variants, Transition, MotionProps } from 'motion/react';

// Re-exports
export * from './variants';
export * from './hooks';

// Re-export the components folder
export * from './components';
