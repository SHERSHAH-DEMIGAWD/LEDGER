/**
 * DealService — application service that orchestrates the Deal domain.
 *
 * All state transitions flow through here. The service:
 * 1. Validates the action using the state machine (server-side authority)
 * 2. Checks actor authorization
 * 3. Updates the deal in a transaction
 * 4. Creates an audit log entry
 *
 * Never trust client-supplied state or role — all authorization is
 * server-side and derived from the verified JWT.
 */

import {
  validateTransition,
  listAvailableActions,
  isTerminal,
  type DealStatus,
  type DealAction,
  type TransitionActor,
} from '../domain/state-machine/DealStateMachine.js';
import { validateDealTerms, type DealTerms } from '../domain/value-objects/DealTerms.js';
import { InvalidStateError } from '../domain/errors/index.js';
import { prisma } from '../db.js';
import {
  dealRepository,
  type DealWithVersions,
  type DealFilter,
} from '../repositories/DealRepository.js';
import type { Role } from '../types.js';

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/**
 * Create a new Deal.
 *
 * The brand is identified from the authenticated request (never trust client ID).
 * The deal starts in DRAFT status.
 */
export async function createDeal(
  terms: unknown,
  actor: TransitionActor,
): Promise<DealWithVersions> {
  // Validate deal terms (domain-level guard)
  validateDealTerms(terms);

  // Only BRAND or ADMIN can create deals
  if (actor.role !== 'BRAND' && actor.role !== 'ADMIN') {
    throw new InvalidStateError('Only brands can create deals');
  }

  const deal = await dealRepository.create({
    brandId: actor.id,
    terms: terms as DealTerms,
  });

  // Audit log
  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId: deal.id,
    action: 'DEAL.CREATED',
    resourceType: 'Deal',
    resourceId: deal.id,
    metadata: { status: deal.status },
  });

  return deal;
}

/**
 * Get a deal by ID with authorization check.
 *
 * The deal is returned only if the requester is a participant or has
 * system-level access (HRT, ADMIN).
 */
export async function getDeal(
  dealId: string,
  requesterId: string,
  requesterRole: string,
): Promise<DealWithVersions> {
  return dealRepository.findByIdWithAccessCheck(dealId, requesterId, requesterRole);
}

/**
 * Get the current state summary of a deal.
 *
 * Returns: status, available actions for this actor, terminal flag.
 */
export async function getDealState(
  dealId: string,
  requesterId: string,
  requesterRole: string,
): Promise<{
  dealId: string;
  status: DealStatus;
  isTerminal: boolean;
  availableActions: DealAction[];
  brandId: string;
  creatorId: string | null;
}> {
  const deal = await getDeal(dealId, requesterId, requesterRole);

  const transitions = listAvailableActions(deal.status, requesterRole as Role);

  return {
    dealId: deal.id,
    status: deal.status,
    isTerminal: isTerminal(deal.status),
    availableActions: transitions.map((t) => t.action),
    brandId: deal.brandId,
    creatorId: deal.creatorId,
  };
}

/**
 * List deals accessible to the requester.
 *
 * `filter.status` accepts a single status or an array; arrays become
 * a `status IN (...)` filter at the repository layer.
 */
export async function listDeals(
  requesterId: string,
  requesterRole: string,
  filter?: DealFilter,
): Promise<DealWithVersions[]> {
  return dealRepository.findAccessibleToUser(requesterId, requesterRole, filter);
}

/**
 * Perform a state transition on a deal.
 *
 * This is the canonical server-side transition gate. It:
 * 1. Loads the authoritative deal state from the DB
 * 2. Validates the transition (current state + actor role + participation)
 * 3. Updates the deal status atomically with optimistic locking
 * 4. Creates an audit log entry
 *
 * Returns the updated deal on success.
 * Throws InvalidStateError on invalid transition.
 * Throws UnauthorizedAccessError on unauthorized attempt.
 * Throws DealVersionConflictError if a concurrent transition races us.
 */
export async function transitionDeal(
  dealId: string,
  action: DealAction,
  actor: TransitionActor,
): Promise<DealWithVersions> {
  // 1. Load authoritative state from DB (no access check yet — the state machine
  //    enforces participation, so a non-participant must see the same deny)
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. Validate transition (state machine enforces role + participation)
  const targetStatus = validateTransition(deal.status, action, actor, {
    isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId },
  });

  // 3. Update status in transaction (repo performs participant access check
  //    and optimistic locking based on the updatedAt we just observed).
  const updated = await dealRepository.updateStatus(
    dealId,
    targetStatus,
    deal.updatedAt,
    actor.id,
    actor.role,
  );

  // 4. Audit log
  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId,
    action: 'DEAL.STATE_CHANGED',
    resourceType: 'Deal',
    resourceId: dealId,
    metadata: {
      fromStatus: deal.status,
      toStatus: targetStatus,
      action,
    },
  });

  return updated;
}

/**
 * Invite a creator to a deal.
 *
 * The deal must currently be in DRAFT status and the actor must be the deal's
 * brand owner (or an ADMIN). The service:
 *  1. Loads the deal
 *  2. Validates brand ownership
 *  3. Validates the state machine transition (DRAFT → PENDING_ACCEPTANCE)
 *  4. Atomically assigns the creatorId AND transitions the status
 *  5. Writes an audit log entry
 *
 * The creatorId assignment and status update are wrapped in a single
 * repository transaction so a partial failure cannot leave the deal
 * with a creatorId but no status change (or vice versa).
 */
export async function inviteCreator(
  dealId: string,
  creatorId: string,
  actor: TransitionActor,
): Promise<DealWithVersions> {
  if (actor.role !== 'BRAND' && actor.role !== 'ADMIN') {
    throw new InvalidStateError('Only brands can invite creators to deals');
  }

  // 1. Load deal
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. Brand ownership (admins bypass)
  if (actor.role !== 'ADMIN' && deal.brandId !== actor.id) {
    throw new InvalidStateError('Only the deal brand can invite creators');
  }

  // 3. Can only invite from DRAFT state
  if (deal.status !== 'DRAFT') {
    throw new InvalidStateError(
      `Cannot invite creator from state '${deal.status}'. Deal must be in DRAFT.`,
    );
  }

  // 4. Validate transition against the state machine (the source of truth).
  //    The participant check is for the actor — the new creatorId being
  //    attached is the *result* of this transition, not a precondition.
  const targetStatus = validateTransition(
    deal.status,
    'SUBMIT_FOR_ACCEPTANCE',
    actor,
    { isDealParticipant: { brandId: deal.brandId, creatorId } },
  );

  // 5. Atomically assign creatorId + transition status in one transaction.
  const updated = await dealRepository.assignCreatorAndTransition(
    dealId,
    creatorId,
    targetStatus,
    deal.updatedAt,
    actor.id,
    actor.role,
  );

  // 6. Audit log
  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId,
    action: 'DEAL.CREATOR_INVITED',
    resourceType: 'Deal',
    resourceId: dealId,
    metadata: {
      creatorId,
      fromStatus: deal.status,
      toStatus: targetStatus,
    },
  });

  return updated;
}

/**
 * List invitations for a creator — deals in PENDING_ACCEPTANCE state
 * where the creatorId matches the requester.
 *
 * Returns only the data a creator needs to decide whether to accept:
 * deal ID, brand info, terms snapshot, status, and timestamp.
 *
 * Authorization: CREATOR role only (enforced at the route layer).
 * A non-creator calling this via the API will get an empty array since
 * the repository's access filter for non-creators does not match
 * deals by creatorId.
 */
export async function listCreatorInvitations(
  requesterId: string,
  requesterRole: string,
): Promise<Array<{
  id: string;
  status: DealStatus;
  createdAt: Date;
  updatedAt: Date;
  brandId: string;
  terms: DealTerms;
  latestVersionNumber: number;
}>> {
  // Only creators can list their invitations through this path.
  // The repository filter also enforces this: for CREATOR role,
  // findAccessibleToUser returns deals where creatorId = userId.
  // But we want ONLY PENDING_ACCEPTANCE deals for invitations.
  if (requesterRole !== 'CREATOR' && requesterRole !== 'ADMIN') {
    // Return empty for non-creators — they use the general listDeals path.
    return [];
  }

  const pendingDeals = await dealRepository.findAccessibleToUser(
    requesterId,
    requesterRole,
    { status: 'PENDING_ACCEPTANCE' },
  );

  // Audit log: record that creator viewed their invitations.
  // Only log once per request (not per deal) to avoid noise.
  await dealRepository.createAuditLog({
    actorId: requesterId,
    action: 'INVITATION.VIEWED',
    resourceType: 'InvitationList',
    resourceId: `invitations:${requesterId}`,
    metadata: { dealCount: pendingDeals.length },
  });

  return pendingDeals.map((deal) => {
    const latest = deal.versions[deal.versions.length - 1];
    return {
      id: deal.id,
      status: deal.status,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      brandId: deal.brandId,
      terms: latest?.terms ?? deal.versions[0].terms,
      latestVersionNumber: latest?.versionNumber ?? 1,
    };
  });
}

/**
 * Get deal history from audit logs (filtered by dealId).
 *
 * Authorization: same access rules as viewing the deal itself.
 */
export async function getDealHistory(
  dealId: string,
  requesterId: string,
  requesterRole: string,
): Promise<Array<{
  id: string;
  action: string;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
  resourceType: string;
  resourceId: string;
}>> {
  // Verify the requester has access to this deal first
  await getDeal(dealId, requesterId, requesterRole);

  const logs = await prisma.auditLog.findMany({
    where: { dealId },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      action: true,
      actorId: true,
      metadata: true,
      timestamp: true,
      resourceType: true,
      resourceId: true,
    },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    actorId: log.actorId,
    metadata: log.metadata as Record<string, unknown> | null,
    timestamp: log.timestamp,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
  }));
}
