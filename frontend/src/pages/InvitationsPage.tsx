/**
 * pages/InvitationsPage.tsx
 *
 * Creator-facing invitation inbox.
 *
 * Lists pending invitations the current creator has been sent.
 * For each invitation, the creator can:
 *   - View the deal terms (brief description + deliverables)
 *   - Accept the invitation  → POST /invitations/:id/accept
 *   - Decline the invitation → POST /invitations/:id/decline
 *
 * This page reads from `GET /invitations` and uses `invitationApi`
 * for accept/decline actions. Transitions are handled by the dedicated
 * invitation endpoints, not by the generic deal transition endpoint.
 *
 * Visual treatment: a docket of pending matters, ruled register, parchment
 * surfaces, restrained action set. Matches the institutional ledger system.
 *
 * Mock mode (VITE_USE_MOCK_DEALS !== 'false'): actions no-op locally.
 * Real backend mode: actions call the correct invitation-specific routes.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton } from '../motion/components';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { EmptyState, ErrorState } from '../components/DealStateViews';
import { invitationApi, type InvitationSummary } from '../services/invitationApi';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';

interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'conflict';
}

const TOAST_STYLES: Record<Toast['kind'], { border: string }> = {
  success: { border: 'var(--color-status-approved)' },
  conflict: { border: 'var(--color-status-pending)' },
  error: { border: 'var(--color-status-disputed)' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const reduced = useReducedMotion();

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
          const style = TOAST_STYLES[toast.kind];
          return (
            <motion.div
              key={toast.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
              transition={{ duration: duration.normal, ease: easing.out }}
              style={{
                pointerEvents: 'all',
                background: 'var(--color-parchment-cream)',
                border: `1px solid ${style.border}`,
                borderLeft: `3px solid ${style.border}`,
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                minWidth: 280,
                maxWidth: 380,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                  flex: 1,
                  fontWeight: 500,
                }}
              >
                {toast.message}
              </span>
              <button
                onClick={() => onDismiss(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-lg)',
                  lineHeight: 1,
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

export function InvitationsPage() {
  const reduced = useReducedMotion();
  const [invitations, setInvitations] = useState<InvitationSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fetchInvitations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invitationApi.listInvitations();
      setInvitations(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load invitations. Please try again.'
      );
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const addToast = (message: string, kind: Toast['kind'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => dismissToast(id), 5000);
  };

  const dismissToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const handleAccept = async (invitationId: string) => {
    setActionInFlight(invitationId);
    try {
      const result = await invitationApi.acceptInvitation(invitationId);
      if (result.ok) {
        addToast('Invitation accepted.', 'success');
        await fetchInvitations();
      } else {
        addToast(result.message, result.kind === 'conflict' ? 'conflict' : 'error');
      }
    } finally {
      setActionInFlight(null);
    }
  };

  const handleDecline = async (invitationId: string) => {
    setActionInFlight(invitationId);
    try {
      const result = await invitationApi.declineInvitation(invitationId);
      if (result.ok) {
        addToast('Invitation declined.', 'success');
        await fetchInvitations();
      } else {
        addToast(result.message, result.kind === 'conflict' ? 'conflict' : 'error');
      }
    } finally {
      setActionInFlight(null);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div
        style={{
          maxWidth: 'var(--layout-max-width)',
          margin: '0 auto',
          padding: 'var(--space-7) var(--space-6) var(--space-8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* ─── HEADER ─────────────────────────────────────────────── */}
        <motion.header
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: easing.out }}
        >
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
            Pending Matters
          </div>
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
            Invitations
          </h1>
          <p
            style={{
              color: 'var(--color-text-tertiary)',
              fontSize: 'var(--text-sm)',
              margin: 'var(--space-2) 0 0',
              maxWidth: 520,
            }}
          >
            Review and respond to deal invitations sent to you.
          </p>
          <div
            style={{
              borderTop: '1px solid var(--color-border-strong)',
              marginTop: 'var(--space-5)',
            }}
          />
        </motion.header>

        {/* ─── LOADING ────────────────────────────────────────────── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  padding: 'var(--space-5) 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <Skeleton width="40%" height={18} />
                  <Skeleton width="80%" height={13} />
                  <Skeleton width="55%" height={13} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-4)',
                    paddingTop: 'var(--space-2)',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  <Skeleton width={80} height={12} />
                  <Skeleton width={80} height={12} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── ERROR ─────────────────────────────────────────────── */}
        {!loading && error && <ErrorState message={error} onRetry={fetchInvitations} />}

        {/* ─── EMPTY ──────────────────────────────────────────────── */}
        {!loading && !error && invitations && invitations.length === 0 && (
          <EmptyState
            title="No pending invitations"
            description="When brands invite you to a deal, it will appear here for review."
            action={
              <Link to="/deals" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm">
                  View all deals
                </Button>
              </Link>
            }
          />
        )}

        {/* ─── INVITATION LIST ────────────────────────────────────── */}
        {!loading && !error && invitations && invitations.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Column headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 130px 130px',
                gap: 'var(--space-3)',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border-strong)',
              }}
            >
              {['Invitation', 'Amount', 'Status'].map((h) => (
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

            {invitations.map((inv, i) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                index={i}
                onAccept={() => handleAccept(inv.id)}
                onDecline={() => handleDecline(inv.id)}
                isLoading={actionInFlight === inv.id}
                disabled={actionInFlight !== null && actionInFlight !== inv.id}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// InvitationRow — a single ruled invitation entry
// ---------------------------------------------------------------------------

function InvitationRow({
  invitation,
  index,
  onAccept,
  onDecline,
  isLoading,
  disabled,
}: {
  invitation: InvitationSummary;
  index: number;
  onAccept: () => void;
  onDecline: () => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.out, delay: index * 0.04 }}
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: 'var(--space-5) 0',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 130px 130px',
          gap: 'var(--space-3)',
          alignItems: 'start',
        }}
      >
        {/* Invitation text */}
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              margin: 0,
              marginBottom: 'var(--space-1)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {invitation.title}
          </h3>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              margin: 0,
              fontSize: 'var(--text-sm)',
              lineHeight: 1.6,
              marginBottom: 'var(--space-3)',
            }}
          >
            {invitation.description}
          </p>

          {/* Metadata row */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span>
              {invitation.deliverableCount} deliverable{invitation.deliverableCount !== 1 ? 's' : ''}
            </span>
            <span>From Brand {invitation.brandId.slice(0, 8)}</span>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onDecline}
              loading={isLoading}
              disabled={disabled}
            >
              Decline
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onAccept}
              loading={isLoading}
              disabled={disabled}
            >
              Accept
            </Button>
          </div>
        </div>

        {/* Amount */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}
        >
          {invitation.amountFormatted}
        </div>

        {/* Status */}
        <div>
          <DealStateBadge status={invitation.status as never} size="sm" />
        </div>
      </div>
    </motion.div>
  );
}
