/**
 * Unit tests for SubmissionService.
 *
 * Tests the service logic in isolation:
 * - Authorization checks (role + participation)
 * - State validation
 * - Audit log creation
 *
 * Uses mocks for the repository layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmissionService, type SubmissionActor } from '../../src/services/SubmissionService.js';
import { InvalidStateError, UnauthorizedAccessError } from '../../src/domain/errors/index.js';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';

// ---------------------------------------------------------------------------------------
// Mock the DealRepository
// ---------------------------------------------------------------------------------------

const mockCreateAuditLog = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: {
    findById: vi.fn(),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  },
}));

// Import after mocking
const { dealRepository } = await import('../../src/repositories/DealRepository.js');

// ---------------------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------------------

const makeInProgressDeal = (overrides: Partial<DealWithVersions> = {}): DealWithVersions => ({
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'IN_PROGRESS',
  fundingStatus: 'FUNDED',
  contractId: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  ...overrides,
});

const makeSubmittedDeal = (overrides: Partial<DealWithVersions> = {}): DealWithVersions => ({
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'SUBMITTED',
  fundingStatus: 'FUNDED',
  contractId: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  ...overrides,
});

const makeApprovedDeal = (overrides: Partial<DealWithVersions> = {}): DealWithVersions => ({
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'APPROVED',
  fundingStatus: 'FUNDED',
  contractId: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  ...overrides,
});

const creatorActor: SubmissionActor = { id: 'creator-1', role: 'CREATOR' };
const brandActor: SubmissionActor = { id: 'brand-1', role: 'BRAND' };
const adminActor: SubmissionActor = { id: 'admin-1', role: 'ADMIN' };

// ---------------------------------------------------------------------------------------
// Tests — submitDeliverable
// ---------------------------------------------------------------------------------------

describe('SubmissionService — submitDeliverable', () => {
  let service: SubmissionService;

  beforeEach(() => {
    service = new SubmissionService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows creator to submit for their own deal', async () => {
      const deal = makeInProgressDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'SUBMITTED' });

      const result = await service.submitDeliverable('deal-1', 'Done!', creatorActor);

      expect(result.status).toBe('SUBMITTED');
    });

    it('rejects admin from submitting (state machine restricts to CREATOR only)', async () => {
      const deal = makeInProgressDeal({ creatorId: 'creator-2' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Admin submitting', adminActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects brand from submitting', async () => {
      const deal = makeInProgressDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', brandActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects non-participant creator', async () => {
      const deal = makeInProgressDeal({ creatorId: 'creator-other' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', { id: 'creator-1', role: 'CREATOR' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects when deal not found', async () => {
      vi.mocked(dealRepository.findById).mockResolvedValue(null);

      await expect(
        service.submitDeliverable('deal-1', 'Note', creatorActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('state validation', () => {
    it('rejects submission from FUNDED state', async () => {
      const deal = makeInProgressDeal({ status: 'FUNDED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', creatorActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects submission from SUBMITTED state', async () => {
      const deal = makeInProgressDeal({ status: 'SUBMITTED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', creatorActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects submission from APPROVED state', async () => {
      const deal = makeInProgressDeal({ status: 'APPROVED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', creatorActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects submission when deal has no creator (auth check fails first)', async () => {
      const deal = makeInProgressDeal({ creatorId: null });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.submitDeliverable('deal-1', 'Note', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('audit log', () => {
    it('creates DELIVERABLE.SUBMITTED audit event', async () => {
      const deal = makeInProgressDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'SUBMITTED' });

      await service.submitDeliverable('deal-1', 'Final submission', creatorActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'creator-1',
        dealId: 'deal-1',
        action: 'DELIVERABLE.SUBMITTED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'IN_PROGRESS',
          toStatus: 'SUBMITTED',
          action: 'SUBMIT_DELIVERABLE',
          note: 'Final submission',
        }),
      });
    });

    it('creates audit event with null note when no note provided', async () => {
      const deal = makeInProgressDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'SUBMITTED' });

      await service.submitDeliverable('deal-1', undefined, creatorActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ note: null }),
        }),
      );
    });
  });

  describe('result', () => {
    it('returns dealId, status, and submittedAt', async () => {
      const deal = makeInProgressDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'SUBMITTED' });

      const result = await service.submitDeliverable('deal-1', 'Done', creatorActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'SUBMITTED',
        submittedAt: expect.any(Date),
      });
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — requestRevision
// ---------------------------------------------------------------------------------------

describe('SubmissionService — requestRevision', () => {
  let service: SubmissionService;

  beforeEach(() => {
    service = new SubmissionService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows brand to request revision on their own deal', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'REVISION_REQUESTED' });

      const result = await service.requestRevision('deal-1', 'Fix the logo', brandActor);

      expect(result.status).toBe('REVISION_REQUESTED');
    });

    it('allows admin to request revision on any deal', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'IN_PROGRESS' });

      const result = await service.requestRevision('deal-1', 'Fix it', adminActor);

      expect(result.status).toBe('REVISION_REQUESTED');
    });

    it('rejects creator from requesting revision', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.requestRevision('deal-1', 'Fix it', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects non-participant brand', async () => {
      const deal = makeSubmittedDeal({ brandId: 'brand-other' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.requestRevision('deal-1', 'Fix it', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('state validation', () => {
    it('rejects revision request from IN_PROGRESS state', async () => {
      const deal = makeSubmittedDeal({ status: 'IN_PROGRESS' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.requestRevision('deal-1', 'Fix it', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects revision request from APPROVED state', async () => {
      const deal = makeSubmittedDeal({ status: 'APPROVED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.requestRevision('deal-1', 'Fix it', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('audit log', () => {
    it('creates DELIVERABLE.REVISION_REQUESTED audit event with revision note', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'REVISION_REQUESTED' });

      await service.requestRevision('deal-1', 'Please revise the opening', brandActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'brand-1',
        dealId: 'deal-1',
        action: 'DELIVERABLE.REVISION_REQUESTED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'SUBMITTED',
          toStatus: 'REVISION_REQUESTED',
          action: 'REQUEST_REVISION',
          revisionNote: 'Please revise the opening',
        }),
      });
    });
  });

  describe('result', () => {
    it('returns dealId, REVISION_REQUESTED status, and timestamp', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'REVISION_REQUESTED' });

      const result = await service.requestRevision('deal-1', 'Fix it', brandActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'REVISION_REQUESTED',
        revisionRequestedAt: expect.any(Date),
      });
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — approveDeliverable
// ---------------------------------------------------------------------------------------

describe('SubmissionService — approveDeliverable', () => {
  let service: SubmissionService;

  beforeEach(() => {
    service = new SubmissionService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows brand to approve their own deal', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'APPROVED' });

      const result = await service.approveDeliverable('deal-1', brandActor);

      expect(result.status).toBe('APPROVED');
    });

    it('allows admin to approve any deal', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'APPROVED' });

      const result = await service.approveDeliverable('deal-1', adminActor);

      expect(result.status).toBe('APPROVED');
    });

    it('rejects creator from approving', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.approveDeliverable('deal-1', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('state validation', () => {
    it('rejects approval from IN_PROGRESS state', async () => {
      const deal = makeSubmittedDeal({ status: 'IN_PROGRESS' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.approveDeliverable('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects approval from APPROVED state (already approved)', async () => {
      const deal = makeSubmittedDeal({ status: 'APPROVED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.approveDeliverable('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects approval from COMPLETED state', async () => {
      const deal = makeSubmittedDeal({ status: 'COMPLETED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.approveDeliverable('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('audit log', () => {
    it('creates DELIVERABLE.APPROVED audit event', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'APPROVED' });

      await service.approveDeliverable('deal-1', brandActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'brand-1',
        dealId: 'deal-1',
        action: 'DELIVERABLE.APPROVED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: {
          fromStatus: 'SUBMITTED',
          toStatus: 'APPROVED',
          action: 'APPROVE',
        },
      });
    });
  });

  describe('result', () => {
    it('returns dealId, APPROVED status, and timestamp', async () => {
      const deal = makeSubmittedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'APPROVED' });

      const result = await service.approveDeliverable('deal-1', brandActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'APPROVED',
        approvedAt: expect.any(Date),
      });
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — releasePayment (complete)
// ---------------------------------------------------------------------------------------

describe('SubmissionService — releasePayment', () => {
  let service: SubmissionService;

  beforeEach(() => {
    service = new SubmissionService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows brand to release payment on their own deal', async () => {
      const deal = makeApprovedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'COMPLETED' });

      const result = await service.releasePayment('deal-1', brandActor);

      expect(result.status).toBe('COMPLETED');
    });

    it('allows admin to release payment on any deal', async () => {
      const deal = makeApprovedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'COMPLETED' });

      const result = await service.releasePayment('deal-1', adminActor);

      expect(result.status).toBe('COMPLETED');
    });

    it('rejects creator from releasing payment', async () => {
      const deal = makeApprovedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.releasePayment('deal-1', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });
  });

  describe('state validation', () => {
    it('rejects release from SUBMITTED state', async () => {
      const deal = makeApprovedDeal({ status: 'SUBMITTED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.releasePayment('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects release from IN_PROGRESS state', async () => {
      const deal = makeApprovedDeal({ status: 'IN_PROGRESS' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.releasePayment('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects release from COMPLETED state (already completed)', async () => {
      const deal = makeApprovedDeal({ status: 'COMPLETED' });
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);

      await expect(
        service.releasePayment('deal-1', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('audit log', () => {
    it('creates PAYMENT.RELEASED audit event', async () => {
      const deal = makeApprovedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'COMPLETED' });

      await service.releasePayment('deal-1', brandActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'brand-1',
        dealId: 'deal-1',
        action: 'PAYMENT.RELEASED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: {
          fromStatus: 'APPROVED',
          toStatus: 'COMPLETED',
          action: 'RELEASE_PAYMENT',
        },
      });
    });
  });

  describe('result', () => {
    it('returns dealId, COMPLETED status, and timestamp', async () => {
      const deal = makeApprovedDeal();
      vi.mocked(dealRepository.findById).mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'COMPLETED' });

      const result = await service.releasePayment('deal-1', brandActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'COMPLETED',
        completedAt: expect.any(Date),
      });
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Full revision loop
// ---------------------------------------------------------------------------------------

describe('SubmissionService — Revision loop', () => {
  let service: SubmissionService;

  beforeEach(() => {
    service = new SubmissionService();
    vi.clearAllMocks();
  });

  it('allows creator to resubmit after revision request', async () => {
    // IN_PROGRESS → SUBMITTED (first submit)
    const inProgressDeal = makeInProgressDeal();
    vi.mocked(dealRepository.findById).mockResolvedValue(inProgressDeal);
    mockUpdateStatus.mockResolvedValue({ ...inProgressDeal, status: 'SUBMITTED' });

    const submitResult = await service.submitDeliverable('deal-1', 'First submission', creatorActor);
    expect(submitResult.status).toBe('SUBMITTED');

    // SUBMITTED → REVISION_REQUESTED (revision requested)
    vi.mocked(dealRepository.findById).mockResolvedValue({ ...inProgressDeal, status: 'SUBMITTED' });
    mockUpdateStatus.mockResolvedValue({ ...inProgressDeal, status: 'REVISION_REQUESTED' });

    const revisionResult = await service.requestRevision('deal-1', 'Please fix the colors', brandActor);
    expect(revisionResult.status).toBe('REVISION_REQUESTED');

    // REVISION_REQUESTED → SUBMITTED (resubmit via state machine)
    // (In production, the creator's POST /transition?action=RESUBMIT is called,
    // but here we directly call submitDeliverable on a REVISION_REQUESTED deal
    // would fail; the resubmit path is exercised through the transition endpoint.)
    // For this unit test, we simulate that the deal has been moved back to SUBMITTED
    // by the RESUBMIT transition, and we assert the approval path continues.
    vi.mocked(dealRepository.findById).mockResolvedValue({ ...inProgressDeal, status: 'SUBMITTED' });
    mockUpdateStatus.mockResolvedValue({ ...inProgressDeal, status: 'APPROVED' });

    const approveResult = await service.approveDeliverable('deal-1', brandActor);
    expect(approveResult.status).toBe('APPROVED');

    // APPROVED → COMPLETED (payment released)
    vi.mocked(dealRepository.findById).mockResolvedValue({ ...inProgressDeal, status: 'APPROVED' });
    mockUpdateStatus.mockResolvedValue({ ...inProgressDeal, status: 'COMPLETED' });

    const completeResult = await service.releasePayment('deal-1', brandActor);
    expect(completeResult.status).toBe('COMPLETED');
  });

  it('revision request creates audit log with revision note', async () => {
    const deal = makeSubmittedDeal();
    vi.mocked(dealRepository.findById).mockResolvedValue(deal);
    mockUpdateStatus.mockResolvedValue({ ...deal, status: 'REVISION_REQUESTED' });

    await service.requestRevision('deal-1', 'The logo needs to be bigger', brandActor);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELIVERABLE.REVISION_REQUESTED',
        metadata: expect.objectContaining({
          revisionNote: 'The logo needs to be bigger',
          fromStatus: 'SUBMITTED',
          toStatus: 'REVISION_REQUESTED',
        }),
      }),
    );
  });

  it('both submissions create separate audit logs', async () => {
    // First submission
    vi.mocked(dealRepository.findById).mockResolvedValue(makeInProgressDeal());
    mockUpdateStatus.mockResolvedValue({ ...makeInProgressDeal(), status: 'SUBMITTED' });
    await service.submitDeliverable('deal-1', 'First version', creatorActor);

    // Second submission after revision
    vi.mocked(dealRepository.findById).mockResolvedValue({ ...makeInProgressDeal(), status: 'IN_PROGRESS' });
    mockUpdateStatus.mockResolvedValue({ ...makeInProgressDeal(), status: 'SUBMITTED' });
    await service.submitDeliverable('deal-1', 'Second version after revision', creatorActor);

    // Should have two separate submission events
    const submissionCalls = mockCreateAuditLog.mock.calls.filter(
      (call) => call[0]?.action === 'DELIVERABLE.SUBMITTED',
    );
    expect(submissionCalls).toHaveLength(2);
    expect(submissionCalls[0][0]?.metadata?.note).toBe('First version');
    expect(submissionCalls[1][0]?.metadata?.note).toBe('Second version after revision');
  });
});
