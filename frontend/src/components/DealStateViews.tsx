/**
 * components/DealStateViews.tsx
 *
 * Reusable loading, empty, and error state components for deal pages.
 *
 * These use the same design tokens and motion language as the rest of Ledger.
 * Loading is shown as restrained ruled-row skeletons (never spinners).
 * Empty / error states use archival language and ruled borders — not rounded
 * cards with drop shadows.
 */

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { Skeleton } from '../motion/components';
import { Button } from './ui';

// ---------------------------------------------------------------------------
// DealListSkeleton — ruled-row loading state
// ---------------------------------------------------------------------------

export function DealListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="record-list"
      role="status"
      aria-label="Loading deal records"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="record-list__head" aria-hidden="true">
        <span>Record / parties</span><span>Agreed value</span><span>State / updated</span>
      </div>
      <ol className="record-list__entries" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <li key={i}>
            <div className="record-row">
              <div className="record-row__identity">
                <Skeleton className="record-row__number" width={20} height={11} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
                </div>
              </div>
              <div className="record-row__value"><Skeleton width="min(80px, 100%)" height={14} /></div>
              <div className="record-row__state">
                <Skeleton width={90} height={20} borderRadius="var(--radius-xs)" />
                <Skeleton width={56} height={11} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DealDetailSkeleton — casebook document loading state
// ---------------------------------------------------------------------------

export function DealDetailSkeleton() {
  return (
    <div
      className="transaction-page"
      role="status"
      aria-label="Loading deal record"
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton width={120} height={14} style={{ marginBottom: 'var(--space-6)' }} />
      {/* Header rule + seal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Skeleton width={28} height={28} borderRadius="50%" />
          <div>
            <Skeleton width={70} height={14} />
            <Skeleton width={100} height={9} style={{ marginTop: 4 }} />
          </div>
        </div>
        <Skeleton width={90} height={11} />
      </div>
      <div style={{ borderTop: '1px solid var(--color-border-strong)', marginBottom: 'var(--space-5)' }} />
      <Skeleton width="75%" height={28} style={{ marginBottom: 'var(--space-5)' }} />
      <Skeleton width="100%" height={70} style={{ marginBottom: 'var(--space-5)' }} />
      <div style={{ display: 'flex', gap: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
        <Skeleton width={120} height={24} />
        <Skeleton width={80} height={20} />
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-5)', marginBottom: 'var(--space-5)' }} />
      {/* Numbered sections */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-5)', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <Skeleton width={24} height={24} borderRadius="50%" />
            <Skeleton width={140} height={11} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Skeleton width="100%" height={12} />
            <Skeleton width="92%" height={12} />
            <Skeleton width="80%" height={12} />
          </div>
        </div>
      ))}
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
      className="transaction-state transaction-state--empty"
      role="status"
    >
      <span className="transaction-state__title">{title}</span>
      {description && (
        <span className="transaction-state__description">{description}</span>
      )}
      {action && <div className="transaction-state__action">{action}</div>}
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
  title = 'Record access interrupted',
  message,
  onRetry,
}: ErrorStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.out }}
      className="transaction-state transaction-state--error"
      role="alert"
    >
      <span className="transaction-state__title">{title}</span>
      <span className="transaction-state__description">{message}</span>
      {onRetry && (
        <div className="transaction-state__action">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </motion.div>
  );
}
