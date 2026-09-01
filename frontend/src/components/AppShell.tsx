/**
 * components/AppShell.tsx
 *
 * Institutional Ledger Frame: Spine of the Register + Content Area.
 *
 * Visually functions as the physical dark-leather spine of the casebook:
 *   - Gold pillar seal insignia
 *   - Category Roman numerals (I. REGISTER, II. INSTITUTION)
 *   - Debossed spine index items with gold indicators
 *   - User persona switcher at the base of the spine
 */

import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { useReducedMotion } from '../motion/hooks';
import { duration } from '../motion/variants';

interface NavItem {
  to: string;
  label: string;
  layoutId: string;
  category: 'I. REGISTER' | 'II. INSTITUTION';
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', layoutId: 'nav-dashboard', category: 'I. REGISTER' },
  { to: '/deals', label: 'All Records', layoutId: 'nav-deals', category: 'I. REGISTER' },
  { to: '/invitations', label: 'Invitations', layoutId: 'nav-invitations', category: 'I. REGISTER' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="ledger-app-shell">
      <SidebarSpine />
      <main>{children}</main>
    </div>
  );
}

function SidebarSpine() {
  return (
    <aside
      className="ledger-sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      {/* Top Spine Seal Header */}
      <div
        style={{
          padding: 'var(--space-6) var(--space-5) var(--space-5)',
          borderBottom: '1px solid rgba(184, 134, 11, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {/* Gold Embossed Pillar Seal */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1.5px solid var(--color-gold-bright)',
              background: 'radial-gradient(circle, #2a1f14 0%, #140e0a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--color-gold-bright)" strokeWidth="0.8" opacity="0.6" />
              <path d="M6 18V10L12 6L18 10V18" stroke="var(--color-gold-bright)" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="9" y1="18" x2="15" y2="18" stroke="var(--color-gold-bright)" strokeWidth="1.2" />
              <line x1="9" y1="11" x2="9" y2="15" stroke="var(--color-gold-bright)" strokeWidth="1" />
              <line x1="12" y1="11" x2="12" y2="15" stroke="var(--color-gold-bright)" strokeWidth="1" />
              <line x1="15" y1="11" x2="15" y2="15" stroke="var(--color-gold-bright)" strokeWidth="1" />
            </svg>
          </div>

          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                fontWeight: 700,
                color: '#f5e6ca',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              LEDGER
            </div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: 'var(--color-gold-pale)',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                marginTop: 3,
                opacity: 0.8,
              }}
            >
              RECORDS & CONTRACTS
            </div>
          </div>
        </div>
      </div>

      {/* Spine Index Menu */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
          padding: 'var(--space-6) var(--space-4)',
          flex: 1,
        }}
      >
        {(['I. REGISTER', 'II. INSTITUTION'] as const).map((category) => (
          <div key={category}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--color-gold-pale)',
                opacity: 0.6,
                padding: '0 var(--space-3) var(--space-3)',
              }}
            >
              {category}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {NAV.filter((item) => item.category === category).map((item) => (
                <SpineItem key={item.to} item={item} />
              ))}
              {category === 'II. INSTITUTION' && (
                <>
                  <div style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', color: '#7a6a55', cursor: 'default' }}>
                    • Activity
                  </div>
                  <div style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', color: '#7a6a55', cursor: 'default' }}>
                    • Parties
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderTop: '1px solid rgba(184, 134, 11, 0.15)',
          fontSize: 'var(--text-xs)',
          color: '#827361',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>EST. 2026</span>
        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-gold-dark)' }}>VERITAS</span>
      </div>
    </aside>
  );
}

function SpineItem({ item }: { item: NavItem }) {
  const reduced = useReducedMotion();

  return (
    <NavLink to={item.to} end={item.to === '/'} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <motion.div
          whileTap={!reduced ? { scale: 0.98 } : undefined}
          transition={{ duration: duration.fast }}
          style={{
            position: 'relative',
            padding: '8px var(--space-3)',
            borderRadius: 'var(--radius-xs)',
            color: isActive ? '#f5e6ca' : '#a3927c',
            fontSize: 'var(--text-sm)',
            fontWeight: isActive ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            transition: 'color 0.15s, background 0.15s',
            background: isActive ? 'rgba(184, 134, 11, 0.12)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--color-gold-bright)' : '2px solid transparent',
          }}
        >
          <span>{item.label}</span>
          {isActive && (
            <div
              style={{
                marginLeft: 'auto',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--color-gold-bright)',
                boxShadow: '0 0 6px var(--color-gold-bright)',
              }}
            />
          )}
        </motion.div>
      )}
    </NavLink>
  );
}
