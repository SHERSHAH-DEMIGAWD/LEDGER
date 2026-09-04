/**
 * Integration tests for the full deliverable lifecycle.
 *
 * Tests the complete happy path from funded deal through submission,
 * review, approval, and completion — plus the revision loop.
 *
 * Strategy: Mock the service layers to test HTTP routing and response shape.
 * State machine logic is unit-tested separately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock service layers
// ---------------------------------------------------------------------------------------

const mockDealService = {
  createDeal: vi.fn(),
  getDeal: vi.fn(),
  getDealState: vi.fn(),
  listDeals: vi.fn(),
  transitionDeal: vi.fn(),
  inviteCreator: vi.fn(),
  getDealHistory: vi.fn(),
};

const mockSubmissionService = {
  submitDeliverable: vi.fn(),
  requestRevision: vi.fn(),
  approveDeliverable: vi.fn(),
  releasePayment: vi.fn(),
};

const mockPaymentService = {
  fundDeal: vi.fn(),
  refundDeal: vi.fn(),
  getPaymentStatus: vi.fn(),
};

vi.mock('../../src/services/DealService.js', () => mockDealService);
vi.mock('../../src/services/SubmissionService.js', () => ({
  submissionService: mockSubmissionService,
}));
vi.mock('../../src/services/PaymentService.js', () => ({
  paymentService: mockPaymentService,
}));

// Now safe to import
const { default: dealRouter } = await import('../../src/routes/deal.routes.js');
const { default: submissionRouter } = await import('../../src/routes/submission.routes.js');
const { default: paymentRouter } = await import('../../src/routes/payment.routes.js');
const { errorHandler, notFoundHandler } = await import(
  '../../src/middleware/errorHandler.js'
);

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { DealAction } from '../../src/domain/state-machine/DealStateMachine.js';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';

// ---------------------------------------------------------------------------------------
// Test app builder — combines all deal-related routes
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', dealRouter);
  app.use('/deals', paymentRouter);
  app.use('/deals', submissionRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

// ---------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------

// Use valid UUIDs so route validation (creatorId UUID check) passes.
const BRAND_ID = '550e8400-e29b-41d4-a716-446655440001';
const CREATOR_ID = '550e8400-e29b-41d4-a716-446655440002';

const BRAND_TOKEN = authHeader(BRAND_ID, 'brand@test.com', 'BRAND');
const CREATOR_TOKEN = authHeader(CREATOR_ID, 'creator@test.com', 'CREATOR');

function authHeader(userId: string, email: string, role: string): string {
  return `Bearer ${makeToken({ userId, email, role })}`;
}

const VALID_TERMS = {
  terms: {
    title: 'Test Deal',
    description: 'A test deal',
    deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
    paymentAmount: 50000,
    currency: 'USD',
  },
};

function makeDeal(overrides: Partial<DealWithVersions> = {}): DealWithVersions {
  return {
    id: 'deal-1',
    brandId: BRAND_ID,
    creatorId: CREATOR_ID,
    status: 'DRAFT',
    contractId: null,
    fundingStatus: 'NOT_FUNDED',
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'v1',
        versionNumber: 1,
        terms: {
          title: 'Test Deal',
          description: 'Test',
          deliverables: [{ title: 'D1', description: 'D' }],
          paymentAmount: 50000,
          currency: 'USD',
        },
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------
// Tests — Complete Happy Path
// ---------------------------------------------------------------------------------------

describe('Submission Lifecycle — Complete Happy Path', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('full lifecycle: create → invite → accept → fund → start → submit → approve → complete', async () => {
    // 1. Create deal
    mockDealService.createDeal.mockResolvedValue(makeDeal({ status: 'DRAFT' }));
    const r1 = await request(app)
      .post('/deals')
      .set('Authorization', BRAND_TOKEN)
      .send(VALID_TERMS);
    expect(r1.status).toBe(201);
    expect(r1.body.data.deal.status).toBe('DRAFT');

    // 2. Invite creator
    mockDealService.inviteCreator.mockResolvedValue(
      makeDeal({ status: 'PENDING_ACCEPTANCE', creatorId: CREATOR_ID }),
    );
    const r2 = await request(app)
      .post('/deals/deal-1/invite')
      .set('Authorization', BRAND_TOKEN)
      .send({ creatorId: CREATOR_ID });
    expect(r2.status).toBe(200);
    expect(r2.body.data.deal.status).toBe('PENDING_ACCEPTANCE');

    // 3. Accept (by creator)
    mockDealService.transitionDeal.mockResolvedValue(
      makeDeal({ status: 'ACCEPTED' }),
    );
    const r3 = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', CREATOR_TOKEN)
      .send({ action: 'ACCEPT' });
    expect(r3.status).toBe(200);
    expect(r3.body.data.deal.status).toBe('ACCEPTED');

    // 4. Fund (by brand)
    mockPaymentService.fundDeal.mockResolvedValue({
      dealId: 'deal-1',
      paymentId: 'payment-1',
      fundingStatus: 'FUNDED',
    });
    const r4 = await request(app)
      .post('/deals/deal-1/fund')
      .set('Authorization', BRAND_TOKEN)
      .send({});
    expect(r4.status).toBe(201);
    expect(r4.body.data.fundingStatus).toBe('FUNDED');

    // 5. Start work (by creator)
    mockDealService.transitionDeal.mockResolvedValue(
      makeDeal({ status: 'IN_PROGRESS' }),
    );
    const r5 = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', CREATOR_TOKEN)
      .send({ action: 'START' });
    expect(r5.status).toBe(200);
    expect(r5.body.data.deal.status).toBe('IN_PROGRESS');

    // 6. Creator submits deliverables
    mockSubmissionService.submitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    const r6 = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', CREATOR_TOKEN)
      .send({ note: 'Final reel submitted for review' });
    expect(r6.status).toBe(200);
    expect(r6.body.data.status).toBe('SUBMITTED');

    // 7. Brand approves
    mockSubmissionService.approveDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    const r7 = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', BRAND_TOKEN)
      .send({});
    expect(r7.status).toBe(200);
    expect(r7.body.data.status).toBe('APPROVED');

    // 8. Brand releases payment / completes
    mockSubmissionService.releasePayment.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    const r8 = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', BRAND_TOKEN)
      .send({});
    expect(r8.status).toBe(200);
    expect(r8.body.data.status).toBe('COMPLETED');
  });

  it('submit with optional note', async () => {
    mockSubmissionService.submitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', CREATOR_TOKEN)
      .send({ note: 'Instagram reel complete!' });

    expect(res.status).toBe(200);
    expect(mockSubmissionService.submitDeliverable).toHaveBeenCalledWith(
      'deal-1',
      'Instagram reel complete!',
      expect.objectContaining({ id: CREATOR_ID, role: 'CREATOR' }),
    );
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Revision Loop
// ---------------------------------------------------------------------------------------

describe('Submission Lifecycle — Revision Loop', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('revision loop: fund → start → submit → request revision → resubmit (RESUBMIT) → approve → complete', async () => {
    // Setup: fund and start
    mockPaymentService.fundDeal.mockResolvedValue({
      dealId: 'deal-1',
      paymentId: 'payment-1',
      fundingStatus: 'FUNDED',
    });
    await request(app).post('/deals/deal-1/fund').set('Authorization', BRAND_TOKEN).send({});

    mockDealService.transitionDeal.mockResolvedValue(makeDeal({ status: 'IN_PROGRESS' }));
    await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', CREATOR_TOKEN)
      .send({ action: 'START' });

    // 1. Creator submits first version
    mockSubmissionService.submitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    const r1 = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', CREATOR_TOKEN)
      .send({ note: 'First version' });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('SUBMITTED');

    // 2. Brand requests revision → deal moves to REVISION_REQUESTED
    mockSubmissionService.requestRevision.mockResolvedValue({
      dealId: 'deal-1',
      status: 'REVISION_REQUESTED',
      revisionRequestedAt: new Date(),
    });
    const r2 = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', BRAND_TOKEN)
      .send({ note: 'Please make the opening hook more engaging' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('REVISION_REQUESTED');

    // 3. Creator resubmits revised version via RESUBMIT (state machine action)
    mockDealService.transitionDeal.mockResolvedValue(makeDeal({ status: 'SUBMITTED' }));
    const r3 = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', CREATOR_TOKEN)
      .send({ action: 'RESUBMIT' });
    expect(r3.status).toBe(200);
    expect(r3.body.data.deal.status).toBe('SUBMITTED');

    // 4. Brand approves revised version
    mockSubmissionService.approveDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    const r4 = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', BRAND_TOKEN)
      .send({});
    expect(r4.status).toBe(200);
    expect(r4.body.data.status).toBe('APPROVED');

    // 5. Brand completes
    mockSubmissionService.releasePayment.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    const r5 = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', BRAND_TOKEN)
      .send({});
    expect(r5.status).toBe(200);
    expect(r5.body.data.status).toBe('COMPLETED');
  });

  it('revision request requires a note', async () => {
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', BRAND_TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Authorization
// ---------------------------------------------------------------------------------------

describe('Submission Lifecycle — Authorization', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('brand cannot submit deliverables', async () => {
    mockSubmissionService.submitDeliverable.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).UnauthorizedAccessError(
        'Only the assigned creator can submit deliverables',
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', BRAND_TOKEN)
      .send({ note: 'Brand trying to submit' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('creator cannot approve deliverables', async () => {
    mockSubmissionService.approveDeliverable.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).UnauthorizedAccessError(
        'Only the deal brand can approve deliverables',
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', CREATOR_TOKEN)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('creator cannot request revision', async () => {
    mockSubmissionService.requestRevision.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).UnauthorizedAccessError(
        'Only the deal brand can request revisions',
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', CREATOR_TOKEN)
      .send({ note: 'Creator trying to request revision' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('creator cannot release payment', async () => {
    mockSubmissionService.releasePayment.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).UnauthorizedAccessError(
        'Only the deal brand can release payment',
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', CREATOR_TOKEN)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('unauthorized user cannot submit', async () => {
    const strangerToken = authHeader('stranger-1', 'stranger@test.com', 'BRAND');
    mockSubmissionService.submitDeliverable.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).UnauthorizedAccessError(
        'Only deal participants may perform this action',
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', strangerToken)
      .send({ note: 'Stranger trying to submit' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Invalid State Transitions
// ---------------------------------------------------------------------------------------

describe('Submission Lifecycle — Invalid State Transitions', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('cannot submit before IN_PROGRESS', async () => {
    mockSubmissionService.submitDeliverable.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).InvalidStateError(
        "Cannot submit deliverables in state 'FUNDED'. Deal must be IN_PROGRESS.",
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', CREATOR_TOKEN)
      .send({ note: 'Early submission' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('cannot approve before SUBMITTED', async () => {
    mockSubmissionService.approveDeliverable.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).InvalidStateError(
        "Cannot approve deliverables in state 'IN_PROGRESS'. Deal must be SUBMITTED.",
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', BRAND_TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('cannot request revision before SUBMITTED', async () => {
    mockSubmissionService.requestRevision.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).InvalidStateError(
        "Cannot request revision in state 'IN_PROGRESS'. Deal must be SUBMITTED.",
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', BRAND_TOKEN)
      .send({ note: 'Early revision' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('cannot complete before APPROVED', async () => {
    mockSubmissionService.releasePayment.mockRejectedValue(
      new (await import('../../src/domain/errors/index.js')).InvalidStateError(
        "Cannot release payment in state 'SUBMITTED'. Deal must be APPROVED.",
      ),
    );
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', BRAND_TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — State endpoint reflects correct available actions
// ---------------------------------------------------------------------------------------

describe('Submission Lifecycle — State endpoint reflects correct available actions', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns available actions for creator in IN_PROGRESS', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'IN_PROGRESS',
      isTerminal: false,
      availableActions: ['START', 'SUBMIT_DELIVERABLE'] as DealAction[],
      brandId: 'brand-1',
      creatorId: 'creator-1',
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set('Authorization', CREATOR_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.state.status).toBe('IN_PROGRESS');
    expect(res.body.data.state.availableActions).toContain('SUBMIT_DELIVERABLE');
    expect(res.body.data.state.availableActions).not.toContain('APPROVE');
  });

  it('returns available actions for brand in SUBMITTED', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      isTerminal: false,
      availableActions: ['APPROVE', 'REQUEST_REVISION'] as DealAction[],
      brandId: 'brand-1',
      creatorId: 'creator-1',
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set('Authorization', BRAND_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.state.status).toBe('SUBMITTED');
    expect(res.body.data.state.availableActions).toContain('APPROVE');
    expect(res.body.data.state.availableActions).toContain('REQUEST_REVISION');
    expect(res.body.data.state.availableActions).not.toContain('SUBMIT_DELIVERABLE');
  });

  it('returns available actions for brand in APPROVED', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      isTerminal: false,
      availableActions: ['RELEASE_PAYMENT'] as DealAction[],
      brandId: 'brand-1',
      creatorId: 'creator-1',
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set('Authorization', BRAND_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.state.status).toBe('APPROVED');
    expect(res.body.data.state.availableActions).toContain('RELEASE_PAYMENT');
  });

  it('COMPLETED is terminal', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      isTerminal: true,
      availableActions: [],
      brandId: 'brand-1',
      creatorId: 'creator-1',
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set('Authorization', BRAND_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.state.isTerminal).toBe(true);
    expect(res.body.data.state.availableActions).toHaveLength(0);
  });
});
