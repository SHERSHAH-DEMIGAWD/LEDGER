/**
 * pages/DashboardPage.tsx
 *
 * Demonstrates the motion animation system on a dashboard layout.
 * Replace with real dashboard implementation as the app grows.
 */

import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Reveal, Stack, StackItem, Card } from '../motion/components';
import { StatusBadge } from '../motion/StatusBadge';
import { useReducedMotion } from '../motion/hooks';
import { Button } from '../components/ui';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const DEALS = [
  {
    id: '1',
    title: 'Seed Bridge Capital — Series A',
    amount: '$1,200,000',
    counterparties: 'Bridge Ventures · Capital Group',
    status: 'pending' as const,
    updatedAt: '2 hours ago',
  },
  {
    id: '2',
    title: 'Northbrook Acquisition — Series B',
    amount: '$3,500,000',
    counterparties: 'Northbrook Partners · Apex Fund',
    status: 'funded' as const,
    updatedAt: 'Yesterday',
  },
  {
    id: '3',
    title: 'Meridian Growth — Bridge Loan',
    amount: '$750,000',
    counterparties: 'Meridian Capital',
    status: 'completed' as const,
    updatedAt: '3 days ago',
  },
  {
    id: '4',
    title: 'Solaris Labs — Convertible Note',
    amount: '$2,100,000',
    counterparties: 'Solaris Ventures · Peak Equity',
    status: 'disputed' as const,
    updatedAt: '5 days ago',
  },
  {
    id: '5',
    title: 'Ironwood Partners — Series C',
    amount: '$5,000,000',
    counterparties: 'Ironwood Capital · Summit Fund',
    status: 'in_progress' as const,
    updatedAt: '1 week ago',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DashboardPage() {
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
      {/* Header */}
      <motion.header
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
      >
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--text-md)' }}>
          Overview of your transactions and deals.
        </p>
      </motion.header>

      {/* Stats row */}
      <Reveal delay={0.05}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <StatCard label="Active Deals" value="3" sub="+1 this month" />
          <StatCard label="Total Value" value="$12.5M" sub="Across 8 deals" />
          <StatCard label="Pending" value="2" sub="Awaiting action" />
          <StatCard label="Completed" value="5" sub="This quarter" />
        </div>
      </Reveal>

      {/* Recent deals */}
      <section>
        <Reveal delay={0.1}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
              Recent Deals
            </h2>
            <Link to="/deals">
              <Button variant="ghost" size="sm">
                View all →
              </Button>
            </Link>
          </div>
        </Reveal>

        <Stack
          staggerDelay={0.04}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          {DEALS.map((deal) => (
            <StackItem key={deal.id} style={{ display: 'block' }}>
              <DealCard deal={deal} />
            </StackItem>
          ))}
        </Stack>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
      style={{
        padding: 'var(--space-5)',
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>
        {value}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        {sub}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DealCard — demonstrates layoutId for shared element transitions
// ---------------------------------------------------------------------------

interface Deal {
  id: string;
  title: string;
  amount: string;
  counterparties: string;
  status: 'pending' | 'funded' | 'completed' | 'disputed' | 'in_progress';
  updatedAt: string;
}

function DealCard({ deal }: { deal: Deal }) {
  return (
    <motion.div layoutId={`deal-card-${deal.id}`}>
      <Card interactive>
        <Link to={`/deals/${deal.id}`} style={{ textDecoration: 'none' }}>
          <div
            style={{
              padding: 'var(--space-5)',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 'var(--space-3)',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span
                layoutId={`deal-title-${deal.id}`}
                style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}
              >
                {deal.title}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {deal.counterparties}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Updated {deal.updatedAt}
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
              <StatusBadge
                layoutId={`deal-status-${deal.id}`}
                status={deal.status}
                size="sm"
              />
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
        </Link>
      </Card>
    </motion.div>
  );
}
