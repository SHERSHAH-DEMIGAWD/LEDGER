/**
 * components/AppShell.tsx
 *
 * Top-level layout: header + side navigation + main content.
 * Navigation uses layoutId for the selected item highlight.
 */

import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { duration, easing } from '../motion/variants';

interface NavItem {
  to: string;
  label: string;
  /** Stable id used for layoutId of the active indicator */
  layoutId: string;
  icon?: ReactNode;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', layoutId: 'nav-dashboard' },
  { to: '/deals', label: 'Deals', layoutId: 'nav-deals' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
      }}
      className="ledger-app-shell"
    >
      <Sidebar />
      <main style={{ minWidth: 0, overflow: 'hidden' }}>{children}</main>
    </div>
  );
}

function Sidebar() {
  return (
    <aside
      style={{
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border)',
        padding: 'var(--space-5) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-2)',
        }}
      >
        <Logo />
        <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Ledger</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          padding: '0 var(--space-2)',
        }}
      >
        v0.1.0
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="var(--color-surface-3)" />
      <path
        d="M8 10h16M8 16h12M8 22h8"
        stroke="var(--color-text-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavItem({ item }: { item: NavItem }) {
  const reduced = useReducedMotion();

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      style={{ textDecoration: 'none' }}
    >
      {({ isActive }) => (
        <motion.div
          whileTap={!reduced ? { scale: 0.98 } : undefined}
          transition={{ duration: duration.fast, ease: easing.snap }}
          style={{
            position: 'relative',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            color: isActive
              ? 'var(--color-text-primary)'
              : 'var(--color-text-tertiary)',
            fontSize: 'var(--text-sm)',
            fontWeight: isActive ? 500 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          {isActive && (
            <motion.span
              layoutId={item.layoutId}
              transition={{
                duration: reduced ? 0 : duration.normal,
                ease: easing.inOut,
              }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                zIndex: 0,
              }}
              aria-hidden
            />
          )}
          <span style={{ position: 'relative', zIndex: 1 }}>{item.label}</span>
        </motion.div>
      )}
    </NavLink>
  );
}
