/**
 * services/auth.ts
 *
 * Client-side authentication state.
 *
 * The account profile is cached for display; the server verifies credentials.
 * A bearer token always takes precedence. Development personas require an
 * explicit development-only opt-in and are never sent alongside a real token.
 *
 * IMPORTANT: The backend is always the source of truth. The frontend
 * never asserts "you are an admin" based on its own state — every API
 * call re-verifies the role server-side.
 */

import type { Role } from '../config/seedUsers';

export const TOKEN_STORAGE_KEY = 'ledger.auth.token';
export const MOCK_USER_STORAGE_KEY = 'ledger.auth.mockUser';
export const AUTH_EXPIRED_EVENT = 'ledger:auth-expired';
export const DEV_PERSONAS_ENABLED = import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_DEV_PERSONAS === 'true';

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Mock user
// ---------------------------------------------------------------------------

export function getMockUser(): MockUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MOCK_USER_STORAGE_KEY);
    if (!raw) return null;
    const user: unknown = JSON.parse(raw);
    if (!user || typeof user !== 'object' || !('id' in user) ||
        typeof user.id !== 'string' || !user.id || !('email' in user) ||
        typeof user.email !== 'string' || !('name' in user) ||
        typeof user.name !== 'string' || !('role' in user) ||
        !['BRAND', 'CREATOR', 'HRT', 'ADMIN'].includes(String(user.role))) return null;
    // A leftover development profile must never unlock a production session.
    if (!getAccessToken() && !DEV_PERSONAS_ENABLED) return null;
    return user as MockUser;
  } catch {
    return null;
  }
}

export function setMockUser(user: MockUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user === null) {
      window.localStorage.removeItem(MOCK_USER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MOCK_USER_STORAGE_KEY, JSON.stringify(user));
    }
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// X-Mock-User header value
// ---------------------------------------------------------------------------

/**
 * Build the X-Mock-User header value for the current persona.
 * Returns null if no persona is set, so callers can decide whether to
 * attach the header at all.
 */
export function getMockUserHeader(): string | null {
  if (!DEV_PERSONAS_ENABLED || getAccessToken()) return null;
  const u = getMockUser();
  if (!u) return null;
  return `${u.role}:${u.id}`;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export function clearAuth(): void {
  setAccessToken(null);
  setMockUser(null);
}
