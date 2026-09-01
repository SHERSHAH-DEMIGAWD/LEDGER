import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { getUserById } from '../services/auth.service.js';
import { NotFoundError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /users/me
 * Get current user information
 * Requires authentication
 */
router.get('/me', mockAwareAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.user is set by mockAwareAuth from verified JWT or mock header
    // Never trust client-provided user IDs
    const userId = req.user!.id;

    const user = await getUserById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
