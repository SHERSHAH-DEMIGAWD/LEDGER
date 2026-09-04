/**
 * tests/unit/term-refinement.test.ts
 *
 * Unit tests for the term-refinement state-machine validation.
 *
 * Covers:
 *  - validateTermRefinement()
 *  - allowed lifecycle states
 *  - role rules
 *  - participant rules
 *  - TERMINAL_REFINEMENT_ALLOWED_STATES (no term refinement from terminal states)
 *  - Existing validateTransition is unaffected
 */

import { describe, it, expect } from 'vitest';
import {
  validateTermRefinement,
  validateTransition,
  TERM_REFINEMENT_ALLOWED_STATES,
  TERM_REFINEMENT_RULES,
  type TransitionActor,
} from '../../src/domain/state-machine/DealStateMachine.js';
import {
  InvalidStateError,
  UnauthorizedAccessError,
} from '../../src/domain/errors/index.js';

const BRAND: TransitionActor = { id: 'brand-1', role: 'BRAND' };
const CREATOR: TransitionActor = { id: 'creator-1', role: 'CREATOR' };
const ADMIN: TransitionActor = { id: 'admin-1', role: 'ADMIN' };
const HRT: TransitionActor = { id: 'hrt-1', role: 'HRT' };
const WRONG_BRAND: TransitionActor = { id: 'brand-2', role: 'BRAND' };
const WRONG_CREATOR: TransitionActor = { id: 'creator-2', role: 'CREATOR' };

const PARTICIPANTS = { brandId: 'brand-1', creatorId: 'creator-1' };

describe('Term Refinement — State Machine', () => {
  describe('TERM_REFINEMENT_ALLOWED_STATES', () => {
    it('contains exactly ACCEPTED, FUNDED, IN_PROGRESS', () => {
      const states = Array.from(TERM_REFINEMENT_ALLOWED_STATES);
      expect(states.sort()).toEqual(['ACCEPTED', 'FUNDED', 'IN_PROGRESS']);
    });

    it('does NOT include DRAFT (no counterparty to negotiate with)', () => {
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('DRAFT')).toBe(false);
    });

    it('does NOT include PENDING_ACCEPTANCE (creator should accept/decline first)', () => {
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('PENDING_ACCEPTANCE')).toBe(false);
    });

    it('does NOT include SUBMITTED, APPROVED, COMPLETED (terminal-ish)', () => {
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('SUBMITTED')).toBe(false);
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('APPROVED')).toBe(false);
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('COMPLETED')).toBe(false);
    });

    it('does NOT include CANCELLED, DECLINED (terminal)', () => {
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('CANCELLED')).toBe(false);
      expect(TERM_REFINEMENT_ALLOWED_STATES.has('DECLINED')).toBe(false);
    });
  });

  describe('TERM_REFINEMENT_RULES', () => {
    it('PROPOSE_TERMS is BRAND only', () => {
      const rule = TERM_REFINEMENT_RULES.find((r) => r.action === 'PROPOSE_TERMS');
      expect(rule?.allowedRoles).toEqual(['BRAND']);
    });

    it('ACCEPT_PROPOSAL is CREATOR only', () => {
      const rule = TERM_REFINEMENT_RULES.find((r) => r.action === 'ACCEPT_PROPOSAL');
      expect(rule?.allowedRoles).toEqual(['CREATOR']);
    });

    it('REJECT_PROPOSAL is CREATOR only', () => {
      const rule = TERM_REFINEMENT_RULES.find((r) => r.action === 'REJECT_PROPOSAL');
      expect(rule?.allowedRoles).toEqual(['CREATOR']);
    });
  });

  describe('PROPOSE_TERMS', () => {
    it('brand in ACCEPTED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('brand in FUNDED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('FUNDED', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('brand in IN_PROGRESS state — succeeds', () => {
      expect(() =>
        validateTermRefinement('IN_PROGRESS', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('brand in DRAFT state — fails (no counterparty)', () => {
      expect(() =>
        validateTermRefinement('DRAFT', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: { brandId: 'brand-1', creatorId: null },
        }),
      ).toThrow(InvalidStateError);
    });

    it('brand in PENDING_ACCEPTANCE state — fails', () => {
      expect(() =>
        validateTermRefinement('PENDING_ACCEPTANCE', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(InvalidStateError);
    });

    it('brand in SUBMITTED state — fails', () => {
      expect(() =>
        validateTermRefinement('SUBMITTED', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(InvalidStateError);
    });

    it('brand in CANCELLED (terminal) — fails', () => {
      expect(() =>
        validateTermRefinement('CANCELLED', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(InvalidStateError);
    });

    it('creator cannot propose', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('admin cannot propose (term refinement is a commercial action)', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', ADMIN, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('HRT cannot propose', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', HRT, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('non-participant brand cannot propose', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', WRONG_BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('deal with no creator — fails', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'PROPOSE_TERMS', BRAND, {
          isDealParticipant: { brandId: 'brand-1', creatorId: null },
        }),
      ).toThrow(InvalidStateError);
    });
  });

  describe('ACCEPT_PROPOSAL', () => {
    it('creator in ACCEPTED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'ACCEPT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in FUNDED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('FUNDED', 'ACCEPT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in IN_PROGRESS state — succeeds', () => {
      expect(() =>
        validateTermRefinement('IN_PROGRESS', 'ACCEPT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in SUBMITTED state — fails', () => {
      expect(() =>
        validateTermRefinement('SUBMITTED', 'ACCEPT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(InvalidStateError);
    });

    it('brand cannot accept', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'ACCEPT_PROPOSAL', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('admin cannot accept', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'ACCEPT_PROPOSAL', ADMIN, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('HRT cannot accept', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'ACCEPT_PROPOSAL', HRT, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('non-participant creator cannot accept', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'ACCEPT_PROPOSAL', WRONG_CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });
  });

  describe('REJECT_PROPOSAL', () => {
    it('creator in ACCEPTED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'REJECT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in FUNDED state — succeeds', () => {
      expect(() =>
        validateTermRefinement('FUNDED', 'REJECT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in IN_PROGRESS state — succeeds', () => {
      expect(() =>
        validateTermRefinement('IN_PROGRESS', 'REJECT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).not.toThrow();
    });

    it('creator in SUBMITTED state — fails', () => {
      expect(() =>
        validateTermRefinement('SUBMITTED', 'REJECT_PROPOSAL', CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(InvalidStateError);
    });

    it('brand cannot reject', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'REJECT_PROPOSAL', BRAND, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('admin cannot reject', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'REJECT_PROPOSAL', ADMIN, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });

    it('non-participant creator cannot reject', () => {
      expect(() =>
        validateTermRefinement('ACCEPTED', 'REJECT_PROPOSAL', WRONG_CREATOR, {
          isDealParticipant: PARTICIPANTS,
        }),
      ).toThrow(UnauthorizedAccessError);
    });
  });

  describe('Existing state machine — unaffected', () => {
    it('validateTransition still works for normal transitions', () => {
      // SUBMIT_FOR_ACCEPTANCE transitions DRAFT -> PENDING_ACCEPTANCE
      const result = validateTransition('DRAFT', 'SUBMIT_FOR_ACCEPTANCE', BRAND, {
        isDealParticipant: { brandId: 'brand-1', creatorId: null },
      });
      expect(result).toBe('PENDING_ACCEPTANCE');
    });

    it('terminal state guard still works', () => {
      expect(() =>
        validateTransition('CANCELLED', 'SUBMIT_FOR_ACCEPTANCE', BRAND, {
          isDealParticipant: { brandId: 'brand-1', creatorId: null },
        }),
      ).toThrow(InvalidStateError);
    });
  });
});
