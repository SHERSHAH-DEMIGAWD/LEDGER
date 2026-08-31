/**
 * components/DealStateViews.tsx
 *
 * Reusable loading, empty, and error state components for deal pages.
 *
 * These are deliberately calm — they use the same design tokens and
 * motion language as the rest of Ledger, never spinners or perpetual
 * motion. Loading is shown as restrained skeletons, error as a single
 * clear message with a retry action.
 */

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { Skeleton, Card } from '../motion/components';
import { Button } from './ui';

// ---------------------------------------------------------------------------
// DealListSkeleton — loading state for the deals list
// ---------------------------------------------------------------------------

export function DealListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} style={{ padding: 'var(--space-5)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 'var(--space-3)',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <Skeleton width="55%" height={16} />
              <Skeleton width="75%" height={12} />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 'var(--space-2)',
              }}
            >
              <Skeleton width={92} height={20} borderRadius="var(--radius-sm)" />
              <Skeleton width={84} height={14} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DealDetailSkeleton — loading state for the deal detail page
// ---------------------------------------------------------------------------

export function DealDetailSkeleton() {
  return (
    <div
      style={{
        maxWidth: 'var(--layout-max-width)',
        margin: '0 auto',
        padding: 'var(--space-7) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton width={120} height={14} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Skeleton width="60%" height={28} />
        <Skeleton width="40%" height={16} />
      </div>
      <Card>
        <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Skeleton width="30%" height={18} />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width={80} height={20} />
            ))}
          </div>
          <Skeleton width="100%" height={48} />
        </div>
      </Card>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 'var(--space-5)',
        }}
        className="ledger-deal-detail-grid"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card>
            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Skeleton width="20%" height={18} />
              <Skeleton width="100%" height={14} />
              <Skeleton width="92%" height={14} />
              <Skeleton width="80%" height={14} />
            </div>
          </Card>
          <Card>
            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Skeleton width="25%" height={18} />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={24} />
              ))}
            </div>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card>
            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Skeleton width="35%" height={18} />
              <Skeleton width="100%" height={36} />
              <Skeleton width="100%" height={36} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.out }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) var(--space-5)',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface-1)',
      }}
      role="status"
    >
      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</span>
      {description && (
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-tertiary)',
            maxWidth: 360,
          }}
        >
          {description}
        </span>
      )}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.out }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) var(--space-5)',
        border: '1px solid var(--color-status-disputed)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-status-disputed-bg)',
      }}
      role="alert"
    >
      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</span>
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: 360,
        }}
      >
        {message}
      </span>
      {onRetry && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </motion.div>
  );
}
