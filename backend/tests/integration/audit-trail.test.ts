/**
 * Integration tests for the Deal History / Audit Trail.
 *
 * These tests verify the HTTP layer for the audit trail and history:
 * - GET /deals/:id/history returns history in deterministic order
 * - Authorization: unauthorized users cannot access history
 * - Authorization: only deal participants (or admin/HRT) can see history
 * - Acceptance/decline produces the correct invitation lifecycle event
 * - Failed transitions do NOT leave behind a successful event
 *
 * Strategy: We use `vi.spyOn` on the real service module so that:
 *   - `getDealHistory`'s internal call to `getDeal` still executes
 *     (and the real `getDeal`'s authorization rules are tested)
 *   - Individual service methods can be overridden per test as needed
 *   - The repository's `createAuditLog` is mocked so we don't need a DB
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the database layer (no real DB needed for history retrieval tests)
// ---------------------------------------------------------------------------------------

const mockAuditLogFindMany = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock('../../src/db.js', () => ({
  prisma: {
    auditLog: {
      findMany: (...args: any[]) => mockAuditLogFindMany(...args),
      create: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
  },
}));

// Mock the repository so the real service functions can still execute
// (they call repository methods internally) without needing a database.
const mockFindByIdWithAccessCheck = vi.fn();
const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/repositories/DealRepository.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/repositories/DealRepository.js')>(),
  dealRepository: {
    createAuditLog: (...args: any[]) => mockCreateAuditLog(...args),
    findByIdWithAccessCheck: (...args: any[]) => mockFindByIdWithAccessCheck(...args),
    findById: (...args: any[]) => mockFindByIdWithAccessCheck(...args),
    updateStatus: async (_id: string, status: string, _expected: Date, _actorId: string, _role: string, options: any) => {
      for (const audit of options.auditLogs) await mockCreateAuditLog(audit);
      return { ...PENDING_DEAL, status };
    },
  },
}));

// Now safe to import the router and the real service module
const { default: dealRouter } = await import('../../src/routes/deal.routes.js');
const { default: invitationRouter } = await import('../../src/routes/invitation.routes.js');
const { errorHandler, notFoundHandler, NotFoundError } = await import(
  '../../src/middleware/errorHandler.js'
);
const dealServiceModule = await import('../../src/services/DealService.js');
const realTransitionDeal = dealServiceModule.transitionDeal;

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  InvalidStateError,
  UnauthorizedAccessError,
} from '../../src/domain/errors/index.js';

// ---------------------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', dealRouter);
  app.use('/invitations', invitationRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(
  payload = { userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' },
): string {
  return `Bearer ${makeToken(payload)}`;
}

// ---------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------

const SAMPLE_TERMS = {
  title: 'Test Deal',
  description: 'A test deal',
  deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
  paymentAmount: 50000,
  currency: 'USD',
};

const DRAFT_DEAL = {
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: null,
  status: 'DRAFT',
  contractId: null,
  fundingStatus: 'NOT_FUNDED',
  acceptedVersionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [
    {
      id: 'v1',
      versionNumber: 1,
      isPending: false,
      terms: SAMPLE_TERMS,
      createdAt: new Date(),
    },
  ],
};

const PENDING_DEAL = {
  ...DRAFT_DEAL,
  status: 'PENDING_ACCEPTANCE' as const,
  creatorId: 'creator-1',
};

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

describe('Audit Trail — History ordering (deterministic)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: 'brand-1', email: 'brand@test.com', role: 'BRAND' });
    // Default: findByIdWithAccessCheck returns DRAFT_DEAL (no auth errors).
    // Tests that need different behavior call vi.spyOn(getDeal).mockResolvedValue(...)
    // or mockRejectedValue(...) directly.
    mockFindByIdWithAccessCheck.mockResolvedValue(DRAFT_DEAL);
  });

  it('returns history with multiple events in chronological order', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);

    const t0 = new Date('2025-01-01T00:00:00.000Z');
    const t1 = new Date('2025-01-01T00:01:00.000Z');
    const t2 = new Date('2025-01-01T00:02:00.000Z');

    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEAL.CREATED',
        actorId: 'brand-1',
        metadata: { status: 'DRAFT' },
        timestamp: t0,
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
      {
        id: 'log-2',
        action: 'DEAL.CREATOR_INVITED',
        actorId: 'brand-1',
        metadata: { creatorId: 'creator-1', fromStatus: 'DRAFT', toStatus: 'PENDING_ACCEPTANCE' },
        timestamp: t1,
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
      {
        id: 'log-3',
        action: 'DEAL.STATE_CHANGED',
        actorId: 'creator-1',
        metadata: { fromStatus: 'PENDING_ACCEPTANCE', toStatus: 'ACCEPTED', action: 'ACCEPT' },
        timestamp: t2,
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(3);
    const timestamps = res.body.data.history.map((h: any) => new Date(h.timestamp).getTime());
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);
    expect(res.body.data.history[0].action).toBe('DEAL.CREATED');
    expect(res.body.data.history[2].action).toBe('DEAL.STATE_CHANGED');
  });

  it('queries audit log with deterministic ordering (timestamp + id)', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([]);

    await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dealId: 'deal-1' },
        orderBy: expect.arrayContaining([
          expect.objectContaining({ timestamp: 'asc' }),
          expect.objectContaining({ id: 'asc' }),
        ]),
      }),
    );
  });

  it('returns empty history for a freshly created deal with no other events', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(0);
  });
});

describe('Audit Trail — Authorization on history endpoint', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: 'brand-1', email: 'brand@test.com', role: 'BRAND' });
    // Default behavior: deal is found and accessible. Tests that need
    // NotFoundError / UnauthorizedAccessError will mock explicitly.
    mockFindByIdWithAccessCheck.mockResolvedValue(DRAFT_DEAL);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/deals/deal-1/history');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('returns 404 when deal does not exist (NotFoundError from getDeal)', async () => {
    // The real getDeal calls findByIdWithAccessCheck, which throws NotFoundError
    // when the deal does not exist. Configure the mock to throw.
    mockFindByIdWithAccessCheck.mockRejectedValue(
      new NotFoundError('Deal', 'nonexistent'),
    );

    const res = await request(app)
      .get('/deals/nonexistent/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RES_001');
  });

  it('returns 403 when the requester is not a deal participant', async () => {
    // The real getDeal calls findByIdWithAccessCheck, which throws
    // UnauthorizedAccessError when the requester is not authorized.
    mockFindByIdWithAccessCheck.mockRejectedValue(
      new UnauthorizedAccessError('Only deal participants can access this resource'),
    );

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set(
        'Authorization',
        authHeader({ userId: 'stranger', email: 's@s.com', role: 'BRAND' }),
      );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('allows ADMIN to view any deal history', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEAL.CREATED',
        actorId: 'brand-1',
        metadata: null,
        timestamp: new Date(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set(
        'Authorization',
        authHeader({ userId: 'admin-1', email: 'a@a.com', role: 'ADMIN' }),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
  });

  it('allows the deal brand to view history of their own deal', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEAL.CREATED',
        actorId: 'brand-1',
        metadata: { status: 'DRAFT' },
        timestamp: new Date(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
  });

  it('allows the invited creator to view history of the deal', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(PENDING_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(200);
  });
});

describe('Audit Trail — Actor attribution', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: 'brand-1', email: 'brand@test.com', role: 'BRAND' });
    mockFindByIdWithAccessCheck.mockResolvedValue(DRAFT_DEAL);
  });

  it('preserves actorId in history response', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEAL.CREATED',
        actorId: 'brand-1',
        metadata: { status: 'DRAFT' },
        timestamp: new Date(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
      {
        id: 'log-2',
        action: 'DEAL.STATE_CHANGED',
        actorId: 'brand-1',
        metadata: { fromStatus: 'DRAFT', toStatus: 'CANCELLED', action: 'CANCEL' },
        timestamp: new Date(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    res.body.data.history.forEach((entry: any) => {
      expect(entry.actorId).toBeDefined();
      expect(entry.actorId).toBe('brand-1');
    });
  });

  it('exposes metadata for state transitions with from/to/action', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEAL.STATE_CHANGED',
        actorId: 'brand-1',
        metadata: { fromStatus: 'DRAFT', toStatus: 'CANCELLED', action: 'CANCEL' },
        timestamp: new Date(),
        resourceType: 'Deal',
        resourceId: 'deal-1',
      },
    ]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.history[0].metadata.fromStatus).toBe('DRAFT');
    expect(res.body.data.history[0].metadata.toStatus).toBe('CANCELLED');
    expect(res.body.data.history[0].metadata.action).toBe('CANCEL');
  });
});

describe('Audit Trail — Invitation lifecycle events', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    // Return the user matching the id from the JWT.
    mockUserFindUnique.mockImplementation(({ where: { id } }: any) => {
      const users: Record<string, object> = {
        'creator-1': { id: 'creator-1', email: 'c@c.com', role: 'CREATOR' },
        'brand-1': { id: 'brand-1', email: 'b@b.com', role: 'BRAND' },
      };
      return Promise.resolve(users[id] ?? null);
    });
    // The accept/decline routes call getDeal, which calls findByIdWithAccessCheck.
    // Return PENDING_DEAL so the state machine allows ACCEPT/DECLINE.
    mockFindByIdWithAccessCheck.mockResolvedValue(PENDING_DEAL);
  });

  it('accept invitation creates INVITATION.ACCEPTED audit log', async () => {
    vi.spyOn(dealServiceModule, 'transitionDeal').mockImplementation(realTransitionDeal);

    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.deal.status).toBe('ACCEPTED');

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'creator-1',
        dealId: 'deal-1',
        action: 'INVITATION.ACCEPTED',
        resourceType: 'Invitation',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'PENDING_ACCEPTANCE',
          toStatus: 'ACCEPTED',
        }),
      }),
    );
  });

  it('decline invitation creates INVITATION.DECLINED audit log', async () => {
    vi.spyOn(dealServiceModule, 'transitionDeal').mockImplementation(realTransitionDeal);

    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.deal.status).toBe('DECLINED');

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'creator-1',
        dealId: 'deal-1',
        action: 'INVITATION.DECLINED',
        resourceType: 'Invitation',
        resourceId: 'deal-1',
        metadata: expect.objectContaining({
          fromStatus: 'PENDING_ACCEPTANCE',
          toStatus: 'DECLINED',
        }),
      }),
    );
  });

  it('accept invitation that fails does NOT create a successful INVITATION.ACCEPTED event', async () => {
    vi.spyOn(dealServiceModule, 'transitionDeal').mockRejectedValue(
      new InvalidStateError("Cannot perform action 'ACCEPT' from state 'DRAFT'"),
    );

    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(400);

    const invAcceptedCalls = mockCreateAuditLog.mock.calls.filter(
      (call: any[]) => call[0]?.action === 'INVITATION.ACCEPTED',
    );
    expect(invAcceptedCalls).toHaveLength(0);
  });

  it('decline invitation that fails does NOT create a successful INVITATION.DECLINED event', async () => {
    vi.spyOn(dealServiceModule, 'transitionDeal').mockRejectedValue(
      new InvalidStateError("Cannot perform action 'DECLINE' from state 'ACCEPTED'"),
    );

    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }),
      );
    expect(res.status).toBe(400);

    const invDeclinedCalls = mockCreateAuditLog.mock.calls.filter(
      (call: any[]) => call[0]?.action === 'INVITATION.DECLINED',
    );
    expect(invDeclinedCalls).toHaveLength(0);
  });

  it('unauthorized accept (wrong role) does NOT create a successful event', async () => {
    vi.spyOn(dealServiceModule, 'transitionDeal').mockRejectedValue(
      new UnauthorizedAccessError("Role 'BRAND' is not permitted to perform 'ACCEPT'"),
    );

    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }),
      );
    expect(res.status).toBe(403);

    const invAcceptedCalls = mockCreateAuditLog.mock.calls.filter(
      (call: any[]) => call[0]?.action === 'INVITATION.ACCEPTED',
    );
    expect(invAcceptedCalls).toHaveLength(0);
  });
});

describe('Audit Trail — Server-authoritative (no client-supplied history)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: 'brand-1', email: 'brand@test.com', role: 'BRAND' });
    mockFindByIdWithAccessCheck.mockResolvedValue(DRAFT_DEAL);
  });

  it('GET /deals/:id/history does not accept a body for history injection', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/deals/deal-1/history')
      .set('Authorization', authHeader())
      .set('Content-Type', 'application/json')
      .send({ injectedEvent: { action: 'FAKE_EVENT', actorId: 'attacker' } });

    expect(res.status).toBe(200);
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dealId: 'deal-1' } }),
    );
  });

  it('history endpoint ignores query-string attempts to pass event payloads', async () => {
    vi.spyOn(dealServiceModule, 'getDeal').mockResolvedValue(DRAFT_DEAL as any);
    mockAuditLogFindMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/deals/deal-1/history?injectedAction=FAKE_EVENT&injectedActor=attacker')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    const callArgs = mockAuditLogFindMany.mock.calls[0]?.[0];
    expect(JSON.stringify(callArgs)).not.toContain('injectedAction');
    expect(JSON.stringify(callArgs)).not.toContain('FAKE_EVENT');
  });
});
