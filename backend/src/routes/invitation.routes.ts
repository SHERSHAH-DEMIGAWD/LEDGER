import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listCreatorInvitations } from '../services/DealService.js';

const router = Router();

/**
 * GET /invitations
 * List pending deal invitations for the authenticated creator.
 *
 * Returns deals in PENDING_ACCEPTANCE state where the creatorId matches
 * the authenticated user.
 *
 * Authorization: Any authenticated user. Non-creators get an empty array.
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await listCreatorInvitations(
      req.user!.id,
      req.user!.role,
    );

    res.json({
      success: true,
      data: { invitations },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
