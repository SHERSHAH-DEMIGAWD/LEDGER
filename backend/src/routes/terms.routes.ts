/**
 * routes/terms.routes.ts
 *
 * Term-refinement API surface.
 *
 * Routes:
 *  - POST   /deals/:id/terms/propose  → 201, DealTermsView
 *  - GET    /deals/:id/terms          → 200, DealTermsView
 *  - POST   /deals/:id/terms/accept   → 200, DealTermsView
 *  - POST   /deals/:id/terms/reject   → 200, DealTermsView
 *
 * All routes delegate to DealService term-refinement functions.
 * Actor identity is extracted from the verified JWT — never from request body.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { validate } from '../middleware/validate.js';
import {
  proposeTerms,
  acceptProposal,
  rejectProposal,
  getDealTerms,
} from '../services/DealService.js';
import {
  proposeTermsSchema,
  acceptProposalSchema,
  rejectProposalSchema,
} from '../schemas/deal.schemas.js';

const router = Router();

/**
 * GET /deals/:id/terms
 *
 * Get the current authoritative terms and any pending proposal for a deal.
 *
 * Returns DealTermsView:
 *  - authoritativeVersionNumber: the version that is currently active
 *  - authoritativeTerms: the active term payload
 *  - pendingVersionNumber: the version number of a pending proposal, or null
 *  - pendingTerms: the pending term payload, or null
 *
 * Authorization: deal participants (brand, creator), ADMIN, or HRT (disputes only).
 */
router.get(
  '/:id/terms',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const view = await getDealTerms(
        id,
        req.user!.id,
        req.user!.role,
      );
      res.json({ success: true, data: { terms: view } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/terms/propose
 *
 * Brand proposes a new set of terms for an existing deal.
 *
 * The proposal is recorded as a new pending DealVersion. The existing
 * authoritative version is NOT changed — the counterparty must explicitly
 * accept the proposal before it becomes active.
 *
 * Authorization: BRAND participants only (ADMIN not allowed).
 * Lifecycle: ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *
 * Returns 201 with DealTermsView.
 * Returns 400 if terms are invalid or deal is in wrong state.
 * Returns 409 if a proposal is already pending.
 */
router.post(
  '/:id/terms/propose',
  mockAwareAuth,
  validate(proposeTermsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { terms } = req.body;
      const view = await proposeTerms(id, terms, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.status(201).json({ success: true, data: { terms: view } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/terms/accept
 *
 * Creator accepts the current pending term proposal.
 *
 * The pending version becomes authoritative: its isPending flag is cleared
 * and the deal's acceptedVersionNumber points to it.
 *
 * Authorization: CREATOR participants only.
 * Lifecycle: ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *
 * Returns 200 with DealTermsView.
 * Returns 400 if no proposal is pending or deal is in wrong state.
 */
router.post(
  '/:id/terms/accept',
  mockAwareAuth,
  validate(acceptProposalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const view = await acceptProposal(id, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: { terms: view } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/terms/reject
 *
 * Creator rejects the current pending term proposal.
 *
 * The pending version is cleared (marked non-pending). The previously
 * authoritative version remains authoritative — nothing changes commercially.
 *
 * Authorization: CREATOR participants only.
 * Lifecycle: ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *
 * Returns 200 with DealTermsView.
 * Returns 400 if no proposal is pending or deal is in wrong state.
 */
router.post(
  '/:id/terms/reject',
  mockAwareAuth,
  validate(rejectProposalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const view = await rejectProposal(id, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.json({ success: true, data: { terms: view } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
