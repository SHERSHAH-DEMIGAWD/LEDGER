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
import { NavLink } from 'react-router-dom'; 
import { motion } from 'motion/react'; 
import { useReducedMotion } from '../motion/hooks'; 
import { duration } from '../motion/variants'; 
import { MasterBackground } from './MasterBackground'; 

interface NavItem { 
  to: string; 
  label: string; 
  end?: boolean; 
} 

const NAV: NavItem[] = [ 
  { to: '/', label: 'Register', end: true }, 
  { to: '/deals', label: 'Deals' }, 
  { to: '/invitations', label: 'Invitations' }, 
] 

export function AppShell({ children }: { children: ReactNode }) { 
  return ( 
    <div className="ledger-app-shell"> 
      {/* Master Background Layer */}
      <MasterBackground /> 
      
      {/* Atmospheric lighting layer */}
      <div className="ledger-atmosphere" aria-hidden="true"> 
        <div className="ledger-light-beam" /> 
        <div className="ledger-light-haze" /> 
        <div className="ledger-grain" /> 
      </div> 
 
      {/* Global navigation */}
      <header className="ledger-topbar"> 
        <NavBrand /> 
 
        <nav className="ledger-topnav" aria-label="Primary navigation"> 
          {NAV.map((item) => ( 
            <TopNavItem key={item.to} item={item} /> 
          ))} 
        </nav> 
 
        <div className="ledger-topbar-right"> 
          <div className="ledger-location"> 
            <span>12.9716° N</span> 
            <span>77.5946° E</span> 
          </div> 
 
          <button 
            type="button" 
            className="ledger-search" 
            aria-label="Search records" 
          > 
            <SearchIcon /> 
            <span>Search records...</span> 
          </button> 
 
          <div className="ledger-user-mark" aria-hidden="true"> 
            <span>SK</span> 
          </div> 
        </div> 
      </header> 
 
      {/* Page content */}
      <main className="ledger-main"> 
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
      aria-label="Ledger — Register" 
    > 
      <span className="ledger-brand-wordmark">ledger</span> 
    </NavLink> 
  ); 
} 

function TopNavItem({ item }: { item: NavItem }) { 
  const reduced = useReducedMotion(); 
 
  return ( 
    <NavLink 
      to={item.to} 
      end={item.end} 
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
          {isActive && <span className="ledger-nav-dot" />} 
        </motion.span> 
      )} 
    </NavLink> 
  ); 
} 

function SearchIcon() { 
  return ( 
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 24 24" 
      fill="none" 
      aria-hidden="true" 
    > 
      <circle 
        cx="11" 
        cy="11" 
        r="6.5" 
        stroke="currentColor" 
        strokeWidth="1.3" 
      /> 
      <path 
        d="M16 16L21 21" 
        stroke="currentColor" 
        strokeWidth="1.3" 
        strokeLinecap="round" 
      /> 
    </svg> 
  ); 
}