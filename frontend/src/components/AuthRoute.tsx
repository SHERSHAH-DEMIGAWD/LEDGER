/**
 * components/AuthRoute.tsx
 *
 * Wraps a route element and gates access based on the AuthContext.
 *
 *   <AuthRoute>
 *     <DealsPage />
 *   </AuthRoute>
 *
 * If the user is not signed in, the wrapper redirects to /login while
 * preserving the requested URL in `state.from` so the LoginPage can
 * send the user back after a successful sign-in.
 *
 * If `roles` is provided, the wrapper additionally checks that the user
 * is in one of the listed roles and redirects to / with a 403 state if
 * not.
 *
 * IMPORTANT: This is a UI affordance only. The backend is the source of
 * truth for authorization. An attacker who bypasses this guard still
 * cannot perform privileged actions because the server re-verifies.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../config/seedUsers';

interface AuthRouteProps {
  children: ReactNode;
  /** If provided, the user must be in one of these roles. */
  roles?: Role[];
}

export function AuthRoute({ children, roles }: AuthRouteProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    // Signed in but lacks the required role. Send to home page.
    return (
      <Navigate
        to="/"
        replace
        state={{ forbidden: true, requiredRoles: roles }}
      />
    );
  }

  return <>{children}</>;
}
