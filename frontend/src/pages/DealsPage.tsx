/**
 * pages/DealsPage.tsx
 *
 * The deals list — all deals with filter + search.
 *
 * Uses:
 *   - useDeals() hook for data
 *   - DealStateBadge + DEAL_STATES for status display
 *   - DealListSkeleton / EmptyState / ErrorState for loading/empty/error
 *   - DealStateTimeline for expanded row previews
 *
 * The frontend is purely presentational — all status values come from the
 * authoritative backend, never inferred.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Stack, StackItem, Card, Expand, Reveal } from '../motion/components';
import { DealTimeline, type TimelineStep } from '../motion/DealTimeline';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { useDeals, filterDeals } from '../hooks/useDeals';
import { useReducedMotion } from '../motion/hooks';
import { useHoverPress } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { getDealStateConfig, DEAL_STATE_ORDER, type DealStatus } from '../types/dealStates';
import type { DealSummary } from '../types/deal';

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

interface Filter {
  label: string;
  value: string;
}

const FILTERS: Filter[] = [
  { label: 'All Deals', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Disputed', value: 'disputed' },
  { label: 'Declined', value: 'declined' },
  { label: 'Cancelled', value: 'cancelled' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DealsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { deals, loading, error, refetch } = useDeals();
  const reduced = useReducedMotion();

  const filtered = filterDeals(deals, activeFilter, searchQuery);

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
          Deals
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--text-md)' }}>
          {loading ? 'Loading…' : `${filtered.length} deal${filtered.length !== 1 ? 's' : ''}`}
          {activeFilter !== 'all' && ' (filtered)'}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      </motion.header>

      {/* Search + Filters */}
      <Reveal>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <SearchIcon />
            <input
              type="search"
              placeholder="Search by title or counterparty…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search deals"
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-focus)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
            role="tablist"
            aria-label="Filter deals"
          >
            {FILTERS.map((filter) => (
              <motion.button
                key={filter.value}
                role="tab"
                aria-selected={activeFilter === filter.value}
                onClick={() => setActiveFilter(filter.value)}
                whileTap={!reduced ? { scale: 0.96 } : undefined}
                transition={{ duration: duration.fast, ease: easing.snap }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor:
                    activeFilter === filter.value
                      ? 'var(--color-border-strong)'
                      : 'var(--color-border)',
                  background:
                    activeFilter === filter.value
                      ? 'var(--color-surface-2)'
                      : 'transparent',
                  color:
                    activeFilter === filter.value
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: activeFilter === filter.value ? 500 : 400,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                }}
              >
                {filter.label}
              </motion.button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Content */}
      {loading ? (
        <DealListSkeleton count={5} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={refetch}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No deals found"
          description={
            searchQuery
              ? `No deals match "${searchQuery}". Try a different search term.`
              : activeFilter !== 'all'
              ? `No deals in this category.`
              : `No deals yet.`
          }
          action={
            (searchQuery || activeFilter !== 'all') ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack
          staggerDelay={0.05}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          {filtered.map((deal) => (
            <StackItem key={deal.id} style={{ display: 'block' }}>
              <DealRow deal={deal} />
            </StackItem>
          ))}
        </Stack>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DealRow — expandable list item
// ---------------------------------------------------------------------------

function DealRow({ deal }: { deal: DealSummary }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const reduced = useReducedMotion();
  const press = useHoverPress({ disabled: reduced });

  const statusConfig = getDealStateConfig(deal.status);

  return (
    <Card interactive style={{ overflow: 'hidden' }}>
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileTap={press.whileTap}
        transition={press.transition}
        aria-expanded={isExpanded}
        aria-label={`${deal.title} — ${statusConfig?.label ?? deal.status}. Click to ${isExpanded ? 'collapse' : 'expand'}.`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--space-3)',
          alignItems: 'center',
          padding: 'var(--space-5)',
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-md)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deal.title}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {deal.counterparties}
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
          <DealStateBadge status={deal.status} size="sm" />
          <span
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {deal.amountFormatted}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {deal.updatedAtRelative}
          </span>
        </div>
      </motion.button>

      {/* Expandable area — preview timeline + view action */}
      <Expand isOpen={isExpanded}>
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'var(--space-6)',
            alignItems: 'start',
          }}
        >
          <DealTimeline
            steps={buildPreviewSteps(deal.status)}
            currentId={getCurrentStepId(deal.status)}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              alignItems: 'flex-end',
            }}
          >
            <Link to={`/deals/${deal.id}`} style={{ textDecoration: 'none' }}>
              <Button size="sm" variant="secondary">
                View Deal →
              </Button>
            </Link>
          </div>
        </div>
      </Expand>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline helpers (presentational — data comes from backend)
// ---------------------------------------------------------------------------

function buildPreviewSteps(status: DealStatus): TimelineStep[] {
  const all = DEAL_STATE_ORDER;
  const config = getDealStateConfig(status);
  const currentOrder = config?.order ?? 0;

  return all.slice(0, Math.min(currentOrder + 3, all.length)).map((s) => {
    const cfg = getDealStateConfig(s);
    const order = cfg?.order ?? 0;
    let stepStatus: 'completed' | 'pending' | 'accepted' = 'accepted';
    if (order < currentOrder) stepStatus = 'completed';
    if (order === currentOrder) stepStatus = 'pending';
    return {
      id: s,
      label: cfg?.label ?? s,
      status: stepStatus,
    };
  });
}

function getCurrentStepId(status: DealStatus): string {
  return status;
}

// ---------------------------------------------------------------------------
// SearchIcon — inline magnifier for the search input
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-text-tertiary)',
        pointerEvents: 'none',
      }}
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
