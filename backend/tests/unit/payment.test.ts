/**
 * Unit tests for PaymentService.
 *
 * Tests the business logic for deal funding and refund operations:
 * - Authorization rules (brand/admin only, creator blocked)
 * - State machine enforcement (ACCEPTED required for funding)
 * - Idempotency (double-fund returns 409)
 * - Audit log creation
 *
 * Uses vi.spyOn to intercept real repository/provider methods while
 * still testing the full service logic path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

import { PaymentService } from '../../src/services/PaymentService.js';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';
import { InvalidStateError, UnauthorizedAccessError } from '../../src/domain/errors/index.js';
import { ConflictError } from '../../src/middleware/errorHandler.js';

// ---------------------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------------------

const mockFindById = vi.fn();
const mockFindByIdWithAccessCheck = vi.fn();
const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
const mockDealUpdateMany = vi.fn();

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdWithAccessCheck: (...args: unknown[]) => mockFindByIdWithAccessCheck(...args),
    createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  },
}));

vi.mock('../../src/db.js', () => ({
  prisma: {
    $transaction: vi.fn((fn) =>
      fn({
        deal: {
          updateMany: (...args: unknown[]) => mockDealUpdateMany(...args),
          findUnique: vi.fn().mockResolvedValue({ id: 'deal-1', fundingStatus: 'FUNDED' }),
        },
      }),
    ),
  },
}));

const mockCreateIntent = vi.fn();
const mockConfirm = vi.fn();

const mockProvider = {
  createIntent: (...args: unknown[]) => mockCreateIntent(...args),
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
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'v1',
        versionNumber: 1,
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
    mockDealUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe('authorization', () => {
    it('allows BRAND participant who owns the deal to fund', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      const result = await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(result.fundingStatus).toBe('FUNDED');
      expect(result.paymentId).toBe('payment-1');
    });

    it('allows ADMIN to fund any deal', async () => {
      const deal = makeAcceptedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
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
  });

  describe('idempotency', () => {
    it('returns 409 when updateMany affects 0 rows (race condition)', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockDealUpdateMany.mockResolvedValue({ count: 0 }); // Simulates concurrent modification

      await expect(
        service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('payment provider', () => {
    it('calls createIntent with correct amount and currency', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockCreateIntent).toHaveBeenCalledWith(
        50000,
        'USD',
        expect.objectContaining({ dealId: 'deal-1' }),
      );
    });

    it('calls confirm after creating intent', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
      mockConfirm.mockResolvedValue({ id: 'payment-1', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} });

      await service.fundDeal('deal-1', { id: 'brand-1', role: 'BRAND' });

      expect(mockConfirm).toHaveBeenCalledWith('intent-1');
    });
  });

  describe('audit log', () => {
    it('creates PAYMENT.FUNDED audit event on successful funding', async () => {
      const deal = makeAcceptedDeal();
      mockFindById.mockResolvedValue(deal);
      mockCreateIntent.mockResolvedValue({ id: 'intent-1', status: 'PENDING', amount: 50000, currency: 'USD', metadata: {} });
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
  });
});

describe('PaymentService.refundDeal', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService(mockProvider as any);
    vi.clearAllMocks();
    mockDealUpdateMany.mockResolvedValue({ count: 1 });
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

  describe('idempotency', () => {
    it('returns 409 when concurrent modification detected', async () => {
      const deal = makeFundedDeal();
      mockFindById.mockResolvedValue(deal);
      mockDealUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.refundDeal('deal-2', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(InvalidStateError);
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

  it('throws InvalidStateError when deal not found', async () => {
    mockFindByIdWithAccessCheck.mockResolvedValue(null);
    mockFindById.mockResolvedValue(null);

    await expect(
      service.getPaymentStatus('nonexistent', 'brand-1', 'BRAND'),
    ).rejects.toThrow(InvalidStateError);
  });

  it('throws NotFoundError when access check fails', async () => {
    mockFindByIdWithAccessCheck.mockRejectedValue(new InvalidStateError('Deal not found'));

    await expect(
      service.getPaymentStatus('deal-1', 'stranger', 'BRAND'),
    ).rejects.toThrow(InvalidStateError);
  });
});
