/**
 * middleware/withMockUser.ts
 *
 * Development-only middleware that injects a mock user into the request when
 * the `X-Mock-User` header is present. This lets the frontend persona
 * switcher authenticate without going through the real registration flow.
 *
 * IMPORTANT: This middleware MUST only be active in non-production environments.
 * The header is forwarded to the browser and would be a trivial security hole
 * if deployed to production.
 *
 * Header format: `X-Mock-User: <role>:<userId>`
 * Example:       `X-Mock-User: BRAND:550e8400-e29b-41d4-a716-446655440000`
 */

import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by withMockUser when X-Mock-User header is present. */
      mockUser?: {
        id: string;
        role: Role;
      };
    }
  }
}

const VALID_ROLES = new Set<Role>(['BRAND', 'CREATOR', 'HRT', 'ADMIN']);

/**
 * Parse the X-Mock-User header value.
 * Returns the parsed user or null if the header is absent or malformed.
 */
export function parseMockUserHeader(
  value: string | undefined,
): { id: string; role: Role } | null {
  if (!value) return null;

  // Format: <role>:<uuid>
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1 || colonIdx === 0 || colonIdx === value.length - 1) {
    return null;
  }

  const role = value.slice(0, colonIdx).toUpperCase() as Role;
  const id = value.slice(colonIdx + 1);

  if (!VALID_ROLES.has(role)) return null;

  // Basic UUID v4 format check (8-4-4-4-12 hex)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  return { id, role };
}

/**
 * Express middleware that reads the `X-Mock-User` header and populates
 * `req.mockUser` when present. Safe to use as a no-op in production since
 * `req.mockUser` will simply never be set.
 */
export function withMockUser(_req: Request, _res: Response, next: NextFunction): void {
  const mockUser = parseMockUserHeader(_req.headers['x-mock-user'] as string | undefined);
  if (mockUser) {
    _req.mockUser = mockUser;
  }
  next();
}
