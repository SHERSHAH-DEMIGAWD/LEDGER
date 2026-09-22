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
  validateTermRefinement,
  listAvailableActions,
  isTerminal,
  type DealStatus,
  type DealAction,
  type TransitionActor,
} from '../domain/state-machine/DealStateMachine.js';
import { validateDealTerms, type DealTerms } from '../domain/value-objects/DealTerms.js';
import { InvalidStateError, UnauthorizedAccessError } from '../domain/errors/index.js';
import { prisma } from '../db.js';
import {
  dealRepository,
  type DealWithVersions,
  type DealFilter,
  type AuditLogInput,
  type DealParticipant,
  participantSelect,
  toDealParticipant,
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

  return dealRepository.create({
    brandId: actor.id,
    terms: terms as DealTerms,
  }, {
    actorId: actor.id,
    action: 'DEAL.CREATED',
    resourceType: 'Deal',
    metadata: { status: 'DRAFT' },
  });
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
  updatedAt: Date;
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
    updatedAt: deal.updatedAt,
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

  if (action === 'SUBMIT_FOR_ACCEPTANCE') {
    throw new InvalidStateError('Invitations must use POST /deals/:id/invite');
  }
  if (action === 'FUND') {
    throw new InvalidStateError('Funding must use POST /deals/:id/fund');
  }
  if (action === 'REQUEST_REVISION') {
    throw new InvalidStateError('Revision requests must use POST /deals/:id/request-revision with a note');
  }
  if (action === 'RAISE_DISPUTE') {
    throw new InvalidStateError('Disputes must use POST /deals/:id/dispute with a note');
  }
  if (action === 'RESOLVE') {
    throw new InvalidStateError('Dispute resolutions must use POST /deals/:id/resolve with a note');
  }
  if (targetStatus === 'IN_PROGRESS') {
    const payment = deal.paymentRecordId
      ? await prisma.payment.findUnique({ where: { id: deal.paymentRecordId } })
      : null;
    if (deal.fundingStatus !== 'FUNDED' || payment?.dealId !== dealId || payment.status !== 'SUCCEEDED') {
      throw new InvalidStateError('Work requires a successfully funded payment record');
    }
  }

  const auditLogs: AuditLogInput[] = [{
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
  }];
  // Keep the invitation event in the canonical service so both API paths
  // produce the same history. Persist these events with the state change.
  if (action === 'ACCEPT' || action === 'DECLINE') {
    auditLogs.push({
      actorId: actor.id,
      dealId,
      action: action === 'ACCEPT' ? 'INVITATION.ACCEPTED' : 'INVITATION.DECLINED',
      resourceType: 'Invitation',
      resourceId: dealId,
      metadata: { fromStatus: deal.status, toStatus: targetStatus },
    });
  }

  return dealRepository.updateStatus(
    dealId, targetStatus, deal.updatedAt, actor.id, actor.role,
    { expectedStatus: deal.status, auditLogs },
  );
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
  recipient: string | { creatorEmail: string },
  actor: TransitionActor,
): Promise<DealWithVersions> {
  if (actor.role !== 'BRAND' && actor.role !== 'ADMIN') {
    throw new UnauthorizedAccessError('Only brands can invite creators to deals');
  }

  // 1. Load deal
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. Brand ownership (admins bypass)
  if (actor.role !== 'ADMIN' && deal.brandId !== actor.id) {
    throw new UnauthorizedAccessError('Only the deal brand can invite creators');
  }

  // 3. Validate that the target creator exists and has the CREATOR role.
  //    Prevents inviting non-existent users or users with the wrong role.
  // 4. Can only invite from DRAFT state
  if (deal.status !== 'DRAFT') {
    throw new InvalidStateError(
      `Cannot invite creator from state '${deal.status}'. Deal must be in DRAFT.`,
    );
  }

  // This is an exact recipient address for an already-connected creator,
  // never a discovery/search endpoint. Reject ambiguous legacy addresses.
  const targetUsers = typeof recipient === 'string'
    ? [await prisma.user.findUnique({
        where: { id: recipient },
        select: { id: true, role: true, deletedAt: true },
      })].filter((user) => user !== null)
    : await prisma.user.findMany({
        where: { email: { equals: recipient.creatorEmail.trim(), mode: 'insensitive' } },
        select: { id: true, role: true, deletedAt: true },
        take: 2,
      });
  const targetUser = targetUsers.length === 1 ? targetUsers[0] : null;
  if (!targetUser || targetUser.role !== 'CREATOR' || targetUser.deletedAt) {
    throw new InvalidStateError('No active creator account matches this invitation. Check the creator’s registered email or ID.');
  }
  const creatorId = targetUser.id;

  // 5. Guard against re-inviting when a creator is already assigned.
  //    The state check above covers PENDING_ACCEPTANCE+, but a DRAFT deal
  //    should never already have a creatorId — reject defensively.
  if (deal.creatorId !== null && deal.creatorId !== creatorId) {
    throw new InvalidStateError(
      `Deal already has an assigned creator and cannot be re-invited`,
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

  // Assignment, status and its audit event commit together.
  return dealRepository.assignCreatorAndTransition(
    dealId, creatorId, targetStatus, deal.updatedAt, actor.id, actor.role,
    [{
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
    }],
  );
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
  brand: DealParticipant | null;
  creator: DealParticipant | null;
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
    const authoritative = deal.acceptedVersionNumber !== null
      ? deal.versions.find((version) => version.versionNumber === deal.acceptedVersionNumber && !version.isPending)
      : [...deal.versions].reverse().find((version) => !version.isPending);
    if (!authoritative) throw new InvalidStateError(`Deal '${deal.id}' has no authoritative terms version`);
    return {
      id: deal.id,
      status: deal.status,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      brandId: deal.brandId,
      brand: deal.brand ?? null,
      creator: deal.creator ?? null,
      terms: authoritative.terms,
      latestVersionNumber: authoritative.versionNumber,
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
  actor: DealParticipant | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
  resourceType: string;
  resourceId: string;
}>> {
  // Verify the requester has access to this deal first
  await getDeal(dealId, requesterId, requesterRole);

  const logs = await prisma.auditLog.findMany({
    where: { dealId },
    // Deterministic ordering: primary by timestamp, secondary by id for ties.
    // Uses database server time which is authoritative (not client-supplied).
    orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      action: true,
      actorId: true,
      actor: { select: participantSelect },
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
    actor: toDealParticipant(log.actor),
    metadata: log.metadata as Record<string, unknown> | null,
    timestamp: log.timestamp,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
  }));
}

// =============================================================================
// Term Refinement (Deal Terms MVP)
// =============================================================================

/**
 * Term-refinement service output: a structured view of the current term state.
 *
 * - authoritativeVersionNumber: the version that is currently authoritative
 *   (the active commercial terms). This is what PaymentService and any other
 *   code reading financial terms MUST use.
 * - pendingVersionNumber: the version number of an outstanding proposal
 *   awaiting counterparty acceptance, or null if none.
 * - authoritativeTerms: the terms of the authoritative version (typed payload).
 * - pendingTerms: the terms of the pending proposal, or null if none.
 *
 * NOTE: This intentionally does NOT return all historical versions. The deal
 * endpoint (`getDeal`) already returns the full version history for audit/review
 * purposes; the term-refinement surface is focused on the "what's active now"
 * and "what's awaiting acceptance" questions.
 */
export interface DealTermsView {
  dealId: string;
  dealStatus: DealStatus;
  authoritativeVersionNumber: number;
  pendingVersionNumber: number | null;
  authoritativeTerms: DealTerms;
  pendingTerms: DealTerms | null;
  pendingProposedBy: 'BRAND' | null;
  pendingProposedAt: Date | null;
}

/**
 * Resolve the authoritative and pending versions for a deal, returning a
 * structured view that is safe to surface to API consumers.
 *
 * Resolution rules (mirrors DealRepository.getAuthoritativeVersion):
 *  - authoritativeVersionNumber = deal.acceptedVersionNumber (the active vN)
 *    OR (legacy fallback) the latest non-pending version.
 *  - pendingVersionNumber = the unique pending version, or null.
 *
 * Throws NotFoundError if deal does not exist; UnauthorizedAccessError if the
 * requester is not a participant (or ADMIN/HRT).
 */
export async function getDealTerms(
  dealId: string,
  requesterId: string,
  requesterRole: string,
): Promise<DealTermsView> {
  const deal = await dealRepository.findByIdWithAccessCheck(
    dealId,
    requesterId,
    requesterRole,
  );

  const authoritative = await dealRepository.getAuthoritativeVersion(
    dealId,
    deal.acceptedVersionNumber,
  );
  if (!authoritative) {
    // Should not happen for any deal that exists (v1 is always created accepted).
    throw new InvalidStateError(
      `Deal '${dealId}' has no authoritative terms version`,
    );
  }

  const pending = await dealRepository.getPendingVersion(dealId);

  return {
    dealId,
    dealStatus: deal.status,
    authoritativeVersionNumber: authoritative.versionNumber,
    pendingVersionNumber: pending?.versionNumber ?? null,
    authoritativeTerms: authoritative.terms as unknown as DealTerms,
    pendingTerms: pending ? (pending.terms as unknown as DealTerms) : null,
    pendingProposedBy: pending ? 'BRAND' : null, // MVP: only brand can propose
    pendingProposedAt: pending ? pending.createdAt : null,
  };
}

/**
 * Brand proposes a new term set for an existing deal.
 *
 * The proposal is recorded as a NEW DealVersion with isPending=true. The
 * authoritative version is NOT mutated. The proposal requires explicit
 * counterparty acceptance (acceptProposal) before it becomes authoritative.
 *
 * Authorization & lifecycle:
 *  - State-machine-gated through validateTermRefinement('PROPOSE_TERMS').
 *  - Only BRAND participants of an ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *  - Term validation reuses existing validateDealTerms — arbitrary JSON is
 *    rejected with DealTermsValidationError.
 *
 * Concurrency:
 *  - Optimistic lock on deal.updatedAt.
 *  - If another proposal is already pending, returns 400 (cannot stack pending).
 *
 * Audit:
 *  - Records DEAL.TERMS_PROPOSED with the previous authoritative version and
 *    the proposed version number.
 */
export async function proposeTerms(
  dealId: string,
  terms: unknown,
  actor: TransitionActor,
): Promise<DealTermsView> {
  // Domain-level validation (rejects arbitrary JSON, malformed terms, etc.)
  validateDealTerms(terms);

  // 1. Load deal (no access check yet — state machine enforces participation).
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. State-machine authorization gate (lifecycle + role + participant).
  validateTermRefinement(deal.status, 'PROPOSE_TERMS', actor, {
    isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId },
  });

  // 3. Reject if a proposal is already pending (single-pending design).
  const existingPending = await dealRepository.getPendingVersion(dealId);
  if (existingPending) {
    throw new InvalidStateError(
      `Deal '${dealId}' already has a pending term proposal (v${existingPending.versionNumber}). Reject or accept it before proposing new terms.`,
    );
  }

  // 4. Create the pending version atomically + bump deal.updatedAt (optimistic lock).
  const created = await dealRepository.createPendingVersionAtomically(
    dealId,
    terms as DealTerms,
    deal.updatedAt,
    actor.id,
    actor.role,
  );

  // 5. Audit log (only after successful persistence).
  const previousAuthoritative = await dealRepository.getAuthoritativeVersion(
    dealId,
    deal.acceptedVersionNumber,
  );

  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId,
    action: 'DEAL.TERMS_PROPOSED',
    resourceType: 'DealVersion',
    resourceId: created.id,
    metadata: {
      dealStatus: deal.status,
      previousAuthoritativeVersionNumber: previousAuthoritative?.versionNumber ?? null,
      proposedVersionNumber: created.versionNumber,
      proposedTerms: terms,
    },
  });

  // 6. Return the new terms view (refreshed, with the pending version visible).
  return getDealTerms(dealId, actor.id, actor.role);
}

/**
 * Creator accepts the current pending term proposal.
 *
 * The pending version becomes authoritative: its isPending is cleared and the
 * deal's acceptedVersionNumber points to it. Any OTHER pending versions
 * (theoretically none in MVP, but defensive) are also cleared — they remain
 * in history but never become authoritative.
 *
 * Authorization & lifecycle:
 *  - State-machine-gated through validateTermRefinement('ACCEPT_PROPOSAL').
 *  - Only CREATOR participants of an ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *  - Requires that a pending version exists; otherwise 400.
 *
 * Concurrency:
 *  - Optimistic lock on deal.updatedAt.
 *
 * Audit:
 *  - Records DEAL.TERMS_ACCEPTED including the previous authoritative version
 *    and the accepted version.
 */
export async function acceptProposal(
  dealId: string,
  actor: TransitionActor,
): Promise<DealTermsView> {
  // 1. Load deal.
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. State-machine authorization gate (lifecycle + role + participant).
  validateTermRefinement(deal.status, 'ACCEPT_PROPOSAL', actor, {
    isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId },
  });

  // 3. Confirm there IS a pending version to accept.
  const pending = await dealRepository.getPendingVersion(dealId);
  if (!pending) {
    throw new InvalidStateError(
      `Deal '${dealId}' has no pending term proposal to accept`,
    );
  }

  // Once funding has been recorded, accepting terms that change the payment
  // amount or currency would make the authoritative agreement contradict the
  // immutable payment record. Non-financial refinements remain permitted.
  if (deal.fundingStatus !== 'NOT_FUNDED') {
    const authoritative = await dealRepository.getAuthoritativeVersion(
      dealId,
      deal.acceptedVersionNumber,
    );
    if (!authoritative) {
      throw new InvalidStateError(
        `Deal '${dealId}' has no authoritative terms version`,
      );
    }
    const currentTerms = authoritative.terms as unknown as DealTerms;
    const proposedTerms = pending.terms as unknown as DealTerms;
    if (
      currentTerms.paymentAmount !== proposedTerms.paymentAmount ||
      currentTerms.currency !== proposedTerms.currency
    ) {
      throw new InvalidStateError(
        'Funded deal proposals cannot change the payment amount or currency',
      );
    }
  }

  const previousAuthoritativeVersionNumber = deal.acceptedVersionNumber;

  // 4. Atomically accept: clears pending flags, updates acceptedVersionNumber.
  await dealRepository.acceptPendingVersion(
    dealId,
    pending.versionNumber,
    deal.updatedAt,
    actor.id,
    actor.role,
  );

  // 5. Audit log.
  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId,
    action: 'DEAL.TERMS_ACCEPTED',
    resourceType: 'DealVersion',
    resourceId: pending.id,
    metadata: {
      dealStatus: deal.status,
      previousAuthoritativeVersionNumber,
      acceptedVersionNumber: pending.versionNumber,
    },
  });

  // 6. Return refreshed terms view.
  return getDealTerms(dealId, actor.id, actor.role);
}

/**
 * Creator rejects the current pending term proposal.
 *
 * The pending version's isPending flag is cleared (rejected). The deal's
 * acceptedVersionNumber is unchanged — the previously authoritative version stays
 * authoritative. The rejected version remains visible in the audit history
 * but NEVER becomes authoritative.
 *
 * Authorization & lifecycle:
 *  - State-machine-gated through validateTermRefinement('REJECT_PROPOSAL').
 *  - Only CREATOR participants of an ACCEPTED, FUNDED, or IN_PROGRESS deal.
 *  - Requires that a pending version exists; otherwise 400.
 *
 * Concurrency:
 *  - Optimistic lock on deal.updatedAt.
 *
 * Audit:
 *  - Records DEAL.TERMS_REJECTED including the previous authoritative version
 *    and the rejected version number.
 */
export async function rejectProposal(
  dealId: string,
  actor: TransitionActor,
): Promise<DealTermsView> {
  // 1. Load deal.
  const deal = await dealRepository.findById(dealId);
  if (!deal) {
    throw new InvalidStateError(`Deal '${dealId}' not found`);
  }

  // 2. State-machine authorization gate (lifecycle + role + participant).
  validateTermRefinement(deal.status, 'REJECT_PROPOSAL', actor, {
    isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId },
  });

  // 3. Confirm there IS a pending version to reject.
  const pending = await dealRepository.getPendingVersion(dealId);
  if (!pending) {
    throw new InvalidStateError(
      `Deal '${dealId}' has no pending term proposal to reject`,
    );
  }

  const previousAuthoritativeVersionNumber = deal.acceptedVersionNumber;

  // 4. Atomically clear all pending versions for this deal.
  await dealRepository.rejectPendingVersions(
    dealId,
    deal.updatedAt,
    actor.id,
    actor.role,
  );

  // 5. Audit log.
  await dealRepository.createAuditLog({
    actorId: actor.id,
    dealId,
    action: 'DEAL.TERMS_REJECTED',
    resourceType: 'DealVersion',
    resourceId: pending.id,
    metadata: {
      dealStatus: deal.status,
      previousAuthoritativeVersionNumber,
      rejectedVersionNumber: pending.versionNumber,
    },
  });

  // 6. Return refreshed terms view.
  return getDealTerms(dealId, actor.id, actor.role);
}

/**
 * Helper used by other services (notably PaymentService) to read the terms
 * of the currently authoritative version of a deal. NEVER returns pending terms.
 *
 * Returns null if no authoritative version exists (which should never occur
 * for a deal that has been created — v1 is always created as accepted).
 */
export async function getAuthoritativeTermsForDeal(
  dealId: string,
): Promise<{ versionNumber: number; terms: DealTerms } | null> {
  const deal = await dealRepository.findById(dealId);
  if (!deal) return null;

  const authoritative = await dealRepository.getAuthoritativeVersion(
    dealId,
    deal.acceptedVersionNumber,
  );
  if (!authoritative) return null;

  return {
    versionNumber: authoritative.versionNumber,
    terms: authoritative.terms as unknown as DealTerms,
  };
}
