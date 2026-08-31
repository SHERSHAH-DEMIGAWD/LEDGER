/**
 * pages/DealDetailPage.tsx
 *
 * Detail view for a single deal.
 *
 * Uses:
 *   - useDeal() hook for data
 *   - DealStateBadge + DealStateTimeline for status display
 *   - DealDetailSkeleton / ErrorState for loading/error
 *   - DealStateTimeline — the horizontal state machine
 *   - DealTimeline — the activity event list
 *
 * Demonstrates shared element transitions from deal card → deal detail
 * using layoutId (from DashboardPage/DealsPage cards).
 *
 * The frontend is purely presentational — all status values come from the
 * authoritative backend, never inferred.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { DealTimeline } from '../motion/DealTimeline';
import { DealStateTimeline } from '../motion/DealStateTimeline';
import { Modal, Drawer, Reveal, Stack, StackItem, Card } from '../motion/components';
import { Button } from '../components/ui';
import { DealStateBadge } from '../components/DealStateBadge';
import { DealDetailSkeleton, ErrorState, EmptyState } from '../components/DealStateViews';
import { useDeal } from '../hooks/useDeal';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';
import { getDealStateConfig, DEAL_STATE_ORDER, type DealStatus } from '../types/dealStates';
import type { Deal, DealDocument, DealParty, DealEvent } from '../types/deal';

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading, error, notFound, refetch } = useDeal(id);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduced = useReducedMotion();

  // Not found
  if (!loading && notFound) {
    return (
      <div
        style={{
          maxWidth: 'var(--layout-max-width)',
          margin: '0 auto',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <Link
          to="/deals"
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--text-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}
        >
          ← Back to deals
        </Link>
        <EmptyState
          title="Deal not found"
          description={`No deal with ID "${id}" exists or it has been removed.`}
          action={
            <Link to="/deals" style={{ textDecoration: 'none' }}>
              <Button size="sm" variant="secondary">
                ← Back to deals
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  // Loading
  if (loading) {
    return <DealDetailSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div
        style={{
          maxWidth: 'var(--layout-max-width)',
          margin: '0 auto',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <Link
          to="/deals"
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--text-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            marginBottom: 'var(--space-6)',
          }}
        >
          ← Back to deals
        </Link>
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  // Should be impossible — loading=false with deal=null = notFound, caught above
  if (!deal) return null;

  const statusConfig = getDealStateConfig(deal.status);

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
      {/* Back link */}
      <Link
        to="/deals"
        style={{
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-sm)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
        }}
      >
        ← Back to deals
      </Link>

      {/* Header */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.normal, ease: easing.out }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              margin: 0,
            }}
          >
            {deal.title}
          </h1>
          <DealStateBadge
            layoutId={`deal-status-${deal.id}`}
            status={deal.status}
            size="md"
          />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-sm)',
            flexWrap: 'wrap',
          }}
        >
          <span>{deal.counterparties}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{deal.amountFormatted}</span>
          {deal.dealType && <span>{deal.dealType}</span>}
        </div>
      </motion.header>

      {/* Deal state timeline */}
      <Reveal delay={0.05}>
        <Card>
          <div style={{ padding: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-4)' }}>
              Status
            </h2>
            <DealStateTimeline currentStatus={deal.status} />
            {statusConfig?.isTerminal && (
              <p
                style={{
                  margin: 'var(--space-4) 0 0',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                This deal has reached a terminal state. No further action is required.
              </p>
            )}
          </div>
        </Card>
      </Reveal>

      {/* Body — two-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 'var(--space-5)',
        }}
        className="ledger-deal-detail-grid"
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Reveal>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Overview
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {deal.description}
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.05}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-4)' }}>
                  Activity
                </h2>
                <DealTimeline
                  steps={deal.events.map(eventToStep)}
                  currentId={deal.events[deal.events.length - 1]?.id}
                />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Documents
                  {deal.documents.length > 0 && (
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 400,
                        color: 'var(--color-text-tertiary)',
                        marginLeft: 'var(--space-2)',
                      }}
                    >
                      ({deal.documents.length})
                    </span>
                  )}
                </h2>
                {deal.documents.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    No documents attached.
                  </p>
                ) : (
                  <Stack
                    staggerDelay={0.04}
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                  >
                    {deal.documents.map((doc) => (
                      <StackItem key={doc.id}>
                        <DocumentRow document={doc} />
                      </StackItem>
                    ))}
                  </Stack>
                )}
              </div>
            </Card>
          </Reveal>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Reveal delay={0.1}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Actions
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <Button variant="primary" onClick={() => setModalOpen(true)}>
                    View Details
                  </Button>
                  <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                    Activity Log
                  </Button>
                  <Button variant="ghost">Download Documents</Button>
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.15}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Parties
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 400,
                      color: 'var(--color-text-tertiary)',
                      marginLeft: 'var(--space-2)',
                    }}
                  >
                    ({deal.parties.length})
                  </span>
                </h2>
                <Stack
                  staggerDelay={0.04}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
                >
                  {deal.parties.map((party) => (
                    <StackItem key={party.id}>
                      <PartyRow party={party} />
                    </StackItem>
                  ))}
                </Stack>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.2}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Key Dates
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <DateRow label="Created" value={deal.createdAt} />
                  <DateRow label="Last Updated" value={deal.updatedAt} />
                  {deal.dueDate && <DateRow label="Due Date" value={deal.dueDate} />}
                  {deal.closeDate && <DateRow label="Close Date" value={deal.closeDate} />}
                </div>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>

      {/* Modals and drawers */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        ariaLabel="Deal details"
      >
        <div style={{ padding: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
            {deal.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            <DetailRow label="Amount" value={deal.amountFormatted} />
            <DetailRow label="Type" value={deal.dealType ?? '—'} />
            <DetailRow label="Source" value={deal.source ?? '—'} />
            <DetailRow label="Status" value={statusConfig?.label ?? deal.status} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="right"
        ariaLabel="Activity log"
      >
        <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
            Activity Log
          </h2>
          <Stack
            staggerDelay={0.04}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            {deal.events.slice().reverse().map((event) => (
              <StackItem key={event.id}>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 2 }}>
                    {event.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    {formatTimestamp(event.timestamp)}
                    {event.actor && ` · ${event.actor}`}
                  </div>
                  {event.description && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {event.description}
                    </div>
                  )}
                </div>
              </StackItem>
            ))}
          </Stack>
          <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
            Close
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-row components
// ---------------------------------------------------------------------------

function DocumentRow({ document: doc }: { document: DealDocument }) {
  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.name}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {doc.size} · Uploaded {formatTimestamp(doc.uploadedAt)}
        </span>
      </div>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          padding: '2px 6px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          flexShrink: 0,
        }}
      >
        {doc.type}
      </span>
    </div>
  );
}

function PartyRow({ party }: { party: DealParty }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
        {party.name}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        {party.role}
        {party.email && (
          <span style={{ marginLeft: 4 }}>
            · <a href={`mailto:${party.email}`} style={{ color: 'var(--color-text-tertiary)', textDecoration: 'underline' }}>{party.email}</a>
          </span>
        )}
      </span>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {formatDate(value)}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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

import type { TimelineStep } from '../motion/DealTimeline';
import type { Status } from '../motion/StatusBadge';

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
