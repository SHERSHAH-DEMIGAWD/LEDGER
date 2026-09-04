/**
 * Integration tests for Dispute routes.
 *
 * Tests the HTTP layer for:
 * - POST /deals/:id/dispute  — raise dispute
 * - POST /deals/:id/resolve  — resolve dispute
 *
 * Strategy: Mock the service layer so tests focus on HTTP shape:
 * authentication, authorization, validation, status codes, and error mapping.
 * The main lifecycle test uses real DisputeService (no service mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the database layer (for mockAwareAuth's prisma.user.findUnique)
// ---------------------------------------------------------------------------------------

const mockUserFindUnique = vi.fn();

vi.mock('../../src/db.js', () => ({
  prisma: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------------------
// Mock the repository layer (so DisputeService can use real logic without a DB)
// ---------------------------------------------------------------------------------------

const mockFindById = vi.fn();
const mockUpdateStatus = vi.fn();
const mockUpdateStatusAndRevisionNote = vi.fn();
const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: {
    findById: (...args: any[]) => mockFindById(...args),
    updateStatus: (...args: any[]) => mockUpdateStatus(...args),
    updateStatusAndRevisionNote: (...args: any[]) => mockUpdateStatusAndRevisionNote(...args),
    createAuditLog: (...args: any[]) => mockCreateAuditLog(...args),
  },
}));

// Now safe to import the router
const { default: disputeRouter } = await import('../../src/routes/dispute.routes.js');
const { errorHandler, notFoundHandler } = await import(
  '../../src/middleware/errorHandler.js'
);

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', disputeRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(userId: string, email: string, role: string): string {
  return `Bearer ${makeToken({ userId, email, role })}`;
}

// ---------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------

const BRAND_ID = '550e8400-e29b-41d4-a716-446655440001';
const CREATOR_ID = '550e8400-e29b-41d4-a716-446655440002';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440003';
const HRT_ID = '550e8400-e29b-41d4-a716-446655440004';
const OTHER_BRAND_ID = '550e8400-e29b-41d4-a716-446655440099';

const BRAND_TOKEN = authHeader(BRAND_ID, 'brand@test.com', 'BRAND');
const CREATOR_TOKEN = authHeader(CREATOR_ID, 'creator@test.com', 'CREATOR');
const ADMIN_TOKEN = authHeader(ADMIN_ID, 'admin@test.com', 'ADMIN');
const HRT_TOKEN = authHeader(HRT_ID, 'hrt@test.com', 'HRT');
const OTHER_BRAND_TOKEN = authHeader(OTHER_BRAND_ID, 'other-brand@test.com', 'BRAND');

function makeDeal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'deal-1',
    brandId: BRAND_ID,
    creatorId: CREATOR_ID,
    status: 'SUBMITTED',
    fundingStatus: 'FUNDED',
    contractId: null,
    paymentRecordId: null,
    latestRevisionNote: null,
    latestRevisionNoteAuthorId: null,
    latestRevisionNoteAt: null,
    acceptedVersionNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------
// Tests — Authentication
// ---------------------------------------------------------------------------------------

describe('Dispute Routes — Authentication', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    // Setup user lookups for all valid test tokens
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const users: Record<string, { id: string; email: string; role: string }> = {
        [BRAND_ID]: { id: BRAND_ID, email: 'brand@test.com', role: 'BRAND' },
        [CREATOR_ID]: { id: CREATOR_ID, email: 'creator@test.com', role: 'CREATOR' },
        [ADMIN_ID]: { id: ADMIN_ID, email: 'admin@test.com', role: 'ADMIN' },
        [HRT_ID]: { id: HRT_ID, email: 'hrt@test.com', role: 'HRT' },
        [OTHER_BRAND_ID]: { id: OTHER_BRAND_ID, email: 'other-brand@test.com', role: 'BRAND' },
      };
      return users[where.id] ?? null;
    });
  });

  it('POST /deals/:id/dispute returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/dispute').send({ note: 'Test' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('POST /deals/:id/resolve returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/resolve').send({ note: 'Test' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/dispute (Raise Dispute)
// ---------------------------------------------------------------------------------------

describe('Dispute Routes — POST /deals/:id/dispute', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const users: Record<string, { id: string; email: string; role: string }> = {
        [BRAND_ID]: { id: BRAND_ID, email: 'brand@test.com', role: 'BRAND' },
        [CREATOR_ID]: { id: CREATOR_ID, email: 'creator@test.com', role: 'CREATOR' },
        [ADMIN_ID]: { id: ADMIN_ID, email: 'admin@test.com', role: 'ADMIN' },
        [HRT_ID]: { id: HRT_ID, email: 'hrt@test.com', role: 'HRT' },
        [OTHER_BRAND_ID]: { id: OTHER_BRAND_ID, email: 'other-brand@test.com', role: 'BRAND' },
      };
      return users[where.id] ?? null;
    });
  });

  describe('happy path', () => {
    it('returns 200 with DISPUTED status when brand raises dispute', async () => {
      const deal = makeDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: 'Quality issues with deliverables' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DISPUTED');
      expect(res.body.data.dealId).toBe('deal-1');
      expect(res.body.data.raisedAt).toBeDefined();
    });

    it('returns 200 with DISPUTED status when admin raises dispute', async () => {
      const deal = makeDeal({ status: 'SUBMITTED', brandId: 'other-brand' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatus.mockResolvedValue({ ...deal, status: 'DISPUTED' });

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', ADMIN_TOKEN)
        .send({ note: 'Admin dispute' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DISPUTED');
    });
  });

  describe('authorization', () => {
    it('returns 403 when creator tries to raise dispute', async () => {
      const deal = makeDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', CREATOR_TOKEN)
        .send({ note: 'Creator trying to dispute' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_011');
    });

    it('returns 403 when HRT tries to raise dispute', async () => {
      const deal = makeDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', HRT_TOKEN)
        .send({ note: 'HRT trying to dispute' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_011');
    });

    it('returns 403 when unrelated brand tries to raise dispute', async () => {
      const deal = makeDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', OTHER_BRAND_TOKEN)
        .send({ note: 'Stranger trying to dispute' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_011');
    });
  });

  describe('validation', () => {
    it('returns 400 when note is missing', async () => {
      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });

    it('returns 400 when note is empty', async () => {
      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });

    it('returns 400 when note exceeds 5000 characters', async () => {
      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: 'x'.repeat(5001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });
  });

  describe('state error', () => {
    it('returns 400 when deal not in SUBMITTED state', async () => {
      const deal = makeDeal({ status: 'IN_PROGRESS' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: 'Early dispute' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEAL_001');
    });

    it('returns 400 when deal not found', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await request(app)
        .post('/deals/deal-1/dispute')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: 'Note' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEAL_001');
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/resolve (Resolve Dispute)
// ---------------------------------------------------------------------------------------

describe('Dispute Routes — POST /deals/:id/resolve', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const users: Record<string, { id: string; email: string; role: string }> = {
        [BRAND_ID]: { id: BRAND_ID, email: 'brand@test.com', role: 'BRAND' },
        [CREATOR_ID]: { id: CREATOR_ID, email: 'creator@test.com', role: 'CREATOR' },
        [ADMIN_ID]: { id: ADMIN_ID, email: 'admin@test.com', role: 'ADMIN' },
        [HRT_ID]: { id: HRT_ID, email: 'hrt@test.com', role: 'HRT' },
        [OTHER_BRAND_ID]: { id: OTHER_BRAND_ID, email: 'other-brand@test.com', role: 'BRAND' },
      };
      return users[where.id] ?? null;
    });
  });

  describe('happy path', () => {
    it('returns 200 with RESOLVED status when HRT resolves dispute', async () => {
      const deal = makeDeal({ status: 'DISPUTED' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({ note: 'Partial refund of 30% recommended' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.dealId).toBe('deal-1');
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it('returns 200 with RESOLVED status when admin resolves dispute', async () => {
      const deal = makeDeal({ status: 'DISPUTED', brandId: 'other-brand' });
      mockFindById.mockResolvedValue(deal);
      mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...deal, status: 'RESOLVED' });

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', ADMIN_TOKEN)
        .send({ note: 'Admin resolution' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
    });
  });

  describe('authorization', () => {
    it('returns 403 when brand tries to resolve dispute', async () => {
      const deal = makeDeal({ status: 'DISPUTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', BRAND_TOKEN)
        .send({ note: 'Brand trying to resolve' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_011');
    });

    it('returns 403 when creator tries to resolve dispute', async () => {
      const deal = makeDeal({ status: 'DISPUTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', CREATOR_TOKEN)
        .send({ note: 'Creator trying to resolve' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_011');
    });
  });

  describe('validation', () => {
    it('returns 400 when note is missing', async () => {
      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });

    it('returns 400 when note is empty', async () => {
      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({ note: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });

    it('returns 400 when note exceeds 5000 characters', async () => {
      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({ note: 'x'.repeat(5001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VAL_001');
    });
  });

  describe('state error', () => {
    it('returns 400 when deal not in DISPUTED state', async () => {
      const deal = makeDeal({ status: 'SUBMITTED' });
      mockFindById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({ note: 'Early resolution' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEAL_001');
    });

    it('returns 400 when deal not found', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await request(app)
        .post('/deals/deal-1/resolve')
        .set('Authorization', HRT_TOKEN)
        .send({ note: 'Note' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEAL_001');
    });
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Full Dispute Lifecycle (real service, no service mock)
// ---------------------------------------------------------------------------------------

describe('Dispute Routes — Full Dispute Lifecycle', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const users: Record<string, { id: string; email: string; role: string }> = {
        [BRAND_ID]: { id: BRAND_ID, email: 'brand@test.com', role: 'BRAND' },
        [CREATOR_ID]: { id: CREATOR_ID, email: 'creator@test.com', role: 'CREATOR' },
        [ADMIN_ID]: { id: ADMIN_ID, email: 'admin@test.com', role: 'ADMIN' },
        [HRT_ID]: { id: HRT_ID, email: 'hrt@test.com', role: 'HRT' },
      };
      return users[where.id] ?? null;
    });
  });

  it('full lifecycle: submit → raise dispute (DISPUTED) → resolve (RESOLVED)', async () => {
    // ── SUBMITTED → DISPUTED ──────────────────────────────────────────────
    const submittedDeal = makeDeal({ status: 'SUBMITTED' });
    mockFindById.mockResolvedValue(submittedDeal);
    mockUpdateStatus.mockResolvedValue({ ...submittedDeal, status: 'DISPUTED' });

    const raiseRes = await request(app)
      .post('/deals/deal-1/dispute')
      .set('Authorization', BRAND_TOKEN)
      .send({ note: 'The submitted reel does not match the brief' });

    expect(raiseRes.status).toBe(200);
    expect(raiseRes.body.data.status).toBe('DISPUTED');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPUTE.RAISED',
        metadata: expect.objectContaining({
          disputeNote: 'The submitted reel does not match the brief',
          fromStatus: 'SUBMITTED',
          toStatus: 'DISPUTED',
        }),
      }),
    );

    // ── DISPUTED → RESOLVED ──────────────────────────────────────────────
    const disputedDeal = makeDeal({ status: 'DISPUTED' });
    mockFindById.mockResolvedValue(disputedDeal);
    mockUpdateStatusAndRevisionNote.mockResolvedValue({ ...disputedDeal, status: 'RESOLVED' });

    const resolveRes = await request(app)
      .post('/deals/deal-1/resolve')
      .set('Authorization', HRT_TOKEN)
      .send({ note: 'After review: partial refund of 40% is fair to both parties' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('RESOLVED');
    expect(resolveRes.body.data.dealId).toBe('deal-1');

    // Verify the service called the correct repository methods
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'deal-1',
      'DISPUTED',
      submittedDeal.updatedAt,
      BRAND_ID,
      'BRAND',
    );
    expect(mockUpdateStatusAndRevisionNote).toHaveBeenCalledWith(
      'deal-1',
      'RESOLVED',
      disputedDeal.updatedAt,
      HRT_ID,
      'HRT',
      'After review: partial refund of 40% is fair to both parties',
    );

    // Verify both audit logs were created
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(2);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPUTE.RAISED' }),
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPUTE.RESOLVED' }),
    );
  });
});
