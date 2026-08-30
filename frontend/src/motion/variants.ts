/**
 * motion/variants.ts
 *
 * Animation language for Ledger.
 *
 * Timing & easing is deliberately restrained and purposeful.
 * Think "high-quality financial SaaS" — not "animated landing page."
 *
 * Three tiers:
 *   fast    — micro-interactions (button hover, toggle)
 *   normal  — UI transitions (card enter, modal)
 *   slow    — deliberate spatial transitions (page enter, layout shift)
 */

import type { Variants, Transition } from 'motion/react';

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export const duration = {
  fast: 0.12,
  normal: 0.24,
  slow: 0.40,
} as const;

// ---------------------------------------------------------------------------
// Easing — named curves that match Ledger's calm, precise feel
// ---------------------------------------------------------------------------

export const easing = {
  /** Subtle ease-out for exits */
  out: [0.16, 1, 0.3, 1],

  /** Gentle ease-in-out for entering */
  inOut: [0.65, 0, 0.35, 1],

  /** Immediate snap for feedback interactions */
  snap: [0.2, 0, 0, 1],

  /** Linear (rarely used — reserved for opacity-only fades) */
  linear: [0, 0, 1, 1],
};

// ---------------------------------------------------------------------------
// Transition helper — uses named timing + easing curves
// ---------------------------------------------------------------------------

export function transition(
  tier: keyof typeof duration = 'normal',
  opts: { delay?: number; scale?: boolean } = {}
): Transition {
  return {
    duration: duration[tier],
    ease: opts.scale ? easing.snap : easing.out,
    delay: opts.delay,
  };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * Fade + slight upward translate.
 * Appropriate for entering page sections and card grids.
 */
export const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transition('normal'),
  },
  exit: {
    opacity: 0,
    transition: transition('fast'),
  },
};

/**
 * Pure opacity fade.
 * Appropriate for tooltips, overlays, or elements where
 * spatial continuity is not important.
 */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transition('normal'),
  },
  exit: {
    opacity: 0,
    transition: transition('fast'),
  },
};

/**
 * Scale from a slightly smaller size + fade.
 * Good for modal/dialog entrance.
 */
export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transition('normal'),
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: transition('fast'),
  },
};

/**
 * Slide in from the right — suitable for drawers.
 */
export const slideRight: Variants = {
  hidden: {
    opacity: 0,
    x: '100%',
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transition('normal'),
  },
  exit: {
    opacity: 0,
    x: '100%',
    transition: transition('normal'),
  },
};

/**
 * Slide in from the left — suitable for sidebars.
 */
export const slideLeft: Variants = {
  hidden: {
    opacity: 0,
    x: '-100%',
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transition('normal'),
  },
  exit: {
    opacity: 0,
    x: '-100%',
    transition: transition('normal'),
  },
};

/**
 * Staggered children enter.
 * Pass `delayChildren` to offset each child.
 * Child variant must have the same `hidden` / `visible` shape as parent.
 */
export function stagger(delay: number = 0.06): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: duration.normal,
        ease: easing.inOut,
        delayChildren: 0,
        staggerChildren: delay,
      },
    },
  };
}

/**
 * Layout-related opacity + subtle vertical reveal.
 * Used for accordions and expandable sections.
 */
export const expand: Variants = {
  hidden: {
    opacity: 0,
    height: 0,
  },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: {
      duration: duration.normal,
      ease: easing.inOut,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      duration: duration.normal,
      ease: easing.inOut,
    },
  },
};

// ---------------------------------------------------------------------------
// Reduced-motion overrides
// ---------------------------------------------------------------------------

/**
 * These variants are instant when prefers-reduced-motion is enabled.
 * Replace any Variants in components with these when reduced motion is active.
 */
export const instant: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0, ease: 'linear' },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0, ease: 'linear' },
  },
};

export const instantFadeUp: Variants = {
  hidden: { opacity: 0, y: 0 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 },
  },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export const instantScaleIn: Variants = {
  hidden: { opacity: 0, scale: 1 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export const instantExpand: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0 } },
  exit: { opacity: 0, height: 0, transition: { duration: 0 } },
};

export const instantSlide: Variants = {
  hidden: { opacity: 0, x: 0 },
  visible: { opacity: 1, x: 0, transition: { duration: 0 } },
  exit: { opacity: 0, x: 0, transition: { duration: 0 } },
};

export const instantFadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};
