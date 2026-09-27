/** 
 * components/AppShell.tsx 
 * 
 * Ledger visual shell. 
 * 
 * Visual direction: 
 * - Cinematic black environment 
 * - Warm light entering from upper-left 
 * - Restrained antique-gold typography and rules 
 * - Editorial / institutional navigation 
 * - No conventional SaaS sidebar 
 * 
 * IMPORTANT: 
 * This component is presentation-only. 
 * It does not alter backend logic, routing semantics, or page data. 
 */ 

import { type ReactNode } from 'react'; 
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGroup, motion } from 'motion/react';
import { useMediaPreference } from '../motion/useMediaPreference';
import { routeEase } from '../motion/routeMotion';
import { duration } from '../motion/variants'; 
import { UserSwitcher } from './UserSwitcher';
import { useAuth } from '../contexts/AuthContext';

interface NavItem { 
  to: string; 
  label: string; 
  end?: boolean; 
} 

const NAV: NavItem[] = [ 
  { to: '/', label: 'Overview', end: true },
  { to: '/deals', label: 'Deals', end: true },
  { to: '/invitations', label: 'Invitations' }, 
] 

export function AppShell({ children }: { children: ReactNode }) { 
  const { user } = useAuth();
  const navigation = NAV.filter((item) => item.to !== '/invitations' || user?.role === 'CREATOR');
  if (user?.role === 'BRAND' || user?.role === 'ADMIN') {
    navigation.push({ to: '/deals/new', label: 'Create Deal', end: true });
  }
  return ( 
    <div className="ledger-app-shell"> 
      <a className="ledger-skip-link" href="#main-content">Skip to content</a>
 
      {/* Global navigation */}
      <header className="ledger-topbar"> 
        <NavBrand /> 
 
        <LayoutGroup id="ledger-navigation">
          <nav className="ledger-topnav" aria-label="Primary navigation">
            {navigation.map((item) => (
              <TopNavItem key={item.to} item={item} />
            ))}
          </nav>
        </LayoutGroup>
 
        <div className="ledger-topbar-right"> 
          <UserSwitcher />
        </div> 
      </header> 
 
      {/* Page content */}
      <main id="main-content" className="ledger-main" tabIndex={-1}>
        <div className="ledger-content">{children}</div> 
      </main> 
 
      {/* Peripheral institutional annotations */}
      <aside className="ledger-annotation ledger-annotation-left" aria-hidden="true"> 
        <span>PEOPLE</span> 
        <span>WORK</span> 
        <span>VALUE</span> 
        <span>ON RECORD</span> 
        <i /> 
      </aside> 
 
      <aside className="ledger-annotation ledger-annotation-bottom-left" aria-hidden="true"> 
        <span>BUILT</span> 
        <span>IN INDIA</span> 
        <span>FOR A FAIRER</span> 
        <span>CREATIVE ECONOMY</span> 
        <i /> 
      </aside> 
 
      <aside className="ledger-annotation ledger-annotation-bottom-right" aria-hidden="true"> 
        <span>CLARITY</span> 
        <span>SECURITY</span> 
        <span>TRUST</span> 
        <span>PROGRESS</span> 
        <i /> 
      </aside> 
    </div> 
  ); 
} 

function NavBrand() { 
  return ( 
    <NavLink 
      to="/" 
      className="ledger-brand" 
      aria-label="Ledger — Overview"
    > 
      <span className="ledger-brand-wordmark">ledger</span> 
    </NavLink> 
  ); 
} 

function TopNavItem({ item }: { item: NavItem }) { 
  const reduced = useMediaPreference('(prefers-reduced-motion: reduce)');
  const { pathname } = useLocation();
  // A transaction belongs to the Deals section, including on direct entry.
  const inDeals = item.to === '/deals' && pathname.startsWith('/deals/') && pathname !== '/deals/new';
 
  return ( 
    <NavLink 
      to={item.to} 
      end={inDeals ? false : item.end}
      className={({ isActive }) => 
        `ledger-topnav-item${isActive ? ' is-active' : ''}` 
      } 
    > 
      {({ isActive }) => ( 
        <motion.span 
          whileTap={!reduced ? { scale: 0.97 } : undefined} 
          transition={{ duration: duration.fast }} 
          className="ledger-topnav-label" 
        > 
          {item.label} 
          {isActive && <motion.span
            className="ledger-nav-indicator"
            layoutId={reduced ? undefined : 'active-section'}
            initial={false}
            transition={{ duration: reduced ? 0 : 0.38, ease: routeEase }}
            aria-hidden="true"
          />}
        </motion.span> 
      )} 
    </NavLink> 
  ); 
} 
