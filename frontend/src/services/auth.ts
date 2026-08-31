/**
 * services/auth.ts
 *
 * Thin client-side authentication token manager.
 *
 * The backend uses JWT in the `Authorization: Bearer <token>` header.
 * Tokens are obtained from `/auth/*` endpoints (out of scope for this
 * vertical slice), and once obtained the frontend stores them here so
 * the API client can attach them to every request.
 *
 * IMPORTANT: This module never owns *who* the user is — the backend
 * always verifies the token server-side. We only carry it.
 */

const TOKEN_STORAGE_KEY = 'ledger.auth.token';

/**
 * Read the current access token, if any.
 *
 * Returns `null` when no token is stored (mock mode, or user has not logged in).
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable (e.g., disabled cookies). Fall through.
    return null;
  }
}

/**
 * Persist an access token.
 * Safe to call with `null` to clear.
 */
export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // Ignore storage errors — token just won't be persisted.
  }
}

/**
 * Clear any stored token. Use on logout.
 */
export function clearAuth(): void {
  setAccessToken(null);
}