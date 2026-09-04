import { Deal, DealVersion, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { UnauthorizedAccessError } from '../domain/errors/index.js';
import type { DealStatus, FundingStatus } from '../domain/state-machine/DealStateMachine.js';
import type { DealTerms } from '../domain/value-objects/DealTerms.js';

export interface DealWithVersions {
  id: string;
  brandId: string;
  creatorId: string | null;
  status: DealStatus;
  // acceptedVersionNumber tracks the currently authoritative DealVersion.
  // A value of null means no explicit acceptance (legacy state — use latest version).
  // When a term proposal is accepted, this is updated to point to that version.
  acceptedVersionNumber: number | null;
  contractId: string | null;
  fundingStatus: FundingStatus;
  // paymentRecordId is the FK to the Payment record. Set after successful funding.
  // Used by PaymentService for reconciliation and by getPaymentStatus.
  paymentRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    versionNumber: number;
    // isPending=true means this version is awaiting counterparty acceptance.
    // Pending versions must NOT be used for payments or authoritative terms.
    isPending: boolean;
    terms: DealTerms;
    createdAt: Date;
  }>;
}

export interface CreateDealInput {
  brandId: string;
  terms: DealTerms;
}

export interface UpdateDealStatusInput {
  dealId: string;
  newStatus: DealStatus;
  expectedUpdatedAt: Date;
}

export interface DealFilter {
  brandId?: string;
  creatorId?: string;
  status?: DealStatus | DealStatus[];
}

export class DealRepository {
  /**
   * Create a new Deal with its initial DealVersion.
   * Both are created atomically in a transaction.
   *
   * v1 is created as accepted (isPending=false) and the deal's
   * acceptedVersionNumber is set to 1, so v1 is the authoritative version.
   */
  async create(input: CreateDealInput): Promise<DealWithVersions> {
    return prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          brandId: input.brandId,
          status: 'DRAFT',
          fundingStatus: 'NOT_FUNDED',
          acceptedVersionNumber: 1,
          versions: {
            create: {
              versionNumber: 1,
              isPending: false,
              terms: input.terms as unknown as Prisma.InputJsonValue,
            },
          },
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
        },
      });

      return this.mapToDealWithVersions(deal);
    });
  }

  /**
   * Find a Deal by ID.
   * Returns null if not found.
   */
  async findById(dealId: string): Promise<DealWithVersions | null> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
    });

    if (!deal) return null;
    return this.mapToDealWithVersions(deal);
  }

  /**
   * Find a Deal by ID and verify the requesting user has access.
   * Throws NotFoundError if deal doesn't exist.
   * Throws UnauthorizedAccessError if user is not authorized to access this deal.
   *
   * Authorization rules:
   * - Brand owner: full access
   * - Invited Creator: read + action access for creator-specific actions
   * - HRT: read access for disputes
   * - Admin: full access
   */
  async findByIdWithAccessCheck(
    dealId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    const deal = await this.findById(dealId);

    if (!deal) {
      throw new NotFoundError('Deal', dealId);
    }

    this.verifyAccess(deal, requesterId, requesterRole);

    return deal;
  }

  /**
   * Find deals accessible to a user.
   * Returns only deals the user is authorized to see.
   */
  async findAccessibleToUser(
    userId: string,
    userRole: string,
    filter?: DealFilter,
  ): Promise<DealWithVersions[]> {
    // Build access filter based on role
    const accessFilter = this.buildAccessFilter(userId, userRole);
    const statusFilter = filter?.status
      ? { status: Array.isArray(filter.status) ? { in: filter.status } : filter.status }
      : {};

    const deals = await prisma.deal.findMany({
      where: {
        AND: [accessFilter, statusFilter],
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return deals.map((d) => this.mapToDealWithVersions(d));
  }

  /**
   * Update the status of a Deal atomically with optimistic locking.
   *
   * Concurrency safety: the UPDATE is gated on `expectedUpdatedAt` matching
   * the row that was loaded by the caller. If another concurrent transition
   * already moved the deal, the WHERE clause will match zero rows and we
   * raise a domain error so the caller can retry against fresh state.
   *
   * Throws NotFoundError if deal doesn't exist.
   * Throws DealVersionConflictError (mapped to HTTP 409) if optimistic lock fails.
   * Throws UnauthorizedAccessError if user is not authorized.
   */
  async updateStatus(
    dealId: string,
    newStatus: DealStatus,
    expectedUpdatedAt: Date,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    // First, load the deal to verify access; the returned row also gives us
    // the timestamp we use for the optimistic lock.
    const existingDeal = await this.findByIdWithAccessCheck(dealId, requesterId, requesterRole);

    // We require the caller to pass the same updatedAt we just observed.
    // If they don't, it's a programmer error and we use the freshly-read value.
    const expected =
      expectedUpdatedAt instanceof Date
        ? expectedUpdatedAt
        : existingDeal.updatedAt;

    return prisma.$transaction(async (tx) => {
      const result = await tx.deal.updateMany({
        where: {
          id: dealId,
          updatedAt: expected, // Optimistic lock
        },
        data: {
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        // Either the deal was deleted, or another transition already moved it.
        // Either way, the caller's view of state is stale.
        const { DealVersionConflictError } = await import('../domain/errors/index.js');
        throw new DealVersionConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }

      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
        },
      });

      if (!deal) {
        throw new NotFoundError('Deal', dealId);
      }

      return this.mapToDealWithVersions(deal);
    });
  }

  /**
   * Atomically set the deal's creatorId and update its status in a single
   * transaction. The state machine must already have been consulted to
   * determine that the (DRAFT → PENDING_ACCEPTANCE) transition is valid;
   * this method only persists the new creator + new status.
   *
   * Optimistic locking is enforced so a concurrent transition cannot race
   * with this assignment.
   */
  async assignCreatorAndTransition(
    dealId: string,
    creatorId: string,
    newStatus: DealStatus,
    expectedUpdatedAt: Date,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    const existingDeal = await this.findByIdWithAccessCheck(dealId, requesterId, requesterRole);
    const expected =
      expectedUpdatedAt instanceof Date ? expectedUpdatedAt : existingDeal.updatedAt;

    return prisma.$transaction(async (tx) => {
      const result = await tx.deal.updateMany({
        where: { id: dealId, updatedAt: expected },
        data: {
          creatorId,
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        const { DealVersionConflictError } = await import('../domain/errors/index.js');
        throw new DealVersionConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }

      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
        },
      });

      if (!deal) {
        throw new NotFoundError('Deal', dealId);
      }

      return this.mapToDealWithVersions(deal);
    });
  }

  /**
   * Get the latest DealVersion for a Deal.
   */
  async getLatestVersion(dealId: string): Promise<DealVersion | null> {
    const version = await prisma.dealVersion.findFirst({
      where: { dealId },
      orderBy: { versionNumber: 'desc' },
    });

    return version;
  }

  /**
   * Get the currently authoritative (accepted) DealVersion for a Deal.
   *
   * Authoritative resolution rules:
   * 1. If deal.acceptedVersionNumber is set, return the version with that versionNumber.
   * 2. Otherwise (legacy state — no acceptedVersionNumber set), return the highest
   *    versionNumber that is NOT pending (preserving pre-refinement behavior).
   * 3. If no accepted version can be found, returns null.
   *
   * NEVER returns a pending version.
   */
  async getAuthoritativeVersion(
    dealId: string,
    acceptedVersionNumber: number | null,
  ): Promise<DealVersion | null> {
    if (acceptedVersionNumber !== null) {
      return prisma.dealVersion.findFirst({
        where: {
          dealId,
          versionNumber: acceptedVersionNumber,
          isPending: false,
        },
      });
    }

    // Legacy fallback: the latest non-pending version
    return prisma.dealVersion.findFirst({
      where: { dealId, isPending: false },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Get the currently pending DealVersion for a Deal (if any).
   *
   * Returns the unique pending proposal for a deal, or null if none exists.
   * Multiple concurrent pending versions are NOT supported by design.
   */
  async getPendingVersion(dealId: string): Promise<DealVersion | null> {
    return prisma.dealVersion.findFirst({
      where: { dealId, isPending: true },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Create a new pending DealVersion (for term proposals).
   *
   * Increments versionNumber monotonically. Caller is responsible for ensuring
   * no other pending version exists for this deal (use getPendingVersion first).
   */
  async createPendingVersion(
    dealId: string,
    terms: DealTerms,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealVersion> {
    // Verify access first
    await this.findByIdWithAccessCheck(dealId, requesterId, requesterRole);

    const latest = await this.getLatestVersion(dealId);
    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    return prisma.dealVersion.create({
      data: {
        dealId,
        versionNumber: nextVersion,
        isPending: true,
        terms: terms as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Create a new pending DealVersion atomically with optimistic locking on the
   * deal row. This is the preferred method for creating a proposal — it ensures
   * the proposal is only created if the deal hasn't been modified concurrently.
   *
   * Throws DealVersionConflictError if the deal was modified concurrently.
   */
  async createPendingVersionAtomically(
    dealId: string,
    terms: DealTerms,
    expectedUpdatedAt: Date,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealVersion> {
    // Access check (throws NotFoundError or UnauthorizedAccessError if fails)
    const existingDeal = await this.findByIdWithAccessCheck(
      dealId,
      requesterId,
      requesterRole,
    );
    const expected =
      expectedUpdatedAt instanceof Date
        ? expectedUpdatedAt
        : existingDeal.updatedAt;

    return prisma.$transaction(async (tx) => {
      // Optimistic lock on the deal row
      const lockResult = await tx.deal.updateMany({
        where: { id: dealId, updatedAt: expected },
        data: { updatedAt: new Date() },
      });

      if (lockResult.count === 0) {
        const { DealVersionConflictError } = await import('../domain/errors/index.js');
        throw new DealVersionConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }

      // Get the next version number
      const latest = await tx.dealVersion.findFirst({
        where: { dealId },
        orderBy: { versionNumber: 'desc' },
      });
      const nextVersion = (latest?.versionNumber ?? 0) + 1;

      // Create the pending version
      const created = await tx.dealVersion.create({
        data: {
          dealId,
          versionNumber: nextVersion,
          isPending: true,
          terms: terms as unknown as Prisma.InputJsonValue,
        },
      });

      return created;
    });
  }

  /**
   * Atomically accept a pending proposal and reject any other pending versions.
   *
   * On success:
   * - The targeted pending version is marked isPending=false (becomes authoritative).
   * - Any other pending versions for this deal are marked isPending=false too
   *   (they were superseded; they remain in history as non-pending, non-authoritative).
   * - The deal's acceptedVersionNumber is updated to point to the accepted version.
   *
   * Returns the updated deal with all versions.
   *
   * Concurrency-safe: gated on the deal's updatedAt to reject concurrent updates.
   * Throws DealVersionConflictError if the deal was modified concurrently.
   */
  async acceptPendingVersion(
    dealId: string,
    pendingVersionNumber: number,
    expectedUpdatedAt: Date,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    // First load with access check to validate and get authoritative state.
    const existingDeal = await this.findByIdWithAccessCheck(
      dealId,
      requesterId,
      requesterRole,
    );
    const expected =
      expectedUpdatedAt instanceof Date
        ? expectedUpdatedAt
        : existingDeal.updatedAt;

    return prisma.$transaction(async (tx) => {
      // Optimistic lock on the deal row
      const lockResult = await tx.deal.updateMany({
        where: { id: dealId, updatedAt: expected },
        data: {
          acceptedVersionNumber: pendingVersionNumber,
          updatedAt: new Date(),
        },
      });

      if (lockResult.count === 0) {
        const { DealVersionConflictError } = await import('../domain/errors/index.js');
        throw new DealVersionConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }

      // Mark ALL pending versions for this deal as non-pending.
      // The accepted one is the new authoritative; the rest become historical
      // (they never become authoritative, they're just no longer "pending").
      await tx.dealVersion.updateMany({
        where: { dealId, isPending: true },
        data: { isPending: false },
      });

      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: {
          versions: { orderBy: { versionNumber: 'asc' } },
        },
      });

      if (!deal) {
        throw new NotFoundError('Deal', dealId);
      }

      return this.mapToDealWithVersions(deal);
    });
  }

  /**
   * Reject all pending versions for a deal. They remain in history as
   * non-pending, non-authoritative versions; the deal's acceptedVersionNumber
   * is unchanged.
   *
   * Concurrency-safe: gated on the deal's updatedAt.
   */
  async rejectPendingVersions(
    dealId: string,
    expectedUpdatedAt: Date,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    const existingDeal = await this.findByIdWithAccessCheck(
      dealId,
      requesterId,
      requesterRole,
    );
    const expected =
      expectedUpdatedAt instanceof Date
        ? expectedUpdatedAt
        : existingDeal.updatedAt;

    return prisma.$transaction(async (tx) => {
      // Optimistic lock — even though we're not changing acceptedVersionNumber,
      // we still gate the operation on updatedAt for consistency.
      const lockResult = await tx.deal.updateMany({
        where: { id: dealId, updatedAt: expected },
        data: { updatedAt: new Date() },
      });

      if (lockResult.count === 0) {
        const { DealVersionConflictError } = await import('../domain/errors/index.js');
        throw new DealVersionConflictError(
          'Deal was modified by another request. Please reload and retry.',
        );
      }

      // Mark all pending versions as non-pending (rejected; historical record kept)
      await tx.dealVersion.updateMany({
        where: { dealId, isPending: true },
        data: { isPending: false },
      });

      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: {
          versions: { orderBy: { versionNumber: 'asc' } },
        },
      });

      if (!deal) {
        throw new NotFoundError('Deal', dealId);
      }

      return this.mapToDealWithVersions(deal);
    });
  }

  /**
   * Create an audit log entry.
   */
  async createAuditLog(params: {
    actorId?: string;
    dealId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        dealId: params.dealId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata
          ? (params.metadata as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private verifyAccess(
    deal: DealWithVersions,
    requesterId: string,
    requesterRole: string,
  ): void {
    // ADMIN can access any deal
    if (requesterRole === 'ADMIN') return;

    // HRT has limited read access — only for deals in DISPUTED or RESOLVED status
    // (the dispute review workflow). HRT cannot view deals in other states.
    if (requesterRole === 'HRT') {
      if (deal.status === 'DISPUTED' || deal.status === 'RESOLVED') return;
      throw new UnauthorizedAccessError('HRT can only access deals in dispute resolution');
    }

    // Creator can access if they are the invited creator
    if (requesterRole === 'CREATOR') {
      if (deal.creatorId === requesterId) return;
      throw new UnauthorizedAccessError('Only deal participants can access this resource');
    }

    // Brand can access if they are the brand owner
    if (requesterRole === 'BRAND') {
      if (deal.brandId === requesterId) return;
      throw new UnauthorizedAccessError('Only deal participants can access this resource');
    }

    throw new UnauthorizedAccessError('Only deal participants can access this resource');
  }

  private buildAccessFilter(userId: string, userRole: string): Prisma.DealWhereInput {
    switch (userRole) {
      case 'ADMIN':
        // Admin can see all deals
        return {};

      case 'HRT':
        // HRT can see all deals with disputes
        return { status: { in: ['DISPUTED', 'RESOLVED'] } };

      case 'BRAND':
        // Brand can see their own deals
        return { brandId: userId };

      case 'CREATOR':
        // Creator can see deals where they are the invited creator
        return { creatorId: userId };

      default:
        // Unknown role: no access
        return { id: 'IMPOSSIBLE_ID_FOR_UNKNOWN_ROLE' };
    }
  }

  private mapToDealWithVersions(
    deal: Deal & {
      versions: DealVersion[];
    },
  ): DealWithVersions {
    return {
      id: deal.id,
      brandId: deal.brandId,
      creatorId: deal.creatorId,
      status: deal.status as DealStatus,
      acceptedVersionNumber: deal.acceptedVersionNumber,
      contractId: deal.contractId,
      fundingStatus: deal.fundingStatus as FundingStatus,
      paymentRecordId: deal.paymentRecordId,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      versions: deal.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        isPending: v.isPending,
        terms: v.terms as unknown as DealTerms,
        createdAt: v.createdAt,
      })),
    };
  }
}

export const dealRepository = new DealRepository();
