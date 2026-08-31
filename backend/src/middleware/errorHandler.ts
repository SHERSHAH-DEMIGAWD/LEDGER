import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import {
  DomainError,
  InvalidStateError,
  UnauthorizedAccessError,
  DealTermsValidationError,
  DealVersionConflictError,
} from '../domain/errors/index.js';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      'RES_001',
      identifier ? `${resource} '${identifier}' not found` : `${resource} not found`,
      404
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('AUTH_010', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('AUTH_011', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('RES_002', message, 409);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VAL_001', message, 400, details);
  }
}

/**
 * Global error handler middleware
 * Ensures no sensitive information is leaked in error responses
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log error details server-side only
  console.error('Error:', {
    name: err.name,
    message: err.message,
    stack: config.server.nodeEnv === 'development' ? err.stack : undefined,
  });

  if (err instanceof AppError) {
    // Don't leak internal error codes to client
    const clientMessage = err.statusCode >= 500 ? 'An unexpected error occurred' : err.message;

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: clientMessage,
      },
    });
  }

  // Domain errors (state machine, validation, authorization)
  // Map known subclasses to appropriate HTTP status codes.
  if (err instanceof DomainError) {
    let statusCode = 400;
    let code = 'DEAL_001';

    if (err instanceof UnauthorizedAccessError) {
      statusCode = 403;
      code = 'AUTH_011';
    } else if (err instanceof DealTermsValidationError) {
      statusCode = 400;
      code = 'VAL_001';
    } else if (err instanceof DealVersionConflictError) {
      statusCode = 409;
      code = 'RES_002';
    } else if (err instanceof InvalidStateError) {
      statusCode = 400;
      code = 'DEAL_001';
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: err.message,
      },
    });
  }

  // Generic errors
  if (config.server.nodeEnv === 'production') {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SYS_001',
        message: 'An unexpected error occurred',
      },
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'SYS_001',
      message: err.message,
    },
  });
};

/**
 * Not found handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'RES_001',
      message: `Route '${req.method} ${req.path}' not found`,
    },
  });
};
