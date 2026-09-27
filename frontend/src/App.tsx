/**
 * App.tsx
 *
 * Root component with React Router + AnimatePresence page transitions.
 *
 * A persistent shell and photographic viewpoint connect the record surfaces.
 * Only the content participates in route exit/entry transitions.
 *
 * Route structure:
 *   /login, /register     — public auth pages (no AppShell)
 *   all other routes      — protected by AuthRoute, wrapped in AppShell
 */

import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MasterBackground } from './components/MasterBackground';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AnimatePresence, motion } from 'motion/react';
import { useMediaPreference } from './motion/useMediaPreference';
import { routeMovement, routeEase } from './motion/routeMotion';
import { RecordTransition } from './motion/RecordTransition';
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

/** The shell stays still; only the record surface releases and settles. */
type RouteMovement = ReturnType<typeof routeMovement> & { recordOpening: boolean };

function AnimatedRouteWrapper({ children, movement }: {
  children: React.ReactNode;
  movement: RouteMovement;
}) {
  const reduced = useMediaPreference('(prefers-reduced-motion: reduce)');
  const compact = useMediaPreference('(max-width: 600px)');
  const { resetDirection } = useDealNavigation();
  const distance = reduced ? 0 : compact ? 4 : 14;
  return (
    <motion.div
      className="ledger-context"
      custom={movement}
      initial="enter"
      animate="settled"
      exit="release"
      variants={{
        enter: (travel: typeof movement) => ({
          opacity: travel.recordOpening ? 1 : 0,
          x: travel.recordOpening ? 0 : travel.direction * distance,
          scale: travel.recordOpening || reduced || compact || !travel.depth ? 1 : travel.depth > 0 ? 0.992 : 1.008,
        }),
        settled: { opacity: 1, x: 0, scale: 1,
          transition: { duration: reduced ? 0.1 : compact ? 0.26 : 0.38, ease: routeEase } },
        release: (travel: typeof movement) => ({
          opacity: 0,
          x: travel.recordOpening ? 0 : -travel.direction * distance * 0.45,
          scale: travel.recordOpening || reduced || compact || !travel.depth ? 1 : travel.depth > 0 ? 1.008 : 0.992,
          transition: { duration: reduced ? 0.06 : travel.recordOpening ? 0.2 : 0.12, ease: routeEase },
        }),
      }}
      onAnimationComplete={resetDirection}
    >
      {children}
    </motion.div>
  );
}

/** Wraps the main app shell with auth guard + persona switcher. */
function ProtectedLayout() {
  const { user } = useAuth();
  const { recordOrigin } = useDealNavigation();
  const location = useLocation();
  // Remember only the last visual context, without maintaining a second history.
  // Route ordering also reverses browser Back between the primary contexts.
  const [journey, setJourney] = useState({ from: location.pathname, to: location.pathname, key: location.key });
  if (journey.to !== location.pathname) {
    setJourney({ from: journey.to, to: location.pathname, key: location.key });
  }
  const movement = { ...routeMovement(journey.from, journey.to),
    recordOpening: !!recordOrigin && journey.from === recordOrigin.from && journey.to === recordOrigin.to };
  return (
    <AuthRoute>
      <AppShell>
        <RecordTransition key={`${user?.id}:${user?.role}`} from={journey.from} to={journey.to} navigationKey={journey.key} />
        <AnimatePresence key={`${user?.id}:${user?.role}`} mode="wait" initial={false} custom={movement}>
          <AnimatedRouteWrapper key={location.pathname} movement={movement}>
            <Routes location={location}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/deals" element={<DealsPage />} />
              <Route path="/deals/new" element={<CreateDealPage />} />
              <Route path="/deals/:id" element={<DealDetailPage />} />
              <Route path="/invitations" element={<InvitationsPage />} />
              <Route path="*" element={<div className="transaction-page"><p className="transaction-eyebrow">Page not found</p><h1 className="transaction-title">No record here.</h1><Link className="transaction-link" to="/deals">Return to your deals →</Link></div>} />
            </Routes>
          </AnimatedRouteWrapper>
        </AnimatePresence>
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
        <Routes location={location} key={['/login', '/register', '/verify-email'].includes(location.pathname) ? location.pathname : 'ledger'}>
          {/* Public auth pages — centered on dark navy, no casebook metaphor */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected routes with direction-aware animation */}
          <Route
            path="/*"
            element={
              <motion.div className="ledger-route" exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                <ProtectedLayout />
              </motion.div>
            }
          />
        </Routes>
      </AnimatePresence>
    </DealNavigationProvider>
  );
}

export default App;
