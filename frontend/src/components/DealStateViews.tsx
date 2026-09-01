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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        marginTop: 'var(--space-4)',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Column headers (faint) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr 1.4fr 130px 130px 110px',
          gap: 'var(--space-3)',
          padding: '8px 0',
          borderBottom: '1px solid var(--color-border-strong)',
        }}
      >
        {['No.', 'Record', 'Parties', 'Value', 'Status', 'Updated'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--color-text-faint)',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '56px 1fr 1.4fr 130px 130px 110px',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--color-border)',
            alignItems: 'center',
          }}
        >
          <Skeleton width={20} height={11} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="70%" height={12} />
          <Skeleton width={80} height={14} />
          <Skeleton width={90} height={20} borderRadius="var(--radius-xs)" />
          <Skeleton width={56} height={11} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DealDetailSkeleton — casebook document loading state
// ---------------------------------------------------------------------------

export function DealDetailSkeleton() {
  return (
    <div
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: 'var(--space-7) var(--space-6) var(--space-8)',
      }}
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) var(--space-5)',
        marginTop: 'var(--space-4)',
        border: '1px dashed var(--color-border)',
        background: 'var(--color-parchment-warm)',
      }}
      role="status"
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </span>
      {description && (
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-tertiary)',
            maxWidth: 360,
            lineHeight: 1.5,
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) var(--space-5)',
        marginTop: 'var(--space-4)',
        border: '1px solid var(--color-status-disputed)',
        background: 'var(--color-parchment-warm)',
      }}
      role="alert"
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: 360,
          lineHeight: 1.5,
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
