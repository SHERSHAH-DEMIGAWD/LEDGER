/**
 * pages/DealDetailPage.tsx
 *
 * Demonstrates shared element transitions from deal card → deal detail
 * using layoutId.
 *
 * Replace with real deal detail implementation as the app grows.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge, Status } from '../motion/StatusBadge';
import { DealTimeline, type TimelineStep } from '../motion/DealTimeline';
import { Modal, Drawer, Reveal, Stack, StackItem, Card } from '../motion/components';
import { Button } from '../components/ui';
import { useReducedMotion } from '../motion/hooks';

const MOCK_DEAL: {
  id: string;
  title: string;
  amount: string;
  counterparties: string;
  status: Status;
  description: string;
  parties: { name: string; role: string }[];
  documents: { name: string; type: string }[];
} = {
  id: '1',
  title: 'Seed Bridge Capital — Series A',
  amount: '$1,200,000',
  counterparties: 'Bridge Ventures · Capital Group',
  status: 'pending',
  description:
    'Bridge capital for the Series A round of a high-growth SaaS company. ' +
    'Funds will be held in escrow pending milestone verification.',
  parties: [
    { name: 'Sarah Chen', role: 'Investor Lead' },
    { name: 'James Park', role: 'Founder' },
    { name: 'Lisa Tran', role: 'Legal Counsel' },
  ],
  documents: [
    { name: 'Term Sheet', type: 'PDF' },
    { name: 'Cap Table', type: 'XLSX' },
    { name: 'Due Diligence Report', type: 'PDF' },
  ],
};

const TIMELINE_STEPS: TimelineStep[] = [
  { id: '1', label: 'Deal Created', status: 'completed', timestamp: 'Aug 15, 2026' },
  { id: '2', label: 'Submitted to Investor', status: 'completed', timestamp: 'Aug 16, 2026' },
  { id: '3', label: 'Under Review', status: 'pending', actor: 'Bridge Ventures' },
  { id: '4', label: 'Approved', status: 'accepted' },
  { id: '5', label: 'Funded', status: 'accepted' },
  { id: '6', label: 'Completed', status: 'accepted' },
];

export function DealDetailPage() {
  const { id } = useParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduced = useReducedMotion();

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

      {/* Header — uses layoutId for shared element transition from card */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
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
            {MOCK_DEAL.title}
          </h1>
          <StatusBadge
            layoutId={`deal-status-${id}`}
            status={MOCK_DEAL.status}
            size="md"
          />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span>{MOCK_DEAL.counterparties}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{MOCK_DEAL.amount}</span>
        </div>
      </motion.header>

      {/* Body — two-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 'var(--space-5)',
        }}
        className="ledger-deal-detail-grid"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Reveal>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Overview
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {MOCK_DEAL.description}
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.05}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-4)' }}>
                  Timeline
                </h2>
                <DealTimeline
                  steps={TIMELINE_STEPS}
                  currentId="3"
                />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Documents
                </h2>
                <Stack
                  staggerDelay={0.04}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                >
                  {MOCK_DEAL.documents.map((doc) => (
                    <StackItem key={doc.name}>
                      <div
                        style={{
                          padding: 'var(--space-3) var(--space-4)',
                          background: 'var(--color-surface-2)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{doc.name}</span>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 6px',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          {doc.type}
                        </span>
                      </div>
                    </StackItem>
                  ))}
                </Stack>
              </div>
            </Card>
          </Reveal>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Reveal delay={0.1}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Actions
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <Button variant="primary" onClick={() => setModalOpen(true)}>
                    Approve Deal
                  </Button>
                  <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                    View Activity
                  </Button>
                  <Button variant="ghost">Request Changes</Button>
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.15}>
            <Card>
              <div style={{ padding: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
                  Parties
                </h2>
                <Stack
                  staggerDelay={0.04}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
                >
                  {MOCK_DEAL.parties.map((party) => (
                    <StackItem key={party.name}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          {party.name}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {party.role}
                        </span>
                      </div>
                    </StackItem>
                  ))}
                </Stack>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>

      {/* Modal example */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        ariaLabel="Approve deal"
      >
        <div style={{ padding: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-3)' }}>
            Approve deal
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, marginBottom: 'var(--space-5)' }}>
            This action will move the deal to the next stage. Are you sure you want to proceed?
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Approve
            </Button>
          </div>
        </div>
      </Modal>

      {/* Drawer example */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="right"
        ariaLabel="Activity log"
      >
        <div style={{ padding: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, marginBottom: 'var(--space-4)' }}>
            Activity
          </h2>
          <Stack
            staggerDelay={0.04}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            {['Submitted for review', 'Documents attached', 'Counterparty added', 'Status changed to Pending'].map(
              (event, i) => (
                <StackItem key={i}>
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      background: 'var(--color-surface-2)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {event}
                  </div>
                </StackItem>
              )
            )}
          </Stack>
        </div>
      </Drawer>
    </div>
  );
}
