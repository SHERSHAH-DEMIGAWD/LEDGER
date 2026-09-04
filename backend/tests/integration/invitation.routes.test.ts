/**
 * Integration tests for Invitation routes.
 *
 * Verifies the HTTP layer for invitation endpoints:
 * - GET /invitations (list)
 * - POST /invitations/:id/accept
 * - POST /invitations/:id/decline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the service layer before importing the router
// ---------------------------------------------------------------------------------------

const mockDealService = {
  listCreatorInvitations: vi.fn(),
  transitionDeal: vi.fn(),
};

const mockDealRepository = {
  createAuditLog: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../src/services/DealService.js', () => mockDealService);
vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: mockDealRepository,
}));

const { default: invitationRouter } = await import('../../src/routes/invitation.routes.js');
const { errorHandler, notFoundHandler } = await import('../../src/middleware/errorHandler.js');

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';

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
  app.use('/invitations', invitationRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(payload = { userId: 'creator-1', email: 'creator@test.com', role: 'CREATOR' }): string {
  return `Bearer ${makeToken(payload)}`;
}

// ---------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------

const PENDING_DEAL: DealWithVersions = {
  id: 'deal-1',
  brandId: 'brand-1',
  creatorId: 'creator-1',
  status: 'PENDING_ACCEPTANCE',
  contractId: null,
  fundingStatus: 'NOT_FUNDED',
  paymentRecordId: null,
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

const ACCEPTED_DEAL: DealWithVersions = {
  ...PENDING_DEAL,
  status: 'ACCEPTED',
};

const DECLINED_DEAL: DealWithVersions = {
  ...PENDING_DEAL,
  status: 'DECLINED',
};

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

describe('Invitation Routes — Authentication', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('GET /invitations returns 401 when no Authorization header', async () => {
    const res = await request(app).get('/invitations');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('GET /invitations returns 401 for invalid token', async () => {
    const res = await request(app)
      .get('/invitations')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('POST /invitations/:id/accept returns 401 without auth', async () => {
    const res = await request(app).post('/invitations/deal-1/accept');
    expect(res.status).toBe(401);
  });

  it('POST /invitations/:id/decline returns 401 without auth', async () => {
    const res = await request(app).post('/invitations/deal-1/decline');
    expect(res.status).toBe(401);
  });
});

describe('Invitation Routes — GET /invitations', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with invitations list for authenticated creator', async () => {
    mockDealService.listCreatorInvitations.mockResolvedValue([
      {
        id: 'deal-1',
        status: 'PENDING_ACCEPTANCE',
        createdAt: new Date(),
        updatedAt: new Date(),
        brandId: 'brand-1',
        terms: {
          title: 'Test Deal',
          description: 'A test deal',
          deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
          paymentAmount: 50000,
          currency: 'USD',
        },
        latestVersionNumber: 1,
      },
    ]);

    const res = await request(app)
      .get('/invitations')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invitations).toHaveLength(1);
    expect(res.body.data.invitations[0].id).toBe('deal-1');
    expect(res.body.data.invitations[0].status).toBe('PENDING_ACCEPTANCE');
    expect(mockDealService.listCreatorInvitations).toHaveBeenCalledWith('creator-1', 'CREATOR');
  });

  it('returns 200 with empty array when no invitations', async () => {
    mockDealService.listCreatorInvitations.mockResolvedValue([]);
    const res = await request(app)
      .get('/invitations')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.invitations).toHaveLength(0);
  });

  it('returns empty array for non-CREATOR roles (BRAND)', async () => {
    mockDealService.listCreatorInvitations.mockResolvedValue([]);
    const res = await request(app)
      .get('/invitations')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' }));
    expect(res.status).toBe(200);
    expect(res.body.data.invitations).toHaveLength(0);
    // The service is called but returns [] for non-creators (service-level guard)
    expect(mockDealService.listCreatorInvitations).toHaveBeenCalledWith('brand-1', 'BRAND');
  });
});

describe('Invitation Routes — POST /invitations/:id/accept', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with updated deal when accept succeeds', async () => {
    mockDealService.transitionDeal.mockResolvedValue(ACCEPTED_DEAL);
    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deal.status).toBe('ACCEPTED');
    expect(mockDealService.transitionDeal).toHaveBeenCalledWith(
      'deal-1',
      'ACCEPT',
      expect.objectContaining({ id: 'creator-1', role: 'CREATOR' }),
    );
  });

  it('returns 400 when service rejects invalid state (not PENDING_ACCEPTANCE)', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new InvalidStateError("Cannot perform action 'ACCEPT' from state 'DRAFT'"),
    );
    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
    expect(res.body.error.message).toContain('ACCEPT');
  });

  it('returns 403 when wrong role (BRAND) attempts to accept', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError("Role 'BRAND' is not permitted to perform 'ACCEPT'"),
    );
    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('returns 403 when non-participant creator tries to accept', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only deal participants may perform this action'),
    );
    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set('Authorization', authHeader({ userId: 'creator-2', email: 'c2@test.com', role: 'CREATOR' }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });
});

describe('Invitation Routes — POST /invitations/:id/decline', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with updated deal when decline succeeds', async () => {
    mockDealService.transitionDeal.mockResolvedValue(DECLINED_DEAL);
    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deal.status).toBe('DECLINED');
    expect(mockDealService.transitionDeal).toHaveBeenCalledWith(
      'deal-1',
      'DECLINE',
      expect.objectContaining({ id: 'creator-1', role: 'CREATOR' }),
    );
  });

  it('returns 400 when service rejects invalid state', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new InvalidStateError("Cannot perform action 'DECLINE' from state 'ACCEPTED'"),
    );
    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when wrong role (BRAND) attempts to decline', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError("Role 'BRAND' is not permitted to perform 'DECLINE'"),
    );
    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('returns 403 when non-participant tries to decline', async () => {
    mockDealService.transitionDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only deal participants may perform this action'),
    );
    const res = await request(app)
      .post('/invitations/deal-1/decline')
      .set('Authorization', authHeader({ userId: 'creator-2', email: 'c2@test.com', role: 'CREATOR' }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });
});

describe('Invitation Routes — Error mapping', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('maps DealVersionConflictError to 409', async () => {
    const { DealVersionConflictError } = await import('../../src/domain/errors/index.js');
    mockDealService.transitionDeal.mockRejectedValue(
      new DealVersionConflictError('Deal was modified by another request. Please retry.'),
    );
    const res = await request(app)
      .post('/invitations/deal-1/accept')
      .set('Authorization', authHeader());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RES_002');
  });

  it('returns 404 for completely wrong path', async () => {
    const res = await request(app).get('/invitations/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RES_001');
  });
});