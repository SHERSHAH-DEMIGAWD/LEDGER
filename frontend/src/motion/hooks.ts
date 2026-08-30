/**
 * motion/hooks.ts
 *
 * Hooks that wrap Motion primitives with Ledger's
 * animation philosophy (reduced-motion aware, accessible).
 */

import { useReducedMotion as useMrm } from 'motion/react';

// ---------------------------------------------------------------------------
// useReducedMotion
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the user prefers reduced motion.
 * Use this to conditionally apply instant vs. animated variants.
 *
 * Example:
 * ```
 * const reduced = useReducedMotion();
 * const variants = reduced ? instantFadeUp : fadeUp;
 * ```
 */
export function useReducedMotion(): boolean {
  return useMrm() ?? false;
}

// ---------------------------------------------------------------------------
// useInViewAnimation
// ---------------------------------------------------------------------------

/**
 * Returns a `whileInView` value that is `{ opacity: 1 }` when reduced motion
 * is enabled (skipping the animation entirely).
 *
 * Designed for use in `whileInView` props:
 * ```
 * <motion.div whileInView={useInViewAnimation(fadeUp)} viewport={{ once: true }}>
 * ```
 *
 * Or destructured:
 * ```
 * const { initial, animate } = useInViewAnimation(fadeUp);
 * <motion.div initial={initial} animate={animate} whileInView={animate} ...>
 * ```
 */
export function useInViewAnimation(
  animatedVariants: {
    hidden: Record<string, unknown>;
    visible: Record<string, unknown>;
  },
  opts: { once?: boolean } = {}
) {
  const reduced = useReducedMotion();

  return {
    whileInView: reduced
      ? { opacity: 1, y: 0 }
      : animatedVariants.visible,
    viewport: {
      once: opts.once ?? true,
      margin: '-40px',
    },
  };
}

// ---------------------------------------------------------------------------
// useStaggerAnimation
// ---------------------------------------------------------------------------

/**
 * Returns children variants with staggered delay applied.
 * Accepts a `stagger` function from `variants.ts`.
 *
 * Each child in the stagger container will animate in sequence
 * with the given delay between items.
 *
 * Example:
 * ```
 * const childVariants = useStaggerAnimation(stagger(0.07));
 * <motion.ul variants={childVariants} ...>
 *   {items.map(item => <motion.li key={item.id} variants={childVariants}>...)}
 * ```
 */
export function useStaggerAnimation(
  staggerVariants: {
    hidden: Record<string, unknown>;
    visible: Record<string, unknown>;
  },
  delay: number = 0.06
) {
  const reduced = useReducedMotion();

  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { duration: 0, staggerChildren: 0 },
      },
    };
  }

  return {
    ...staggerVariants,
    visible: {
      ...staggerVariants.visible,
      transition: {
        ...(staggerVariants.visible as { transition?: object }).transition,
        staggerChildren: delay,
      } as object,
    },
  };
}

// ---------------------------------------------------------------------------
// useFocusRing
// ---------------------------------------------------------------------------

/**
 * Returns motion props for a focus-visible ring that fades in.
 * Usage:
 * ```
 * const focusProps = useFocusRing();
 * <motion.div {...focusProps} />
 * ```
 */
export function useFocusRing() {
  const reduced = useReducedMotion();

  return {
    initial: { opacity: 0, scale: 0.92 },
    whileFocus: { opacity: 1, scale: 1 },
    transition: { duration: reduced ? 0 : 0.12, ease: 'easeOut' },
  };
}

// ---------------------------------------------------------------------------
// useHoverPress
// ---------------------------------------------------------------------------

/**
 * Returns whileHover / whileTap props for a button-like element.
 * Subtle scale on hover and press — not excessive.
 *
 * Usage:
 * ```
 * const hoverPress = useHoverPress();
 * <motion.button {...hoverPress} style={{ cursor: 'pointer' }}>
 * ```
 */
export function useHoverPress(
  opts: {
    hoverScale?: number;
    tapScale?: number;
    disabled?: boolean;
  } = {}
) {
  const { hoverScale = 1.02, tapScale = 0.98, disabled = false } = opts;

  if (disabled) {
    return {};
  }

  return {
    whileHover: { scale: hoverScale },
    whileTap: { scale: tapScale },
    transition: { duration: 0.12, ease: [0.2, 0, 0, 1] },
  };
}

// ---------------------------------------------------------------------------
// usePressFeedback
// ---------------------------------------------------------------------------

/**
 * A simpler press-only feedback for dense UI elements (chips, tags).
 * No hover, just tap scale.
 */
export function usePressFeedback() {
  return {
    whileTap: { scale: 0.96 },
    transition: { duration: 0.08, ease: [0.2, 0, 0, 1] },
  };
}

// ---------------------------------------------------------------------------
// useLayoutAnimation
// ---------------------------------------------------------------------------

/**
 * Wrapper hook for Motion's `layout` prop on layout animations.
 * Ensures layout animations respect reduced-motion preferences.
 *
 * Usage:
 * ```
 * const layoutProps = useLayoutAnimation();
 * <motion.div layout {...layoutProps}>
 * ```
 */
export function useLayoutAnimation() {
  const reduced = useReducedMotion();

  return {
    layout: true,
    transition: reduced
      ? { duration: 0 }
      : { type: 'spring', stiffness: 400, damping: 35 },
  };
}

// ---------------------------------------------------------------------------
// usePageTransition
// ---------------------------------------------------------------------------

/**
 * Returns initial/animated/animate props for a page-level entrance.
 * The initial state always places the page slightly below its final position.
 */
export function usePageTransition() {
  const reduced = useReducedMotion();

  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };
}
