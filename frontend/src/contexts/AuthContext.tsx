/**
 * contexts/AuthContext.tsx
 *
 * Application-wide authentication state.
 *
 * The current persona lives in the AuthContext, which is read by:
 *   - TopBar / UserSwitcher (display the active persona)
 *   - AuthRoute (gate protected pages)
 *   - DealDetailPage / InvitationsPage (role-based UI)
 *
 * Source of truth: the backend. The frontend keeps a local copy in
 * localStorage so the user persona survives a page refresh.
 *
 * In mock mode (VITE_USE_MOCK_DEALS=true), the persona is the *only*
 * authentication signal the UI relies on.
 *
 * In real-backend mode, the persona is sent as the `X-Mock-User` header
 * to short-circuit the auth middleware. The real backend always re-verifies.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clearAuth as clearAuthStorage,
  getMockUser,
  MOCK_USER_STORAGE_KEY,
  setAccessToken,
  setMockUser,
  type MockUser,
} from '../services/auth';
import { findSeedUser, toMockUserHeader, type Role, type SeedUser } from '../config/seedUsers';

interface AuthContextValue {
  /** Currently signed-in persona, or null. */
  user: MockUser | null;

  /**
   * Sign in as a specific seed user. In real-backend mode, this also
   * stores an access token if you provide one (optional).
   */
  signIn: (
    seedUser: SeedUser,
    options?: { accessToken?: string }
  ) => void;

  /**
   * Switch the active persona without navigating away.
   * Useful for the UserSwitcher.
   */
  switchPersona: (seedUser: SeedUser) => void;

  /**
   * Sign out the current persona and clear all auth state.
   * In a protected route, this navigates to /login.
   */
  signOut: (redirect?: boolean) => void;

  /**
   * Convenience: is the current user in one of the given roles?
   */
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();

  // Initialize from localStorage so the persona survives a page refresh.
  const [user, setUser] = useState<MockUser | null>(() => getMockUser());

  // HTTP reads shared storage on each request. Keep the displayed account in
  // sync when another tab changes it, so its records and actions refresh too.
  // Writes stay in the explicit auth actions below; replaying them here would
  // overwrite a newer account selected in another tab.
  useEffect(() => {
    const syncAccount = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage &&
          (event.key === MOCK_USER_STORAGE_KEY || event.key === null)) {
        setUser(getMockUser());
      }
    };
    window.addEventListener('storage', syncAccount);
    return () => window.removeEventListener('storage', syncAccount);
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(
    (seedUser, options) => {
      const mockUser: MockUser = {
        id: seedUser.id,
        email: seedUser.email,
        name: seedUser.name,
        role: seedUser.role,
      };
      setUser(mockUser);
      setMockUser(mockUser);
      setAccessToken(options?.accessToken ?? null);
    },
    [],
  );

  const switchPersona = useCallback<AuthContextValue['switchPersona']>(
    (seedUser) => {
      const mockUser: MockUser = {
        id: seedUser.id,
        email: seedUser.email,
        name: seedUser.name,
        role: seedUser.role,
      };
      setUser(mockUser);
      setMockUser(mockUser);
      setAccessToken(null);
    },
    [],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(
    (redirect = true) => {
      setUser(null);
      clearAuthStorage();
      if (redirect) {
        navigate('/login', { replace: true });
      }
    },
    [navigate],
  );

  const hasRole = useCallback<AuthContextValue['hasRole']>(
    (...roles) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, signIn, switchPersona, signOut, hasRole }),
    [user, signIn, switchPersona, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the AuthContext.
 * Throws if used outside an AuthProvider — that is a programming error.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/**
 * Resolve a MockUser back to the full SeedUser record (with name/blurb).
 * Returns null if the active user is not in the seed list.
 */
export function useActiveSeedUser(): SeedUser | null {
  const { user } = useAuth();
  if (!user) return null;
  return findSeedUser(user.id) ?? null;
}

/**
 * The current X-Mock-User header value (for the API client).
 * Returns null if no persona is active.
 */
export function useMockUserHeader(): string | null {
  const { user } = useAuth();
  if (!user) return null;
  return toMockUserHeader({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    password: '',
    blurb: '',
  });
}
