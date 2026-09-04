// services/PaymentService.ts
/**
 * PaymentService — orchestrates deal funding and refund operations.
 *
 * This service owns the funding business logic:
 * 1. Validate deal existence
 * 2. Validate authorization (brand participant or admin)
 * 3. Validate deal state (must be ACCEPTED for funding)
 * 4. Enforce idempotency (already FUNDED → 409)
 * 5. Invoke PaymentProvider
 * 6. Update funding status
 * 7. Create PAYMENT.FUNDED audit event
 * 8. Return the resulting payment/funding information
 */

import { prisma } from '../db.js';
import { dealRepository, type DealWithVersions } from '../repositories/DealRepository.js';
import { simulatedPayment } from '../integrations/payment/SimulatedPayment.js';
import type { PaymentProvider } from '../integrations/payment/PaymentProvider.js';
import { InvalidStateError, UnauthorizedAccessError } from '../domain/errors/index.js';
import { ConflictError } from '../middleware/errorHandler.js';
import type { Role } from '../types.js';

export interface PaymentActor {
  id: string;
  role: Role;
}

export interface FundResult {
  dealId: string;
  paymentId: string;
  fundingStatus: 'FUNDED';
}

export interface RefundResult {
  dealId: string;
  paymentId: string;
  fundingStatus: 'REFUNDED';
}

export interface PaymentStatusResult {
  dealId: string;
  fundingStatus: 'NOT_FUNDED' | 'FUNDED' | 'REFUNDED';
  paymentId: string | null;
}

export class PaymentService {
  constructor(private readonly provider: PaymentProvider) {}

  /**
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
   * Idempotency:
   * - Second funding attempt returns 409 (ConflictError)
   */
  async fundDeal(
    dealId: string,
    actor: PaymentActor,
  ): Promise<FundResult> {
    // 1. Load the deal
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization
    this.verifyFundingAuthorization(deal, actor);

    // 3. Verify deal is in ACCEPTED state
    if (deal.status !== 'ACCEPTED') {
      throw new InvalidStateError(
        `Cannot fund deal in state '${deal.status}'. Deal must be in ACCEPTED status.`,
      );
    }

    // 4. Verify funding has not already occurred
    if (deal.fundingStatus !== 'NOT_FUNDED') {
      throw new ConflictError(
        `Deal has already been funded (fundingStatus: ${deal.fundingStatus})`,
      );
    }

    // 5. Call the simulated payment provider
    const intent = await this.provider.createIntent(
      this.getPaymentAmount(deal),
      this.getPaymentCurrency(deal),
      { dealId, actorId: actor.id },
    );

    const payment = await this.provider.confirm(intent.id);

    // 6. Persist the funding status
    await prisma.$transaction(async (tx) => {
      const result = await tx.deal.updateMany({
        where: {
          id: dealId,
          fundingStatus: 'NOT_FUNDED',
          status: 'ACCEPTED',
        },
        data: {
          fundingStatus: 'FUNDED',
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        // Race condition: another request already funded the deal
        throw new ConflictError(
          `Deal was modified by another request. Please reload and retry.`,
        );
      }

      const updatedDeal = await tx.deal.findUnique({
        where: { id: dealId },
      });

      if (!updatedDeal) {
        throw new InvalidStateError(`Deal '${dealId}' not found`);
      }

      return updatedDeal;
    });

    // 7. Create audit event
    await dealRepository.createAuditLog({
      actorId: actor.id,
      dealId,
      action: 'PAYMENT.FUNDED',
      resourceType: 'Payment',
      resourceId: payment.id,
      metadata: {
        paymentId: payment.id,
        intentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        dealStatus: deal.status,
        fromFundingStatus: 'NOT_FUNDED',
        toFundingStatus: 'FUNDED',
      },
    });

    return {
      dealId,
      paymentId: payment.id,
      fundingStatus: 'FUNDED',
    };
  }

  /**
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
   */
  async refundDeal(
    dealId: string,
    actor: PaymentActor,
  ): Promise<RefundResult> {
    // 1. Load the deal
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization
    this.verifyFundingAuthorization(deal, actor);

    // 3. Verify deal is funded
    if (deal.fundingStatus !== 'FUNDED') {
      throw new InvalidStateError(
        `Cannot refund deal with fundingStatus '${deal.fundingStatus}'. Deal must be FUNDED.`,
      );
    }

    // 4. Simulated refund always succeeds
    const refundId = `sim_refund_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 5. Persist the refund status
    await prisma.$transaction(async (tx) => {
      const result = await tx.deal.updateMany({
        where: {
          id: dealId,
          fundingStatus: 'FUNDED',
        },
        data: {
          fundingStatus: 'REFUNDED',
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new InvalidStateError(
          `Deal was modified by another request. Please reload and retry.`,
        );
      }

      const updatedDeal = await tx.deal.findUnique({
        where: { id: dealId },
      });

      if (!updatedDeal) {
        throw new InvalidStateError(`Deal '${dealId}' not found`);
      }

      return updatedDeal;
    });

    // 6. Create audit event
    await dealRepository.createAuditLog({
      actorId: actor.id,
      dealId,
      action: 'PAYMENT.REFUNDED',
      resourceType: 'Payment',
      resourceId: refundId,
      metadata: {
        refundId,
        dealStatus: deal.status,
        fromFundingStatus: 'FUNDED',
        toFundingStatus: 'REFUNDED',
      },
    });

    return {
      dealId,
      paymentId: refundId,
      fundingStatus: 'REFUNDED',
    };
  }

  /**
   * Get the payment/funding status for a deal.
   *
   * Returns the existing funding/payment state supported by the current data model.
   */
  async getPaymentStatus(
    dealId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<PaymentStatusResult> {
    // Verify the requester has access to this deal first
    await dealRepository.findByIdWithAccessCheck(dealId, requesterId, requesterRole);

    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    return {
      dealId: deal.id,
      fundingStatus: deal.fundingStatus,
      paymentId: null, // The current data model does not store payment IDs
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private verifyFundingAuthorization(
    deal: DealWithVersions,
    actor: PaymentActor,
  ): void {
    // ADMIN can fund any deal
    if (actor.role === 'ADMIN') return;

    // Only BRAND participants can fund
    if (actor.role === 'BRAND') {
      if (deal.brandId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the deal brand can fund this deal',
      );
    }

    // CREATOR and other roles cannot fund
    throw new UnauthorizedAccessError(
      'Only deal brand participants can fund this deal',
    );
  }

  private getPaymentAmount(deal: DealWithVersions): number {
    const latestVersion = deal.versions[deal.versions.length - 1];
    if (latestVersion?.terms) {
      const terms = latestVersion.terms as { paymentAmount?: number };
      return terms.paymentAmount ?? 0;
    }
    return 0;
  }

  private getPaymentCurrency(deal: DealWithVersions): string {
    const latestVersion = deal.versions[deal.versions.length - 1];
    if (latestVersion?.terms) {
      const terms = latestVersion.terms as { currency?: string };
      return terms.currency ?? 'USD';
    }
    return 'USD';
  }
}

export const paymentService = new PaymentService(simulatedPayment);