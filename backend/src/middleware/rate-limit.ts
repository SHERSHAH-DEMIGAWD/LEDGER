import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request } from 'express';
import { config } from '../config.js';

/**
 * Derive a rate-limit key from the request.
 *
 * Relies on req.ip which is set by Express based on `app.set('trust proxy', ...)`.
 * If req.ip is missing (should not happen after trust proxy is configured),
 * we throw rather than silently fall back to a shared 'unknown' key that would
 * allow all such requests to share one bucket and DoS legitimate users.
 */
function keyFromReq(req: Request): string {
  const ip = req.ip;
  if (!ip) {
    // Throw to prevent a silent shared-bucket DoS. The error handler will
    // return 500 (or 400) — better than silently weakening rate limiting.
    throw new Error('req.ip unavailable; check trust proxy configuration');
  }
  return ip;
}

/**
 * Rate limiter for authentication endpoints
 * 5 attempts per 15 minutes per IP (configurable via env)
 */
export const authRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_001',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  keyGenerator: keyFromReq,
});

/**
 * Rate limiter for registration
 * 3 accounts per hour per IP
 */
export const registerRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_002',
      message: 'Too many accounts created from this IP. Please try again later.',
    },
  },
  keyGenerator: keyFromReq,
});
