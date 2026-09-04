/**
 * Unit tests for DisputeService.
 *
 * Tests the service logic in isolation:
 * - Authorization checks (role + participation)
 * - State validation
 * - Audit log creation
 *
 * Uses mocks for the repository layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisputeService, type DisputeActor } from '../../src/services/DisputeService.js';
import { InvalidStateError, UnauthorizedAccessError } from '../../src/domain/errors/index.js';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';

// ---------------------------------------------------------------------------------------
// Mock the DealRepository
// ---------------------------------------------------------------------------------------

const mockCreateAuditLog = vi.fn();
const mockUpdateStatus = vi.fn();
const mockUpdateStatusAndRevisionNote = vi.fn();
const mockFindById = vi.fn();

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    updateStatusAndRevisionNote: (...args: unknown[]) => mockUpdateStatusAndRevisionNote(...args),
    createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  },
}));

// Import after mocking (used for the mock to attach to the module's named export)
await import('../../src/repositories/DealRepository.js');

// ---------------------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------------------

const makeSubmittedDeal = (overrides: Partial<DealWithVersions> = {}): DealWithVersions => ({
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'SUBMITTED',
  fundingStatus: 'FUNDED',
  contractId: null,
  paymentRecordId: null,
  latestRevisionNote: null,
  latestRevisionNoteAuthorId: null,
  latestRevisionNoteAt: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  ...overrides,
});

const makeDisputedDeal = (overrides: Partial<DealWithVersions> = {}): DealWithVersions => ({
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'DISPUTED',
  fundingStatus: 'FUNDED',
  contractId: null,
  paymentRecordId: null,
  latestRevisionNote: null,
  latestRevisionNoteAuthorId: null,
  latestRevisionNoteAt: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
  ...overrides,
});

const brandActor: DisputeActor = { id: 'brand-1', role: 'BRAND' };
const creatorActor: DisputeActor = { id: 'creator-1', role: 'CREATOR' };
const adminActor: DisputeActor = { id: 'admin-1', role: 'ADMIN' };
const hrtActor: DisputeActor = { id: 'hrt-1', role: 'HRT' };

// ---------------------------------------------------------------------------------------
// Tests — raiseDispute
// ---------------------------------------------------------------------------------------

describe('DisputeService — raiseDispute', () => {
  let service: DisputeService;

  beforeEach(() => {
    service = new DisputeService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows brand to raise dispute on their own deal', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const result = await service.raiseDispute('deal-1', 'Quality concerns', brandActor);

      expect(result.status).toBe('DISPUTED');
    });

    it('allows admin to raise dispute on any deal', async () => {
      const deal = makeSubmittedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const result = await service.raiseDispute('deal-1', 'Admin dispute', adminActor);

      expect(result.status).toBe('DISPUTED');
    });

    it('rejects creator from raising dispute', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Creator trying to dispute', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects HRT from raising dispute', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'HRT trying to dispute', hrtActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects non-participant brand', async () => {
      const deal = makeSubmittedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Stranger trying to dispute', { id: 'brand-1', role: 'BRAND' }),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects when deal not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.raiseDispute('deal-1', 'Note', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('state validation', () => {
    it('rejects dispute from IN_PROGRESS state', async () => {
      const deal = makeSubmittedDeal({ status: 'IN_PROGRESS' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Early dispute', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects dispute from APPROVED state', async () => {
      const deal = makeSubmittedDeal({ status: 'APPROVED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Post-approval dispute', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects dispute from FUNDED state', async () => {
      const deal = makeSubmittedDeal({ status: 'FUNDED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Funded dispute', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects dispute from COMPLETED state (terminal)', async () => {
      const deal = makeSubmittedDeal({ status: 'COMPLETED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.raiseDispute('deal-1', 'Late dispute', brandActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects when deal has no creator (brand still allowed via auth check)', async () => {
      const deal = makeSubmittedDeal({ creatorId: null });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const result = await service.raiseDispute('deal-1', 'No-creator dispute', brandActor);
      expect(result.status).toBe('DISPUTED');
    });
  });

  describe('audit log', () => {
    it('creates DISPUTE.RAISED audit event with dispute note', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      await service.raiseDispute('deal-1', 'Deliverable quality is substandard', brandActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'brand-1',
        dealId: 'deal-1',
        action: 'DISPUTE.RAISED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'SUBMITTED',
          toStatus: 'DISPUTED',
          action: 'RAISE_DISPUTE',
          disputeNote: 'Deliverable quality is substandard',
        }),
      });
    });

    it('creates audit event with admin as actor when admin raises dispute', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      await service.raiseDispute('deal-1', 'Admin dispute note', adminActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          metadata: expect.objectContaining({ disputeNote: 'Admin dispute note' }),
        }),
      );
    });
  });

  describe('result', () => {
    it('returns dealId, DISPUTED status, and timestamp', async () => {
      const deal = makeSubmittedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const result = await service.raiseDispute('deal-1', 'Dispute note', brandActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'DISPUTED',
        raisedAt: expect.any(Date),
      });
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — resolveDispute
// ---------------------------------------------------------------------------------------

describe('DisputeService — resolveDispute', () => {
  let service: DisputeService;

  beforeEach(() => {
    service = new DisputeService();
    vi.clearAllMocks();
  });

  describe('authorization', () => {
    it('allows HRT to resolve dispute on any deal', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      const result = await service.resolveDispute('deal-1', 'HRT recommends partial refund', hrtActor);

      expect(result.status).toBe('RESOLVED');
    });

    it('allows admin to resolve dispute on any deal', async () => {
      const deal = makeDisputedDeal({ brandId: 'brand-other' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      const result = await service.resolveDispute('deal-1', 'Admin resolution', adminActor);

      expect(result.status).toBe('RESOLVED');
    });

    it('rejects brand from resolving dispute', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Brand trying to resolve', brandActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects creator from resolving dispute', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Creator trying to resolve', creatorActor),
      ).rejects.toThrow(UnauthorizedAccessError);
    });

    it('rejects when deal not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.resolveDispute('deal-1', 'Note', hrtActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('state validation', () => {
    it('rejects resolution from SUBMITTED state', async () => {
      const deal = makeDisputedDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Premature resolution', hrtActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects resolution from APPROVED state', async () => {
      const deal = makeDisputedDeal({ status: 'APPROVED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Already resolved', hrtActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects resolution from RESOLVED state (already resolved)', async () => {
      const deal = makeDisputedDeal({ status: 'RESOLVED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Duplicate resolution', hrtActor),
      ).rejects.toThrow(InvalidStateError);
    });

    it('rejects resolution from COMPLETED state (terminal)', async () => {
      const deal = makeDisputedDeal({ status: 'COMPLETED' });
      mockFindById.mockResolvedValue(deal);

      await expect(
        service.resolveDispute('deal-1', 'Terminal resolution', hrtActor),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('audit log', () => {
    it('creates DISPUTE.RESOLVED audit event with resolution note', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      await service.resolveDispute('deal-1', 'Partial refund of 30% recommended', hrtActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        actorId: 'hrt-1',
        dealId: 'deal-1',
        action: 'DISPUTE.RESOLVED',
        resourceType: 'Deal',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'DISPUTED',
          toStatus: 'RESOLVED',
          action: 'RESOLVE',
          resolutionNote: 'Partial refund of 30% recommended',
        }),
      });
    });

    it('creates audit event with admin as actor when admin resolves', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      await service.resolveDispute('deal-1', 'Admin resolution note', adminActor);

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          metadata: expect.objectContaining({ resolutionNote: 'Admin resolution note' }),
        }),
      );
    });
  });

  describe('result', () => {
    it('returns dealId, RESOLVED status, and timestamp', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      const result = await service.resolveDispute('deal-1', 'Resolution note', hrtActor);

      expect(result).toEqual({
        dealId: 'deal-1',
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      });
    });
  });

  describe('resolution note persistence', () => {
    it('calls updateStatusAndRevisionNote with the resolution note', async () => {
      const deal = makeDisputedDeal();
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      await service.resolveDispute('deal-1', 'Brand to refund 50%', hrtActor);

      expect(mockUpdateStatusAndRevisionNote).toHaveBeenCalledWith(
        'deal-1',
        'RESOLVED',
        deal.updatedAt,
        'hrt-1',
        'HRT',
        'Brand to refund 50%',
      );
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Full dispute lifecycle
// ---------------------------------------------------------------------------------------

describe('DisputeService — Dispute lifecycle', () => {
  let service: DisputeService;

  beforeEach(() => {
    service = new DisputeService();
    vi.clearAllMocks();
  });

  it('full lifecycle: SUBMITTED → DISPUTED → RESOLVED', async () => {
    // SUBMITTED → DISPUTED
    const submittedDeal = makeSubmittedDeal();
    mockFindById.mockResolvedValue(submittedDeal);
    mockUpdateStatus.mockResolvedValue({ ...submittedDeal, status: 'DISPUTED' });

    const raiseResult = await service.raiseDispute('deal-1', 'Quality issues', brandActor);
    expect(raiseResult.status).toBe('DISPUTED');

    // DISPUTED → RESOLVED
    const disputedDeal = { ...submittedDeal, status: 'DISPUTED' as const };
    mockFindById.mockResolvedValue(disputedDeal);
    mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...disputedDeal, status: 'RESOLVED' });

    const resolveResult = await service.resolveDispute('deal-1', 'Partial refund agreed', hrtActor);
    expect(resolveResult.status).toBe('RESOLVED');
  });

  it('both dispute actions create separate audit logs', async () => {
    // Raise dispute
    const submittedDeal = makeSubmittedDeal();
    mockFindById.mockResolvedValue(submittedDeal);
    mockUpdateStatus.mockResolvedValue({ ...submittedDeal, status: 'DISPUTED' });
    await service.raiseDispute('deal-1', 'First dispute', brandActor);

    // Resolve dispute
    const disputedDeal = { ...submittedDeal, status: 'DISPUTED' as const };
    mockFindById.mockResolvedValue(disputedDeal);
    mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...disputedDeal, status: 'RESOLVED' });
    await service.resolveDispute('deal-1', 'Resolution applied', hrtActor);

    const disputeCalls = mockCreateAuditLog.mock.calls.filter(
      (call) => call[0]?.action?.startsWith('DISPUTE.'),
    );
    expect(disputeCalls).toHaveLength(2);
    expect(disputeCalls[0][0]?.action).toBe('DISPUTE.RAISED');
    expect(disputeCalls[0][0]?.metadata?.disputeNote).toBe('First dispute');
    expect(disputeCalls[1][0]?.action).toBe('DISPUTE.RESOLVED');
    expect(disputeCalls[1][0]?.metadata?.resolutionNote).toBe('Resolution applied');
  });
});
