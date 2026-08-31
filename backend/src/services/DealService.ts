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

import { PrismaClient } from '@prisma/client';
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
import {
  dealRepository,
  type DealWithVersions,
  type DealFilter,
} from '../repositories/DealRepository.js';
import type { Role } from '../types.js';

// Local Prisma instance for audit log reads (deal history).
// Separate instance so we don't couple repository internals to history query.
const prisma = new PrismaClient();

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
 * 3. Updates the deal status atomically
 * 4. Creates an audit log entry
 *
 * Returns the updated deal on success.
 * Throws InvalidStateError on invalid transition.
 * Throws UnauthorizedAccessError on unauthorized attempt.
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

  // 3. Update status in transaction (repo performs participant access check)
  const updated = await dealRepository.updateStatus(
    dealId,
    targetStatus,
    actor.id,
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
 * Assigns the creatorId and transitions DRAFT → PENDING_ACCEPTANCE.
 *
 * The state machine lists SUBMIT_FOR_ACCEPTANCE as DRAFT → PENDING_ACCEPTANCE,
 * but does not have a way to attach a creator at transition time. This service
 * keeps the two concerns together: the actor must be the brand owner and the
 * deal must be in DRAFT.
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

  // 4. Persist creatorId via a dedicated update path.
  //    We don't have a setCreatorId repo method yet, so do it inline here.
  //    This is the only place outside the repository that touches the deal row.
  await prisma.deal.update({
    where: { id: dealId },
    data: { creatorId },
  });

  // 5. Move status DRAFT → PENDING_ACCEPTANCE through the state machine
  //    (use SUBMIT_FOR_ACCEPTANCE which is the canonical action for this transition)
  const targetStatus = validateTransition(
    deal.status,
    'SUBMIT_FOR_ACCEPTANCE',
    actor,
    { isDealParticipant: { brandId: deal.brandId, creatorId } },
  );

  const updated = await dealRepository.updateStatus(
    dealId,
    targetStatus,
    actor.id,
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