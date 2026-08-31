/**
 * pages/InvitationsPage.tsx
 *
 * Creator-facing invitation inbox.
 *
 * Lists pending invitations the current creator has been sent.
 * For each invitation, the creator can:
 *   - View the deal terms (brief description + deliverables)
 *   - Accept the invitation (transitions the deal DRAFT → ACCEPTED)
 *   - Decline the invitation (transitions to DECLINED)
 *
 * This page reads from `GET /invitations` and uses
 * `useDealActions` for state transitions.
 *
 * In the mock dataset, the same `dealApi.transitionDeal` is used, with the
 * understanding that in a real backend flow, accept/decline would route
 * through dedicated creator endpoints (out of scope for this slice).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Reveal, Stack, StackItem } from '../motion/components';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { EmptyState, ErrorState } from '../components/DealStateViews';
import { invitationApi, type InvitationSummary } from '../services/invitationApi';
import { dealApi } from '../services/dealApi';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import type { DealAction } from '../types/api';

interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'conflict';
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
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
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
            style={{
              pointerEvents: 'all',
              background:
                toast.kind === 'success'
                  ? 'var(--color-success-bg, #dcfce7)'
                  : toast.kind === 'conflict'
                  ? 'var(--color-warning-bg, #fef9c3)'
                  : 'var(--color-error-bg, #fee2e2)',
              border: `1px solid ${
                toast.kind === 'success'
                  ? 'var(--color-success-border, #86efac)'
                  : toast.kind === 'conflict'
                  ? 'var(--color-warning-border, #fde047)'
                  : 'var(--color-error-border, #fca5a5)'
              }`,
              borderRadius: 'var(--radius-md)',
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
                color:
                  toast.kind === 'success'
                    ? 'var(--color-success-text, #166534)'
                    : toast.kind === 'conflict'
                    ? 'var(--color-warning-text, #854d0e)'
                    : 'var(--color-error-text, #991b1b)',
                flex: 1,
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
                color: 'inherit',
                fontSize: 'var(--text-lg)',
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        ))}
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

  const handleAction = async (invitationId: string, action: DealAction) => {
    setActionInFlight(invitationId);
    try {
      const result = await dealApi.transitionDeal(invitationId, action);
      if (result.ok) {
        addToast(
          action === 'ACCEPT' ? 'Invitation accepted.' : 'Invitation declined.',
          'success'
        );
        // Refresh the list to remove the now-resolved invitation
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
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>
            Invitations
          </h1>
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Review and respond to deal invitations sent to you.
          </p>
        </motion.header>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              padding: 'var(--space-7)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <motion.div
              animate={reduced ? {} : { opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Loading invitations…
            </motion.div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <ErrorState message={error} onRetry={fetchInvitations} />
        )}

        {/* Empty state */}
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

        {/* Invitation list */}
        {!loading && !error && invitations && invitations.length > 0 && (
          <Reveal>
            <Stack
              staggerDelay={0.06}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              {invitations.map((inv) => (
                <StackItem key={inv.id}>
                  <InvitationCard
                    invitation={inv}
                    onAccept={() => handleAction(inv.id, 'ACCEPT')}
                    onDecline={() => handleAction(inv.id, 'DECLINE')}
                    isLoading={actionInFlight === inv.id}
                    disabled={actionInFlight !== null && actionInFlight !== inv.id}
                  />
                </StackItem>
              ))}
            </Stack>
          </Reveal>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function InvitationCard({
  invitation,
  onAccept,
  onDecline,
  isLoading,
  disabled,
}: {
  invitation: InvitationSummary;
  onAccept: () => void;
  onDecline: () => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  return (
    <Card>
      <div
        style={{
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {/* Top row: title + status badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              margin: 0,
            }}
          >
            {invitation.title}
          </h2>
          <DealStateBadge status={invitation.status as never} size="sm" />
        </div>

        {/* Description */}
        <p
          style={{
            color: 'var(--color-text-secondary)',
            margin: 0,
            fontSize: 'var(--text-sm)',
            lineHeight: 1.6,
          }}
        >
          {invitation.description}
        </p>

        {/* Metadata row */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-tertiary)',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {invitation.amountFormatted}
          </span>
          <span>{invitation.deliverableCount} deliverable{invitation.deliverableCount !== 1 ? 's' : ''}</span>
          <span>From Brand {invitation.brandId.slice(0, 8)}</span>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="secondary"
            onClick={onDecline}
            loading={isLoading}
            disabled={disabled}
          >
            Decline
          </Button>
          <Button
            variant="primary"
            onClick={onAccept}
            loading={isLoading}
            disabled={disabled}
          >
            Accept
          </Button>
        </div>
      </div>
    </Card>
  );
}
