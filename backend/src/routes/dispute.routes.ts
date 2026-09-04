/**
 * routes/dispute.routes.ts
 *
 * Routes for the dispute lifecycle.
 *
 * Routes:
 * - POST /deals/:id/dispute  → 200, status = DISPUTED   (brand or admin only)
 * - POST /deals/:id/resolve  → 200, status = RESOLVED   (HRT or admin only)
 *
 * Both routes delegate to DisputeService, which validates the state-machine
 * transition and produces dedicated audit events.
 *
 * These routes are supplementary to the generic /deals/:id/transition endpoint.
 * They exist because:
 * 1. They require request bodies (dispute/resolution notes) that the generic
 *    transition endpoint does not handle.
 * 2. They produce dedicated audit events (DISPUTE.RAISED, DISPUTE.RESOLVED).
 * 3. The state machine transitions are still used under the hood, preserving
 *    a single source of truth for state and authorization.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { validate } from '../middleware/validate.js';
import { disputeService } from '../services/DisputeService.js';
import {
  raiseDisputeSchema,
  resolveDisputeSchema,
} from '../schemas/deal.schemas.js';

const router = Router();

/**
 * POST /deals/:id/dispute
 *
 * Raise a dispute on submitted deliverables (Brand only).
 *
 * Body: { note: string } (required)
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed (403)
 * - HRT → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in SUBMITTED status
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/dispute',
  mockAwareAuth,
  validate(raiseDisputeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { note } = req.body as { note: string };
      const result = await disputeService.raiseDispute(id, note, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/resolve
 *
 * Resolve an active dispute (HRT or Admin only).
 *
 * Body: { note: string } (required)
 *
 * Authorization:
 * - HRT → allowed
 * - Admin → allowed
 * - Brand → NOT allowed (403)
 * - Creator → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in DISPUTED status
 *
 * The resolution note is persisted on the Deal row (latestRevisionNote)
 * and recorded in the audit trail (DISPUTE.RESOLVED metadata).
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/resolve',
  mockAwareAuth,
  validate(resolveDisputeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { note } = req.body as { note: string };
      const result = await disputeService.resolveDispute(id, note, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
