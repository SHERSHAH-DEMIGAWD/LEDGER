/**
 * App.tsx
 *
 * Root component with React Router + AnimatePresence page transitions.
 * Page transitions are subtle and fast — navigation must never feel slower.
 *
 * Route structure:
 *   /login, /register     — public auth pages (no AppShell)
 *   all other routes      — protected by AuthRoute, wrapped in AppShell
 */

import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from './motion/hooks';
import { duration, easing } from './motion/variants';
import { Page } from './motion/components';
import { AppShell } from './components/AppShell';
import { AuthRoute } from './components/AuthRoute';
import { UserSwitcher } from './components/UserSwitcher';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { DealDetailPage } from './pages/DealDetailPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

/** Wraps the main app shell with auth guard + persona switcher. */
function ProtectedLayout() {
  return (
    <AuthRoute>
      <AppShell>
        <UserSwitcher />
        <Routes>
          <Route path="/" element={<Page><DashboardPage /></Page>} />
          <Route path="/deals" element={<Page><DealsPage /></Page>} />
          <Route path="/deals/:id" element={<Page><DealDetailPage /></Page>} />
          <Route path="/invitations" element={<Page><InvitationsPage /></Page>} />
        </Routes>
      </AppShell>
    </AuthRoute>
  );
}

function App() {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{
          duration: reduced ? 0 : duration.slow,
          ease: easing.inOut,
        }}
      >
        <Routes location={location}>
          {/* Public auth pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes */}
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default App;
