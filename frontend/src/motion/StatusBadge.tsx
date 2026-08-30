/**
 * motion/StatusBadge.tsx
 *
 * Visual primitives for Ledger's transaction states.
 *
 * The component is purely PRESENTATIONAL. It receives status as a string
 * prop and maps it to the appropriate visual treatment.
 *
 * The frontend must NEVER decide, own, or infer these states.
 * All status values come from the authoritative application/backend state.
 */

import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';
import { useReducedMotion } from './hooks';

// ---------------------------------------------------------------------------
// Status definitions
// ---------------------------------------------------------------------------

export type Status =
  | 'pending'
  | 'accepted'
  | 'funded'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'disputed'
  | 'resolved'
  | 'completed';

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  /** Whether this status warrants a subtle pulsing dot */
  active?: boolean;
}

const STATUS_MAP: Record<Status, StatusConfig> = {
  pending: {
    label: 'Pending',
    color: 'var(--color-status-pending)',
    bg: 'var(--color-status-pending-bg)',
    active: true,
  },
  accepted: {
    label: 'Accepted',
    color: 'var(--color-status-accepted)',
    bg: 'var(--color-status-accepted-bg)',
  },
  funded: {
    label: 'Funded',
    color: 'var(--color-status-funded)',
    bg: 'var(--color-status-funded-bg)',
  },
  in_progress: {
    label: 'In Progress',
    color: 'var(--color-status-in-progress)',
    bg: 'var(--color-status-in-progress-bg)',
    active: true,
  },
  submitted: {
    label: 'Submitted',
    color: 'var(--color-status-submitted)',
    bg: 'var(--color-status-submitted-bg)',
    active: true,
  },
  approved: {
    label: 'Approved',
    color: 'var(--color-status-approved)',
    bg: 'var(--color-status-approved-bg)',
  },
  disputed: {
    label: 'Disputed',
    color: 'var(--color-status-disputed)',
    bg: 'var(--color-status-disputed-bg)',
    active: true,
  },
  resolved: {
    label: 'Resolved',
    color: 'var(--color-status-resolved)',
    bg: 'var(--color-status-resolved-bg)',
  },
  completed: {
    label: 'Completed',
    color: 'var(--color-status-completed)',
    bg: 'var(--color-status-completed-bg)',
  },
};

const UNKNOWN_STATUS: StatusConfig = {
  label: 'Unknown',
  color: 'var(--color-text-muted)',
  bg: 'rgba(79, 79, 99, 0.10)',
};

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export interface StatusBadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  status: Status;
  /**
   * Controls the size variant.
   * - sm: compact (e.g., inline with text)
   * - md: standard (e.g., in table rows or card headers)
   * - lg: prominent (e.g., in deal detail headers)
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the animated status dot.
   * Defaults to `true` for active statuses, `false` for others.
   * Pass `false` explicitly to hide the dot on any variant.
   */
  showDot?: boolean;
  children?: string;
}

/**
 * A reusable status badge.
 *
 * Usage:
 * ```tsx
 * <StatusBadge status="pending" />
 * <StatusBadge status="completed" size="lg" />
 * <StatusBadge status="disputed" showDot={false} />
 * ```
 *
 * The `children` prop overrides the auto-generated label.
 * This is intentional — it lets parent components pass localized labels
 * if the backend provides them in a different format.
 */
export function StatusBadge({
  status,
  size = 'md',
  showDot,
  children,
  style,
  ...rest
}: StatusBadgeProps) {
  const reduced = useReducedMotion();
  const config = STATUS_MAP[status as Status] ?? UNKNOWN_STATUS;
  const label = children ?? config.label;

  // showDot defaults: true for active statuses
  const dotVisible = showDot ?? config.active ?? false;

  const sizeStyles = {
    sm: { padding: '2px 6px', fontSize: 'var(--text-xs)', gap: 4 },
    md: { padding: '4px 8px', fontSize: 'var(--text-sm)', gap: 5 },
    lg: { padding: '6px 12px', fontSize: 'var(--text-base)', gap: 6 },
  } as const;

  const dotSizes = { sm: 5, md: 6, lg: 7 };

  return (
    <motion.span
      role="status"
      aria-label={`Status: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        ...sizeStyles[size],
        background: config.bg,
        color: config.color,
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
          // Subtle pulse for active states — restrained, not distracting
          animate={
            !reduced && dotVisible ? { opacity: [1, 0.5, 1] } : { opacity: 1 }
          }
          transition={
            !reduced && dotVisible
              ? { duration: 2.4, repeat: Infinity, ease: 'linear' }
              : {}
          }
          style={{
            width: dotSizes[size],
            height: dotSizes[size],
            borderRadius: '50%',
            background: config.color,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// StatusGroup — horizontal list of status badges
// ---------------------------------------------------------------------------

export interface StatusGroupProps {
  statuses: Status[];
  size?: StatusBadgeProps['size'];
  showDot?: boolean;
  className?: string;
}

export function StatusGroup({
  statuses,
  size = 'sm',
  showDot,
  className,
}: StatusGroupProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
    >
      {statuses.map((s) => (
        <StatusBadge key={s} status={s} size={size} showDot={showDot} />
      ))}
    </div>
  );
}
