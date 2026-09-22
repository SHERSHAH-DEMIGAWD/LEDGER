/**
 * App.tsx
 *
 * Root component with React Router + AnimatePresence page transitions.
 *
 * Navigation metaphor: opening a casebook.
 * - Forward navigation (into a deeper page) → page enters from the right
 * - Backward navigation → page enters from the left
 * - Deal-to-deal navigation → page enters vertically (up/down)
 *
 * Route structure:
 *   /login, /register     — public auth pages (no AppShell)
 *   all other routes      — protected by AuthRoute, wrapped in AppShell
 */

import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { MasterBackground } from './components/MasterBackground';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from './motion/hooks';
import { duration, easing } from './motion/variants';
import { AppShell } from './components/AppShell';
import { AuthRoute } from './components/AuthRoute';
import { useAuth } from './contexts/AuthContext';
import { CreateDealPage } from './pages/CreateDealPage';
import {
  DealNavigationProvider,
  useDealNavigation,
} from './contexts/DealNavigationContext';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { DealDetailPage } from './pages/DealDetailPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

/**
 * Direction-aware page transition wrapper.
 *
 * Renders a real motion.div (not display:contents) so that the page-level
 * transform is actually visible. The wrapper fills its parent and does not
 * participate in flex/grid layout, so it doesn't disrupt the AppShell grid.
 *
 * Reads direction from DealNavigationContext and applies:
 *   - Vertical slide (y) for deal-to-deal navigation
 *   - Horizontal slide (x) for all other navigation
 */
function AnimatedRouteWrapper({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const { direction, resetDirection } = useDealNavigation();

  // Determine animation axes based on direction
  const getInitial = () => {
    if (reduced) return { opacity: 0 };
    if (direction === 'next-record' || direction === 'up') return { opacity: 0, y: 80 };
    if (direction === 'prev-record' || direction === 'down') return { opacity: 0, y: -80 };
    if (direction === 'backward') return { opacity: 0, x: -60 };
    if (direction === 'forward') return { opacity: 0, x: 60 };
    // Default horizontal
    return { opacity: 0, x: 40 };
  };

  const getAnimate = () => {
    if (reduced) return { opacity: 1 };
    return { opacity: 1, x: 0, y: 0 };
  };

  const getExit = () => {
    if (reduced) return { opacity: 0 };
    if (direction === 'next-record' || direction === 'up') return { opacity: 0, y: -80 };
    if (direction === 'prev-record' || direction === 'down') return { opacity: 0, y: 80 };
    if (direction === 'backward') return { opacity: 0, x: 60 };
    if (direction === 'forward') return { opacity: 0, x: -60 };
    // Default horizontal
    return { opacity: 0, x: -40 };
  };

  const handleAnimationComplete = () => {
    resetDirection();
  };

  return (
    <motion.div
      initial={getInitial()}
      animate={getAnimate()}
      exit={getExit()}
      transition={{
        duration: reduced ? 0 : duration.slow,
        ease: easing.inOut,
      }}
      onAnimationComplete={handleAnimationComplete}
      className="ledger-route"
    >
      {children}
    </motion.div>
  );
}

/** Wraps the main app shell with auth guard + persona switcher. */
function ProtectedLayout() {
  const { user } = useAuth();
  return (
    <AuthRoute>
      <AppShell>
        <Routes key={`${user?.id}:${user?.role}`}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/deals/new" element={<CreateDealPage />} />
          <Route path="/deals/:id" element={<DealDetailPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="*" element={<div className="transaction-page"><p className="transaction-eyebrow">Page not found</p><h1 className="transaction-title">No record here.</h1><Link className="transaction-link" to="/deals">Return to your deals →</Link></div>} />
        </Routes>
      </AppShell>
    </AuthRoute>
  );
}

function App() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <DealNavigationProvider>
      <MasterBackground />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {/* Public auth pages — centered on dark navy, no casebook metaphor */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected routes with direction-aware animation */}
          <Route
            path="/*"
            element={
              <AnimatedRouteWrapper>
                <ProtectedLayout />
              </AnimatedRouteWrapper>
            }
          />
        </Routes>
      </AnimatePresence>
    </DealNavigationProvider>
  );
}

export default App;
