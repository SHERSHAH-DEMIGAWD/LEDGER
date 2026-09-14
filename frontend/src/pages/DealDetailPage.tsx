/**
 * pages/DealDetailPage.tsx
 *
 * Casebook Contractual Record View (Reference Image 2).
 *
 * Rendered as an open physical casebook page:
 *   - Left binding seam shadow
 *   - Right edge paper-stack depth effect
 *   - Protruding right-hand bookmark navigation tabs
 *   - Ceremonial Embossed Wax Seal
 *   - Header: ← BACK TO REGISTER, RECORD NO. 001, CREATED / LAST UPDATED
 *   - 2-Column Document Grid: Articles (Scope, Documents, Parties) + Record History Timeline
 *   - Top Right Navigation: ▲ PREVIOUS | NEXT ▼
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
import type { DealEvent } from '../types/deal';
import type { DealAction } from '../types/api';
import { DealEntryView } from '../components/DealEntryView';
import { useAuth } from '../contexts/AuthContext';

interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'conflict';
}

const ENTRY_STATUSES = ['DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'DECLINED', 'CANCELLED'];

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
              role={toast.kind === 'success' ? 'status' : 'alert'}
              aria-atomic="true"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2, ease: easing.out }}
              style={{
                pointerEvents: 'all',
                background: 'var(--color-parchment-cream)',
                border: `1px solid ${s.border}`,
                borderLeft: `3px solid ${s.accent}`,
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                minWidth: 280,
                maxWidth: 360,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-primary)', flex: 1, lineHeight: 1.5 }}>
                {toast.message}
              </span>
              <button
                onClick={() => onDismiss(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-ink-muted)',
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

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading, refreshing, error, notFound, refetch } = useDeal(id);
  const { availableActions, loadingActions, actionsError, performAction, refetchActions } = useDealActions(id, deal?.status, deal?.updatedAt);
  const { user } = useAuth();
  const { deals: allDeals } = useDeals();
  const { recordNavigation } = useDealNavigation();
  const navigate = useNavigate();

  const [historyEvents, setHistoryEvents] = useState<DealEvent[] | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<DealAction | null>(null);
  const actionLock = useRef(false);
  const reduced = useReducedMotion();
  const isEntryRecord = !!deal && ENTRY_STATUSES.includes(deal.status);

  const currentIndex = id ? allDeals.findIndex((d) => d.id === id) : -1;
  const hasNext = currentIndex >= 0 && currentIndex < allDeals.length - 1;
  const hasPrev = currentIndex > 0;
  const nextDeal = hasNext ? allDeals[currentIndex + 1] : null;
  const prevDeal = hasPrev ? allDeals[currentIndex - 1] : null;

  const goToNext = useCallback(() => {
    if (!nextDeal) return;
    recordNavigation('next-record');
    navigate(`/deals/${nextDeal.id}`);
  }, [nextDeal, recordNavigation, navigate]);

  const goToPrev = useCallback(() => {
    if (!prevDeal) return;
    recordNavigation('prev-record');
    navigate(`/deals/${prevDeal.id}`);
  }, [prevDeal, recordNavigation, navigate]);

  const backToRegister = () => {
    recordNavigation('backward');
    navigate('/');
  };

  // Keyboard navigation
  useEffect(() => {
    if (isEntryRecord) return;
    function handleKey(e: KeyboardEvent) {
      if (modalOpen || drawerOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
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
  }, [hasNext, hasPrev, goToNext, goToPrev, modalOpen, drawerOpen, isEntryRecord]);

  // Scoped Wheel Navigation
  useEffect(() => {
    if (isEntryRecord) return;
    let isThrottled = false;

    function handleWheel(e: WheelEvent) {
      if (modalOpen || drawerOpen || isThrottled) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable)
      ) {
        return;
      }

      const mainEl = document.querySelector('main');
      if (!mainEl) return;

      const isAtBottom = mainEl.scrollHeight - mainEl.scrollTop <= mainEl.clientHeight + 10;
      const isAtTop = mainEl.scrollTop <= 10;

      if (e.deltaY > 80 && isAtBottom && hasNext) {
        isThrottled = true;
        goToNext();
        setTimeout(() => { isThrottled = false; }, 900);
      } else if (e.deltaY < -80 && isAtTop && hasPrev) {
        isThrottled = true;
        goToPrev();
        setTimeout(() => { isThrottled = false; }, 900);
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [hasNext, hasPrev, goToNext, goToPrev, modalOpen, drawerOpen, isEntryRecord]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setHistoryEvents(null);
    async function loadHistory() {
      const result = await dealApi.getDealHistory(id as string);
      if (!cancelled && result.ok) {
        setHistoryEvents(result.data);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [id, historyTick, user?.id, deal?.updatedAt]);

  const refreshRecord = () => {
    refetch();
    refetchActions();
    setHistoryTick((tick) => tick + 1);
  };

  const addToast = (message: string, kind: Toast['kind'] = 'success') => {
    const toastId = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id: toastId, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 5000);
  };

  const handleAction = async (action: DealAction) => {
    if (actionLock.current || loadingActions || refreshing) return;
    actionLock.current = true;
    setActionInFlight(action);
    try {
      const result = await performAction(action, refetch);
      if (result.success) {
        addToast(result.message, 'success');
        setHistoryTick((t) => t + 1);
      } else {
        addToast(result.message, result.isConflict ? 'conflict' : 'error');
      }
    } finally {
      setHistoryTick((tick) => tick + 1);
      actionLock.current = false;
      setActionInFlight(null);
    }
  };

  if (!loading && notFound) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-7) var(--space-5)' }}>
        <button onClick={backToRegister} style={{ color: 'var(--color-ink-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          ← Back to Register
        </button>
        <EmptyState title="Record Not Found" description={`No record matching ID "${id}" exists in this archive.`} />
      </div>
    );
  }

  if (loading) return <DealDetailSkeleton />;
  if (error || !deal) return <ErrorState message={error || 'Failed to load record'} onRetry={refetch} />;

  if (isEntryRecord) {
    return <>
      <ToastContainer toasts={toasts} onDismiss={(toastId) => setToasts((items) => items.filter((item) => item.id !== toastId))} />
      <DealEntryView key={deal.id} deal={deal} actions={availableActions} checkingActions={loadingActions || refreshing} actionsError={actionsError} actionInFlight={actionInFlight} events={historyEvents} onAction={handleAction} onRefresh={refreshRecord} onNotice={addToast} />
    </>;
  }

  const statusConfig = getDealStateConfig(deal.status);
  const brandParty = deal.parties.find((p) => p.role.toLowerCase().includes('brand'));
  const creatorParty = deal.parties.find((p) => p.role.toLowerCase().includes('creator'));

  const eventsToShow = historyEvents !== null ? historyEvents : deal.events;
  const formattedRecordNo = String(currentIndex >= 0 ? currentIndex + 1 : 1).padStart(3, '0');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#120e0b',
        padding: 'var(--space-5) var(--space-6) var(--space-8)',
        color: 'var(--color-ink-primary)',
        position: 'relative',
      }}
    >
      <ToastContainer toasts={toasts} onDismiss={(tId) => setToasts((prev) => prev.filter((t) => t.id !== tId))} />

      <div style={{ maxWidth: 960, margin: '0 auto', position: 'relative' }}>
        {/* Protruding Right Bookmarks (REFERENCE IMAGE 2) */}
        <div
          style={{
            position: 'absolute',
            right: -52,
            top: 60,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            zIndex: 30,
          }}
        >
          <button className="bookmark-tab">Overview</button>
          <button className="bookmark-tab">Deliverables</button>
          <button className="bookmark-tab">Payments</button>
          <button className="bookmark-tab">Files</button>
          <button className="bookmark-tab" onClick={() => setDrawerOpen(true)}>History</button>
        </div>

        {/* ─── PHYSICAL OPEN CASEBOOK PAGE (REFERENCE IMAGE 2) ────────────── */}
        <motion.div
          className="paper-stack-effect"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: easing.out }}
          style={{
            background: 'var(--color-parchment-cream)',
            border: '1px solid #c8bda8',
            borderRadius: '2px 4px 4px 2px',
            padding: 'var(--space-6) var(--space-7)',
            position: 'relative',
          }}
        >
          {/* Left Book Binding Seam Gradient */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 24,
              background: 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 40%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* ─── TOP CONTROL BAR ─────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-6)',
              paddingBottom: 'var(--space-3)',
              borderBottom: '1px solid #c9bfb0',
              fontSize: 'var(--text-xs)',
            }}
          >
            <button
              onClick={backToRegister}
              style={{
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-ink-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              ← BACK TO REGISTER
            </button>

            {/* Top-Right Navigation: ▲ PREVIOUS | NEXT ▼ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <button
                onClick={goToPrev}
                disabled={!hasPrev}
                style={{
                  opacity: hasPrev ? 1 : 0.35,
                  cursor: hasPrev ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-ink-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ▲ PREVIOUS
              </button>
              <button
                onClick={goToNext}
                disabled={!hasNext}
                style={{
                  opacity: hasNext ? 1 : 0.35,
                  cursor: hasNext ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-ink-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                NEXT ▼
              </button>
              <button
                onClick={() => setModalOpen(true)}
                style={{ fontSize: 16, color: 'var(--color-ink-muted)', cursor: 'pointer' }}
                title="Options"
              >
                ⋮
              </button>
            </div>
          </div>

          {/* ─── RECORD HEADER & TITLE BLOCK ────────────────────────────── */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-6)' }}>
            {/* Ceremonial Wax Seal Stamp Top Right */}
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: '1.5px solid #8b6508',
                background: 'radial-gradient(circle, rgba(139,101,8,0.12) 0%, rgba(139,101,8,0.03) 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.8,
                transform: 'rotate(-6deg)',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.12em', color: '#8b6508', textTransform: 'uppercase' }}>
                VERITAS
              </span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#8b6508" strokeWidth="0.8" opacity="0.6" />
                <path d="M6 18V10L12 6L18 10V18" stroke="#8b6508" strokeWidth="1.2" />
                <line x1="9" y1="13" x2="15" y2="13" stroke="#8b6508" strokeWidth="0.8" />
              </svg>
              <span style={{ fontSize: 5, fontWeight: 700, letterSpacing: '0.1em', color: '#8b6508', textTransform: 'uppercase' }}>
                PACTA SERVANDA
              </span>
            </div>

            {/* Record No & Dates */}
            <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)' }}>
                  RECORD NO.
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, lineHeight: 1.1 }}>
                  {formattedRecordNo}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)' }}>
                  CREATED
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, marginTop: 4 }}>
                  {formatDateShort(deal.createdAt)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)' }}>
                  LAST UPDATED
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, marginTop: 4 }}>
                  {formatDateShort(deal.updatedAt)}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-ink-muted)', marginBottom: 2 }}>
              {deal.dealType?.toUpperCase() || 'CREATOR PARTNERSHIP AGREEMENT'}
            </div>

            {/* Main Title */}
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(24px, 3.5vw, 36px)',
                fontWeight: 600,
                margin: '0 0 var(--space-5)',
                lineHeight: 1.15,
                color: 'var(--color-ink-primary)',
              }}
            >
              {deal.title}
            </h1>

            {/* Parties Register Display */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 30px 1fr',
                alignItems: 'center',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-parchment-warm)',
                border: '1px solid #c4b396',
                borderRadius: 2,
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-ink-muted)' }}>
                  {brandParty?.role?.toUpperCase() || 'BRAND'}
                </div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-ink-primary)' }}>
                  {brandParty?.name || 'Brand Entity'}
                </div>
                {brandParty?.email && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{brandParty.email}</div>}
              </div>
              <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--color-ink-muted)' }}>✕</div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-ink-muted)' }}>
                  {creatorParty?.role?.toUpperCase() || 'CREATOR'}
                </div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-ink-primary)' }}>
                  {creatorParty?.name || 'Creator'}
                </div>
                {creatorParty?.email && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{creatorParty.email}</div>}
              </div>
            </div>

            {/* Metadata Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'var(--space-2)',
                padding: 'var(--space-3) 0',
                borderTop: '1px solid #c9bfb0',
                borderBottom: '1px solid #c9bfb0',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-ink-muted)' }}>
                  STATUS
                </div>
                <div style={{ marginTop: 4 }}>
                  <DealStateBadge status={deal.status} size="sm" />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-ink-muted)' }}>
                  VALUE
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {deal.amountFormatted}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-ink-muted)' }}>
                  EFFECTIVE DATE
                </div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{formatDateShort(deal.createdAt)}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-ink-muted)' }}>
                  DUE / CLOSE
                </div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>
                  {deal.dueDate ? formatDateShort(deal.dueDate) : deal.closeDate ? formatDateShort(deal.closeDate) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ─── TWO-COLUMN CONTENT GRID ─────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr',
              gap: 'var(--space-7)',
            }}
          >
            {/* Left Column: Articles */}
            <div>
              {/* ARTICLE I: SCOPE */}
              <section style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)', marginBottom: 4 }}>
                  ARTICLE I
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 var(--space-2)' }}>
                  SCOPE OF WORK
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.65, color: 'var(--color-ink-secondary)', margin: 0 }}>
                  {deal.description || 'No descriptive scope provided in the record.'}
                </p>
              </section>

              {/* ARTICLE II: DOCUMENTS */}
              {deal.documents && deal.documents.length > 0 && (
                <section style={{ marginBottom: 'var(--space-6)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)', marginBottom: 4 }}>
                    ARTICLE II
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 var(--space-2)' }}>
                    RECORD DOCUMENTS
                  </h2>
                  <div style={{ border: '1px solid #c4b396', borderRadius: 2, overflow: 'hidden' }}>
                    {deal.documents.map((doc, idx) => (
                      <div key={doc.id || idx} style={{ padding: '8px 12px', borderBottom: idx < deal.documents.length - 1 ? '1px solid #c9bfb0' : 'none', fontSize: 'var(--text-xs)', display: 'flex', justifyContent: 'space-between', background: 'var(--color-parchment-warm)' }}>
                        <span style={{ fontWeight: 600 }}>{doc.name}</span>
                        <span style={{ color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>{doc.type} · {doc.size}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ARTICLE III: PARTIES */}
              <section style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)', marginBottom: 4 }}>
                  ARTICLE III
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 var(--space-3)' }}>
                  REGISTERED PARTIES
                </h2>
                <div style={{ border: '1px solid #c4b396', borderRadius: 2, overflow: 'hidden', fontSize: 'var(--text-xs)' }}>
                  {deal.parties.map((party, idx) => (
                    <div key={party.id || idx} style={{ padding: '8px 12px', borderBottom: idx < deal.parties.length - 1 ? '1px solid #c9bfb0' : 'none', display: 'flex', justifyContent: 'space-between', background: 'var(--color-parchment-warm)' }}>
                      <span style={{ fontWeight: 700 }}>{party.role}</span>
                      <span>{party.name} {party.email && `(${party.email})`}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* NEXT ACTION CALLOUT BOX */}
              <div
                style={{
                  background: 'var(--color-parchment-warm)',
                  border: '1px solid #c4b396',
                  borderRadius: 2,
                  padding: 'var(--space-4) var(--space-5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                }}
              >
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)', marginBottom: 2 }}>
                    NEXT ACTION
                  </div>
                  {deal.fundingStatus && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
                      Funding: {deal.fundingStatus.replace(/_/g, ' ')} · Accepted amount: {deal.amountFormatted}
                      {deal.paymentStatus === 'PENDING' && <div>Payment pending — funding is not yet confirmed.</div>}
                      {deal.paymentId && <div>Payment: {deal.paymentStatus} · {deal.paymentId}</div>}
                    </div>
                  )}
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
                    {statusConfig?.isTerminal
                      ? 'This record has reached a completed terminal state.'
                      : loadingActions
                      ? 'Determining available actions...'
                      : actionsError
                      ? 'Action check failed.'
                      : 'Execute the available action to progress this record.'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {availableActions.map((action) => (
                    <Button
                      key={action}
                      variant={actionVariant(action)}
                      onClick={() => handleAction(action)}
                      loading={actionInFlight === action}
                      disabled={loadingActions || actionInFlight !== null || (action === 'FUND' && deal.paymentStatus === 'PENDING')}
                      size="sm"
                    >
                      {ACTION_LABELS[action] ?? action} →
                    </Button>
                  ))}
                  {availableActions.length === 0 && !statusConfig?.isTerminal && (
                    <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
                      Official Log
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Timeline */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-ink-muted)', marginBottom: 'var(--space-3)' }}>
                RECORD HISTORY
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {eventsToShow.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', fontStyle: 'italic' }}>
                    No historical entries recorded.
                  </div>
                ) : (
                  eventsToShow.map((evt, idx) => (
                    <TimelineStepRow
                      key={evt.id || idx}
                      index={idx + 1}
                      title={evt.label}
                      timestamp={formatTimestamp(evt.timestamp)}
                      actor={evt.actor}
                      isCompleted={true}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Full Record Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} ariaLabel="Record Certificate">
        <div style={{ padding: 'var(--space-6)', background: 'var(--color-parchment-cream)', color: 'var(--color-ink-primary)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: '0 0 var(--space-4)' }}>
            Official Record Certificate #{formattedRecordNo}
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
            Title: {deal.title}<br />
            Amount: {deal.amountFormatted}<br />
            Status: {deal.status}<br />
            Parties: {deal.counterparties}
          </p>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Official Log Drawer */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" ariaLabel="Official Log">
        <div style={{ padding: 'var(--space-5)', background: 'var(--color-parchment-cream)', color: 'var(--color-ink-primary)', height: '100%' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', margin: '0 0 var(--space-4)' }}>
            Official Audit Log
          </h3>
          {eventsToShow.map((e) => (
            <div key={e.id} style={{ marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid #c9bfb0' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{e.label}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>{formatTimestamp(e.timestamp)} - {e.actor}</div>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Close</Button>
        </div>
      </Drawer>
    </div>
  );
}

function TimelineStepRow({
  index,
  title,
  timestamp,
  actor,
  isCompleted,
}: {
  index: number;
  title: string;
  timestamp: string;
  actor?: string;
  isCompleted: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: isCompleted ? '#4a3b2c' : 'transparent',
          border: isCompleted ? 'none' : '1px dashed var(--color-ink-muted)',
          color: isCompleted ? '#f5f0e8' : 'var(--color-ink-muted)',
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {String(index).padStart(2, '0')}
      </div>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: isCompleted ? 'var(--color-ink-primary)' : 'var(--color-ink-muted)' }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>
          {timestamp} {actor && `· By ${actor}`}
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
