/**
 * services/auth.ts
 *
 * Client-side authentication state.
 *
 * Two parallel concepts:
 *   1. `accessToken` — opaque bearer token, sent in the `Authorization` header.
 *      This is the real auth path. In mock mode it is unused.
 *   2. `mockUser` — a {id, role, email} object representing the currently
 *      signed-in persona. The frontend keeps it in localStorage and, when
 *      VITE_USE_MOCK_DEALS=false, forwards it to the backend in the
 *      `X-Mock-User: <role>:<id>` header.
 *
 * In mock mode (VITE_USE_MOCK_DEALS=true), only `mockUser` is used.
 * In real-backend mode, both may be used; the real JWT (if any) takes
 * precedence and the X-Mock-User header acts as a development shortcut.
 *
 * IMPORTANT: The backend is always the source of truth. The frontend
 * never asserts "you are an admin" based on its own state — every API
 * call re-verifies the role server-side.
 */

import type { Role } from '../config/seedUsers';

const TOKEN_STORAGE_KEY = 'ledger.auth.token';
const MOCK_USER_STORAGE_KEY = 'ledger.auth.mockUser';

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
    return JSON.parse(raw) as MockUser;
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
