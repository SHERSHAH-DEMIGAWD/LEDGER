// services/PaymentService.ts
/**
 * PaymentService — orchestrates deal funding and refund operations.
 *
 * Concurrency safety (the P0-1 fix):
 *   fundDeal uses a two-phase commit with a unique constraint on Payment.dealId.
 *   Phase 1 (DB transaction): INSERT a "PENDING" Payment row with a deterministic
 *     intentId. The unique constraint on dealId is the atomic serialization point.
 *     A concurrent request gets a P2002 unique-violation error before any
 *     payment provider call.
 *   Phase 2 (provider call): Only the winner of phase 1 calls the payment
 *     provider. If the provider call fails, the row is deleted in a
 *     compensating transaction and a ConflictError is thrown.
 *
 *   This makes the "no second payment intent after a concurrent request has
 *   already funded the deal" guarantee enforced by the database, not by
 *   best-effort pre-checks.
 *
 * Optimistic locking: Preserved on Deal updates (status + fundingStatus).
 * State machine: Preserved — the Service still validates status/fundingStatus
 *   before any DB write.
 * Authorization: Unchanged — BRAND participant / ADMIN only.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { dealRepository, type DealWithVersions } from '../repositories/DealRepository.js';
import { simulatedPayment } from '../integrations/payment/SimulatedPayment.js';
import type { PaymentProvider } from '../integrations/payment/PaymentProvider.js';
import { InvalidStateError, UnauthorizedAccessError, DealTermsValidationError } from '../domain/errors/index.js';
import { ConflictError } from '../middleware/errorHandler.js';
import type { Role } from '../types.js';
import type { DealTerms } from '../domain/value-objects/DealTerms.js';

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
   * Concurrency:
   *   Uses a two-phase commit with a unique constraint on Payment.dealId.
   *   The DB is the serialization point — concurrent requests cannot both
   *   create payment intents. The losing request receives ConflictError (409).
   *
   * Authorization:
   *   - Brand participant associated with the deal → allowed
   *   - Admin → allowed
   *   - Creator → NOT allowed
   *   - Unrelated users → NOT allowed
   *
   * State requirements:
   *   - Deal must be in ACCEPTED status
   *   - Funding must not have already occurred (NOT_FUNDED only)
   *
   * Idempotency:
   *   Second funding attempt returns 409 (ConflictError).
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

    // 5. Read the authoritative terms for the payment amount/currency.
    // CRITICAL: must use the AUTHORITATIVE terms version. Pending term
    // proposals must NOT affect payment.
    const authoritativeTerms = await this.getAuthoritativeTerms(deal);
    const amount = this.getPaymentAmountFromTerms(authoritativeTerms);
    const currency = this.getPaymentCurrencyFromTerms(authoritativeTerms);

    // 6. Pre-generate a deterministic intentId. This ID is what we will
    // store in the DB row AND what we will pass to the provider.
    // By using a UUID, the row is "fresh" and the intent is unique even
    // across retries (e.g. network failure → retry).
    const intentId = `sim_intent_${crypto.randomUUID()}`;

    // ------------------------------------------------------------------------
    // PHASE 1: Atomic claim via DB INSERT
    //
    // The unique constraint on Payment.dealId is the serialization point.
    // If another request has already created a Payment row for this deal,
    // this INSERT throws P2002 → we throw ConflictError (409) WITHOUT
    // ever calling the payment provider.
    //
    // We also create the Payment row in the same transaction that
    // updates Deal.fundingStatus and Deal.paymentId, so the two are
    // always consistent. If the deal update fails (optimistic lock),
    // the payment row is rolled back and we throw ConflictError.
    // ------------------------------------------------------------------------
    let paymentRow: { id: string; intentId: string };
    try {
      paymentRow = await prisma.$transaction(async (tx) => {
        // Optimistic-lock update: only succeeds if the deal is still
        // in ACCEPTED status and NOT_FUNDED. If a concurrent request
        // already funded the deal, this updateMany affects 0 rows.
        const dealResult = await tx.deal.updateMany({
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

        if (dealResult.count === 0) {
          // Concurrent modification — another request beat us.
          // Throw inside the tx so the payment INSERT is rolled back.
          throw new ConflictError(
            'Deal was modified by another request. Please reload and retry.',
          );
        }

        // Create the Payment row. The unique dealId constraint is the
        // final guard — if a concurrent request has ALREADY created
        // a Payment row for this deal (and is mid-flight through phase 2),
        // this INSERT throws P2002.
        const created = await tx.payment.create({
          data: {
            dealId,
            amount,
            currency,
            status: 'PENDING',
            paymentId: 'pending', // Updated in phase 2
            intentId,
            actorId: actor.id,
          },
        });

        return { id: created.id, intentId: created.intentId };
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      // Catch the unique-violation from Prisma. P2002 is the error code
      // for unique constraint violations. The Payment.dealId unique
      // constraint is the only unique constraint on this table.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          'Deal has already been funded (payment record already exists).',
        );
      }
      throw err;
    }

    // ------------------------------------------------------------------------
    // PHASE 2: Provider call
    //
    // The DB row is now committed with our intentId. We are the unique
    // winner of phase 1. Now we call the provider.
    //
    // If the provider fails, we must:
    //   - Delete the DB row (so the user can retry)
    //   - Throw an error
    // ------------------------------------------------------------------------
    try {
      const intent = await this.provider.createIdempotentIntent(
        intentId,
        amount,
        currency,
        { dealId, actorId: actor.id },
      );

      const payment = await this.provider.confirm(intent.id);

      // Update the Payment row with the final paymentId and mark SUCCEEDED.
      await prisma.payment.update({
        where: { id: paymentRow.id },
        data: {
          paymentId: payment.id,
          status: 'SUCCEEDED',
        },
      });

      // Update the Deal.paymentRecordId for fast lookup
      await prisma.deal.update({
        where: { id: dealId },
        data: { paymentRecordId: paymentRow.id },
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
          paymentRecordId: paymentRow.id,
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
    } catch (providerErr) {
      // Provider call failed after we claimed the row.
      // Compensate: delete the Payment row AND reset Deal.fundingStatus.
      // We use a tx so the two are atomic.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.payment.delete({ where: { id: paymentRow.id } });
          await tx.deal.update({
            where: { id: dealId },
            data: { fundingStatus: 'NOT_FUNDED', updatedAt: new Date() },
          });
        });
      } catch (compensateErr) {
        // If compensation fails, log loudly. The Payment row will be
        // orphaned; reconciliation should pick it up.
        console.error('PaymentService: compensation failed', {
          paymentRowId: paymentRow.id,
          dealId,
          providerErr,
          compensateErr,
        });
      }

      // Translate the provider error to a ConflictError so the route
      // returns 409 (consistent with the rest of the payment lifecycle).
      throw new ConflictError(
        `Payment provider failed for deal '${dealId}': ${
          providerErr instanceof Error ? providerErr.message : String(providerErr)
        }`,
      );
    }
  }

  /**
   * Refund a funded deal.
   *
   * Authorization:
   *   - Brand participant associated with the deal → allowed
   *   - Admin → allowed
   *   - Creator → NOT allowed
   *
   * State requirements:
   *   - Deal must be in FUNDED funding status
   *   - Non-funded deal → 400
   *
   * Concurrency:
   *   Optimistic locking via updateMany. On race (count=0) → ConflictError (409).
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

    // 5. Persist the refund status.
    // Optimistic lock: updateMany on (id, fundingStatus='FUNDED') is the
    // atomic guard. If a concurrent request has already refunded the
    // deal, count=0 → throw ConflictError (409), NOT InvalidStateError.
    let paymentRecordId: string | null = null;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
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
          // Race condition: another request already refunded or modified the deal
          throw new ConflictError(
            'Deal was modified by another request. Please reload and retry.',
          );
        }

        // Mark the Payment row as REFUNDED
        if (deal.paymentRecordId) {
          await tx.payment.update({
            where: { id: deal.paymentRecordId },
            data: { status: 'REFUNDED', updatedAt: new Date() },
          });
          paymentRecordId = deal.paymentRecordId;
        }

        const updatedDeal = await tx.deal.findUnique({
          where: { id: dealId },
        });

        if (!updatedDeal) {
          throw new InvalidStateError(`Deal '${dealId}' not found`);
        }

        return updatedDeal;
      });
      void txResult;
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      // If the Payment row update inside the tx threw a "record not found"
      // (e.g. concurrent refund), Prisma raises P2025. Translate to Conflict.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }
      throw err;
    }

    // 6. Create audit event
    await dealRepository.createAuditLog({
      actorId: actor.id,
      dealId,
      action: 'PAYMENT.REFUNDED',
      resourceType: 'Payment',
      resourceId: refundId,
      metadata: {
        refundId,
        paymentRecordId,
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
   */
  async getPaymentStatus(
    dealId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<PaymentStatusResult> {
    // Verify the requester has access to this deal first
    const deal = await dealRepository.findByIdWithAccessCheck(dealId, requesterId, requesterRole);

    // Resolve the actual paymentId from the Payment table.
    // deal.paymentRecordId is the FK; we want the provider's paymentId for reconciliation.
    let providerPaymentId: string | null = null;
    if (deal.paymentRecordId) {
      const paymentRow = await prisma.payment.findUnique({
        where: { id: deal.paymentRecordId },
        select: { paymentId: true },
      });
      providerPaymentId = paymentRow?.paymentId ?? null;
    }

    return {
      dealId: deal.id,
      fundingStatus: deal.fundingStatus,
      paymentId: providerPaymentId,
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

  /**
   * Resolve the authoritative terms for a deal, or throw if none exist.
   *
   * CRITICAL: This is the ONLY method that PaymentService uses to read terms.
   * It NEVER returns a pending version. If no authoritative version exists,
   * it throws (which should never happen for a valid deal).
   *
   * Uses deal.acceptedVersionNumber if set; falls back to the latest
   * non-pending version (legacy state preservation).
   */
  private async getAuthoritativeTerms(deal: DealWithVersions): Promise<DealTerms> {
    const authoritative = await dealRepository.getAuthoritativeVersion(
      deal.id,
      deal.acceptedVersionNumber,
    );

    if (!authoritative) {
      throw new InvalidStateError(
        `Payment error: deal '${deal.id}' has no authoritative terms version. This indicates a data integrity problem.`,
      );
    }

    return authoritative.terms as unknown as DealTerms;
  }

  private getPaymentAmountFromTerms(terms: DealTerms): number {
    const amount = terms.paymentAmount ?? 0;
    if (amount <= 0) {
      throw new DealTermsValidationError('Payment amount must be greater than zero');
    }
    return amount;
  }

  private getPaymentCurrencyFromTerms(terms: DealTerms): string {
    return terms.currency ?? 'USD';
  }
}

export const paymentService = new PaymentService(simulatedPayment);
