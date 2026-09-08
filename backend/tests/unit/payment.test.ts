/**
 * Unit tests for PaymentService.
 *
 * Tests the business logic for deal funding and refund operations:
 * - Authorization rules (brand/admin only, creator blocked)
 * - State machine enforcement (ACCEPTED required for funding)
 * - Idempotency (double-fund returns 409)
 * - P2002 unique-violation translates to ConflictError
 * - Audit log creation
 * - paymentRecordId persistence on Deal
 *
 * The mocks simulate the real Prisma transaction surface so the
 * "unique constraint is the atomic guard" contract can be tested
 * directly. The concurrent funding test drives two fundDeal calls
 * against a shared transaction mock that simulates the unique-violation
 * for the second caller — proving the race is impossible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

import { PaymentService } from '../../src/services/PaymentService.js';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';
import { InvalidStateError, UnauthorizedAccessError, DealTermsValidationError } from '../../src/domain/errors/index.js';
import { ConflictError } from '../../src/middleware/errorHandler.js';

// ---------------------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------------------

const mockFindById = vi.fn();
const mockFindByIdWithAccessCheck = vi.fn();
const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
const mockGetAuthoritativeVersion = vi.fn();

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdWithAccessCheck: (...args: unknown[]) => mockFindByIdWithAccessCheck(...args),
    createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
    getAuthoritativeVersion: (...args: unknown[]) => mockGetAuthoritativeVersion(...args),
  },
}));

// Prisma transaction mock that models the real DB behavior:
// - updateMany: counts 1 on success, 0 on concurrent modification
// - payment.create: succeeds once, throws P2002 on duplicate (concurrent race)
// - deal.update (for paymentRecordId): succeeds always
const mockDealUpdateMany = vi.fn();
const mockPaymentCreate = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockDealUpdate = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentDelete = vi.fn();

// Tracks the "claimed dealIds" — second payment.create for same dealId throws P2002
const claimedDealIds = new Set<string>();

const prismaTransactionMock = (fn: (tx: any) => any) => fn({
  deal: {
    updateMany: (...args: unknown[]) => mockDealUpdateMany(...args),
    update: (...args: unknown[]) => mockDealUpdate(...args),
    findUnique: vi.fn().mockResolvedValue({ id: 'deal-1', fundingStatus: 'FUNDED' }),
  },
  payment: {
    create: (...args: unknown[]) => mockPaymentCreate(...args),
    update: (...args: unknown[]) => mockPaymentUpdate(...args),
    findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
    delete: (...args: unknown[]) => mockPaymentDelete(...args),
  },
});

vi.mock('../../src/db.js', () => ({
  prisma: {
    $transaction: vi.fn((fn) => prismaTransactionMock(fn)),
    deal: {
      update: (...args: unknown[]) => mockDealUpdate(...args),
    },
    payment: {
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
      findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
    },
  },
}));

const mockCreateIdempotentIntent = vi.fn();
const mockConfirm = vi.fn();
// Legacy createIntent kept for backward compat
const mockCreateIntent = vi.fn();

const mockProvider = {
  createIntent: (...args: unknown[]) => mockCreateIntent(...args),
  createIdempotentIntent: (...args: unknown[]) => mockCreateIdempotentIntent(...args),
  confirm: (...args: unknown[]) => mockConfirm(...args),
};

// ---------------------------------------------------------------------------------------
// Sample data factories
// ---------------------------------------------------------------------------------------

function makeAcceptedDeal(overrides?: Partial<DealWithVersions>): DealWithVersions {
  return {
    id: 'deal-1',
    brandId: 'brand-1',
    creatorId: 'creator-1',
    status: 'ACCEPTED',
    contractId: null,
    fundingStatus: 'NOT_FUNDED',
    paymentRecordId: null,
    latestRevisionNote: null,
    latestRevisionNoteAuthorId: null,
    latestRevisionNoteAt: null,
    acceptedVersionNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'v1',
        versionNumber: 1,
        isPending: false,
        terms: { title: 'T', description: 'D', deliverables: [], paymentAmount: 50000, currency: 'USD' },
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

function makeFundedDeal(overrides?: Partial<DealWithVersions>): DealWithVersions {
  return {
    ...makeAcceptedDeal(),
    id: 'deal-2',
    fundingStatus: 'FUNDED',
    paymentRecordId: 'payment-record-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

describe('PaymentService.fundDeal', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService(mockProvider as any);
    vi.clearAllMocks();
    claimedDealIds.clear();

    // Default: updateMany succeeds (counts 1)
    mockDealUpdateMany.mockResolvedValue({ count: 1 });

    // Default: payment.create succeeds unless dealId is already claimed
    mockPaymentCreate.mockImplementation(({ data }: { data: { dealId: string; amount?: number; currency?: string; intentId?: string; actorId?: string } }) => {
      if (claimedDealIds.has(data.dealId)) {
        // Simulate the unique constraint violation that Prisma would throw.
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`dealId`)',
          { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['dealId'] } },
        );
      }
      claimedDealIds.add(data.dealId);
      return Promise.resolve({
        id: `payment-record-${data.dealId}`,
        dealId: data.dealId,
        amount: data.amount,
        currency: data.currency,
        status: 'PENDING',
        paymentId: 'pending',
        intentId: data.intentId || 'sim_intent_uuid',
        actorId: data.actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    mockPaymentUpdate.mockResolvedValue({});
    mockDealUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValue({ paymentId: 'payment-1' });

    // Default: getAuthoritativeVersion returns whatever deal was last set on
    // findById's first version. Tests can override this.
    mockGetAuthoritativeVersion.mockImplementation((_dealId: string) => {
      const lastDeal = mockFindById.mock.results[mockFindById.mock.results.length - 1];
      if (lastDeal && lastDeal.value && (lastDeal.value as any).versions) {
        return (lastDeal.value as any).versions[0];
      }
      return null;
    });
  });

  describe('authorization', () => {
    it('allows BRAND participant who owns the deal to fund', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      const result = await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(result.fundingStatus).toBe('FUNDED');
      expect(result.paymentId).toBe('payment-1');
    });

    it('allows ADMIN to fund any deal', async () => {
      const deal = makeAcceptedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      const result = await service.fundDeal('deal-1', { id: 'admin-1', role: 'ADMIN' });

      expect(result.fundingStatus).toBe('FUNDED');
    });

    it('blocks CREATOR from funding', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-1', { id: 'creator-1', role: 'CREATOR' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('blocks BRAND who does not own the deal', async () => {
      const deal = makeAcceptedDeal({ brandId: 'brand-1' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-1', { id: 'brand-other', role: 'BRAND' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('state machine', () => {
    it('throws InvalidStateError when deal is not in ACCEPTED status', async () => {
      const deal = makeAcceptedDeal({ status: 'DRAFT' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });

    it('throws InvalidStateError when deal is in PENDING_ACCEPTANCE', async () => {
      const deal = makeAcceptedDeal({ status: 'PENDING_ACCEPTANCE' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });

    it('throws ConflictError when deal is already FUNDED', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-2', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);
    });

    it('throws InvalidStateError when deal is not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.fundDeal('nonexistent', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });

    // Test zero payment amount validation
    it('throws DealTermsValidationError when payment amount is zero', async () => {
      const dealWithZeroAmount = {
        ...makeAcceptedDeal(),
        versions: [{
          ...makeAcceptedDeal().versions[0],
          terms: { 
            ...makeAcceptedDeal().versions[0].terms,
            paymentAmount: 0 
          }
        }]
      };
      mockFindById.mockResolvedValue(dealWithZeroAmount);

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(DealTermsValidationError);
    });

    // Test negative payment amount validation
    it('throws DealTermsValidationError when payment amount is negative', async () => {
      const dealWithNegativeAmount = {
        ...makeAcceptedDeal(),
        versions: [{
          ...makeAcceptedDeal().versions[0],
          terms: { 
            ...makeAcceptedDeal().versions[0].terms,
            paymentAmount: -50000 
          }
        }]
      };
      mockFindById.mockResolvedValue(dealWithNegativeAmount);

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(DealTermsValidationError);
    });
  });

  describe('idempotency', () => {
    it('returns 409 when updateMany affects 0 rows (optimistic lock race)', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockDealUpdateMany.mockResolvedValue({ count: 0 }); // Concurrent modification

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      // The provider was NEVER called — DB guard caught it first.
      expect(mockCreateIdempotentIntent).not.toHaveBeenCalled();
    });

    it('returns 409 on P2002 unique-violation (Payment.dealId duplicate)', async () => {
      // Simulate: a concurrent request already created the Payment row
      // and committed it (so Payment.dealId unique constraint is taken).
      // Our deal.updateMany still succeeds (we won the deal status race),
      // but payment.create raises P2002.
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockDealUpdateMany.mockResolvedValue({ count: 1 });
      // Pre-claim the dealId so the next payment.create throws P2002
      claimedDealIds.add('deal-1');

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      // The provider was NEVER called — DB guard caught it first.
      expect(mockCreateIdempotentIntent).not.toHaveBeenCalled();
    });
  });

  describe('concurrent funding (the P0-1 race condition fix)', () => {
    it('allows only ONE fundDeal to succeed; the second receives ConflictError', async () => {
      // Two concurrent fundDeal requests for the same deal.
      // The DB-enforced unique constraint on Payment.dealId is the
      // serialization point. The shared `claimedDealIds` set in the
      // mock simulates exactly what the real DB would do: the second
      // INSERT raises P2002.

      const dealA = makeAcceptedDeal({ id: 'deal-race' });
      mockFindById.mockResolvedValue(dealA);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      // Fire both concurrently
      const results = await Promise.allSettled([
        service.fundDeal('deal-race', { id: 'brand-1', role: 'BRAND' }),
        service.fundDeal('deal-race', { id: 'brand-1', role: 'BRAND' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      // CRITICAL: only ONE payment intent was created, even though
      // two concurrent requests both passed the initial auth+state checks.
      expect(mockCreateIdempotentIntent).toHaveBeenCalledTimes(1);
    });
  });

  describe('payment provider', () => {
    it('calls createIdempotentIntent with correct amount and currency', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockCreateIdempotentIntent).toHaveBeenCalledWith(
        expect.stringMatching(/^sim_intent_/),  // intentId from the pre-committed row
        50000,
        'USD',
        expect.objectContaining({ dealId: 'deal-1' }),
      );
    });

    it('calls confirm with the intent ID returned by the provider', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockConfirm).toHaveBeenCalledWith('intent-1');
    });

    it('compensates (deletes Payment row + resets fundingStatus) on provider failure', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockRejectedValue(new Error('Provider down'));

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      // Compensation was called: payment.delete + deal.update (reset to NOT_FUNDED)
      expect(mockPaymentDelete).toHaveBeenCalled();
      expect(mockDealUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: expect.objectContaining({ fundingStatus: 'NOT_FUNDED' }),
        }),
      );
    });
  });

  describe('paymentRecordId persistence', () => {
    it('writes paymentRecordId to Deal on successful funding', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockDealUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: expect.objectContaining({ paymentRecordId: expect.any(String) }),
        }),
      );
    });

    it('does NOT write paymentRecordId to Deal if provider fails', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockRejectedValue(new Error('Provider down'));

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      // The compensation deal.update sets NOT_FUNDED — but does NOT
      // set paymentRecordId. Check no call set paymentRecordId to
      // a non-null value.
      const updateCalls = mockDealUpdate.mock.calls;
      for (const call of updateCalls) {
        const data = (call[0] as any).data;
        if (data && 'paymentRecordId' in data) {
          expect(data.paymentRecordId).toBeUndefined();
        }
      }
    });
  });

  describe('audit log', () => {
    it('creates PAYMENT.FUNDED audit event on successful funding', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIdempotentIntent.mockResolvedValue({ id: 'sim_intent_uuid', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'brand-1',
          dealId: 'deal-1',
          action: 'PAYMENT.FUNDED',
          resourceType: 'Payment',
          metadata: expect.objectContaining({
            paymentId: 'payment-1',
            fromFundingStatus: 'NOT_FUNDED',
            toFundingStatus: 'FUNDED',
          }),
        }),
      );
    });

    it('does NOT create audit log when deal is not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.fundDeal('nonexistent', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);

      expect(mockCreateAuditLog).not.toHaveBeenCalled();
    });

    it('does NOT create audit log when already funded', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.fundDeal('deal-2', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      expect(mockCreateAuditLog).not.toHaveBeenCalled();
    });

    it('does NOT create audit log when concurrent fund is rejected', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockDealUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);

      expect(mockCreateAuditLog).not.toHaveBeenCalled();
    });
  });
});

describe('PaymentService.refundDeal', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService(mockProvider as any);
    vi.clearAllMocks();
    mockDealUpdateMany.mockResolvedValue({ count: 1 });
    mockPaymentUpdate.mockResolvedValue({});
  });

  describe('authorization', () => {
    it('allows BRAND participant to refund', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      const result = await service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' });

      expect(result.fundingStatus).toBe('REFUNDED');
    });

    it('allows ADMIN to refund any deal', async () => {
      const deal = makeFundedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);

      const result = await service.refundDeal('deal-2', { id: 'admin-1', role: 'ADMIN' });

      expect(result.fundingStatus).toBe('REFUNDED');
    });

    it('blocks CREATOR from refunding', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.refundDeal('deal-2', { id: 'creator-1', role: 'CREATOR' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('blocks BRAND who does not own the deal', async () => {
      const deal = makeFundedDeal({ brandId: 'brand-1' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.refundDeal('deal-2', { id: 'brand-other', role: 'BRAND' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('state machine', () => {
    it('throws InvalidStateError when deal is not funded', async () => {
      const deal = makeAcceptedDeal({ fundingStatus: 'NOT_FUNDED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.refundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });

    it('throws InvalidStateError when deal is already refunded', async () => {
      const deal = makeAcceptedDeal({ fundingStatus: 'REFUNDED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.refundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });

    it('throws InvalidStateError when deal is not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.refundDeal('nonexistent', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('concurrency', () => {
    it('throws ConflictError on concurrent modification (P0-2 fix)', async () => {
      // This is the P0-2 fix: the old code threw InvalidStateError
      // (HTTP 400 → 500 because not mapped) on race. The new code
      // throws ConflictError (HTTP 409).
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);
      mockDealUpdateMany.mockResolvedValue({ count: 0 }); // concurrent modification

      await expect(
        service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError when Payment row update fails inside the tx', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);
      // Deal updateMany succeeds, but Payment row was deleted concurrently (P2025)
      mockDealUpdateMany.mockResolvedValue({ count: 1 });
      mockPaymentUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.22.0',
        }),
      );

      await expect(
        service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('payment record update', () => {
    it('marks the Payment row as REFUNDED on successful refund', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      await service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' });

      expect(mockPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-record-1' },
          data: expect.objectContaining({ status: 'REFUNDED' }),
        }),
      );
    });
  });

  describe('audit log', () => {
    it('creates PAYMENT.REFUNDED audit event on successful refund', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);

      await service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'brand-1',
          dealId: 'deal-2',
          action: 'PAYMENT.REFUNDED',
          resourceType: 'Payment',
          metadata: expect.objectContaining({
            fromFundingStatus: 'FUNDED',
            toFundingStatus: 'REFUNDED',
          }),
        }),
      );
    });

    it('does NOT create audit log when deal is not funded', async () => {
      const deal = makeAcceptedDeal({ fundingStatus: 'NOT_FUNDED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.refundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);

      expect(mockCreateAuditLog).not.toHaveBeenCalled();
    });
  });
});

describe('PaymentService.getPaymentStatus', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService(mockProvider as any);
    vi.clearAllMocks();
    mockPaymentFindUnique.mockResolvedValue({ paymentId: 'payment-1' });
  });

  it('returns fundingStatus NOT_FUNDED for accepted deal', async () => {
    const deal = makeAcceptedDeal();
    mockFindByIdWithAccessCheck.mockResolvedValue(deal);
    mockFindById.mockResolvedValue(deal);

    const result = await service.getPaymentStatus('deal-1', 'brand-1', 'BRAND');

    expect(result.fundingStatus).toBe('NOT_FUNDED');
    expect(result.dealId).toBe('deal-1');
  });

  it('returns fundingStatus FUNDED for funded deal', async () => {
    const deal = makeFundedDeal();
    mockFindByIdWithAccessCheck.mockResolvedValue(deal);
    mockFindById.mockResolvedValue(deal);

    const result = await service.getPaymentStatus('deal-2', 'brand-1', 'BRAND');

    expect(result.fundingStatus).toBe('FUNDED');
  });

  it('returns the provider paymentId for a funded deal (P1-5 fix)', async () => {
    // P1-5 fix: getPaymentStatus should return the actual paymentId
    // from the Payment record, not null.
    const deal = makeFundedDeal();
    mockFindByIdWithAccessCheck.mockResolvedValue(deal);
    mockFindById.mockResolvedValue(deal);

    const result = await service.getPaymentStatus('deal-2', 'brand-1', 'BRAND');

    expect(result.paymentId).toBe('payment-1');
  });

  it('throws InvalidStateError when deal not found', async () => {
    mockFindByIdWithAccessCheck.mockRejectedValue(new InvalidStateError('Deal not found'));
    mockFindById.mockResolvedValue(null);

    await expect(
      service.getPaymentStatus('nonexistent', 'brand-1', 'BRAND'),
    ).rejects.toThrow(InvalidStateError);
  });
});
