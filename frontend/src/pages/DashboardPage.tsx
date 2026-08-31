/**
 * pages/DashboardPage.tsx
 *
 * Overview dashboard with stats and recent deals.
 * Uses the same useDeals() hook and DealStateBadge component as the
 * deals page so the dashboard is consistent with the rest of the app.
 */

import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Reveal, Stack, StackItem, Card } from '../motion/components';
import { DealListSkeleton, ErrorState, EmptyState } from '../components/DealStateViews';
import { useDeals } from '../hooks/useDeals';
import { useReducedMotion, useHoverPress } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { getDealStateConfig, type DealStatus } from '../types/dealStates';
import type { DealSummary } from '../types/deal';

// ---------------------------------------------------------------------------
// Stat categories — derived from a status, presentational only
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
  const recent = [...deals]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

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
    >
      {/* Header */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.out }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
      >
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--text-md)' }}>
          Overview of your transactions and deals.
        </p>
      </motion.header>

      {/* Stats row */}
      <Reveal delay={0.05}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <StatCard
            label="Active Deals"
            value={loading ? '…' : String(activeCount)}
            sub={loading ? 'Loading' : 'Currently in motion'}
          />
          <StatCard
            label="Total Value"
            value={loading ? '…' : formatCompactCurrency(totalValue)}
            sub={loading ? 'Loading' : `Across ${deals.length} deals`}
          />
          <StatCard
            label="Pending"
            value={loading ? '…' : String(pendingCount)}
            sub={loading ? 'Loading' : 'Awaiting action'}
          />
          <StatCard
            label="Completed"
            value={loading ? '…' : String(completedCount)}
            sub={loading ? 'Loading' : 'All time'}
          />
        </div>
      </Reveal>

      {/* Recent deals */}
      <section>
        <Reveal delay={0.1}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
              Recent Deals
            </h2>
            <Link to="/deals" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                View all →
              </Button>
            </Link>
          </div>
        </Reveal>

        {loading ? (
          <DealListSkeleton count={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No deals yet"
            description="Once you create your first deal, it will show up here."
            action={
              <Link to="/deals" style={{ textDecoration: 'none' }}>
                <Button size="sm" variant="secondary">
                  Browse deals
                </Button>
              </Link>
            }
          />
        ) : (
          <Stack
            staggerDelay={0.04}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            {recent.map((deal) => (
              <StackItem key={deal.id} style={{ display: 'block' }}>
                <DealCard deal={deal} />
              </StackItem>
            ))}
          </Stack>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      whileHover={!reduced ? { y: -2, transition: { duration: duration.fast, ease: easing.out } } : undefined}
      style={{
        padding: 'var(--space-5)',
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>
        {value}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        {sub}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DealCard — uses layoutId for shared element transitions
// ---------------------------------------------------------------------------

function DealCard({ deal }: { deal: DealSummary }) {
  const reduced = useReducedMotion();
  const press = useHoverPress({ disabled: reduced });
  const statusConfig = getDealStateConfig(deal.status);

  return (
    <motion.div layoutId={`deal-card-${deal.id}`}>
      <Card interactive>
        <Link to={`/deals/${deal.id}`} style={{ textDecoration: 'none' }}>
          <motion.div
            {...press}
            style={{
              padding: 'var(--space-5)',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 'var(--space-3)',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
              <motion.span
                layoutId={`deal-title-${deal.id}`}
                style={{
                  fontWeight: 600,
                  fontSize: 'var(--text-md)',
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {deal.title}
              </motion.span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {deal.counterparties}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Updated {deal.updatedAtRelative}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 'var(--space-2)',
                flexShrink: 0,
              }}
            >
              <DealStateBadge
                layoutId={`deal-status-${deal.id}`}
                status={deal.status}
                size="sm"
              />
              <span
                style={{
                  fontSize: 'var(--text-md)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {deal.amountFormatted}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {statusConfig?.label ?? deal.status}
              </span>
            </div>
          </motion.div>
        </Link>
      </Card>
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
