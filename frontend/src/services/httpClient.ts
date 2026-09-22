/**
 * services/httpClient.ts
 *
 * Centralized axios client with auth header attachment.
 *
 * Every API service (`dealApi`, `invitationApi`, future services) should
 * import `getHttpClient()` from this module rather than creating their own
 * axios instance. This guarantees a single source of truth for the base URL,
 * timeouts, and header injection.
 *
 * Uses a bearer token when available. Explicitly enabled development personas
 * send X-Mock-User only when no real token exists. All transactions use HTTP.
 *
 * Base URL:
 *   - In development with Vite proxy: defaults to `/api` (relative).
 *     Vite proxies /api/* → http://localhost:3000/*.
 *   - In production: VITE_API_BASE_URL should be the full backend URL,
 *     e.g. https://api.ledger.example.com/api
 *   - Override with VITE_API_BASE_URL env var if you need a different
 *     origin (e.g. when serving frontend outside of Vite).
 */

import axios, { type AxiosInstance } from 'axios';
import { AUTH_EXPIRED_EVENT, clearAuth, getAccessToken, getMockUserHeader } from './auth';

// Default to relative `/api` so the Vite dev proxy and same-origin production
// deployments work without additional configuration. Set VITE_API_BASE_URL
// to override.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

let httpClient: AxiosInstance | null = null;

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const mockHeader = getMockUserHeader();
  if (mockHeader) {
    headers['X-Mock-User'] = mockHeader;
  }
  return headers;
}

export function getHttpClient(): AxiosInstance {
  if (!httpClient) {
    httpClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10_000,
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
    });

    // Read credentials for every request, including after account switching.
    httpClient.interceptors.request.use((config) => {
      const auth = buildAuthHeaders();
      // config.headers is always defined after axios.create above; cast
      // to Record for the spread.
      const headers = (config.headers ?? {}) as Record<string, string>;
      Object.assign(headers, auth);
      config.headers = headers as typeof config.headers;
      return config;
    });

    httpClient.interceptors.response.use((response) => response, (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const headers = error.config?.headers;
        const sentToken = headers?.Authorization;
        const sentPersona = headers?.['X-Mock-User'];
        const token = getAccessToken();
        const persona = getMockUserHeader();
        // A late response from the previous account cannot sign out a newly
        // selected account. Only invalidate the credentials actually rejected.
        if ((token && sentToken === `Bearer ${token}`) ||
            (persona && sentPersona === persona)) {
          clearAuth();
          window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        }
      }
      return Promise.reject(error);
    });
  }
  return httpClient;
}

/**
 * Reset the http client (used in tests / when the env config changes).
 * Production code should never need this.
 */
export function resetHttpClient(): void {
  httpClient = null;
}
