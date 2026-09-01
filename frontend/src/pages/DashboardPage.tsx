/**
 * pages/DashboardPage.tsx
 *
 * Institutional Register — Brand & Creator Cover View (Reference Image 1).
 *
 * Designed as a physical leather-bound institutional register cover:
 *   - Dark mahogany leather container with double-ruled gold debossed frame
 *   - Filigree ornamental scrolls (`─── ❖ ───`)
 *   - Dynamic title: BRAND NAME ✕ CREATOR NAME
 *   - Archival subtitle: "RECORDS OF AGREEMENTS"
 *   - Gold Wax Seal Medallion with dark ribbon mounted on right binding edge
 *   - Contiguous 4-column metric bar inset into leather
 *   - Physically mounted Parchment Sheet containing Recent Records table
 */

import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useDeals } from '../hooks/useDeals';
import { useAuth } from '../contexts/AuthContext';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { type DealStatus } from '../types/dealStates';
import type { DealSummary } from '../types/deal';

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

export function DashboardPage() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { deals, loading, error, refetch } = useDeals();
  const { recordNavigation } = useDealNavigation();

  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0);
  const activeCount = deals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;
  const pendingCount = deals.filter((d) => PENDING_STATUSES.includes(d.status)).length;
  const completedCount = deals.filter((d) => d.status === 'COMPLETED').length;
  const recent = [...deals]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  // Dynamic names from runtime data
  const brandName = user?.name?.toUpperCase() || 'ACME STUDIOS';
  const creatorName = deals.length > 0 && deals[0].counterparties
    ? deals[0].counterparties.split('×')[1]?.trim()?.toUpperCase() || 'ALEX RIVERA'
    : 'ALEX RIVERA';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0d0a08 0%, #15100c 50%, #0a0806 100%)',
        padding: 'var(--space-6) var(--space-6) var(--space-8)',
        color: '#f5e6ca',
      }}
    >
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        {/* ─── PHYSICAL LEATHER COVER (REFERENCE IMAGE 1) ─────────── */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: easing.out }}
          style={{
            position: 'relative',
            border: '2px solid #8b6508',
            borderRadius: 6,
            background: 'linear-gradient(180deg, #241b14 0%, #18120d 100%)',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.85), 0 25px 60px rgba(0,0,0,0.8)',
            padding: 'var(--space-7) var(--space-6) var(--space-6)',
            overflow: 'hidden',
          }}
        >
          {/* Inner double-line gold debossed frame */}
          <div
            style={{
              position: 'absolute',
              inset: 8,
              border: '1px solid rgba(212, 175, 55, 0.25)',
              pointerEvents: 'none',
              borderRadius: 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 12,
              border: '1px stroke rgba(212, 175, 55, 0.15)',
              pointerEvents: 'none',
              borderRadius: 3,
            }}
          />

          {/* Gold Wax Seal Medallion & Ribbon Clasp Right Edge */}
          <div
            style={{
              position: 'absolute',
              top: '42%',
              right: -18,
              transform: 'translateY(-50%)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Dark Leather Ribbon */}
            <div
              style={{
                width: 26,
                height: 80,
                background: '#0a0806',
                borderLeft: '1px solid #7a5c1a',
                boxShadow: '-3px 0 10px rgba(0,0,0,0.7)',
              }}
            />
            {/* Gold Embossed Medallion */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #d4af37 0%, #8b6508 70%, #4a3403 100%)',
                boxShadow: '0 6px 16px rgba(0,0,0,0.7), inset 0 2px 4px rgba(255,255,255,0.4)',
                border: '2px solid #ffd700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: -16,
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="0.8" opacity="0.5" />
                <path d="M7 17V10L12 6L17 10V17" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="17" x2="15" y2="17" stroke="#fff" strokeWidth="1.5" />
                <line x1="12" y1="10" x2="12" y2="14" stroke="#fff" strokeWidth="1.2" />
              </svg>
            </div>
          </div>

          {/* ─── COVER TITLE BLOCK ───────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.28em',
                color: 'var(--color-gold-pale)',
                marginBottom: 'var(--space-2)',
                opacity: 0.85,
              }}
            >
              INSTITUTIONAL REGISTER
            </div>

            {/* Scrollwork Filigree ornament */}
            <div style={{ fontSize: 12, color: 'var(--color-gold-bright)', letterSpacing: '0.3em', margin: '4px 0 12px', opacity: 0.7 }}>
              ───── ❖ ─────
            </div>

            {/* Brand × Creator Title */}
            <h1
              className="gold-foil-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(26px, 4vw, 40px)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {brandName}
              <span style={{ display: 'block', fontSize: '0.45em', color: 'var(--color-gold-bright)', margin: '6px 0', opacity: 0.75 }}>
                ✕
              </span>
              {creatorName}
            </h1>

            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.24em',
                color: 'var(--color-gold-pale)',
                marginTop: 'var(--space-3)',
                opacity: 0.85,
              }}
            >
              RECORDS OF AGREEMENTS
            </div>

            {/* Embossed Center Veritas Seal Stamp */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: 'var(--space-5) 0 var(--space-4)' }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  border: '1.5px solid #8b6508',
                  background: 'radial-gradient(circle, rgba(42,31,20,0.6) 0%, rgba(15,11,8,0.9) 100%)',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8), 0 4px 10px rgba(0,0,0,0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.14em', color: '#cbb88a', textTransform: 'uppercase' }}>
                  VERITAS
                </span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: '2px 0' }}>
                  <circle cx="12" cy="12" r="10" stroke="#d4af37" strokeWidth="0.8" opacity="0.6" />
                  <path d="M6 18V10L12 6L18 10V18" stroke="#d4af37" strokeWidth="1.2" />
                  <line x1="9" y1="13" x2="15" y2="13" stroke="#d4af37" strokeWidth="0.8" />
                  <line x1="9" y1="16" x2="15" y2="16" stroke="#d4af37" strokeWidth="0.8" />
                </svg>
                <span style={{ fontSize: 5, fontWeight: 700, letterSpacing: '0.12em', color: '#cbb88a', textTransform: 'uppercase' }}>
                  PACTA SERVANDA
                </span>
              </div>
            </div>
          </div>

          {/* ─── CONTIGUOUS METRIC BAR ───────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              borderTop: '1px solid #6e541b',
              borderBottom: '1px solid #6e541b',
              background: 'rgba(10, 7, 5, 0.6)',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <MetricCell
              label="ACTIVE RECORDS"
              value={loading ? '—' : String(activeCount).padStart(2, '0')}
              sub="Across all parties"
            />
            <MetricCell
              label="TOTAL CONTRACT VALUE"
              value={loading ? '—' : formatCompactCurrency(totalValue)}
              sub="Total value of active records"
              isGold
            />
            <MetricCell
              label="PENDING REVIEW"
              value={loading ? '—' : String(pendingCount).padStart(2, '0')}
              sub="Awaiting action"
            />
            <MetricCell
              label="COMPLETED"
              value={loading ? '—' : String(completedCount).padStart(2, '0')}
              sub="All time"
              isLast
            />
          </div>

          {/* ─── MOUNTED PARCHMENT SHEET (RECENT RECORDS) ─────────── */}
          <div
            style={{
              background: 'var(--color-parchment-cream)',
              borderRadius: 3,
              border: '1px solid #c4b396',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6), inset 0 0 60px rgba(184,160,120,0.12)',
              color: 'var(--color-ink-primary)',
              padding: 'var(--space-5)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-4)',
                paddingBottom: 'var(--space-3)',
                borderBottom: '1px solid #c9bfb0',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 700,
                  color: 'var(--color-ink-primary)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                RECENT RECORDS
              </h2>
              <Link
                to="/deals"
                onClick={() => recordNavigation('forward')}
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: 'var(--color-ink-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textDecoration: 'none',
                }}
              >
                VIEW ALL RECORDS →
              </Link>
            </div>

            {loading ? (
              <DealListSkeleton count={4} />
            ) : error ? (
              <ErrorState message={error} onRetry={refetch} />
            ) : recent.length === 0 ? (
              <EmptyState
                title="No records established"
                description="When contractual records are formed, they will be registered here."
                action={
                  <Link to="/deals" onClick={() => recordNavigation('forward')}>
                    <Button size="sm" variant="secondary">Browse Register</Button>
                  </Link>
                }
              />
            ) : (
              <div>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 2fr 2fr 1.2fr 1fr 1fr',
                    gap: 'var(--space-2)',
                    padding: '6px 8px',
                    borderBottom: '1px solid #c9bfb0',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--color-ink-muted)',
                  }}
                >
                  <span>NO.</span>
                  <span>AGREEMENT</span>
                  <span>PARTIES</span>
                  <span>VALUE</span>
                  <span>STATUS</span>
                  <span>UPDATED</span>
                </div>

                {/* Rows */}
                {recent.map((deal, idx) => (
                  <RecentParchmentRow
                    key={deal.id}
                    deal={deal}
                    index={idx + 1}
                    onNavigate={() => recordNavigation('forward')}
                  />
                ))}

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'var(--space-4)',
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid #c9bfb0',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-ink-muted)',
                  }}
                >
                  <span>Showing 1 to {recent.length} of {deals.length} records</span>
                  <Link
                    to="/deals"
                    onClick={() => recordNavigation('forward')}
                    style={{
                      color: 'var(--color-ink-primary)',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    1 2 →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  sub,
  isGold,
  isLast,
}: {
  label: string;
  value: string;
  sub: string;
  isGold?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        padding: 'var(--space-4) var(--space-4)',
        borderRight: isLast ? 'none' : '1px solid #574316',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--color-gold-pale)',
          opacity: 0.85,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: isGold ? 'var(--text-2xl)' : 'var(--text-3xl)',
          fontWeight: 600,
          color: isGold ? '#ffd700' : '#f5e6ca',
          lineHeight: 1.1,
          margin: '2px 0 4px',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: '#a3927c' }}>{sub}</div>
    </div>
  );
}

function RecentParchmentRow({
  deal,
  index,
  onNavigate,
}: {
  deal: DealSummary;
  index: number;
  onNavigate: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <Link
      to={`/deals/${deal.id}`}
      onClick={onNavigate}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <motion.div
        whileHover={!reduced ? { backgroundColor: 'rgba(184, 134, 11, 0.08)' } : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 2fr 2fr 1.2fr 1fr 1fr',
          gap: 'var(--space-2)',
          padding: '10px 8px',
          borderBottom: '1px solid #e0d5c1',
          alignItems: 'center',
          fontSize: 'var(--text-xs)',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-ink-muted)' }}>
          {String(index).padStart(3, '0')}
        </span>

        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-ink-primary)' }}>
            {deal.title}
          </div>
        </div>

        <div style={{ color: 'var(--color-ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deal.counterparties}
        </div>

        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-ink-primary)' }}>
          {deal.amountFormatted}
        </span>

        <div>
          <DealStateBadge status={deal.status} size="sm" />
        </div>

        <span style={{ color: 'var(--color-ink-muted)' }}>
          {deal.updatedAtRelative}
        </span>
      </motion.div>
    </Link>
  );
}

function formatCompactCurrency(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
}
