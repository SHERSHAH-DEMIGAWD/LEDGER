/**
 * components/AppShell.tsx
 *
 * Institutional ledger frame: permanent sidebar spine + main content area.
 *
 * Navigation is organized around the constitutional casebook metaphor:
 *   RECORD  — Deals, Invitations (the actual contracts)
 *   ACTIVITY — Activity Log
 *
 * The sidebar is a dark institutional frame (navy/brown) that conveys
 * trust, permanence, and authority. The main content area uses warm
 * parchment surfaces, evoking real legal/financial documents.
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
  category: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', layoutId: 'nav-dashboard', category: 'HOME' },
  { to: '/deals', label: 'Deals', layoutId: 'nav-deals', category: 'RECORD' },
  { to: '/invitations', label: 'Invitations', layoutId: 'nav-invitations', category: 'RECORD' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="ledger-app-shell">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}

function Sidebar() {
  return (
    <aside
      style={{
        background: 'linear-gradient(180deg, var(--color-institution-navy-mid) 0%, var(--color-institution-navy) 100%)',
        borderRight: '1px solid var(--color-border-dark)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
      className="ledger-sidebar"
    >
      {/* Top: Identity header */}
      <div
        style={{
          padding: 'var(--space-6) var(--space-5) var(--space-5)',
          borderBottom: '1px solid var(--color-border-dark-surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          {/* Ledger seal mark */}
          <div style={{ position: 'relative' }}>
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
              {/* Outer ring */}
              <circle cx="24" cy="24" r="22" stroke="var(--color-gold)" strokeWidth="1.5" opacity="0.6" />
              {/* Inner seal */}
              <circle cx="24" cy="24" r="18" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.3" />
              {/* Ledger book icon */}
              <rect x="12" y="14" width="24" height="20" rx="1.5" stroke="var(--color-gold)" strokeWidth="1.5" fill="none" />
              {/* Book spine */}
              <line x1="12" y1="20" x2="36" y2="20" stroke="var(--color-gold)" strokeWidth="1" opacity="0.7" />
              {/* Lines on page */}
              <line x1="16" y1="24" x2="30" y2="24" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
              <line x1="16" y1="28" x2="28" y2="28" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--color-text-on-dark)',
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              Ledger
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginTop: 2,
              }}
            >
              Records &amp; Contracts
            </div>
          </div>
        </div>
      </div>

      {/* Navigation organized by category */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          padding: 'var(--space-5) var(--space-4)',
          flex: 1,
        }}
      >
        {(['HOME', 'RECORD'] as const).map((category) => (
          <div key={category}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--color-text-on-dark-muted)',
                padding: '0 var(--space-3) var(--space-2)',
              }}
            >
              {category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {NAV.filter(item => item.category === category).map((item) => (
                <NavItem key={item.to} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: Version + institutional seal */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderTop: '1px solid var(--color-border-dark-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-on-dark-muted)',
          }}
        >
          Est. 2026
        </span>
        {/* Small decorative seal */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '1px solid var(--color-gold)',
            opacity: 0.4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-gold)',
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </aside>
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
            padding: '8px var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            color: isActive
              ? 'var(--color-gold-pale)'
              : 'var(--color-text-on-dark-secondary)',
            fontSize: 'var(--text-sm)',
            fontWeight: isActive ? 500 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            transition: 'color 0.15s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-on-dark)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-on-dark-secondary)';
            }
          }}
        >
          {isActive && (
            <>
              {/* Left accent bar */}
              <motion.div
                layoutId={item.layoutId + '-bar'}
                transition={{
                  duration: reduced ? 0 : duration.normal,
                  ease: easing.inOut,
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '20%',
                  bottom: '20%',
                  width: 2,
                  background: 'var(--color-gold)',
                  borderRadius: '0 2px 2px 0',
                }}
                aria-hidden
              />
            </>
          )}
          <span
            style={{
              position: 'relative',
              zIndex: 1,
            }}
          >
            {item.label}
          </span>
          {isActive && (
            <motion.span
              layoutId={item.layoutId + '-dot'}
              transition={{
                duration: reduced ? 0 : duration.normal,
                ease: easing.inOut,
              }}
              style={{
                position: 'absolute',
                right: 'var(--space-3)',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--color-gold)',
                opacity: 0.6,
              }}
              aria-hidden
            />
          )}
        </motion.div>
      )}
    </NavLink>
  );
}
