/**
 * services/SubmissionService.ts
 *
 * Orchestrates the creator submission, brand review, revision request, and
 * approval lifecycle for deals that have entered the funded work phase.
 *
 * This service owns:
 * 1. Submitting deliverables (creator only, from IN_PROGRESS)
 * 2. Requesting revisions (brand only, from SUBMITTED)
 * 3. Approving deliverables (brand only, from SUBMITTED)
 * 4. Recording submission/revision notes in the audit trail
 *
 * Each action flows through the state machine for authorization and state
 * validation, and produces a dedicated audit event so the trail is
 * human-readable.
 *
 * State transitions:
 * - IN_PROGRESS + SUBMIT_DELIVERABLE → SUBMITTED  (creator)
 * - SUBMITTED + REQUEST_REVISION → REVISION_REQUESTED    (brand, with revision note)
 * - SUBMITTED + APPROVE → APPROVED               (brand)
 * - APPROVED + RELEASE_PAYMENT → COMPLETED       (brand, via separate complete endpoint)
 *
 * Revision model: SUBMITTED → REVISION_REQUESTED → SUBMITTED.
 * Resubmission uses the existing RESUBMIT transition.
 */

import { dealRepository, type DealWithVersions } from '../repositories/DealRepository.js';
import {
  validateTransition,
  type DealStatus,
} from '../domain/state-machine/DealStateMachine.js';
import { InvalidStateError, UnauthorizedAccessError } from '../domain/errors/index.js';
import type { Role } from '../types.js';

// ---------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------

export interface SubmissionActor {
  id: string;
  role: Role;
}

export interface SubmitResult {
  dealId: string;
  status: DealStatus;
  submittedAt: Date;
}

export interface RevisionRequestResult {
  dealId: string;
  status: DealStatus;
  revisionRequestedAt: Date;
}

export interface ApprovalResult {
  dealId: string;
  status: DealStatus;
  approvedAt: Date;
}

// ---------------------------------------------------------------------------------------
// SubmissionService
// ---------------------------------------------------------------------------------------

export class SubmissionService {
  /**
   * Submit deliverables for a deal.
   *
   * Authorization:
   * - Creator participant associated with the deal → allowed
   * - Admin → allowed
   * - Brand → NOT allowed
   * - Unrelated users → NOT allowed
   *
   * State requirements:
   * - Deal must be in IN_PROGRESS status
   * - Deal must have a creator assigned
   *
   * @param dealId - The deal ID
   * @param note   - Optional submission note from the creator
   * @param actor  - The authenticated actor (from JWT)
   */
  async submitDeliverable(
    dealId: string,
    note: string | undefined,
    actor: SubmissionActor,
  ): Promise<SubmitResult> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify the actor is the creator or admin
    this.verifySubmissionAuthorization(deal, actor);

    // 3. Verify deal is in IN_PROGRESS state
    if (deal.status !== 'IN_PROGRESS') {
      throw new InvalidStateError(
        `Cannot submit deliverables in state '${deal.status}'. Deal must be IN_PROGRESS.`,
      );
    }

    // 4. Verify deal has a creator assigned
    if (!deal.creatorId) {
      throw new InvalidStateError(
        `Cannot submit deliverables: deal has no assigned creator`,
      );
    }

    // 5. Validate the state transition (IN_PROGRESS → SUBMITTED)
    const targetStatus = validateTransition(
      deal.status,
      'SUBMIT_DELIVERABLE',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 6. Persist the state change (with optimistic locking)
    const previousUpdatedAt = deal.updatedAt;
    const submittedAt = new Date();
    // State, supported notes and audit history commit or roll back together.
    await dealRepository.updateStatus(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
      { expectedStatus: deal.status, auditLogs: [{
      actorId: actor.id,
      dealId,
      action: 'DELIVERABLE.SUBMITTED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'SUBMIT_DELIVERABLE',
        note: note ?? null,
      },
      }] },
    );

    return {
      dealId,
      status: targetStatus,
      submittedAt,
    };
  }

  /**
   * Request revision on submitted deliverables.
   *
   * Authorization:
   * - Brand participant associated with the deal → allowed
   * - Admin → allowed
   * - Creator → NOT allowed
   *
   * State requirements:
   * - Deal must be in SUBMITTED status
   *
   * This transitions the deal to REVISION_REQUESTED with a revision note
   * in the audit trail. The revision note is preserved as metadata so
   * the creator knows what to address.
   *
   * @param dealId - The deal ID
   * @param note   - Revision request note from the brand (required)
   * @param actor  - The authenticated actor (from JWT)
   */
  async requestRevision(
    dealId: string,
    note: string,
    actor: SubmissionActor,
  ): Promise<RevisionRequestResult> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization (brand or admin only)
    this.verifyRevisionAuthorization(deal, actor);

    // 3. Verify deal is in SUBMITTED state
    if (deal.status !== 'SUBMITTED') {
      throw new InvalidStateError(
        `Cannot request revision in state '${deal.status}'. Deal must be SUBMITTED.`,
      );
    }

    // 4. Validate the state transition (SUBMITTED → REVISION_REQUESTED)
    const targetStatus = validateTransition(
      deal.status,
      'REQUEST_REVISION',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 5. Persist the state change to REVISION_REQUESTED, recording the revision note
    const previousUpdatedAt = deal.updatedAt;
    const revisionRequestedAt = new Date();
    // State, supported notes and audit history commit or roll back together.
    await dealRepository.updateStatusAndRevisionNote(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
      note,
      { expectedStatus: deal.status, auditLogs: [{
      actorId: actor.id,
      dealId,
      action: 'DELIVERABLE.REVISION_REQUESTED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'REQUEST_REVISION',
        revisionNote: note,
      },
      }] },
    );

    return {
      dealId,
      status: targetStatus,
      revisionRequestedAt,
    };
  }

  /**
   * Approve submitted deliverables and release payment.
   *
   * Authorization:
   * - Brand participant associated with the deal → allowed
   * - Admin → allowed
   * - Creator → NOT allowed
   *
   * State requirements:
   * - Deal must be in SUBMITTED status
   *
   * This transitions the deal to APPROVED. Payment release (COMPLETED)
   * is handled by a separate releasePayment call.
   *
   * @param dealId - The deal ID
   * @param actor  - The authenticated actor (from JWT)
   */
  async approveDeliverable(
    dealId: string,
    actor: SubmissionActor,
  ): Promise<ApprovalResult> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization (brand or admin only)
    this.verifyApprovalAuthorization(deal, actor);

    // 3. Verify deal is in SUBMITTED state
    if (deal.status !== 'SUBMITTED') {
      throw new InvalidStateError(
        `Cannot approve deliverables in state '${deal.status}'. Deal must be SUBMITTED.`,
      );
    }

    // 4. Validate the state transition (SUBMITTED → APPROVED)
    const targetStatus = validateTransition(
      deal.status,
      'APPROVE',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 5. Persist the state change
    const previousUpdatedAt = deal.updatedAt;
    const approvedAt = new Date();
    // State, supported notes and audit history commit or roll back together.
    await dealRepository.updateStatus(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
      { expectedStatus: deal.status, auditLogs: [{
      actorId: actor.id,
      dealId,
      action: 'DELIVERABLE.APPROVED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'APPROVE',
      },
      }] },
    );

    return {
      dealId,
      status: targetStatus,
      approvedAt,
    };
  }

  /**
   * Release payment and complete the deal.
   *
   * Authorization:
   * - Brand participant associated with the deal → allowed
   * - Admin → allowed
   *
   * State requirements:
   * - Deal must be in APPROVED status
   *
   * @param dealId - The deal ID
   * @param actor  - The authenticated actor (from JWT)
   */
  async releasePayment(
    dealId: string,
    actor: SubmissionActor,
  ): Promise<{ dealId: string; status: DealStatus; completedAt: Date }> {
    // 1. Load the authoritative deal state
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      throw new InvalidStateError(`Deal '${dealId}' not found`);
    }

    // 2. Verify authorization
    this.verifyCompletionAuthorization(deal, actor);

    // 3. Verify deal is in APPROVED state
    if (deal.status !== 'APPROVED') {
      throw new InvalidStateError(
        `Cannot release payment in state '${deal.status}'. Deal must be APPROVED.`,
      );
    }

    // 4. Validate the state transition (APPROVED → COMPLETED)
    const targetStatus = validateTransition(
      deal.status,
      'RELEASE_PAYMENT',
      actor,
      { isDealParticipant: { brandId: deal.brandId, creatorId: deal.creatorId } },
    );

    // 5. Persist the state change
    const previousUpdatedAt = deal.updatedAt;
    const completedAt = new Date();
    // State, supported notes and audit history commit or roll back together.
    await dealRepository.updateStatus(
      dealId,
      targetStatus,
      previousUpdatedAt,
      actor.id,
      actor.role,
      { expectedStatus: deal.status, auditLogs: [{
      actorId: actor.id,
      dealId,
      action: 'PAYMENT.RELEASED',
      resourceType: 'Deal',
      resourceId: dealId,
      metadata: {
        fromStatus: deal.status,
        toStatus: targetStatus,
        action: 'RELEASE_PAYMENT',
      },
      }] },
    );

    return {
      dealId,
      status: targetStatus,
      completedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — authorization
  // ---------------------------------------------------------------------------

  private verifySubmissionAuthorization(
    deal: DealWithVersions,
    actor: SubmissionActor,
  ): void {
    // ADMIN can submit on any deal
    if (actor.role === 'ADMIN') return;

    // Only the creator can submit deliverables
    if (actor.role === 'CREATOR') {
      if (deal.creatorId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the assigned creator can submit deliverables for this deal',
      );
    }

    throw new UnauthorizedAccessError(
      'Only the assigned creator can submit deliverables for this deal',
    );
  }

  private verifyRevisionAuthorization(
    deal: DealWithVersions,
    actor: SubmissionActor,
  ): void {
    // ADMIN can request revision on any deal
    if (actor.role === 'ADMIN') return;

    // Only the brand can request revision
    if (actor.role === 'BRAND') {
      if (deal.brandId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the deal brand can request revisions',
      );
    }

    throw new UnauthorizedAccessError(
      'Only the deal brand can request revisions',
    );
  }

  private verifyApprovalAuthorization(
    deal: DealWithVersions,
    actor: SubmissionActor,
  ): void {
    // ADMIN can approve any deal
    if (actor.role === 'ADMIN') return;

    // Only the brand can approve
    if (actor.role === 'BRAND') {
      if (deal.brandId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the deal brand can approve deliverables',
      );
    }

    throw new UnauthorizedAccessError(
      'Only the deal brand can approve deliverables',
    );
  }

  private verifyCompletionAuthorization(
    deal: DealWithVersions,
    actor: SubmissionActor,
  ): void {
    // ADMIN can complete any deal
    if (actor.role === 'ADMIN') return;

    // Only the brand can release payment
    if (actor.role === 'BRAND') {
      if (deal.brandId === actor.id) return;
      throw new UnauthorizedAccessError(
        'Only the deal brand can release payment',
      );
    }

    throw new UnauthorizedAccessError(
      'Only the deal brand can release payment',
    );
  }
}

export const submissionService = new SubmissionService();
