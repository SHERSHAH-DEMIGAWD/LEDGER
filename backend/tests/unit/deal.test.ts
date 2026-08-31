import { describe, it, expect } from 'vitest';
import {
  canTransition,
  listAvailableActions,
  validateTransition,
  isTerminal,
  DEAL_TRANSITIONS,
  type DealStatus,
  type DealAction,
  type TransitionActor,
} from '../../src/domain/state-machine/DealStateMachine.js';
import {
  validateDealTerms,
  createDealTerms,
  type DealTerms,
} from '../../src/domain/value-objects/DealTerms.js';
import {
  InvalidStateError,
  UnauthorizedAccessError,
  DealTermsValidationError,
} from '../../src/domain/errors/index.js';

// =============================================================================
// 1. Deal State Machine — Valid Transitions
// =============================================================================

describe('DealStateMachine — valid transitions', () => {
  const testCases: Array<{
    action: DealAction;
    from: DealStatus;
    to: DealStatus;
  }> = [
    { action: 'SUBMIT_FOR_ACCEPTANCE', from: 'DRAFT', to: 'PENDING_ACCEPTANCE' },
    { action: 'ACCEPT', from: 'PENDING_ACCEPTANCE', to: 'ACCEPTED' },
    { action: 'DECLINE', from: 'PENDING_ACCEPTANCE', to: 'DECLINED' },
    { action: 'CANCEL', from: 'DRAFT', to: 'CANCELLED' },
    { action: 'CANCEL', from: 'PENDING_ACCEPTANCE', to: 'CANCELLED' },
    { action: 'FUND', from: 'ACCEPTED', to: 'FUNDED' },
    { action: 'START', from: 'FUNDED', to: 'IN_PROGRESS' },
    { action: 'SUBMIT_DELIVERABLE', from: 'IN_PROGRESS', to: 'SUBMITTED' },
    { action: 'APPROVE', from: 'SUBMITTED', to: 'APPROVED' },
    { action: 'REQUEST_REVISION', from: 'SUBMITTED', to: 'REVISION_REQUESTED' },
    { action: 'RESUBMIT', from: 'REVISION_REQUESTED', to: 'SUBMITTED' },
    { action: 'RAISE_DISPUTE', from: 'SUBMITTED', to: 'DISPUTED' },
    { action: 'RESOLVE', from: 'DISPUTED', to: 'RESOLVED' },
    { action: 'ACCEPT_RESOLUTION', from: 'RESOLVED', to: 'APPROVED' },
    { action: 'REQUEST_REWORK', from: 'RESOLVED', to: 'IN_PROGRESS' },
    { action: 'RELEASE_PAYMENT', from: 'APPROVED', to: 'COMPLETED' },
    { action: 'RELEASE_PAYMENT', from: 'RESOLVED', to: 'COMPLETED' },
  ];

  testCases.forEach(({ action, from, to }) => {
    it(`should allow '${action}' from '${from}' → '${to}'`, () => {
      const result = canTransition(from, action);
      expect(result).not.toBeNull();
      expect(result!.to).toBe(to);
    });
  });
});

// =============================================================================
// 2. Deal State Machine — Invalid Transitions (from wrong state)
// =============================================================================

describe('DealStateMachine — invalid transitions (wrong state)', () => {
  const invalidCases: Array<{ action: DealAction; from: DealStatus }> = [
    { action: 'ACCEPT', from: 'DRAFT' },
    { action: 'FUND', from: 'DRAFT' },
    { action: 'SUBMIT_DELIVERABLE', from: 'DRAFT' },
    { action: 'APPROVE', from: 'DRAFT' },
    { action: 'ACCEPT', from: 'ACCEPTED' },
    { action: 'FUND', from: 'IN_PROGRESS' },
    { action: 'START', from: 'IN_PROGRESS' },
    { action: 'SUBMIT_DELIVERABLE', from: 'SUBMITTED' },
    { action: 'APPROVE', from: 'APPROVED' },
    { action: 'ACCEPT', from: 'COMPLETED' },
    { action: 'CANCEL', from: 'ACCEPTED' },
    { action: 'CANCEL', from: 'IN_PROGRESS' },
  ];

  invalidCases.forEach(({ action, from }) => {
    it(`should reject '${action}' from '${from}'`, () => {
      const result = canTransition(from, action);
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// 3. Deal State Machine — Role Authorization
// =============================================================================

describe('DealStateMachine — role authorization', () => {
  it('SUBMIT_FOR_ACCEPTANCE allowed for BRAND', () => {
    const actions = listAvailableActions('DRAFT', 'BRAND');
    expect(actions.some((t) => t.action === 'SUBMIT_FOR_ACCEPTANCE')).toBe(true);
  });

  it('SUBMIT_FOR_ACCEPTANCE allowed for ADMIN', () => {
    const actions = listAvailableActions('DRAFT', 'ADMIN');
    expect(actions.some((t) => t.action === 'SUBMIT_FOR_ACCEPTANCE')).toBe(true);
  });

  it('ACCEPT allowed for CREATOR', () => {
    const actions = listAvailableActions('PENDING_ACCEPTANCE', 'CREATOR');
    expect(actions.some((t) => t.action === 'ACCEPT')).toBe(true);
  });

  it('ACCEPT not allowed for BRAND', () => {
    const actions = listAvailableActions('PENDING_ACCEPTANCE', 'BRAND');
    expect(actions.some((t) => t.action === 'ACCEPT')).toBe(false);
  });

  it('FUND allowed for BRAND', () => {
    const actions = listAvailableActions('ACCEPTED', 'BRAND');
    expect(actions.some((t) => t.action === 'FUND')).toBe(true);
  });

  it('RESOLVE allowed for HRT', () => {
    const actions = listAvailableActions('DISPUTED', 'HRT');
    expect(actions.some((t) => t.action === 'RESOLVE')).toBe(true);
  });

  it('RESOLVE allowed for ADMIN', () => {
    const actions = listAvailableActions('DISPUTED', 'ADMIN');
    expect(actions.some((t) => t.action === 'RESOLVE')).toBe(true);
  });

  it('RESOLVE not allowed for BRAND', () => {
    const actions = listAvailableActions('DISPUTED', 'BRAND');
    expect(actions.some((t) => t.action === 'RESOLVE')).toBe(false);
  });

  it('SUBMIT_DELIVERABLE allowed for CREATOR', () => {
    const actions = listAvailableActions('IN_PROGRESS', 'CREATOR');
    expect(actions.some((t) => t.action === 'SUBMIT_DELIVERABLE')).toBe(true);
  });

  it('SUBMIT_DELIVERABLE not allowed for BRAND', () => {
    const actions = listAvailableActions('IN_PROGRESS', 'BRAND');
    expect(actions.some((t) => t.action === 'SUBMIT_DELIVERABLE')).toBe(false);
  });
});

// =============================================================================
// 4. validateTransition — throws on invalid state
// =============================================================================

describe('validateTransition — throws on invalid state', () => {
  const brandActor: TransitionActor = { id: 'brand-1', role: 'BRAND' };

  it('throws InvalidStateError when action is not defined from current state', () => {
    expect(() =>
      validateTransition('DRAFT', 'ACCEPT', brandActor),
    ).toThrow(InvalidStateError);
  });

  it('throws InvalidStateError for terminal states', () => {
    expect(() =>
      validateTransition('COMPLETED', 'FUND', brandActor),
    ).toThrow(InvalidStateError);
    expect(() =>
      validateTransition('DECLINED', 'CANCEL', brandActor),
    ).toThrow(InvalidStateError);
    expect(() =>
      validateTransition('CANCELLED', 'START', brandActor),
    ).toThrow(InvalidStateError);
  });
});

// =============================================================================
// 5. validateTransition — throws on unauthorized role
// =============================================================================

describe('validateTransition — throws on unauthorized role', () => {
  it('throws UnauthorizedAccessError when role cannot perform action', () => {
    const creatorActor: TransitionActor = { id: 'creator-1', role: 'CREATOR' };
    // SUBMIT_FOR_ACCEPTANCE is BRAND/ADMIN only, not CREATOR
    expect(() =>
      validateTransition('DRAFT', 'SUBMIT_FOR_ACCEPTANCE', creatorActor),
    ).toThrow(UnauthorizedAccessError);
  });

  it('throws UnauthorizedAccessError when creator tries to fund', () => {
    const creatorActor: TransitionActor = { id: 'creator-1', role: 'CREATOR' };
    expect(() =>
      validateTransition('ACCEPTED', 'FUND', creatorActor),
    ).toThrow(UnauthorizedAccessError);
  });
});

// =============================================================================
// 6. validateTransition — participant-level guard
// =============================================================================

describe('validateTransition — participant-level guard', () => {
  it('throws UnauthorizedAccessError when non-participant tries to transition', () => {
    const strangerActor: TransitionActor = { id: 'stranger-id', role: 'BRAND' };
    expect(() =>
      validateTransition('DRAFT', 'CANCEL', strangerActor, {
        isDealParticipant: { brandId: 'brand-1', creatorId: null },
      }),
    ).toThrow(UnauthorizedAccessError);
  });

  it('allows BRAND owner to cancel their own DRAFT', () => {
    const brandActor: TransitionActor = { id: 'brand-1', role: 'BRAND' };
    const result = validateTransition('DRAFT', 'CANCEL', brandActor, {
      isDealParticipant: { brandId: 'brand-1', creatorId: null },
    });
    expect(result).toBe('CANCELLED');
  });

  it('allows ADMIN to perform actions on any deal', () => {
    const adminActor: TransitionActor = { id: 'admin-1', role: 'ADMIN' };
    const result = validateTransition('DRAFT', 'CANCEL', adminActor, {
      isDealParticipant: { brandId: 'brand-1', creatorId: null },
    });
    expect(result).toBe('CANCELLED');
  });
});

// =============================================================================
// 7. Terminal States
// =============================================================================

describe('isTerminal', () => {
  it('DECLINED is terminal', () => {
    expect(isTerminal('DECLINED')).toBe(true);
  });

  it('COMPLETED is terminal', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
  });

  it('CANCELLED is terminal', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
  });

  it('DRAFT is not terminal', () => {
    expect(isTerminal('DRAFT')).toBe(false);
  });

  it('PENDING_ACCEPTANCE is not terminal', () => {
    expect(isTerminal('PENDING_ACCEPTANCE')).toBe(false);
  });

  it('APPROVED is not terminal', () => {
    expect(isTerminal('APPROVED')).toBe(false);
  });

  it('DISPUTED is not terminal', () => {
    expect(isTerminal('DISPUTED')).toBe(false);
  });
});

// =============================================================================
// 8. DealTerms — valid terms
// =============================================================================

describe('DealTerms — valid terms', () => {
  const validTerms: DealTerms = {
    title: 'Test Deal',
    description: 'A test deal for unit testing',
    deliverables: [
      {
        title: 'Logo Design',
        description: 'Create a professional logo',
        deadline: '2025-06-01',
      },
    ],
    paymentAmount: 50000, // $500.00 in cents
    currency: 'USD',
    timeline: {
      startDate: '2025-05-01',
      endDate: '2025-06-01',
    },
  };

  it('accepts valid deal terms', () => {
    expect(() => validateDealTerms(validTerms)).not.toThrow();
  });

  it('createDealTerms returns frozen object', () => {
    const terms = createDealTerms(validTerms);
    expect(Object.isFrozen(terms)).toBe(true);
  });

  it('createDealTerms returns copy of input', () => {
    const terms = createDealTerms(validTerms);
    expect(terms).not.toBe(validTerms);
    expect(terms).toEqual(validTerms);
  });

  it('accepts terms without optional timeline', () => {
    const minimal = { ...validTerms, timeline: undefined };
    expect(() => validateDealTerms(minimal)).not.toThrow();
  });

  it('accepts terms with optional deadline on deliverable', () => {
    const noDeadline = {
      ...validTerms,
      deliverables: [{ title: 'T', description: 'D' }],
    };
    expect(() => validateDealTerms(noDeadline)).not.toThrow();
  });
});

// =============================================================================
// 9. DealTerms — invalid terms validation
// =============================================================================

describe('DealTerms — invalid terms validation', () => {
  it('rejects non-object terms', () => {
    expect(() => validateDealTerms(null)).toThrow(DealTermsValidationError);
    expect(() => validateDealTerms('string')).toThrow(DealTermsValidationError);
    expect(() => validateDealTerms(123)).toThrow(DealTermsValidationError);
    expect(() => validateDealTerms(undefined)).toThrow(DealTermsValidationError);
  });

  it('rejects missing title', () => {
    expect(() =>
      validateDealTerms({
        title: '',
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects title exceeding 255 chars', () => {
    expect(() =>
      validateDealTerms({
        title: 'a'.repeat(256),
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects missing description', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: '',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects non-integer payment amount', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 100.5,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects negative payment amount', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: -100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects payment amount exceeding $1,000,000', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 1_000_000_01,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('accepts payment amount exactly $1,000,000', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'T', description: 'D' }],
        paymentAmount: 100_000_00,
        currency: 'USD',
      }),
    ).not.toThrow();
  });

  it('rejects invalid currency format', () => {
    const invalidCurrencies = ['usd', 'US', 'USDD', '123', ''];
    invalidCurrencies.forEach((currency) => {
      expect(() =>
        validateDealTerms({
          title: 'T',
          description: 'desc',
          deliverables: [{ title: 'T', description: 'D' }],
          paymentAmount: 100,
          currency,
        }),
      ).toThrow(DealTermsValidationError);
    });
  });

  it('accepts valid 3-letter uppercase currency codes', () => {
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
    validCurrencies.forEach((currency) => {
      expect(() =>
        validateDealTerms({
          title: 'T',
          description: 'desc',
          deliverables: [{ title: 'T', description: 'D' }],
          paymentAmount: 100,
          currency,
        }),
      ).not.toThrow();
    });
  });

  it('rejects empty deliverables array', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects missing deliverables', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: undefined,
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects deliverable without title', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: '', description: 'D' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects deliverable without description', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'T', description: '' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });

  it('rejects deliverable title exceeding 255 chars', () => {
    expect(() =>
      validateDealTerms({
        title: 'T',
        description: 'desc',
        deliverables: [{ title: 'a'.repeat(256), description: 'D' }],
        paymentAmount: 100,
        currency: 'USD',
      }),
    ).toThrow(DealTermsValidationError);
  });
});

// =============================================================================
// 10. DEAL_TRANSITIONS — Completeness Check
// =============================================================================

describe('DEAL_TRANSITIONS — completeness', () => {
  it('has exactly 17 defined transitions', () => {
    expect(DEAL_TRANSITIONS).toHaveLength(17);
  });

  it('each transition has from, to, action, allowedRoles, and description', () => {
    DEAL_TRANSITIONS.forEach((t) => {
      expect(t).toHaveProperty('from');
      expect(t).toHaveProperty('to');
      expect(t).toHaveProperty('action');
      expect(t).toHaveProperty('allowedRoles');
      expect(t).toHaveProperty('description');
      expect(Array.isArray(t.allowedRoles)).toBe(true);
      expect(t.allowedRoles.length).toBeGreaterThan(0);
    });
  });

  it('terminal states have no outgoing transitions', () => {
    const terminalStates: DealStatus[] = ['DECLINED', 'COMPLETED', 'CANCELLED'];
    terminalStates.forEach((status) => {
      const outgoing = DEAL_TRANSITIONS.filter((t) => t.from === status);
      expect(outgoing).toHaveLength(0);
    });
  });

  it('no duplicate transitions (same from + action)', () => {
    const seen = new Set<string>();
    DEAL_TRANSITIONS.forEach((t) => {
      const key = `${t.from}:${t.action}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });
});
