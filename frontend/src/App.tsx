/**
 * App.tsx
 *
 * Root component with React Router + AnimatePresence page transitions.
 * Page transitions are subtle and fast — navigation must never feel slower.
 */

import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from './motion/hooks';
import { duration, easing } from './motion/variants';
import { Page } from './motion/components';
import { AppShell } from './components/AppShell';

// Placeholder pages — replace with real pages as they are built
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { DealDetailPage } from './pages/DealDetailPage';

function App() {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <AppShell>
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
            <Route path="/" element={<Page><DashboardPage /></Page>} />
            <Route path="/deals" element={<Page><DealsPage /></Page>} />
            <Route path="/deals/:id" element={<Page><DealDetailPage /></Page>} />
            <Route
              path="*"
              element={
                <Page>
                  <NotFoundPage />
                </Page>
              }
            />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

function NotFoundPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        gap: 'var(--space-4)',
        textAlign: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <a
        href="/"
        style={{
          color: 'var(--color-text-primary)',
          textDecoration: 'underline',
        }}
      >
        Go home
      </a>
    </div>
  );
}

export default App;
