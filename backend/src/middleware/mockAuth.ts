/**
 * middleware/mockAuth.ts
 *
 * Unified authentication middleware.
 *
 * Behavior:
 *   1. If `req.mockUser` is set (from `withMockUser` reading the X-Mock-User
 *      header), use that identity directly. This short-circuits JWT verification
 *      for the development persona switcher.
 *   2. Otherwise, fall through to the real JWT-based `authenticate` middleware.
 *
 * This middleware MUST be mounted AFTER `withMockUser` in the middleware chain.
 *
 * Security note:
 *   - The X-Mock-User header is only trusted because `withMockUser` is wired
 *     up at the app level. In production, the `withMockUser` middleware itself
 *     is a no-op (it only sets `req.mockUser` if the header is present), so
 *     the worst case is a misconfigured deployment that accepts a forged role
 *     for an unauthenticated request. The check below (`if (req.mockUser)`)
 *     mirrors how the real `authenticate` middleware would fail closed.
 *   - We still verify the user exists in the DB and the role matches the
 *     header claim (defense-in-depth — a stale ID is rejected).
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { authenticate } from './auth.js';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';

export const mockAwareAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.mockUser) {
    try {
      // Defense in depth: confirm the user still exists with the claimed role.
      // A header claiming BRAND with an ADMIN user's ID is a forgery attempt.
      const user = await prisma.user.findUnique({
        where: { id: req.mockUser.id },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return next(new UnauthorizedError('Mock user not found'));
      }

      if (user.role !== req.mockUser.role) {
        return next(
          new ForbiddenError(
            `Mock user role mismatch: header claims ${req.mockUser.role}, DB has ${user.role}`,
          ),
        );
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      return next();
    } catch (err) {
      return next(err);
    }
  }

  // Fall through to real JWT authentication.
  return authenticate(req, res, next);
};
