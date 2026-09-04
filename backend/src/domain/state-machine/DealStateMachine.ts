// Deal State Machine — single source of truth for valid state transitions.
// This is intentionally explicit and not "smart" so that adding states
// requires code changes and is therefore auditable.

import { InvalidStateError, UnauthorizedAccessError } from '../errors/index.js';
import type { Role } from '../../types.js';

export type DealStatus =
  | 'DRAFT'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'FUNDED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type FundingStatus =
  | 'NOT_FUNDED'
  | 'FUNDED'
  | 'REFUNDED';

export type DealAction =
  | 'SUBMIT_FOR_ACCEPTANCE'   // DRAFT -> PENDING_ACCEPTANCE (Brand)
  | 'ACCEPT'                   // PENDING_ACCEPTANCE -> ACCEPTED (Creator)
  | 'DECLINE'                  // PENDING_ACCEPTANCE -> DECLINED (Creator, terminal)
  | 'FUND'                     // ACCEPTED -> FUNDED (Brand)
  | 'START'                    // FUNDED -> IN_PROGRESS (System/Brand)
  | 'SUBMIT_DELIVERABLE'       // IN_PROGRESS -> SUBMITTED (Creator)
  | 'APPROVE'                  // SUBMITTED -> APPROVED (Brand)
  | 'REQUEST_REVISION'         // SUBMITTED -> REVISION_REQUESTED (Brand)
  | 'RESUBMIT'                 // REVISION_REQUESTED -> SUBMITTED (Creator)
  | 'RAISE_DISPUTE'            // SUBMITTED -> DISPUTED (Brand)
  | 'RESOLVE'                  // DISPUTED -> RESOLVED (HRT/Admin)
  | 'ACCEPT_RESOLUTION'        // RESOLVED -> APPROVED (System/Brand)
  | 'REQUEST_REWORK'           // RESOLVED -> IN_PROGRESS (Creator)
  | 'RELEASE_PAYMENT'          // APPROVED -> COMPLETED (System, terminal) or RESOLVED -> COMPLETED (Brand)
  | 'CANCEL'                   // DRAFT or PENDING_ACCEPTANCE -> CANCELLED (Brand, terminal);

/**
 * Term-refinement actions. These DO NOT change the deal status.
 * They operate on DealTerms (DealVersion) lifecycle: proposing, accepting, or
 * rejecting a term change. They are gated through `validateTermRefinement()`
 * in the same way state transitions are gated through `validateTransition()`.
 *
 * These are NOT DealAction because they do not produce a state transition.
 */
export type TermRefinementAction =
  | 'PROPOSE_TERMS'
  | 'ACCEPT_PROPOSAL'
  | 'REJECT_PROPOSAL';

export interface DealTransition {
  action: DealAction;
  from: DealStatus;
  to: DealStatus;
  allowedRoles: Role[];
  description: string;
}

// Explicit, fully enumerated transition table. Adding a transition here is the
// ONLY way to enable a new state change; the state machine never derives a
// transition from heuristic rules.
export const DEAL_TRANSITIONS: readonly DealTransition[] = [
  {
    action: 'SUBMIT_FOR_ACCEPTANCE',
    from: 'DRAFT',
    to: 'PENDING_ACCEPTANCE',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand finalizes deal terms and sends invitation to creator',
  },
  {
    action: 'ACCEPT',
    from: 'PENDING_ACCEPTANCE',
    to: 'ACCEPTED',
    allowedRoles: ['CREATOR'],
    description: 'Creator accepts the deal invitation',
  },
  {
    action: 'DECLINE',
    from: 'PENDING_ACCEPTANCE',
    to: 'DECLINED',
    allowedRoles: ['CREATOR'],
    description: 'Creator declines the deal invitation (terminal)',
  },
  {
    action: 'CANCEL',
    from: 'DRAFT',
    to: 'CANCELLED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand cancels a draft deal (terminal)',
  },
  {
    action: 'CANCEL',
    from: 'PENDING_ACCEPTANCE',
    to: 'CANCELLED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand cancels a pending deal (terminal)',
  },
  {
    action: 'FUND',
    from: 'ACCEPTED',
    to: 'FUNDED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand funds the deal',
  },
  {
    action: 'START',
    from: 'FUNDED',
    to: 'IN_PROGRESS',
    allowedRoles: ['BRAND', 'CREATOR', 'ADMIN'],
    description: 'Deal enters active work phase',
  },
  {
    action: 'SUBMIT_DELIVERABLE',
    from: 'IN_PROGRESS',
    to: 'SUBMITTED',
    allowedRoles: ['CREATOR'],
    description: 'Creator submits deliverable for review',
  },
  {
    action: 'APPROVE',
    from: 'SUBMITTED',
    to: 'APPROVED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand approves the submitted deliverable',
  },
  {
    action: 'REQUEST_REVISION',
    from: 'SUBMITTED',
    to: 'REVISION_REQUESTED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand requests revision to the submitted deliverable',
  },
  {
    action: 'RESUBMIT',
    from: 'REVISION_REQUESTED',
    to: 'SUBMITTED',
    allowedRoles: ['CREATOR', 'ADMIN'],
    description: 'Creator resubmits revised deliverable after revision request',
  },
  {
    action: 'RAISE_DISPUTE',
    from: 'SUBMITTED',
    to: 'DISPUTED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand raises a dispute on the submitted deliverable',
  },
  {
    action: 'RESOLVE',
    from: 'DISPUTED',
    to: 'RESOLVED',
    allowedRoles: ['HRT', 'ADMIN'],
    description: 'HRT provides dispute resolution recommendation',
  },
  {
    action: 'ACCEPT_RESOLUTION',
    from: 'RESOLVED',
    to: 'APPROVED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Brand accepts the dispute resolution',
  },
  {
    action: 'REQUEST_REWORK',
    from: 'RESOLVED',
    to: 'IN_PROGRESS',
    allowedRoles: ['CREATOR', 'BRAND', 'ADMIN'],
    description: 'Re-work is required after dispute resolution',
  },
  {
    action: 'RELEASE_PAYMENT',
    from: 'APPROVED',
    to: 'COMPLETED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Payment is released and the deal is completed (terminal)',
  },
  {
    action: 'RELEASE_PAYMENT',
    from: 'RESOLVED',
    to: 'COMPLETED',
    allowedRoles: ['BRAND', 'ADMIN'],
    description: 'Payment is released after dispute resolution (terminal)',
  },
] as const;

const TERMINAL_STATES: ReadonlySet<DealStatus> = new Set<DealStatus>([
  'DECLINED',
  'COMPLETED',
  'CANCELLED',
]);

export function isTerminal(status: DealStatus): boolean {
  return TERMINAL_STATES.has(status);
}

export function canTransition(from: DealStatus, action: DealAction): DealTransition | null {
  return DEAL_TRANSITIONS.find((t) => t.from === from && t.action === action) ?? null;
}

export function listAvailableActions(
  from: DealStatus,
  actorRole: Role,
): DealTransition[] {
  return DEAL_TRANSITIONS.filter(
    (t) => t.from === from && t.allowedRoles.includes(actorRole),
  );
}

export interface TransitionActor {
  id: string;
  role: Role;
}

/**
 * Validate that an actor is permitted to perform an action on a deal in a
 * given state. This is the canonical authorization gate for state
 * transitions. It must be called inside a transaction that has already
 * loaded the current Deal row (so the state we are reasoning about is the
 * authoritative server-side state, not a client-supplied value).
 *
 * Returns the resulting target status on success.
 *
 * Throws:
 *  - InvalidStateError if the action is not defined from the current state.
 *  - UnauthorizedAccessError if the actor's role cannot perform the action.
 */
export function validateTransition(
  currentStatus: DealStatus,
  action: DealAction,
  actor: TransitionActor,
  options: { isDealParticipant?: { brandId: string; creatorId: string | null } } = {},
): DealStatus {
  // Explicit terminal-state guard (defense-in-depth). The transition table
  // below has no entries from terminal states, so canTransition would already
  // reject these — but this makes the invariant explicit and fail-safe if a
  // transition is ever accidentally added from a terminal state.
  if (isTerminal(currentStatus)) {
    throw new InvalidStateError(
      `Cannot perform action '${action}' from terminal state '${currentStatus}'`,
    );
  }

  const transition = canTransition(currentStatus, action);
  if (!transition) {
    throw new InvalidStateError(
      `Cannot perform action '${action}' from state '${currentStatus}'`,
    );
  }

  if (!transition.allowedRoles.includes(actor.role)) {
    throw new UnauthorizedAccessError(
      `Role '${actor.role}' is not permitted to perform '${action}'`,
    );
  }

  // Additional participant-level guard: an actor in the allowed roles must
  // also be a participant of the deal. ADMIN is a system role and may act
  // on any deal; HRT may act on disputes regardless of participation.
  if (
    actor.role !== 'ADMIN' &&
    actor.role !== 'HRT' &&
    options.isDealParticipant !== undefined
  ) {
    const isParticipant =
      actor.id === options.isDealParticipant.brandId ||
      (options.isDealParticipant.creatorId !== null &&
        actor.id === options.isDealParticipant.creatorId);
    if (!isParticipant) {
      throw new UnauthorizedAccessError(
        'Only deal participants may perform this action',
      );
    }
  }

  return transition.to;
}

// =============================================================================
// Term-Refinement Authorization
// =============================================================================

/**
 * The lifecycle states in which term refinement is permitted.
 *
 * Why these states only:
 *  - DRAFT          : Brand owns terms; no creator is bound yet, so any "refinement"
 *                     is just an edit, not a counterparty proposal.
 *  - PENDING_ACCEPTANCE : Creator hasn't accepted yet — they should accept or decline
 *                     the existing invitation, not negotiate new terms.
 *  - ACCEPTED       : Both parties are bound to terms. Refinement requires counterparty approval.
 *  - FUNDED         : Money is committed against the current terms. New terms affect money.
 *                     Refinement still requires counterparty approval.
 *  - IN_PROGRESS    : Active delivery against terms. Any change must be mutual.
 *  - SUBMITTED+     : Submission locks the deliverables (not the terms), but the deal
 *                     is in review/closure — opening term refinement here invites
 *                     game-playing on payment/dispute boundaries. Term refinement
 *                     is not permitted.
 *
 * State machine is the single source of truth: changes here require code edits
 * and are therefore auditable.
 */
export const TERM_REFINEMENT_ALLOWED_STATES: ReadonlySet<DealStatus> = new Set<DealStatus>([
  'ACCEPTED',
  'FUNDED',
  'IN_PROGRESS',
]);

/**
 * Role that may perform each term-refinement action.
 *
 * - PROPOSE_TERMS    : Only BRAND (the proposer) — counterparty must agree.
 *                      ADMIN is intentionally NOT allowed here: term refinement is
 *                      a commercial action between the two deal parties. ADMIN
 *                      has elevated system access but does not unilaterally
 *                      modify business terms. This preserves existing admin
 *                      behavior (consistent with existing architecture).
 * - ACCEPT_PROPOSAL  : Only CREATOR (the counterparty) — they decide whether
 *                      the new terms are acceptable.
 * - REJECT_PROPOSAL  : Only CREATOR (the counterparty).
 */
export interface TermRefinementRule {
  action: TermRefinementAction;
  allowedRoles: Role[];
}

export const TERM_REFINEMENT_RULES: readonly TermRefinementRule[] = [
  { action: 'PROPOSE_TERMS', allowedRoles: ['BRAND'] },
  { action: 'ACCEPT_PROPOSAL', allowedRoles: ['CREATOR'] },
  { action: 'REJECT_PROPOSAL', allowedRoles: ['CREATOR'] },
];

/**
 * Validate that an actor is permitted to perform a term-refinement action on
 * a deal in a given lifecycle state.
 *
 * This is the parallel of `validateTransition()` for term refinement. It uses
 * the same error conventions (InvalidStateError for state, UnauthorizedAccessError
 * for role/participant) so callers and tests can rely on consistent semantics.
 *
 * Lifecycle rule:
 *  - deal status must be in TERM_REFINEMENT_ALLOWED_STATES (ACCEPTED, FUNDED, IN_PROGRESS).
 *  - deal must have an assigned creator (no terms to negotiate before invite).
 *
 * Role rule:
 *  - PROPOSE_TERMS  → BRAND only
 *  - ACCEPT_PROPOSAL → CREATOR only
 *  - REJECT_PROPOSAL → CREATOR only
 *
 * Participant rule:
 *  - Actor must be the brand (for PROPOSE) or the creator (for ACCEPT/REJECT).
 *  - ADMIN/HRT are not deal participants and cannot refine terms.
 */
export function validateTermRefinement(
  currentStatus: DealStatus,
  action: TermRefinementAction,
  actor: TransitionActor,
  options: { isDealParticipant?: { brandId: string; creatorId: string | null } } = {},
): void {
  // Lifecycle guard
  if (!TERM_REFINEMENT_ALLOWED_STATES.has(currentStatus)) {
    throw new InvalidStateError(
      `Cannot ${action === 'PROPOSE_TERMS' ? 'propose' : action === 'ACCEPT_PROPOSAL' ? 'accept' : 'reject'} terms in state '${currentStatus}'. Allowed states: ${Array.from(TERM_REFINEMENT_ALLOWED_STATES).join(', ')}.`,
    );
  }

  // Creator must be assigned before any term refinement can happen
  if (options.isDealParticipant && options.isDealParticipant.creatorId === null) {
    throw new InvalidStateError(
      'Cannot refine terms: deal has no assigned creator',
    );
  }

  // Role rule
  const rule = TERM_REFINEMENT_RULES.find((r) => r.action === action);
  if (!rule) {
    throw new InvalidStateError(`Unknown term-refinement action '${action}'`);
  }
  if (!rule.allowedRoles.includes(actor.role)) {
    throw new UnauthorizedAccessError(
      `Role '${actor.role}' is not permitted to perform '${action}'`,
    );
  }

  // Participant rule (admin and HRT are NOT deal participants)
  if (actor.role !== 'ADMIN' && actor.role !== 'HRT' && options.isDealParticipant) {
    if (action === 'PROPOSE_TERMS') {
      if (actor.id !== options.isDealParticipant.brandId) {
        throw new UnauthorizedAccessError(
          'Only the deal brand may propose term changes',
        );
      }
    } else {
      // ACCEPT_PROPOSAL / REJECT_PROPOSAL
      if (actor.id !== options.isDealParticipant.creatorId) {
        throw new UnauthorizedAccessError(
          'Only the deal creator may accept or reject proposed terms',
        );
      }
    }
  }

  // ADMIN/HRT are not allowed for any term-refinement action (even though
  // they pass the lifecycle and role-rule checks above for some states).
  // Term refinement is a commercial action reserved for deal participants.
  if (actor.role === 'ADMIN' || actor.role === 'HRT') {
    throw new UnauthorizedAccessError(
      'Term refinement is a commercial action reserved for deal participants',
    );
  }
}
