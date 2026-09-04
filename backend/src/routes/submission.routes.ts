/**
 * routes/submission.routes.ts
 *
 * Routes for the deliverable submission, review, revision, and completion
 * lifecycle.
 *
 * Routes:
 * - POST /deals/:id/submit          → 200, status = SUBMITTED
 * - POST /deals/:id/request-revision → 200, status = IN_PROGRESS
 * - POST /deals/:id/approve         → 200, status = APPROVED
 * - POST /deals/:id/complete        → 200, status = COMPLETED
 *
 * All routes are thin — they delegate to SubmissionService for business logic.
 *
 * These routes are supplementary to the generic /deals/:id/transition endpoint.
 * They exist because:
 * 1. They require request bodies (submission/revision notes) that the generic
 *    transition endpoint does not handle.
 * 2. They produce dedicated audit events (DELIVERABLE.SUBMITTED,
 *    DELIVERABLE.REVISION_REQUESTED, DELIVERABLE.APPROVED, PAYMENT.RELEASED)
 *    that are specific to the deliverable lifecycle.
 * 3. The state machine transitions are still used under the hood, preserving
 *    a single source of truth for state and authorization.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { validate } from '../middleware/validate.js';
import { submissionService } from '../services/SubmissionService.js';
import {
  submitDeliverableSchema,
  requestRevisionSchema,
  approveDeliverableSchema,
  releasePaymentSchema,
} from '../schemas/deal.schemas.js';

const router = Router();

/**
 * POST /deals/:id/submit
 *
 * Submit deliverables for an in-progress deal (Creator only).
 *
 * Body: { note?: string }
 *
 * Authorization:
 * - Creator participant associated with the deal → allowed
 * - Admin → allowed
 * - Brand → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in IN_PROGRESS status
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/submit',
  mockAwareAuth,
  validate(submitDeliverableSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { note } = req.body as { note?: string };
      const result = await submissionService.submitDeliverable(id, note, {
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
 * POST /deals/:id/request-revision
 *
 * Request a revision on a submitted deal (Brand only).
 *
 * Body: { note: string } (required)
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in SUBMITTED status
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/request-revision',
  mockAwareAuth,
  validate(requestRevisionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { note } = req.body as { note: string };
      const result = await submissionService.requestRevision(id, note, {
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
 * POST /deals/:id/approve
 *
 * Approve submitted deliverables (Brand only).
 *
 * Body: (no payload required)
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in SUBMITTED status
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/approve',
  mockAwareAuth,
  validate(approveDeliverableSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await submissionService.approveDeliverable(id, {
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
 * POST /deals/:id/complete
 *
 * Release payment and complete an approved deal (Brand only).
 *
 * Body: (no payload required)
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed (403)
 * - Unrelated users → NOT allowed (403)
 *
 * State requirements:
 * - Deal must be in APPROVED status
 *
 * Returns 200 with the new status and timestamp.
 */
router.post(
  '/:id/complete',
  mockAwareAuth,
  validate(releasePaymentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await submissionService.releasePayment(id, {
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
