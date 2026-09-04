// routes/payment.routes.ts
/**
 * Payment routes for deal funding and refund operations.
 *
 * Routes:
 * - POST /deals/:id/fund        → 201, fundingStatus = FUNDED
 * - POST /deals/:id/refund      → 200, fundingStatus = REFUNDED
 * - GET  /deals/:id/payment-status → 200
 *
 * All routes are thin — they delegate to PaymentService for business logic.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { mockAwareAuth } from '../middleware/mockAuth.js';
import { paymentService } from '../services/PaymentService.js';

const router = Router();

/**
 * POST /deals/:id/fund
 *
 * Fund a deal.
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed
 * - Unrelated users → NOT allowed
 *
 * State requirements:
 * - Deal must be in ACCEPTED status
 * - Funding must not have already occurred (NOT_FUNDED only)
 *
 * Returns 201 with fundingStatus = FUNDED.
 */
router.post(
  '/:id/fund',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await paymentService.fundDeal(id, {
        id: req.user!.id,
        role: req.user!.role as 'BRAND' | 'CREATOR' | 'HRT' | 'ADMIN',
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals/:id/refund
 *
 * Refund a funded deal.
 *
 * Authorization:
 * - Brand participant associated with the deal → allowed
 * - Admin → allowed
 * - Creator → NOT allowed
 *
 * State requirements:
 * - Deal must be in FUNDED funding status
 * - Non-funded deal → 400
 *
 * Returns 200 with fundingStatus = REFUNDED.
 */
router.post(
  '/:id/refund',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await paymentService.refundDeal(id, {
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
 * GET /deals/:id/payment-status
 *
 * Get the payment/funding status for a deal.
 *
 * Returns the existing funding/payment state supported by the current data model.
 */
router.get(
  '/:id/payment-status',
  mockAwareAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await paymentService.getPaymentStatus(
        id,
        req.user!.id,
        req.user!.role,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;