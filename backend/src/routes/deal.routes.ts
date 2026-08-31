import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createDeal,
  getDeal,
  getDealState,
  listDeals,
  transitionDeal,
  inviteCreator,
  getDealHistory,
} from '../services/DealService.js';
import {
  createDealSchema,
  transitionDealSchema,
  inviteCreatorSchema,
} from '../schemas/deal.schemas.js';
import type { DealAction } from '../domain/state-machine/DealStateMachine.js';

const router = Router();

/**
 * GET /deals
 * List deals accessible to the authenticated user.
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deals = await listDeals(req.user!.id, req.user!.role);
    res.json({ success: true, data: { deals } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /deals
 * Create a new deal (BRAND or ADMIN).
 */
router.post(
  '/',
  authenticate,
  validate(createDealSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { terms } = req.body;
      const deal = await createDeal(terms, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.status(201).json({ success: true, data: { deal } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/invite
 * Invite a creator to a draft deal (BRAND only).
 */
router.post(
  '/:id/invite',
  authenticate,
  validate(inviteCreatorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { creatorId } = req.body;
      const deal = await inviteCreator(id, creatorId, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: { deal } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /deals/:id
 * Get a single deal (participant, HRT, or ADMIN).
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deal = await getDeal(id, req.user!.id, req.user!.role);
    res.json({ success: true, data: { deal } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /deals/:id/state
 * Get current state and available actions for a deal.
 * Powers the DealStateTimeline on the frontend.
 */
router.get('/:id/state', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const state = await getDealState(id, req.user!.id, req.user!.role);
    res.json({ success: true, data: { state } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /deals/:id/history
 * Get audit history for a deal.
 */
router.get('/:id/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const history = await getDealHistory(id, req.user!.id, req.user!.role);
    res.json({ success: true, data: { history } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /deals/:id/transition
 * Perform a state transition (server-side authoritative).
 *
 * Body: { action: DealAction }
 *
 * The server validates:
 * - Current deal state
 * - Actor authorization (role + participation)
 * - That the requested action is defined from the current state
 *
 * Invalid transitions return 400 with INVALID_TRANSITION error code.
 * Unauthorized attempts return 403.
 */
router.post(
  '/:id/transition',
  authenticate,
  validate(transitionDealSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { action } = req.body;
      const deal = await transitionDeal(id, action as DealAction, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: { deal } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;