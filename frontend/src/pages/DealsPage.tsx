/**
 * pages/DealsPage.tsx
 *
 * Record Index — the official register of all deal records.
 *
 * Presented as an archival folio:
 * - Top: "REGISTER OF RECORDS" with search + filter tabs
 * - Body: ruled rows with folio numbers, parties, value, status, updated
 * - Each row: parchment alternating backgrounds, ruled borders
 *
 * Uses:
 *   - useDeals() hook for data
 *   - DealStateBadge + DEAL_STATES for status display
 *   - DealListSkeleton / EmptyState / ErrorState for loading/empty/error
 *
 * The frontend is purely presentational — all status values come from the
 * authoritative backend, never inferred.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useDeals, filterDeals } from '../hooks/useDeals';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { getDealStateConfig } from '../types/dealStates';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import type { DealSummary } from '../types/deal';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

interface Filter {
  label: string;
  value: string;
}

const FILTERS: Filter[] = [
  { label: 'All Records', value: 'all' },
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
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { deals, loading, error, refetch } = useDeals();
  const reduced = useReducedMotion();

  const filtered = useMemo(
    () => filterDeals(deals, activeFilter, searchQuery),
    [deals, activeFilter, searchQuery]
  );

  return (
    <div
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: 'var(--space-7) var(--space-6) var(--space-8)',
      }}
    >
      {/* ─── REGISTER HEADER ────────────────────────────────────── */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.out }}
      >
        {/* Archival label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-3)',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: 'var(--color-text-faint)',
            }}
          >
            Register of Records
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-faint)',
              letterSpacing: '0.06em',
            }}
          >
            {loading ? '—' : `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          Deal Records
        </h1>
        {(user?.role === 'BRAND' || user?.role === 'ADMIN') && <div className="transaction-actions"><Link className="transaction-button transaction-button--primary" to="/deals/new">Create Deal →</Link></div>}

        {/* Top rule */}
        <div style={{ borderTop: '1px solid var(--color-border-strong)', marginTop: 'var(--space-5)' }} />
      </motion.header>

      {/* ─── SEARCH + FILTERS ────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          paddingTop: 'var(--space-5)',
          paddingBottom: 'var(--space-4)',
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
            aria-label="Search records"
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderBottomColor = 'var(--color-text-primary)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderBottomColor = 'var(--color-border)';
            }}
          />
        </div>

        {/* Filter tabs — text-only, no pill backgrounds */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--color-border)',
          }}
          role="tablist"
          aria-label="Filter records"
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.value;
            return (
              <button
                key={filter.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFilter(filter.value)}
                style={{
                  padding: '8px 0',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                  marginBottom: '-1px',
                  background: 'transparent',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 500 : 400,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  letterSpacing: '0.01em',
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── REGISTER BODY ──────────────────────────────────────── */}
      {loading ? (
        <DealListSkeleton count={5} />
      ) : error ? (
        <ErrorState title="Register access interrupted" message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No records found"
          description={
            searchQuery
              ? `No records match "${searchQuery}". Try a different search term.`
              : activeFilter !== 'all'
              ? `No records in this category.`
              : `The register is empty.`
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
        <RecordRegister entries={filtered} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecordRegister — folio table
// ---------------------------------------------------------------------------

function RecordRegister({ entries }: { entries: DealSummary[] }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.out }}
      style={{ marginTop: 'var(--space-4)' }}
    >
      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr 1.4fr 130px 130px 110px',
          gap: 'var(--space-3)',
          padding: '8px 0',
          borderBottom: '1px solid var(--color-border-strong)',
        }}
        className="ledger-register-headers"
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

      {/* Entries */}
      <AnimatePresence initial={false}>
        {entries.map((deal, i) => (
          <RecordRow key={deal.id} deal={deal} folio={i + 1} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function RecordRow({ deal, folio }: { deal: DealSummary; folio: number }) {
  const reduced = useReducedMotion();
  const statusConfig = getDealStateConfig(deal.status);
  const { recordNavigation } = useDealNavigation();

  return (
    <motion.div
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0 }}
      transition={{ duration: duration.normal, ease: easing.out }}
    >
      <Link
        to={`/deals/${deal.id}`}
        onClick={() => recordNavigation('forward')}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        aria-label={`${deal.title} — ${statusConfig?.label ?? deal.status}`}
      >
        <motion.div
          whileHover={!reduced ? { backgroundColor: 'rgba(184, 160, 120, 0.06)' } : undefined}
          transition={{ duration: duration.fast, ease: easing.out }}
          style={{
            display: 'grid',
            gridTemplateColumns: '56px 1fr 1.4fr 130px 130px 110px',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--color-border)',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          className="ledger-register-row"
        >
          {/* Folio number */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-faint)',
              letterSpacing: '0.04em',
            }}
          >
            {String(folio).padStart(3, '0')}
          </span>

          {/* Record title */}
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingRight: 'var(--space-2)',
            }}
            title={deal.title}
          >
            {deal.title}
          </span>

          {/* Parties */}
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={deal.counterparties}
          >
            {deal.counterparties}
          </span>

          {/* Value */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
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
// SearchIcon — inline magnifier
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
        left: 0,
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
