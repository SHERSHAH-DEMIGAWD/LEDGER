import { Request, Response, NextFunction } from 'express';
import { Role } from '../types.js';
import { ForbiddenError, UnauthorizedError } from './errorHandler.js';

const roleHierarchy: Record<Role, number> = {
  ADMIN: 4,
  HRT: 3,
  BRAND: 2,
  CREATOR: 1,
};

/**
 * Require one of the specified roles
 * Authorization is enforced server-side only - never trusts client claims
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userRole = req.user.role as Role;

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
};

/**
 * Require minimum role level
 */
export const requireMinRole = (minRole: Role) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userRole = req.user.role as Role;
    const userLevel = roleHierarchy[userRole] ?? 0;
    const requiredLevel = roleHierarchy[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
};

/**
 * HRT-only access (dispute review capabilities)
 * Note: Admin has separate user management capabilities
 */
export const requireHRT = requireRole('HRT', 'ADMIN');

/**
 * Admin-only access (system administration)
 */
export const requireAdmin = requireRole('ADMIN');
