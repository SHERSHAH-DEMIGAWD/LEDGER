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
 * Headers attached on every request:
 *   - `Authorization: Bearer <token>` if an access token is present
 *   - `X-Mock-User: <role>:<id>`     if a mock persona is set
 *     (this is forwarded to the backend in development for the persona switcher)
 *
 * The backend's `withMockUser` middleware reads `X-Mock-User` and
 * authenticates accordingly, falling back to real JWT if the header is
 * absent. This means the same client works in both mock-mode (no backend)
 * and real-backend-mode (with the seeded database).
 */

import axios, { type AxiosInstance } from 'axios';
import { getAccessToken, getMockUserHeader } from './auth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

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
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach auth headers to every request. The interceptor runs for both
    // the regular path and the mock-header path simultaneously.
    httpClient.interceptors.request.use((config) => {
      const auth = buildAuthHeaders();
      // config.headers is always defined after axios.create above; cast
      // to Record for the spread.
      const headers = (config.headers ?? {}) as Record<string, string>;
      Object.assign(headers, auth);
      config.headers = headers as typeof config.headers;
      return config;
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
