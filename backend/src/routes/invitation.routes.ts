import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { listCreatorInvitations, transitionDeal } from '../services/DealService.js';
import type { DealAction } from '../domain/state-machine/DealStateMachine.js';

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
router.get('/', mockAwareAuth, async (req: Request, res: Response, next: NextFunction) => {
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

/**
 * POST /invitations/:id/accept
 * Accept a deal invitation.
 *
 * Delegates to the existing DealStateMachine transition
 * (PENDING_ACCEPTANCE → ACCEPTED, CREATOR-only). The state machine
 * enforces both role and deal-participation at the server level.
 */
router.post(
  '/:id/accept',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const deal = await transitionDeal(
        id,
        'ACCEPT' as DealAction,
        {
          id: req.user!.id,
          role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
        },
      );

      res.json({ success: true, data: { deal } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /invitations/:id/decline
 * Decline a deal invitation (terminal).
 *
 * Delegates to the existing DealStateMachine transition
 * (PENDING_ACCEPTANCE → DECLINED, CREATOR-only, terminal).
 */
router.post(
  '/:id/decline',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const deal = await transitionDeal(
        id,
        'DECLINE' as DealAction,
        {
          id: req.user!.id,
          role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
        },
      );

      res.json({ success: true, data: { deal } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
