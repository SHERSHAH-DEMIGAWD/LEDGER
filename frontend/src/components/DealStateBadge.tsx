/**
 * components/DealStateBadge.tsx
 *
 * A visual badge for Deal states defined in PRODUCT_RULES.md and ARCHITECTURE.md.
 *
 * Purely presentational — receives a DealStatus string and renders the
 * appropriate label and color from the state registry.
 *
 * The frontend NEVER decides, owns, or infers state transitions.
 * All status values come from the authoritative application/backend state.
 */

import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { getDealStateConfig, type DealStatus } from '../types/dealStates';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DealStateBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  /** The deal status — must match a value from the documented state enum */
  status: DealStatus;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the animated status dot.
   * Active statuses (in-progress, pending, disputed) show a subtle pulse.
   */
  showDot?: boolean;
  /** Override the auto-generated label (e.g., for localization) */
  children?: string;
}

// ---------------------------------------------------------------------------
// Status dot pulse animation (mirrors existing StatusBadge behavior)
// ---------------------------------------------------------------------------

const SIZE_STYLES = {
  sm: { padding: '2px 6px', fontSize: 'var(--text-xs)', gap: 4 },
  md: { padding: '4px 8px', fontSize: 'var(--text-sm)', gap: 5 },
  lg: { padding: '6px 12px', fontSize: 'var(--text-base)', gap: 6 },
} as const;

const DOT_SIZES = { sm: 5, md: 6, lg: 7 };

// States that are considered "active" for the pulsing dot indicator
const ACTIVE_STATES: DealStatus[] = [
  'IN_PROGRESS',
  'PENDING_ACCEPTANCE',
  'DISPUTED',
  'REVISION_REQUESTED',
];

// ---------------------------------------------------------------------------
// DealStateBadge
// ---------------------------------------------------------------------------

export function DealStateBadge({
  status,
  size = 'md',
  showDot,
  children,
  style,
  ...rest
}: DealStateBadgeProps) {
  const reduced = useReducedMotion();
  const config = getDealStateConfig(status);
  const label = children ?? config.label;

  // showDot defaults: true for active states
  const dotVisible = showDot ?? ACTIVE_STATES.includes(status);

  return (
    <motion.span
      role="status"
      aria-label={`Status: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        ...SIZE_STYLES[size],
        background: `var(${config.bgVar})`,
        color: `var(${config.colorVar})`,
        borderRadius: 'var(--radius-sm)',
        fontWeight: 500,
        letterSpacing: '0.01em',
        userSelect: 'none',
        ...(style as object),
      }}
      {...rest}
    >
      {dotVisible && (
        <motion.span
          key={`dot-${status}`}
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={
            !reduced && dotVisible ? { opacity: [1, 0.5, 1] } : { opacity: 1 }
          }
          transition={
            !reduced && dotVisible
              ? { duration: 2.4, repeat: Infinity, ease: 'linear' }
              : {}
          }
          style={{
            width: DOT_SIZES[size],
            height: DOT_SIZES[size],
            borderRadius: '50%',
            background: `var(${config.colorVar})`,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// DealStateGroup — horizontal list of state badges
// ---------------------------------------------------------------------------

export interface DealStateGroupProps {
  statuses: DealStatus[];
  size?: DealStateBadgeProps['size'];
  showDot?: boolean;
  className?: string;
}

export function DealStateGroup({
  statuses,
  size = 'sm',
  showDot,
  className,
}: DealStateGroupProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
    >
      {statuses.map((s) => (
        <DealStateBadge key={s} status={s} size={size} showDot={showDot} />
      ))}
    </div>
  );
}