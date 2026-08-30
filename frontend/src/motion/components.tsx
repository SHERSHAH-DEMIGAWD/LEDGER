/**
 * motion/components.tsx
 *
 * Reusable animation primitives for Ledger.
 *
 * These are deliberately minimal and composable. Pages and feature
 * components should be built on top of these rather than reaching
 * for the underlying `motion` library directly.
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  type HTMLMotionProps,
  type Variants,
} from 'motion/react';
import { forwardRef, useEffect, type ReactNode, type ElementType } from 'react';
import {
  fadeUp,
  instantFadeUp,
  duration,
  easing,
} from './variants';
import { useReducedMotion, usePageTransition, useHoverPress } from './hooks';

// ---------------------------------------------------------------------------
// Page — wraps page content in a page-level enter/exit
// ---------------------------------------------------------------------------

export interface PageProps {
  children: ReactNode;
  className?: string;
}

/**
 * The outer wrapper for every page. Use inside `AnimatePresence` in
 * your router for page-to-page transitions.
 */
export function Page({ children, className }: PageProps) {
  const reduced = useReducedMotion();
  const pt = usePageTransition();

  return (
    <motion.div
      className={className}
      initial={pt.initial}
      animate={pt.animate}
      exit={pt.exit}
      transition={{
        duration: reduced ? 0 : duration.slow,
        ease: easing.inOut,
      }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// FadeUp — small block enter
// ---------------------------------------------------------------------------

export interface FadeUpProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  delay?: number;
  y?: number;
}

/**
 * A small block that fades in with a subtle upward translate.
 *
 * Use for sections inside a page, not for large page-level content.
 */
export function FadeUp({
  children,
  delay = 0,
  y = 12,
  ...rest
}: FadeUpProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : duration.normal,
        ease: easing.out,
        delay,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Fade — pure opacity transition
// ---------------------------------------------------------------------------

export function Fade({
  children,
  delay = 0,
  ...rest
}: { children: ReactNode; delay?: number } & HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduced ? 0 : duration.normal,
        ease: 'linear',
        delay,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Stack — staggered list/grid container
// ---------------------------------------------------------------------------

export interface StackProps {
  children: ReactNode;
  staggerDelay?: number;
  initialDelay?: number;
  className?: string;
  as?: ElementType;
  style?: React.CSSProperties;
}

/**
 * Container that staggers the entrance of its `motion` children.
 * Each child must have `variants={childVariants}` and `initial="hidden"`/`animate="visible"`.
 */
export function Stack({
  children,
  staggerDelay = 0.06,
  initialDelay = 0,
  className,
  as = 'div',
  style,
}: StackProps) {
  const reduced = useReducedMotion();

  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: reduced ? 0 : staggerDelay,
            delayChildren: initialDelay,
            duration: reduced ? 0 : duration.normal,
          },
        },
      }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Pair with `Stack` for any list/grid item.
 */
export function StackItem({
  children,
  variants,
  className,
  as = 'div',
  ...rest
}: {
  children: ReactNode;
  variants?: Variants;
  className?: string;
  as?: ElementType;
} & HTMLMotionProps<'div'>) {
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;
  const reduced = useReducedMotion();

  return (
    <MotionTag
      className={className}
      variants={
        variants ??
        (reduced ? instantFadeUp : fadeUp)
      }
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// ---------------------------------------------------------------------------
// Card — interactive card primitive
// ---------------------------------------------------------------------------

export interface CardProps extends HTMLMotionProps<'div'> {
  interactive?: boolean;
  active?: boolean;
}

/**
 * The base card primitive. Optional `interactive` adds hover/press feedback.
 * `active` adds a subtle highlight.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, interactive = false, active = false, className, ...rest },
  ref
) {
  const reduced = useReducedMotion();
  const press = useHoverPress({ disabled: !interactive || reduced });

  return (
    <motion.div
      ref={ref}
      className={className}
      whileHover={
        interactive && !reduced
          ? { y: -1, transition: { duration: duration.fast, ease: easing.out } }
          : undefined
      }
      whileTap={press.whileTap}
      transition={press.transition}
      style={{
        border: '1px solid var(--color-border)',
        background: active ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
        borderRadius: 'var(--radius-lg)',
        ...(rest.style ?? {}),
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// Expand — content section that grows in
// ---------------------------------------------------------------------------

export interface ExpandProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  isOpen: boolean;
  children: ReactNode;
}

/**
 * Use to expand/collapse a section of content.
 * The motion is layout-aware and respects reduced-motion.
 */
export function Expand({ isOpen, children, ...rest }: ExpandProps) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="content"
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{
            duration: reduced ? 0 : duration.normal,
            ease: easing.inOut,
          }}
          style={{ overflow: 'hidden' }}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Reveal — content revealed when scrolled into view
// ---------------------------------------------------------------------------

export interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}

/**
 * Subtle opacity + translate reveal when scrolled into view.
 * `once` defaults to true so content does not re-animate on every scroll.
 */
export function Reveal({
  children,
  delay = 0,
  y = 12,
  className,
  once = true,
}: RevealProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once, margin: '-40px' }}
      transition={{
        duration: reduced ? 0 : duration.normal,
        ease: easing.out,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Modal / Drawer / Overlay
// ---------------------------------------------------------------------------

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Optional accessible label for the modal.
   * Strongly recommended — without one, the modal has no accessible name.
   */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
}

/**
 * A modal/dialog with restrained enter/exit.
 * Renders into a portal-style `fixed` overlay, but the parent should
 * still wrap the call in `<AnimatePresence>` to handle exit.
 */
export function Modal({
  isOpen,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  className,
}: ModalProps) {
  const reduced = useReducedMotion();

  // Close on Escape — properly cleaned up via useEffect
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey, { passive: true });
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduced ? 0 : duration.fast,
            ease: 'linear',
          }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
        >
          <motion.div
            key="content"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{
              duration: reduced ? 0 : duration.normal,
              ease: easing.out,
            }}
            onClick={(e) => e.stopPropagation()}
            className={className}
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-3)',
              maxWidth: 560,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  side?: 'right' | 'left';
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/**
 * A side drawer that slides in from the left or right.
 * Wrap in `<AnimatePresence>` at the call site.
 */
export function Drawer({
  isOpen,
  onClose,
  side = 'right',
  children,
  ariaLabel,
  className,
}: DrawerProps) {
  const reduced = useReducedMotion();
  const isRight = side === 'right';

  // Close on Escape — properly cleaned up via useEffect
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey, { passive: true });
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduced ? 0 : duration.fast,
            ease: 'linear',
          }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 50,
          }}
        >
          <motion.div
            key="content"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: isRight ? '100%' : '-100%' }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: isRight ? '100%' : '-100%' }}
            transition={{
              duration: reduced ? 0 : duration.normal,
              ease: easing.inOut,
            }}
            onClick={(e) => e.stopPropagation()}
            className={className}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              [side]: 0,
              width: 'min(420px, 100%)',
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — loading placeholders
// ---------------------------------------------------------------------------

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  className?: string;
}

/**
 * A subtle, non-perpetual skeleton block.
 * Per Ledger's animation philosophy, skeletons pulse once on enter
 * (so we never create distracting perpetual motion) and then settle
 * into a calm static state with a low-contrast hue.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 'var(--radius-sm)',
  className,
}: SkeletonProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : duration.normal }}
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--color-surface-3)',
      }}
    />
  );
}
