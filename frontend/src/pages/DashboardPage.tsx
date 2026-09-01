/**
 * pages/DashboardPage.tsx
 *
 * Institutional overview — the record authority's summary view.
 *
 * Feels like an annual report or institutional folio: restrained, editorial,
 * and archival rather than a data-dense SaaS dashboard.
 *
 * Uses:
 *   - useDeals() hook for data
 *   - DealStateBadge for status display
 *   - DealListSkeleton / EmptyState / ErrorState for loading/empty/error
 *
 * All status values come from the authoritative backend.
 */

import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useDeals } from '../hooks/useDeals';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { type DealStatus } from '../types/dealStates';
import type { DealSummary } from '../types/deal';

// ---------------------------------------------------------------------------
// Status categories — derived from backend status, presentational only
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: DealStatus[] = [
  'DRAFT',
  'PENDING_ACCEPTANCE',
  'FUNDED',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'REVISION_REQUESTED',
];

const PENDING_STATUSES: DealStatus[] = [
  'DRAFT',
  'PENDING_ACCEPTANCE',
  'SUBMITTED',
  'REVISION_REQUESTED',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const reduced = useReducedMotion();
  const { deals, loading, error, refetch } = useDeals();

  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0);
  const activeCount = deals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;
  const pendingCount = deals.filter((d) => PENDING_STATUSES.includes(d.status)).length;
  const completedCount = deals.filter((d) => d.status === 'COMPLETED').length;
  const disputedCount = deals.filter((d) => d.status === 'DISPUTED').length;
  const recent = [...deals]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div
      style={{
        maxWidth: 'var(--layout-max-width)',
        margin: '0 auto',
        padding: 'var(--space-7) var(--space-6) var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-7)',
      }}
    >
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.out }}
      >
        {/* Archival label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: 'var(--color-text-faint)',
            marginBottom: 'var(--space-2)',
          }}
        >
          Record Summary
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          Institutional Overview
        </h1>

        {/* Top rule */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-strong)',
            marginTop: 'var(--space-5)',
          }}
        />
      </motion.header>

      {/* ─── RECORD SUMMARY GRID ────────────────────────────────── */}
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.out, delay: 0.05 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 0,
          border: '1px solid var(--color-border-strong)',
          background: 'var(--color-parchment-warm)',
        }}
      >
        <SummaryStat
          label="Total Portfolio Value"
          value={loading ? '—' : formatCompactCurrency(totalValue)}
          sub={loading ? 'Loading' : `Across ${deals.length} record${deals.length !== 1 ? 's' : ''}`}
          accent
        />
        <SummaryStat
          label="Active Records"
          value={loading ? '—' : String(activeCount)}
          sub={loading ? 'Loading' : 'Currently in progress'}
        />
        <SummaryStat
          label="Pending Review"
          value={loading ? '—' : String(pendingCount)}
          sub={loading ? 'Loading' : 'Awaiting action'}
        />
        <SummaryStat
          label="Completed"
          value={loading ? '—' : String(completedCount)}
          sub={loading ? 'Loading' : 'All time'}
          isLast
        />
      </motion.div>

      {/* ─── RECENT RECORDS ─────────────────────────────────────── */}
      <section>
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.normal, ease: easing.out, delay: 0.1 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-4)',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border-strong)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--color-text-faint)',
                marginBottom: 4,
              }}
            >
              Record Activity
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Recent Records
            </h2>
          </div>
          <Link
            to="/deals"
            style={{
              textDecoration: 'none',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            View all
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 6h6M7 4l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </motion.div>

        {loading ? (
          <DealListSkeleton count={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No records yet"
            description="Once records are established, they will appear here."
            action={
              <Link to="/deals" style={{ textDecoration: 'none' }}>
                <Button size="sm" variant="secondary">
                  Browse records
                </Button>
              </Link>
            }
          />
        ) : (
          <div>
            {/* Column headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 130px 130px',
                gap: 'var(--space-3)',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border-strong)',
              }}
            >
              {['Record', 'Parties', 'Status', 'Updated'].map((h) => (
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

            {/* Rows */}
            {recent.map((deal, i) => (
              <RecentRecordRow key={deal.id} deal={deal} delay={0.02 * i} />
            ))}

            {/* Dispute notice */}
            {disputedCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-parchment-warm)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--color-status-disputed)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {disputedCount} record{disputedCount !== 1 ? 's' : ''} in dispute. Review in the{' '}
                  <Link
                    to="/deals"
                    style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }}
                  >
                    Record Index
                  </Link>
                  .
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryStat — institutional stat cell
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  sub,
  accent,
  isLast,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        padding: 'var(--space-5) var(--space-5)',
        borderRight: isLast ? 'none' : '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--color-text-faint)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: accent ? 'var(--font-mono)' : 'var(--font-display)',
          fontSize: accent ? 'var(--text-2xl)' : 'var(--text-2xl)',
          fontWeight: 600,
          color: accent ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
          letterSpacing: accent ? '-0.02em' : 'inherit',
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {sub}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentRecordRow — ruled row with link
// ---------------------------------------------------------------------------

function RecentRecordRow({ deal, delay }: { deal: DealSummary; delay: number }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: duration.normal, ease: easing.out, delay }}
    >
      <Link
        to={`/deals/${deal.id}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
      >
        <motion.div
          whileHover={
            !reduced
              ? { backgroundColor: 'rgba(184, 160, 120, 0.06)' }
              : undefined
          }
          transition={{ duration: duration.fast }}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 130px 130px',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--color-border)',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          {/* Record title + parties */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 2,
              }}
            >
              {deal.title}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {deal.counterparties}
            </div>
          </div>

          {/* Amount */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-text-primary)',
            }}
          >
            {deal.amountFormatted}
          </span>

          {/* Status */}
          <span>
            <DealStateBadge status={deal.status} size="sm" />
          </span>

          {/* Updated */}
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {deal.updatedAtRelative}
          </span>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
