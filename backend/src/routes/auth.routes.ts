import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { validate } from '../middleware/validate.js';
import { authRateLimit, registerRateLimit } from '../middleware/rate-limit.js';
import { register, login, verifyEmail, rotateRefreshToken, revokeRefreshToken, generateAccessToken } from '../services/auth.service.js';
import { registerSchema, loginSchema, verifyEmailSchema } from '../schemas/auth.schemas.js';

const router = Router();

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register', registerRateLimit, validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, role } = req.body;
    const result = await register({ email, password, role });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        },
        message: 'Registration successful. Please check your email to verify your account.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/login
 * Login and receive tokens
 */
router.post('/login', authRateLimit, validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await login({ email, password });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth/refresh', // Only sent to refresh endpoint
    });

    res.json({
      success: true,
      data: {
        accessToken: result.tokens.accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          emailVerified: result.user.emailVerified,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout
 * Logout and revoke refresh token
 */
router.post('/logout', mockAwareAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      path: '/auth/refresh',
    });

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token from cookie
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_010', message: 'Refresh token required' },
      });
      return;
    }

    const result = await rotateRefreshToken(refreshToken);

    // Set new refresh token cookie (token rotation)
    res.cookie('refreshToken', result.newToken, {
      httpOnly: true,
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    const accessToken = generateAccessToken(result.user);

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          emailVerified: result.user.emailVerified,
        },
      },
    });
  } catch (error) {
    // Clear cookie on refresh failure
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      path: '/auth/refresh',
    });
    next(error);
  }
});

/**
 * POST /auth/verify-email
 * Verify email with token
 */
router.post('/verify-email', validate(verifyEmailSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    await verifyEmail(token);

    res.json({
      success: true,
      data: { message: 'Email verified successfully' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
