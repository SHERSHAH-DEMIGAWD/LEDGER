import { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from './errorHandler.js';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Authenticate request using JWT access token from Authorization header.
 * NEVER trusts client-provided user IDs or roles - extracts from verified JWT only.
 *
 * All JWT verification failures are normalized to UnauthorizedError so they
 * surface as 401 responses with a controlled message, not 500s leaking
 * library internals.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new UnauthorizedError('Authentication required'));
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
  } catch (error) {
    // Normalize all JWT errors to a single 401 response.
    // Do NOT include the underlying library error message in the response.
    if (error instanceof TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    if (error instanceof NotBeforeError) {
      return next(new UnauthorizedError('Token not yet valid'));
    }
    if (error instanceof JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid token'));
    }
    // Unknown error - still treat as auth failure rather than 500
    return next(new UnauthorizedError('Invalid token'));
  }

  // Sanity-check the payload shape; reject malformed payloads as 401, not 500
  if (
    !decoded ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    return next(new UnauthorizedError('Invalid token'));
  }

  req.user = {
    id: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  };
  next();
};
