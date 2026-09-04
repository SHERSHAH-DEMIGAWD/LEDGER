/**
 * Integration tests for Deal routes.
 *
 * These tests verify the HTTP layer: authentication, authorization, request
 * validation, and error response shape. They mock the service layer so they
 * can run without a database.
 *
 * Real service logic (state machine, authorization) is unit-tested in
 * tests/unit/deal.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// IMPORTANT: The config module is evaluated at import time and reads from
// process.env. The .env file already sets JWT_SECRET, but for tests we set
// the env directly. Since config.ts is loaded lazily via the require chain,
// we just rely on .env values being present.
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the service layer before importing the router
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

vi.mock('../../src/services/DealService.js', () => mockDealService);

// Now safe to import the router
const { default: dealRouter } = await import('../../src/routes/deal.routes.js');
const { errorHandler, notFoundHandler, NotFoundError } = await import(
  '../../src/middleware/errorHandler.js'
);

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';
import type { DealAction, DealStatus } from '../../src/domain/state-machine/DealStateMachine.js';
import {
  InvalidStateError,
  UnauthorizedAccessError,
  DealTermsValidationError,
  DealVersionConflictError,
} from '../../src/domain/errors/index.js';

// ---------------------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', dealRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(payload = { userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' }): string {
  return `Bearer ${makeToken(payload)}`;
}

// ---------------------------------------------------------------------------------------
// Sample data factories
// ---------------------------------------------------------------------------------------

const DRAFT_DEAL: DealWithVersions = {
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: null,
  status: 'DRAFT',
  contractId: null,
  fundingStatus: 'NOT_FUNDED',
  paymentRecordId: null,
  latestRevisionNote: null,
  latestRevisionNoteAuthorId: null,
  latestRevisionNoteAt: null,
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [
    {
      id: 'v1',
      versionNumber: 1,
      isPending: false,
      terms: {
        title: 'Test Deal',
        description: 'A test deal',
        deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
        paymentAmount: 50000,
        currency: 'USD',
      },
      createdAt: new Date(),
    },
  ],
};

const PENDING_DEAL: DealWithVersions = {
  ...DRAFT_DEAL,
  id: 'deal-2',
  status: 'PENDING_ACCEPTANCE',
  creatorId: 'creator-1',
};

const VALID_TERMS_BODY = {
  terms: {
    title: 'Test Deal',
    description: 'A test deal',
    deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
    paymentAmount: 50000,
    currency: 'USD',
  },
};

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

describe('Deal Routes — Authentication', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('GET /deals returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/deals');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('GET /deals returns 401 when Authorization header has no Bearer prefix', async () => {
    const res = await request(app)
      .get('/deals')
      .set('Authorization', 'NotBearer sometoken');
    expect(res.status).toBe(401);
  });

  it('GET /deals returns 401 for an invalid/expired token', async () => {
    const res = await request(app)
      .get('/deals')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('GET /deals returns 401 for a token signed with wrong secret', async () => {
    const badToken = jwt.sign(
      { userId: 'brand-1', email: 'b@b.com', role: 'BRAND' },
      'wrong-secret-at-least-32-chars-long',
    );
    const res = await request(app)
      .get('/deals')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('POST /deals returns 401 without auth', async () => {
    const res = await request(app)
      .post('/deals')
      .send(VALID_TERMS_BODY);
    expect(res.status).toBe(401);
  });

  it('POST /deals/:id/transition returns 401 without auth', async () => {
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .send({ action: 'CANCEL' });
    expect(res.status).toBe(401);
  });

  it('GET /deals/:id returns 401 without auth', async () => {
    const res = await request(app).get('/deals/deal-1');
    expect(res.status).toBe(401);
  });

  it('GET /deals/:id/state returns 401 without auth', async () => {
    const res = await request(app).get('/deals/deal-1/state');
    expect(res.status).toBe(401);
  });

  it('GET /deals/:id/history returns 401 without auth', async () => {
    const res = await request(app).get('/deals/deal-1/history');
    expect(res.status).toBe(401);
  });

  it('POST /deals/:id/invite returns 401 without auth', async () => {
    const res = await request(app)
      .post('/deals/deal-1/invite')
      .send({ creatorId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.status).toBe(401);
  });
});

describe('Deal Routes — Validation (createDeal)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('rejects create with missing terms field', async () => {
    mockDealService.createDeal.mockResolvedValue(DRAFT_DEAL);
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rejects create with empty deliverables array', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send({
        terms: {
          title: 'T',
          description: 'D',
          deliverables: [],
          paymentAmount: 50000,
          currency: 'USD',
        },
      });
    expect(res.status).toBe(400);
  });

  it('rejects create with missing paymentAmount', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send({
        terms: {
          title: 'T',
          description: 'D',
          deliverables: [{ title: 'D', description: 'x' }],
          currency: 'USD',
        },
      });
    expect(res.status).toBe(400);
  });

  it('rejects create with invalid currency code', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send({
        terms: {
          title: 'T',
          description: 'D',
          deliverables: [{ title: 'D', description: 'x' }],
          paymentAmount: 50000,
          currency: 'usd', // lowercase
        },
      });
    expect(res.status).toBe(400);
  });

  it('rejects create when service throws DealTermsValidationError', async () => {
    mockDealService.createDeal.mockRejectedValue(
      new DealTermsValidationError('Payment amount cannot be negative'),
    );
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send(VALID_TERMS_BODY);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });
});

describe('Deal Routes — Validation (transitionDeal)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('rejects transition with missing action', async () => {
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rejects transition with unknown action', async () => {
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', authHeader())
      .send({ action: 'UNKNOWN_ACTION' });
    expect(res.status).toBe(400);
  });

  it('accepts transition with valid action', async () => {
    const updated = { ...DRAFT_DEAL, status: 'CANCELLED' as DealStatus };
    mockDealService.transitionDeal.mockResolvedValue(updated);
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', authHeader())
      .send({ action: 'CANCEL' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDealService.transitionDeal).toHaveBeenCalledWith(
      'deal-1',
      'CANCEL',
      expect.objectContaining({ id: 'brand-1', role: 'BRAND' }),
    );
  });
});

describe('Deal Routes — Validation (inviteCreator)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('rejects invite with missing creatorId', async () => {
    const res = await request(app)
      .post('/deals/deal-1/invite')
      .set('Authorization', authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rejects invite with invalid UUID for creatorId', async () => {
    const res = await request(app)
      .post('/deals/deal-1/invite')
      .set('Authorization', authHeader())
      .send({ creatorId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('accepts invite with valid creatorId UUID', async () => {
    mockDealService.inviteCreator.mockResolvedValue(PENDING_DEAL);
    const res = await request(app)
      .post('/deals/deal-1/invite')
      .set('Authorization', authHeader())
      .send({ creatorId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Deal Routes — GET /deals (list)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with deals list for authenticated brand', async () => {
    mockDealService.listDeals.mockResolvedValue([DRAFT_DEAL, PENDING_DEAL]);
    const res = await request(app)
      .get('/deals')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deals).toHaveLength(2);
    expect(mockDealService.listDeals).toHaveBeenCalledWith('brand-1', 'BRAND', {});
  });

  it('returns 200 with empty array when no deals', async () => {
    mockDealService.listDeals.mockResolvedValue([]);
    const res = await request(app)
      .get('/deals')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.deals).toHaveLength(0);
  });

  it('passes status filter to listDeals service', async () => {
    mockDealService.listDeals.mockResolvedValue([DRAFT_DEAL]);
    const res = await request(app)
      .get('/deals?status=FUNDED')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(mockDealService.listDeals).toHaveBeenCalledWith(
      'brand-1',
      'BRAND',
      expect.objectContaining({ status: 'FUNDED' }),
    );
  });

  it('passes multiple comma-separated statuses as array filter', async () => {
    mockDealService.listDeals.mockResolvedValue([]);
    const res = await request(app)
      .get('/deals?status=FUNDED,IN_PROGRESS')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(mockDealService.listDeals).toHaveBeenCalledWith(
      'brand-1',
      'BRAND',
      expect.objectContaining({ status: ['FUNDED', 'IN_PROGRESS'] }),
    );
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await request(app)
      .get('/deals?status=NOT_A_REAL_STATUS')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
    expect(res.body.error.message).toContain('Invalid status');
  });

  it('ignores unknown query parameters', async () => {
    mockDealService.listDeals.mockResolvedValue([]);
    const res = await request(app)
      .get('/deals?page=1&unknown=foo')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
  });
});

describe('Deal Routes — GET /deals/:id', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with deal for valid ID', async () => {
    mockDealService.getDeal.mockResolvedValue(DRAFT_DEAL);
    const res = await request(app)
      .get('/deals/deal-1')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deal.id).toBe('deal-1');
    expect(mockDealService.getDeal).toHaveBeenCalledWith('deal-1', 'brand-1', 'BRAND');
  });

  it('returns 404 when deal not found', async () => {
    mockDealService.getDeal.mockRejectedValue(new NotFoundError('Deal', 'deal-999'));
    const res = await request(app)
      .get('/deals/deal-999')
      .set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RES_001');
  });

  it('returns 403 when user is not a participant', async () => {
    mockDealService.getDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only deal participants can access this resource'),
    );
    const res = await request(app)
      .get('/deals/deal-other-brand')
      .set('Authorization', authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });
});

describe('Deal Routes — GET /deals/:id/state', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with deal state', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'DRAFT',
      isTerminal: false,
      availableActions: ['CANCEL', 'SUBMIT_FOR_ACCEPTANCE'] as DealAction[],
      brandId: 'brand-1',
      creatorId: null,
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.state.status).toBe('DRAFT');
    expect(res.body.data.state.isTerminal).toBe(false);
    expect(res.body.data.state.availableActions).toContain('CANCEL');
  });
});

describe('Deal Routes — GET /deals/:id/history', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with audit history', async () => {
    const history = [
      {
        id: 'log-1',
        action: 'DEAL.CREATED',
        actorId: 'brand-1',
        metadata: { status: 'DRAFT' },
        timestamp: new Date().toISOString(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
      {
        id: 'log-2',
        action: 'DEAL.CREATOR_INVITED',
        actorId: 'brand-1',
        metadata: { creatorId: 'creator-1', fromStatus: 'DRAFT', toStatus: 'PENDING_ACCEPTANCE' },
        timestamp: new Date().toISOString(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ];
    mockDealService.getDealHistory.mockResolvedValue(history);
    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
    expect(res.body.data.history[0].action).toBe('DEAL.CREATED');
    expect(res.body.data.history[1].action).toBe('DEAL.CREATOR_INVITED');
  });
});

describe('Deal Routes — POST /deals', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 201 with created deal', async () => {
    mockDealService.createDeal.mockResolvedValue(DRAFT_DEAL);
    const res = await request(app)
      .post('/deals')
      .set('Authorization', authHeader())
      .send(VALID_TERMS_BODY);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deal.status).toBe('DRAFT');
    expect(mockDealService.createDeal).toHaveBeenCalledWith(
      VALID_TERMS_BODY.terms,
      expect.objectContaining({ id: 'brand-1', role: 'BRAND' }),
    );
  });

  it('extracts user ID and role from JWT, not from request body', async () => {
    mockDealService.createDeal.mockResolvedValue(DRAFT_DEAL);
    await request(app)
      .post('/deals')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-2', email: 'b2@test.com', role: 'BRAND' }),
      )
      .send(VALID_TERMS_BODY);
    expect(mockDealService.createDeal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'brand-2', role: 'BRAND' }),
    );
    expect(mockDealService.createDeal).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'brand-1' }),
    );
  });
});

describe('Deal Routes — POST /deals/:id/invite', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with updated deal when invite succeeds', async () => {
    mockDealService.inviteCreator.mockResolvedValue(PENDING_DEAL);
    const res = await request(app)
      .post('/deals/deal-1/invite')
      .set('Authorization', authHeader())
      .send({ creatorId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDealService.inviteCreator).toHaveBeenCalledWith(
      'deal-1',
      '550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({ id: 'brand-1', role: 'BRAND' }),
    );
  });

  it('returns 400 when service rejects invalid state', async () => {
    mockDealService.inviteCreator.mockRejectedValue(
      new InvalidStateError("Cannot invite creator from state 'ACCEPTED'. Deal must be in DRAFT."),
    );
    const res = await request(app)
      .post('/deals/deal-accepted/invite')
      .set('Authorization', authHeader())
      .send({ creatorId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });
});

describe('Deal Routes — State Machine Enforcement (end-to-end)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 400 for invalid state transition — ACCEPT from DRAFT', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new InvalidStateError("Cannot perform action 'ACCEPT' from state 'DRAFT'"),
    );
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', authHeader())
      .send({ action: 'ACCEPT' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when wrong role attempts a transition', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError("Role 'CREATOR' is not permitted to perform 'CANCEL'"),
    );
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      )
      .send({ action: 'CANCEL' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('returns 403 when non-participant tries to transition', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only deal participants may perform this action'),
    );
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set(
        'Authorization',
        authHeader({ userId: 'stranger-1', email: 's@s.com', role: 'BRAND' }),
      )
      .send({ action: 'CANCEL' });
    expect(res.status).toBe(403);
  });

  it('returns 409 when concurrent modification detected', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new DealVersionConflictError('Deal was modified by another request. Please retry.'),
    );
    const res = await request(app)
      .post('/deals/deal-1/transition')
      .set('Authorization', authHeader())
      .send({ action: 'CANCEL' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RES_002');
  });
});

describe('Deal Routes — Not Found Handler', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 404 for completely wrong path', async () => {
    const res = await request(app).get('/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RES_001');
  });
});

describe('Deal Routes — Authorization — role is extracted from JWT, not request body', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('BRAND can create deals', async () => {
    mockDealService.createDeal.mockResolvedValue(DRAFT_DEAL);
    const res = await request(app)
      .post('/deals')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      )
      .send(VALID_TERMS_BODY);
    expect(res.status).toBe(201);
  });

  it('CREATOR role from JWT is what the service sees, not anything from body', async () => {
    mockDealService.createDeal.mockRejectedValue(
      new InvalidStateError('Only brands can create deals'),
    );
    const res = await request(app)
      .post('/deals')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      )
      .send(VALID_TERMS_BODY);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
    // The service should have been called with role: 'CREATOR' from the JWT
    expect(mockDealService.createDeal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'CREATOR' }),
    );
  });
});

describe('Deal Routes — Full Happy-Path Lifecycle (mocked)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('complete brand lifecycle: create → invite → accept → fund → start', async () => {
    // 1. Create deal
    mockDealService.createDeal.mockResolvedValue(DRAFT_DEAL);
    const r1 = await request(app)
      .post('/deals')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      )
      .send(VALID_TERMS_BODY);
    expect(r1.status).toBe(201);
    expect(r1.body.data.deal.status).toBe('DRAFT');

    // 2. Invite creator
    mockDealService.inviteCreator.mockResolvedValue(PENDING_DEAL);
    const r2 = await request(app)
      .post('/deals/deal-1/invite')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      )
      .send({ creatorId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(r2.status).toBe(200);

    // 3. Accept (by creator)
    const acceptedDeal = { ...PENDING_DEAL, status: 'ACCEPTED' as DealStatus };
    mockDealService.transitionDeal.mockResolvedValue(acceptedDeal);
    const r3 = await request(app)
      .post('/deals/deal-2/transition')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      )
      .send({ action: 'ACCEPT' });
    expect(r3.status).toBe(200);

    // 4. Fund (by brand)
    const fundedDeal = { ...acceptedDeal, status: 'FUNDED' as DealStatus };
    mockDealService.transitionDeal.mockResolvedValue(fundedDeal);
    const r4 = await request(app)
      .post('/deals/deal-2/transition')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      )
      .send({ action: 'FUND' });
    expect(r4.status).toBe(200);

    // 5. Start (by creator)
    const inProgressDeal = { ...fundedDeal, status: 'IN_PROGRESS' as DealStatus };
    mockDealService.transitionDeal.mockResolvedValue(inProgressDeal);
    const r5 = await request(app)
      .post('/deals/deal-2/transition')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      )
      .send({ action: 'START' });
    expect(r5.status).toBe(200);
    expect(r5.body.data.deal.status).toBe('IN_PROGRESS');
  });

  it('state endpoint returns available actions for creator role in PENDING_ACCEPTANCE', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-2',
      status: 'PENDING_ACCEPTANCE',
      isTerminal: false,
      availableActions: ['ACCEPT', 'DECLINE'] as DealAction[],
      brandId: 'brand-1',
      creatorId: 'creator-1',
    });
    const res = await request(app)
      .get('/deals/deal-2/state')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.state.availableActions).toContain('ACCEPT');
    expect(res.body.data.state.availableActions).toContain('DECLINE');
    expect(res.body.data.state.availableActions).not.toContain('CANCEL'); // Not allowed for CREATOR
  });

  it('state endpoint returns available actions for brand role in DRAFT', async () => {
    mockDealService.getDealState.mockResolvedValue({
      dealId: 'deal-1',
      status: 'DRAFT',
      isTerminal: false,
      availableActions: ['CANCEL', 'SUBMIT_FOR_ACCEPTANCE'] as DealAction[],
      brandId: 'brand-1',
      creatorId: null,
    });
    const res = await request(app)
      .get('/deals/deal-1/state')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.state.availableActions).toContain('CANCEL');
    expect(res.body.data.state.availableActions).toContain('SUBMIT_FOR_ACCEPTANCE');
    expect(res.body.data.state.isTerminal).toBe(false);
  });
});
