/**
 * services/DisputeService.ts
 *
 * Handles the dispute lifecycle for deals:
 * 1. Raising a dispute (SUBMITTED → DISPUTED) — Brand only
 * 2. Resolving a dispute (DISPUTED → RESOLVED) — HRT or Admin only
 *
 * Both actions use the existing state machine for authorization and state
 * validation, and produce dedicated audit events so the trail is
 * human-readable.
 *
 * State transitions (from DealStateMachine):
 * - SUBMITTED + RAISE_DISPUTE → DISPUTED  (Brand, Admin)
 * - DISPUTED + RESOLVE → RESOLVED         (HRT, Admin)
 */

import { dealRepository } from '../repositories/DealRepository.js';
import {
  validateTransition,
  type DealStatus,
} from '../domain/state-machine/DealStateMachine.js';
import { InvalidStateError, UnauthorizedAccessError } from '../domain/errors/index.js';
import type { Role } from '../types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DisputeActor {
  id: string;
  role: Role;
}

export interface RaiseDisputeResult {
  dealId: string;
  status: DealStatus;
  raisedAt: Date;
}

export interface ResolveDisputeResult {
  dealId: string;
  status: DealStatus;
  resolvedAt: Date;
}

// ---------------------------------------------------------------------------
// DisputeService
// ---------------------------------------------------------------------------

export class DisputeService {
  /**
   * Raise a dispute on submitted deliverables.
   *
   * Authorization:
   * - Brand participant associated with the deal → allowed
   * - Admin → allowed
   * - Creator → NOT allowed
   * - HRT → NOT allowed
   *
   * State requirements:
   * - Deal must be in SUBMITTED status
   *
   * @param dealId - The deal ID
   * @param note   - Required dispute description
   * @param actor  - The authenticated actor (from JWT)
   */
  async raiseDispute(
    dealId: string,
    note: string,
    actor: DisputeActor,
  ): Promise<RaiseDisputeResult> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization (brand or admin only — HRT cannot raise disputes)
    this.verifyDisputeAuthorization(deal, actor);

    // 3. Verify deal is in SUBMITTED state
    if (deal.status !== 'SUBMITTED') {
      throw new InvalidStateError(
        `Cannot raise dispute in state '${deal.status}'. Deal must be SUBMITTED.`,
      );
    }

    // 4. Validate the state transition (SUBMITTED → DISPUTED)
    const targetStatus = validateTransition(
      deal.status,
      'RAISE_DISPUTE',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 5. Persist the state change (with optimistic locking)
    const previousUpdatedAt = deal.updatedAt;
    await dealRepository.updateStatus(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
    );

    // 6. Create audit event for dispute raised
    const raisedAt = new Date();
    await dealRepository.createAuditLog({
      actorId: actor.id,
      dealId,
      action: 'DISPUTE.RAISED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'RAISE_DISPUTE',
        disputeNote: note,
      },
    });

    return {
      dealId,
      status: targetStatus,
      raisedAt,
    };
  }

  /**
   * Resolve an active dispute.
   *
   * Authorization:
   * - HRT → allowed (primary resolver for disputes)
   * - Admin → allowed
   * - Brand → NOT allowed
   * - Creator → NOT allowed
   *
   * State requirements:
   * - Deal must be in DISPUTED status
   *
   * The resolution note is stored in the audit trail and optionally persisted
   * to the deal's latestRevisionNote field for creator reference.
   *
   * @param dealId         - The deal ID
   * @param resolutionNote - Required resolution description
   * @param actor          - The authenticated actor (HRT or Admin)
   */
  async resolveDispute(
    dealId: string,
    resolutionNote: string,
    actor: DisputeActor,
  ): Promise<ResolveDisputeResult> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization (HRT or admin only)
    this.verifyResolutionAuthorization(deal, actor);

    // 3. Verify deal is in DISPUTED state
    if (deal.status !== 'DISPUTED') {
      throw new InvalidStateError(
        `Cannot resolve dispute in state '${deal.status}'. Deal must be DISPUTED.`,
      );
    }

    // 4. Validate the state transition (DISPUTED → RESOLVED)
    const targetStatus = validateTransition(
      deal.status,
      'RESOLVE',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 5. Persist the state change with resolution note
    const previousUpdatedAt = deal.updatedAt;
    await dealRepository.updateStatusAndRevisionNote(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
      resolutionNote,
    );

    // 6. Create audit event for dispute resolved
    const resolvedAt = new Date();
    await dealRepository.createAuditLog({
      actorId: actor.id,
      dealId,
      action: 'DISPUTE.RESOLVED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'RESOLVE',
        resolutionNote,
      },
    });

    return {
      dealId,
      status: targetStatus,
      resolvedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — authorization
  // ---------------------------------------------------------------------------

  private verifyDisputeAuthorization(
    deal: Awaited<ReturnType<typeof dealRepository.findById>>,
    actor: DisputeActor,
  ): void {
    // ADMIN can raise dispute on any deal
    if (actor.role === 'ADMIN') return;

    // Only the brand can raise disputes
    if (actor.role === 'BRAND') {
      if (deal!.brandId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the deal brand can raise a dispute',
      );
    }

    // HRT cannot raise disputes (only resolve them)
    if (actor.role === 'HRT') {
      throw new UnauthorizedAccessError(
        'HRT cannot raise disputes — only resolve them',
      );
    }

    throw new UnauthorizedAccessError(
      'Only the deal brand can raise a dispute',
    );
  }

  private verifyResolutionAuthorization(
    _deal: Awaited<ReturnType<typeof dealRepository.findById>>,
    actor: DisputeActor,
  ): void {
    // ADMIN can resolve any dispute
    if (actor.role === 'ADMIN') return;

    // Only HRT can resolve disputes
    if (actor.role === 'HRT') {
      // HRT must still be an authorized resolver — the state machine
      // enforces HRT for the RESOLVE transition, and the repository's
      // HRT access check ensures HRT can only access DISPUTED deals.
      return;
    }

    // Brand and Creator cannot resolve disputes
    throw new UnauthorizedAccessError(
      'Only HRT or Admin can resolve a dispute',
    );
  }
}

export const disputeService = new DisputeService();
