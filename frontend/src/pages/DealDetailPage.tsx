/**
 * pages/DealDetailPage.tsx
 *
 * Casebook document view for a single deal record.
 *
 * The deal record is presented as an official ledger document:
 * - Record header with formal parties register
 * - Numbered document sections separated by thin rules
 * - Institutional status stamp
 * - Archival activity log
 *
 * All state values come from the authoritative backend.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { DealTimeline } from '../motion/DealTimeline';
import { DealStateTimeline } from '../motion/DealStateTimeline';
import { Modal, Drawer } from '../motion/components';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { DealDetailSkeleton, ErrorState, EmptyState } from '../components/DealStateViews';
import { useDeal } from '../hooks/useDeal';
import { useDealActions, ACTION_LABELS, actionVariant } from '../hooks/useDealActions';
import { useDeals } from '../hooks/useDeals';
import { dealApi } from '../services/dealApi';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { getDealStateConfig } from '../types/dealStates';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import type { DealDocument, DealParty, DealEvent } from '../types/deal';
import type { TimelineStep } from '../motion/DealTimeline';
import type { Status } from '../motion/StatusBadge';
import type { DealAction } from '../types/api';

// ---------------------------------------------------------------------------
// Toast — institutional, no SaaS colours
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'conflict';
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const kindStyles: Record<Toast['kind'], { border: string; accent: string }> = {
    success: { border: 'var(--color-border-strong)', accent: 'var(--color-status-completed)' },
    conflict: { border: 'var(--color-border-strong)', accent: 'var(--color-status-pending)' },
    error: { border: 'var(--color-border-strong)', accent: 'var(--color-status-disputed)' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'var(--space-4)',
        right: 'var(--space-4)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const s = kindStyles[toast.kind];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2, ease: easing.out }}
              style={{
                pointerEvents: 'all',
                background: 'var(--color-parchment-warm)',
                border: `1px solid ${s.border}`,
                borderLeft: `3px solid ${s.accent}`,
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                minWidth: 280,
                maxWidth: 360,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: s.accent,
                  marginTop: 5,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', flex: 1, lineHeight: 1.5 }}>
                {toast.message}
              </span>
              <button
                onClick={() => onDismiss(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '2px 4px',
                  flexShrink: 0,
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document section primitive — ruled section, no card wrapper
// ---------------------------------------------------------------------------

function DocSection({
  number,
  label,
  children,
}: {
  number: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-faint)',
            letterSpacing: '0.06em',
          }}
        >
          {number}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {label}
        </span>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading, error, notFound, refetch } = useDeal(id);
  const { availableActions, loadingActions, actionsError, performAction } = useDealActions(id);
  const { deals: allDeals } = useDeals();
  const { recordNavigation } = useDealNavigation();
  const navigate = useNavigate();

  // History from the dedicated /history endpoint
  const [historyEvents, setHistoryEvents] = useState<DealEvent[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Incremented after a successful state transition so history re-fetches
  const [historyTick, setHistoryTick] = useState(0);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<DealAction | null>(null);
  const reduced = useReducedMotion();

  // Deal-to-deal navigation: find current index and neighbors
  const currentIndex = id ? allDeals.findIndex((d) => d.id === id) : -1;
  const hasNext = currentIndex >= 0 && currentIndex < allDeals.length - 1;
  const hasPrev = currentIndex > 0;
  const nextDeal = hasNext ? allDeals[currentIndex + 1] : null;
  const prevDeal = hasPrev ? allDeals[currentIndex - 1] : null;

  const goToNext = () => {
    if (!nextDeal) return;
    recordNavigation('up');
    navigate(`/deals/${nextDeal.id}`);
  };

  const goToPrev = () => {
    if (!prevDeal) return;
    recordNavigation('down');
    navigate(`/deals/${prevDeal.id}`);
  };

  // Keyboard navigation: ArrowDown → next, ArrowUp → previous
  // Skip when typing in inputs or when modals are open
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (modalOpen || drawerOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowDown' && hasNext) {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp' && hasPrev) {
        e.preventDefault();
        goToPrev();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, hasPrev, nextDeal, prevDeal, modalOpen, drawerOpen]);

  // Load history when deal id is available
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setHistoryEvents(null);
    setHistoryError(null);
    // TypeScript does not propagate narrowing into async closures — safe assertion
    const dealId: string = id as string;

    async function loadHistory() {
      const result = await dealApi.getDealHistory(dealId);
      if (cancelled) return;

      if (!result.ok) {
        // Non-critical — fall back to events from deal record
        setHistoryError(result.message);
      } else {
        setHistoryEvents(result.data);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [id, historyTick]);

  const addToast = (message: string, kind: Toast['kind'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => dismissToast(id), 5000);
  };

  const dismissToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const handleAction = async (action: DealAction) => {
    setActionInFlight(action);
    try {
      const result = await performAction(action, refetch);
      if (result.success) {
        addToast(result.message, 'success');
        // Refresh history so the new event appears immediately
        setHistoryTick((t) => t + 1);
      } else {
        addToast(result.message, result.isConflict ? 'conflict' : 'error');
      }
    } finally {
      setActionInFlight(null);
    }
  };

  // Not found
  if (!loading && notFound) {
    return (
      <div style={{ maxWidth: 'var(--layout-max-width)', margin: '0 auto', padding: 'var(--space-7) var(--space-5)' }}>
        <Link
          to="/deals"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}
        >
          ← Record Index
        </Link>
        <EmptyState
          title="Record not found"
          description={`No record bearing identifier "${id}" exists in this archive.`}
          action={
            <Link to="/deals" style={{ textDecoration: 'none' }}>
              <Button size="sm" variant="secondary">← Return to Record Index</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <>
        <DealDetailSkeleton />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Error
  if (error) {
    return (
      <>
        <div style={{ maxWidth: 'var(--layout-max-width)', margin: '0 auto', padding: 'var(--space-7) var(--space-5)' }}>
          <Link
            to="/deals"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', textDecoration: 'none' }}
          >
            ← Record Index
          </Link>
          <ErrorState title="Record access interrupted" message={error} onRetry={refetch} />
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Should be impossible — loading=false with deal=null = notFound, caught above
  if (!deal) return null;

  const statusConfig = getDealStateConfig(deal.status);

  // Decide what events to show: history API takes priority, fall back to deal.events
  const eventsToShow: DealEvent[] =
    historyEvents !== null
      ? historyEvents
      : deal.events;

  const timelineSteps = eventsToShow.map(eventToStep);
  const latestEventId =
    eventsToShow.length > 0 ? eventsToShow[eventsToShow.length - 1].id : undefined;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Record document — parchment surface, document-width */}
      <div
        style={{
          maxWidth: 860,
          margin: '0 auto',
          padding: 'var(--space-7) var(--space-6) var(--space-8)',
        }}
      >
        {/* Back link */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-6)',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <Link
            to="/deals"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-tertiary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              textDecoration: 'none',
            }}
          >
            ← Record Index
          </Link>

          {/* Deal-to-deal navigation */}
          {(hasPrev || hasNext) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-faint)',
              }}
              aria-label="Deal navigation"
            >
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Records
              </span>
              <button
                onClick={goToPrev}
                disabled={!hasPrev}
                aria-label="Previous record"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: hasPrev ? 'pointer' : 'not-allowed',
                  opacity: hasPrev ? 1 : 0.4,
                  color: 'var(--color-text-secondary)',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Previous record (ArrowUp)"
              >
                ↑
              </button>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  minWidth: 60,
                  textAlign: 'center',
                }}
              >
                {currentIndex >= 0 ? `${currentIndex + 1} / ${allDeals.length}` : '— / —'}
              </span>
              <button
                onClick={goToNext}
                disabled={!hasNext}
                aria-label="Next record"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: hasNext ? 'pointer' : 'not-allowed',
                  opacity: hasNext ? 1 : 0.4,
                  color: 'var(--color-text-secondary)',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Next record (ArrowDown)"
              >
                ↓
              </button>
            </div>
          )}
        </div>

        {/* ─── RECORD HEADER ─────────────────────────────────────── */}
        <motion.header
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: easing.out }}
        >
          {/* Ledger mark + record number */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {/* Ledger seal icon */}
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
                <circle cx="16" cy="16" r="14" stroke="var(--color-gold)" strokeWidth="1" opacity="0.5" />
                <rect x="7" y="9" width="18" height="14" rx="1" stroke="var(--color-gold)" strokeWidth="1.2" fill="none" />
                <line x1="7" y1="14" x2="25" y2="14" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.6" />
                <line x1="11" y1="18" x2="21" y2="18" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
                <line x1="11" y1="21" x2="19" y2="21" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.4" />
              </svg>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.1,
                  }}
                >
                  Ledger
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    color: 'var(--color-text-faint)',
                    marginTop: 1,
                  }}
                >
                  Record Authority
                </div>
              </div>
            </div>

            {/* Record number */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-faint)',
                letterSpacing: '0.06em',
              }}
            >
              #{deal.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          {/* Top rule */}
          <div style={{ borderTop: '1px solid var(--color-border-strong)', marginBottom: 'var(--space-5)' }} />

          {/* Deal title — serif, editorial */}
          <motion.h1
            layoutId={`deal-title-${deal.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(22px, 4vw, 34px)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '0 0 var(--space-5)',
            }}
          >
            {deal.title}
          </motion.h1>

          {/* Parties register — formal ledger grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: deal.parties.length > 1
                ? `repeat(${Math.min(deal.parties.length, 2)}, 1fr)`
                : '1fr',
              border: '1px solid var(--color-border-strong)',
              marginBottom: 'var(--space-5)',
            }}
          >
            {deal.parties.map((party, i) => (
              <div
                key={party.id}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderRight: i < deal.parties.length - 1 ? '1px solid var(--color-border-strong)' : 'none',
                  background: i % 2 === 0 ? 'var(--color-parchment-warm)' : 'var(--color-parchment-cream)',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--color-text-faint)',
                    marginBottom: 2,
                  }}
                >
                  {party.role}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    marginBottom: 2,
                  }}
                >
                  {party.name}
                </div>
                {party.email && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    {party.email}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Metadata row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {deal.amountFormatted}
            </span>
            {deal.dealType && (
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-tertiary)',
                  padding: '3px 8px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xs)',
                }}
              >
                {deal.dealType}
              </span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <DealStateBadge layoutId={`deal-status-${deal.id}`} status={deal.status} size="md" />
            </div>
          </div>

          {/* Bottom rule */}
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-5)' }} />
        </motion.header>

        {/* ─── DOCUMENT BODY — numbered sections ─────────────────── */}
        <div>

          {/* 01 — Record Description */}
          <DocSection number="01" label="Record Description">
            <p
              style={{
                fontSize: 'var(--text-md)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.75,
                margin: 0,
                maxWidth: 680,
              }}
            >
              {deal.description}
            </p>
          </DocSection>

          {/* 02 — Parties */}
          <DocSection number="02" label="Parties to this Record">
            <div>
              {deal.parties.map((party) => (
                <PartyRow key={party.id} party={party} />
              ))}
            </div>
          </DocSection>

          {/* 03 — Record of Proceedings */}
          <DocSection number="03" label="Record of Proceedings">
            {eventsToShow.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
                No proceedings recorded in this matter.
              </p>
            ) : (
              <>
                <DealTimeline steps={timelineSteps} currentId={latestEventId} />
                {historyError && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 'var(--space-3)', fontStyle: 'italic' }}>
                    proceedings log sourced from embedded record
                  </p>
                )}
              </>
            )}
          </DocSection>

          {/* 04 — Documents */}
          <DocSection number="04" label="Documents">
            {deal.documents.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
                No documents appended to this record.
              </p>
            ) : (
              <div>
                {deal.documents.map((doc) => (
                  <DocumentRow key={doc.id} document={doc} />
                ))}
              </div>
            )}
          </DocSection>
        </div>

        {/* ─── STATUS + ACTIONS + DATES ────────────────────────── */}
        <div
          style={{
            marginTop: 'var(--space-7)',
            paddingTop: 'var(--space-6)',
            borderTop: '1px solid var(--color-border-strong)',
            display: 'grid',
            gridTemplateColumns: '1fr 280px',
            gap: 'var(--space-7)',
            alignItems: 'start',
          }}
          className="ledger-record-actions"
        >
          {/* Left: status + actions */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-text-faint)', marginBottom: 'var(--space-4)' }}>
              Record Status
            </div>
            <DealStateTimeline currentStatus={deal.status} />

            {statusConfig?.isTerminal && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-4)', fontStyle: 'italic', maxWidth: 480 }}>
                This record has reached a terminal state. No further action is recorded.
              </p>
            )}

            {/* Record actions */}
            <div style={{ marginTop: 'var(--space-6)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-text-faint)', marginBottom: 'var(--space-3)' }}>
                Record Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: 400 }}>
                {loadingActions ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    Determining available actions…
                  </p>
                ) : actionsError ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    Unable to determine available actions.{" "}
                    <button onClick={refetch} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline' }}>
                      Retry
                    </button>
                  </p>
                ) : availableActions.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    No actions available at this stage.
                  </p>
                ) : (
                  availableActions.map((action) => (
                    <Button
                      key={action}
                      variant={actionVariant(action)}
                      onClick={() => handleAction(action)}
                      loading={actionInFlight === action}
                      disabled={actionInFlight !== null && actionInFlight !== action}
                    >
                      {ACTION_LABELS[action] ?? action}
                    </Button>
                  ))
                )}
                <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-1) 0' }} />
                <Button variant="secondary" onClick={() => setModalOpen(true)}>View Full Record</Button>
                <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Official Log</Button>
                {deal.documents.length > 0 && (
                  <Button variant="ghost">Download Documents</Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: key dates */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-text-faint)', marginBottom: 'var(--space-4)' }}>
              Record Dates
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
              <DateRow label="Established" value={deal.createdAt} />
              <DateRow label="Last Amended" value={deal.updatedAt} />
              {deal.dueDate && <DateRow label="Due Date" value={deal.dueDate} />}
              {deal.closeDate && <DateRow label="Closed" value={deal.closeDate} />}
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL: Full Record Certificate ──────────────────── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} ariaLabel="Full record certificate">
        <div style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {deal.title}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', letterSpacing: '0.06em' }}>
                #{deal.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
            <button onClick={() => setModalOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 18, lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>
              ×
            </button>
          </div>
          <div>
            <DetailRow label="Record Amount" value={deal.amountFormatted} />
            <DetailRow label="Record Type" value={deal.dealType ?? '—'} />
            <DetailRow label="Source" value={deal.source ?? '—'} />
            <DetailRow label="Current Status" value={statusConfig?.label ?? deal.status} />
            <DetailRow label="Established" value={formatDate(deal.createdAt)} />
            <DetailRow label="Last Amended" value={formatDate(deal.updatedAt)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* ─── DRAWER: Official Log ──────────────────────────────── */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" ariaLabel="Official record log">
        <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                Official Log
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
                #{deal.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
            <button onClick={() => setDrawerOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}>
              ×
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)' }} />
          {eventsToShow.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              No entries in the official log.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, overflowY: 'auto' }}>
              {eventsToShow.slice().reverse().map((event) => (
                <div
                  key={event.id}
                  style={{ paddingLeft: 'var(--space-4)', borderLeft: '2px solid var(--color-border)' }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                    {event.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTimestamp(event.timestamp)}
                    {event.actor && ` · ${event.actor}`}
                  </div>
                  {event.description && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                      {event.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Close</Button>
        </div>
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-row components
// ---------------------------------------------------------------------------

function DocumentRow({ document: doc }: { document: DealDocument }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.name}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {doc.size} · Appended {formatTimestamp(doc.uploadedAt)}
        </span>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          padding: '2px 6px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
          flexShrink: 0,
          letterSpacing: '0.04em',
        }}
      >
        {doc.type}
      </span>
    </div>
  );
}

function PartyRow({ party }: { party: DealParty }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 'var(--space-4)',
        alignItems: 'start',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          paddingTop: 2,
        }}
      >
        {party.role}
      </span>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {party.name}
        </div>
        {party.email && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {party.email}
          </div>
        )}
      </div>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: 'var(--space-2) var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        gap: 'var(--space-4)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
        {formatDate(value)}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 'var(--space-4)',
        padding: 'var(--space-2) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event → TimelineStep conversion
// ---------------------------------------------------------------------------

function eventToStep(event: DealEvent): TimelineStep {
  const statusMap: Record<string, Status> = {
    created: 'completed',
    submitted: 'submitted',
    accepted: 'accepted',
    funded: 'funded',
    in_progress: 'in_progress',
    review_started: 'pending',
    approved: 'approved',
    disputed: 'disputed',
    resolved: 'resolved',
    completed: 'completed',
  };

  return {
    id: event.id,
    label: event.label,
    status: statusMap[event.type] ?? 'pending',
    timestamp: formatTimestamp(event.timestamp),
    actor: event.actor,
  };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
