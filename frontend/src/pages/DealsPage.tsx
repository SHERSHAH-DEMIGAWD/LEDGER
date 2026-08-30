/**
 * pages/DealsPage.tsx
 *
 * Demonstrates stacked layout animations and filters with DealTimeline.
 * Replace with real deals page as the app grows.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Stack, StackItem, Card, Expand, Reveal } from '../motion/components';
import { StatusBadge, Status } from '../motion/StatusBadge';
import { DealTimeline, type TimelineStep } from '../motion/DealTimeline';
import { Button, Spacer } from '../components/ui';
import { useReducedMotion } from '../motion/hooks';

const ALL_DEALS = [
  {
    id: '1',
    title: 'Seed Bridge Capital — Series A',
    amount: '$1,200,000',
    counterparties: 'Bridge Ventures · Capital Group',
    status: 'pending' as Status,
    updatedAt: '2 hours ago',
  },
  {
    id: '2',
    title: 'Northbrook Acquisition — Series B',
    amount: '$3,500,000',
    counterparties: 'Northbrook Partners · Apex Fund',
    status: 'funded' as Status,
    updatedAt: 'Yesterday',
  },
  {
    id: '3',
    title: 'Meridian Growth — Bridge Loan',
    amount: '$750,000',
    counterparties: 'Meridian Capital',
    status: 'completed' as Status,
    updatedAt: '3 days ago',
  },
  {
    id: '4',
    title: 'Solaris Labs — Convertible Note',
    amount: '$2,100,000',
    counterparties: 'Solaris Ventures · Peak Equity',
    status: 'disputed' as Status,
    updatedAt: '5 days ago',
  },
  {
    id: '5',
    title: 'Ironwood Partners — Series C',
    amount: '$5,000,000',
    counterparties: 'Ironwood Capital · Summit Fund',
    status: 'in_progress' as Status,
    updatedAt: '1 week ago',
  },
];

const FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Disputed', value: 'disputed' },
];

export function DealsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const filtered = ALL_DEALS.filter((d) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active')
      return ['pending', 'funded', 'in_progress'].includes(d.status);
    if (activeFilter === 'completed') return d.status === 'completed';
    if (activeFilter === 'disputed') return d.status === 'disputed';
    return true;
  });

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
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
      >
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>
          Deals
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--text-md)' }}>
          {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
        </p>
      </motion.header>

      {/* Filters */}
      <Reveal>
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
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.08 }}
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
              }}
            >
              {filter.label}
            </motion.button>
          ))}
        </div>
      </Reveal>

      {/* Deal list */}
      <Stack
        staggerDelay={0.05}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        {filtered.map((deal) => (
          <StackItem key={deal.id} style={{ display: 'block' }}>
            <Card
              interactive
              onClick={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  padding: 'var(--space-5)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-3)',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>
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
                  }}
                >
                  <StatusBadge status={deal.status} size="sm" />
                  <span
                    style={{
                      fontSize: 'var(--text-md)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {deal.amount}
                  </span>
                </div>
              </div>

              {/* Expandable area */}
              <Expand isOpen={expandedId === deal.id}>
                <div
                  style={{
                    padding: 'var(--space-4) var(--space-5)',
                    borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-6)',
                  }}
                >
                  <DealTimeline
                    steps={getMockSteps(deal.status)}
                    currentId={getMockCurrentId(deal.status)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', justifyContent: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Last updated
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {deal.updatedAt}
                    </span>
                    <Spacer size={2} />
                    <Link to={`/deals/${deal.id}`}>
                      <Button size="sm" variant="secondary">
                        View Deal →
                      </Button>
                    </Link>
                  </div>
                </div>
              </Expand>
            </Card>
          </StackItem>
        ))}
      </Stack>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock timeline helpers
// ---------------------------------------------------------------------------

function getMockSteps(status: Status): TimelineStep[] {
  const base: TimelineStep[] = [
    {
      id: 'created',
      label: 'Deal Created',
      status: 'completed',
      timestamp: 'Aug 15, 2026',
    },
    {
      id: 'submitted',
      label: 'Submitted',
      status: 'completed',
      timestamp: 'Aug 16, 2026',
    },
    {
      id: 'pending',
      label: 'Under Review',
      status: status === 'pending' ? 'pending' : 'completed',
      timestamp: status === 'pending' ? undefined : 'Aug 17, 2026',
    },
    {
      id: 'funded',
      label: 'Funded',
      status: ['funded', 'completed'].includes(status) ? 'completed' : 'accepted',
      timestamp: ['funded', 'completed'].includes(status) ? 'Aug 20, 2026' : undefined,
    },
    {
      id: 'completed',
      label: 'Completed',
      status: status === 'completed' ? 'completed' : 'accepted',
      timestamp: status === 'completed' ? 'Aug 25, 2026' : undefined,
    },
  ];
  return base;
}

function getMockCurrentId(status: Status): string {
  if (status === 'pending') return 'pending';
  if (status === 'funded') return 'funded';
  if (status === 'completed') return 'completed';
  if (status === 'disputed') return 'pending';
  if (status === 'in_progress') return 'pending';
  return 'pending';
}
