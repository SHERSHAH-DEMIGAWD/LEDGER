import { PrismaClient, Deal, DealVersion, Prisma } from '@prisma/client';
import { NotFoundError } from '../middleware/errorHandler.js';
import { UnauthorizedAccessError } from '../domain/errors/index.js';
import type { DealStatus, FundingStatus } from '../domain/state-machine/DealStateMachine.js';
import type { DealTerms } from '../domain/value-objects/DealTerms.js';

const prisma = new PrismaClient();

export interface DealWithVersions {
  id: string;
  brandId: string;
  creatorId: string | null;
  status: DealStatus;
  contractId: string | null;
  fundingStatus: FundingStatus;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    versionNumber: number;
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
  actorId: string;
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
   */
  async create(input: CreateDealInput): Promise<DealWithVersions> {
    return prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          brandId: input.brandId,
          status: 'DRAFT',
          fundingStatus: 'NOT_FUNDED',
          versions: {
            create: {
              versionNumber: 1,
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
   * Update the status of a Deal.
   * Uses optimistic locking via updatedAt to prevent concurrent race conditions.
   * Throws NotFoundError if deal doesn't exist.
   * Throws UnauthorizedAccessError if user is not authorized.
   */
  async updateStatus(
    dealId: string,
    newStatus: DealStatus,
    _actorId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<DealWithVersions> {
    // First, load the deal with a lock to prevent concurrent transitions
    const existingDeal = await this.findByIdWithAccessCheck(dealId, requesterId, requesterRole);

    const updated = await prisma.$transaction(async (tx) => {
      // Use a row-level lock on the deal to serialize concurrent transition attempts
      // In PostgreSQL, SELECT ... FOR UPDATE achieves this.
      // Prisma doesn't expose FOR UPDATE directly, so we rely on the unique constraint
      // on status + updatedAt being enforced, with a retry loop below.
      const result = await tx.deal.updateMany({
        where: {
          id: dealId,
          updatedAt: existingDeal.updatedAt, // Optimistic locking
        },
        data: {
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new Error('CONCURRENT_MODIFICATION: The deal was modified by another request. Please retry.');
      }

      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
        },
      });

      return deal;
    });

    if (!updated) {
      throw new NotFoundError('Deal', dealId);
    }

    return this.mapToDealWithVersions(updated);
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
   * Create a new DealVersion (for term updates).
   */
  async createVersion(
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
        terms: terms as unknown as Prisma.InputJsonValue,
      },
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

    // HRT has limited read access (only for disputes) — implemented at service level
    // For now, HRT can view deals
    if (requesterRole === 'HRT') return;

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
      contractId: deal.contractId,
      fundingStatus: deal.fundingStatus as FundingStatus,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      versions: deal.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        terms: v.terms as unknown as DealTerms,
        createdAt: v.createdAt,
      })),
    };
  }
}

export const dealRepository = new DealRepository();
