/**
 * tests/integration/terms.routes.test.ts
 *
 * Integration tests for the term-refinement API routes.
 * Covers: propose → accept / reject lifecycle, authorization, concurrency,
 * lifecycle restrictions, and audit events.
 *
 * These tests mock the repository layer and run without a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the repository layer before importing the router
// ---------------------------------------------------------------------------------------

const mockRepo = {
  findById: vi.fn(),
  findByIdWithAccessCheck: vi.fn(),
  getAuthoritativeVersion: vi.fn(),
  getPendingVersion: vi.fn(),
  createPendingVersionAtomically: vi.fn(),
  acceptPendingVersion: vi.fn(),
  rejectPendingVersions: vi.fn(),
  createAuditLog: vi.fn(),
};

vi.mock('../../src/repositories/DealRepository.js', () => ({
  dealRepository: mockRepo,
  DealRepository: vi.fn(),
}));

// Now safe to import
const { default: termsRouter } = await import('../../src/routes/terms.routes.js');
const { errorHandler, notFoundHandler } = await import(
  '../../src/middleware/errorHandler.js'
);

import express, { type Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { DealWithVersions } from '../../src/repositories/DealRepository.js';
import { DealVersionConflictError } from '../../src/domain/errors/index.js';

// ---------------------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', termsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(payload: { userId: string; email: string; role: string }): string {
  return `Bearer ${makeToken(payload)}`;
}

const BRAND_AUTH = authHeader({ userId: 'brand-1', email: 'brand@test.com', role: 'BRAND' });
const CREATOR_AUTH = authHeader({ userId: 'creator-1', email: 'creator@test.com', role: 'CREATOR' });
const OTHER_BRAND_AUTH = authHeader({ userId: 'brand-2', email: 'brand2@test.com', role: 'BRAND' });
const OTHER_CREATOR_AUTH = authHeader({ userId: 'creator-2', email: 'creator2@test.com', role: 'CREATOR' });
const ADMIN_AUTH = authHeader({ userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN' });

// ---------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------

function makeAcceptedDealWithV1(overrides: Partial<DealWithVersions> = {}): DealWithVersions {
  return {
    id: 'deal-1',
    brandId: 'brand-1',
    creatorId: 'creator-1',
    status: 'ACCEPTED',
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
        terms: {
          title: 'Original Deal',
          description: 'Original terms',
          deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
          paymentAmount: 50000,
          currency: 'USD',
        },
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

function makeFundedDealWithV1(overrides: Partial<DealWithVersions> = {}): DealWithVersions {
  return makeAcceptedDealWithV1({ status: 'FUNDED', fundingStatus: 'FUNDED', ...overrides });
}

function makeInProgressDealWithV1(overrides: Partial<DealWithVersions> = {}): DealWithVersions {
  return makeFundedDealWithV1({ status: 'IN_PROGRESS', ...overrides });
}

const VALID_TERMS = {
  title: 'Updated Deal',
  description: 'Updated terms',
  deliverables: [{ title: 'D1', description: 'Deliverable 1' }],
  paymentAmount: 75000,
  currency: 'USD',
};

// ---------------------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------------------

describe('Terms Routes — Integration', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // GET /deals/:id/terms
  // ==========================================================================

  describe('GET /deals/:id/terms', () => {
    it('returns authoritative terms with no pending proposal', async () => {
      const deal = makeAcceptedDealWithV1();
      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.getPendingVersion.mockResolvedValue(null);

      const res = await request(app)
        .get('/deals/deal-1/terms')
        .set('Authorization', BRAND_AUTH);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
      expect(res.body.data.terms.pendingVersionNumber).toBeNull();
      expect(res.body.data.terms.authoritativeTerms.paymentAmount).toBe(50000);
    });

    it('returns both authoritative and pending terms when proposal exists', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = {
        id: 'v2',
        versionNumber: 2,
        isPending: true,
        terms: VALID_TERMS,
        createdAt: new Date(),
      };

      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);

      const res = await request(app)
        .get('/deals/deal-1/terms')
        .set('Authorization', BRAND_AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
      expect(res.body.data.terms.pendingVersionNumber).toBe(2);
      expect(res.body.data.terms.pendingTerms.paymentAmount).toBe(75000);
    });
  });

  // ==========================================================================
  // POST /deals/:id/terms/propose
  // ==========================================================================

  describe('POST /deals/:id/terms/propose', () => {
    it('201 — brand proposes terms in ACCEPTED state', async () => {
      const deal = makeAcceptedDealWithV1();
      const createdVersion = {
        id: 'v2',
        versionNumber: 2,
        isPending: true,
        terms: VALID_TERMS,
        createdAt: new Date(),
      };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);
      mockRepo.getPendingVersion
        .mockResolvedValueOnce(null) // check for existing
        .mockResolvedValueOnce(createdVersion as any); // refresh
      mockRepo.createPendingVersionAtomically.mockResolvedValue(createdVersion as any);
      // acceptedVersionNumber is still 1, so authoritative is v1 in BOTH calls
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.terms.pendingVersionNumber).toBe(2);
      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
    });

    it('201 — brand proposes terms in FUNDED state', async () => {
      const deal = makeFundedDealWithV1();
      const createdVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValueOnce(null).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createPendingVersionAtomically.mockResolvedValue(createdVersion as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValueOnce(deal.versions[0]).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(201);
    });

    it('201 — brand proposes terms in IN_PROGRESS state', async () => {
      const deal = makeInProgressDealWithV1();
      const createdVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValueOnce(null).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createPendingVersionAtomically.mockResolvedValue(createdVersion as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValueOnce(deal.versions[0]).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(201);
    });

    it('400 — invalid terms payload (missing required fields)', async () => {
      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: { title: 42 } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('400 — propose in DRAFT state is not allowed', async () => {
      // DRAFT without creator: state machine rejects before any repo call
      void makeAcceptedDealWithV1({ status: 'DRAFT', creatorId: null });

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
    });

    it('400 — propose in PENDING_ACCEPTANCE state is not allowed', async () => {
      void makeAcceptedDealWithV1({ status: 'PENDING_ACCEPTANCE' });

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
    });

    it('400 — propose in SUBMITTED state is not allowed', async () => {
      void makeAcceptedDealWithV1({ status: 'SUBMITTED' });

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
    });

    it('400 — propose in APPROVED state is not allowed', async () => {
      void makeAcceptedDealWithV1({ status: 'APPROVED' });

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
    });

    it('400 — propose in CANCELLED state is not allowed', async () => {
      void makeAcceptedDealWithV1({ status: 'CANCELLED' });

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
    });

    it('403 — creator cannot propose terms', async () => {
      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', CREATOR_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(403);
    });

    it('403 — admin cannot propose (term refinement is commercial)', async () => {
      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', ADMIN_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(403);
    });

    it('403 — non-participant brand cannot propose', async () => {
      const deal = makeAcceptedDealWithV1();
      mockRepo.findById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', OTHER_BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(403);
    });

    it('400 — a pending proposal already exists', async () => {
      const deal = makeAcceptedDealWithV1();
      const existingPending = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(existingPending as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DEAL_001');
    });

    it('audit event DEAL.TERMS_PROPOSED is recorded with previous authoritative and proposed versions', async () => {
      const deal = makeAcceptedDealWithV1();
      const createdVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValueOnce(null).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createPendingVersionAtomically.mockResolvedValue(createdVersion as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValueOnce(deal.versions[0]).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEAL.TERMS_PROPOSED',
          dealId: 'deal-1',
          actorId: 'brand-1',
          metadata: expect.objectContaining({
            previousAuthoritativeVersionNumber: 1,
            proposedVersionNumber: 2,
          }),
        }),
      );
    });

    it('authoritative version remains unchanged after proposal', async () => {
      const deal = makeAcceptedDealWithV1();
      const createdVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValueOnce(null).mockResolvedValueOnce(createdVersion as any);
      mockRepo.createPendingVersionAtomically.mockResolvedValue(createdVersion as any);
      mockRepo.getAuthoritativeVersion
        .mockResolvedValueOnce(deal.versions[0]) // audit
        .mockResolvedValueOnce(deal.versions[0]); // refresh (unchanged)
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
      expect(res.body.data.terms.authoritativeTerms.paymentAmount).toBe(50000);
    });
  });

  // ==========================================================================
  // POST /deals/:id/terms/accept
  // ==========================================================================

  describe('POST /deals/:id/terms/accept', () => {
    it('200 — creator accepts pending proposal', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion
        .mockResolvedValueOnce(pendingVersion as any) // accept: check
        .mockResolvedValueOnce(null); // getDealTerms refresh
      mockRepo.acceptPendingVersion.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);
      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.terms.authoritativeVersionNumber).toBe(2);
      expect(res.body.data.terms.pendingVersionNumber).toBeNull();
      expect(res.body.data.terms.authoritativeTerms.paymentAmount).toBe(75000);
    });

    it('200 — accept in FUNDED state', async () => {
      const deal = makeFundedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.acceptPendingVersion.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(200);
    });

    it('200 — accept in IN_PROGRESS state', async () => {
      const deal = makeInProgressDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.acceptPendingVersion.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(200);
    });

    it('403 — brand cannot accept proposal', async () => {
      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', BRAND_AUTH);

      expect(res.status).toBe(403);
    });

    it('403 — non-participant creator cannot accept', async () => {
      const deal = makeAcceptedDealWithV1();
      mockRepo.findById.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', OTHER_CREATOR_AUTH);

      expect(res.status).toBe(403);
    });

    it('400 — no pending proposal to accept', async () => {
      const deal = makeAcceptedDealWithV1();

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(null);

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(400);
    });

    it('400 — accept in SUBMITTED state is not allowed', async () => {
      void makeAcceptedDealWithV1({ status: 'SUBMITTED' });

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(400);
    });

    it('audit event DEAL.TERMS_ACCEPTED is recorded with previous and accepted version numbers', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.acceptPendingVersion.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEAL.TERMS_ACCEPTED',
          dealId: 'deal-1',
          actorId: 'creator-1',
          metadata: expect.objectContaining({
            previousAuthoritativeVersionNumber: 1,
            acceptedVersionNumber: 2,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // POST /deals/:id/terms/reject
  // ==========================================================================

  describe('POST /deals/:id/terms/reject', () => {
    it('200 — creator rejects pending proposal', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion
        .mockResolvedValueOnce(pendingVersion as any) // reject: check
        .mockResolvedValueOnce(null); // getDealTerms refresh
      mockRepo.rejectPendingVersions.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.createAuditLog.mockResolvedValue({} as any);
      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);

      const res = await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
      expect(res.body.data.terms.pendingVersionNumber).toBeNull();
    });

    it('403 — brand cannot reject proposal', async () => {
      const res = await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', BRAND_AUTH);

      expect(res.status).toBe(403);
    });

    it('400 — no pending proposal to reject', async () => {
      const deal = makeAcceptedDealWithV1();

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(null);

      const res = await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(400);
    });

    it('audit event DEAL.TERMS_REJECTED is recorded with previous and rejected version numbers', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.rejectPendingVersions.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', CREATOR_AUTH);

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEAL.TERMS_REJECTED',
          dealId: 'deal-1',
          actorId: 'creator-1',
          metadata: expect.objectContaining({
            previousAuthoritativeVersionNumber: 1,
            rejectedVersionNumber: 2,
          }),
        }),
      );
    });

    it('rejected version never becomes authoritative', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.rejectPendingVersions.mockResolvedValue({} as any);
      mockRepo.getAuthoritativeVersion.mockResolvedValue(deal.versions[0]);
      mockRepo.createAuditLog.mockResolvedValue({} as any);

      const res = await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', CREATOR_AUTH);

      expect(res.body.data.terms.authoritativeVersionNumber).toBe(1);
    });
  });

  // ==========================================================================
  // Concurrency — optimistic locking
  // ==========================================================================

  describe('Concurrency — stale updatedAt', () => {
    it('proposeTerms — 409 on concurrent modification', async () => {
      const deal = makeAcceptedDealWithV1();

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(null);
      mockRepo.createPendingVersionAtomically.mockRejectedValue(
        new DealVersionConflictError('Deal was modified by another request'),
      );

      const res = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RES_002');
    });

    it('acceptProposal — 409 on concurrent modification', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.acceptPendingVersion.mockRejectedValue(
        new DealVersionConflictError('Deal was modified by another request'),
      );

      const res = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RES_002');
    });

    it('rejectProposal — 409 on concurrent modification', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = { id: 'v2', versionNumber: 2, isPending: true, terms: VALID_TERMS, createdAt: new Date() };

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.getPendingVersion.mockResolvedValue(pendingVersion as any);
      mockRepo.rejectPendingVersions.mockRejectedValue(
        new DealVersionConflictError('Deal was modified by another request'),
      );

      const res = await request(app)
        .post('/deals/deal-1/terms/reject')
        .set('Authorization', CREATOR_AUTH);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RES_002');
    });
  });

  // ==========================================================================
  // Full propose → accept lifecycle
  // ==========================================================================

  describe('Full propose → accept lifecycle', () => {
    it('v1 authoritative → brand proposes v2 pending → creator accepts → v2 becomes authoritative', async () => {
      const deal = makeAcceptedDealWithV1();
      const pendingVersion = {
        id: 'v2', versionNumber: 2, isPending: true,
        terms: VALID_TERMS, createdAt: new Date(),
      };
      // Version that has been accepted (isPending cleared, isPending=false)
      const acceptedV2 = { ...pendingVersion, isPending: false };

      // Set up all mocks: each function starts fresh from vi.fn() and accumulates
      // mockResolvedValueOnce calls as they're consumed in order.
      // getPendingVersion order:
      //   1. proposeTerms → check no existing pending
      //   2. getDealTerms refresh (after propose) → getDealTerms → getPendingVersion → return pendingVersion
      //   3. acceptProposal → check pending exists
      //   4. getDealTerms refresh (after accept) → getDealTerms → getPendingVersion → return null (accepted)
      mockRepo.getPendingVersion
        .mockResolvedValueOnce(null) // 1. propose: no existing pending
        .mockResolvedValueOnce(pendingVersion as any) // 2. getDealTerms after propose: pending exists
        .mockResolvedValueOnce(pendingVersion as any) // 3. accept: pending exists
        .mockResolvedValueOnce(null); // 4. getDealTerms after accept: no more pending

      // getAuthoritativeVersion order:
      //   1. proposeTerms audit → get authoritative (v1)
      //   2. getDealTerms after propose → authoritative (v1, unchanged)
      //   3. acceptProposal → authoritative of accepted (acceptedV2, isPending=false)
      //   4. getDealTerms after accept → authoritative (acceptedV2)
      mockRepo.getAuthoritativeVersion
        .mockResolvedValueOnce(deal.versions[0]) // 1. propose audit
        .mockResolvedValueOnce(deal.versions[0]) // 2. getDealTerms after propose (v1)
        .mockResolvedValueOnce(acceptedV2 as any) // 3. accept: authoritative of accepted
        .mockResolvedValueOnce(acceptedV2 as any); // 4. getDealTerms after accept (v2)

      mockRepo.findById.mockResolvedValue(deal);
      mockRepo.findByIdWithAccessCheck.mockResolvedValue(deal);
      mockRepo.createPendingVersionAtomically.mockResolvedValue(pendingVersion as any);
      mockRepo.createAuditLog.mockResolvedValue({} as any);
      mockRepo.acceptPendingVersion.mockResolvedValue({} as any);

      // Step 1: Propose
      const proposeRes = await request(app)
        .post('/deals/deal-1/terms/propose')
        .set('Authorization', BRAND_AUTH)
        .send({ terms: VALID_TERMS });
      expect(proposeRes.status).toBe(201);
      expect(proposeRes.body.data.terms.authoritativeVersionNumber).toBe(1);
      expect(proposeRes.body.data.terms.pendingVersionNumber).toBe(2);

      // Step 2: Accept
      const acceptRes = await request(app)
        .post('/deals/deal-1/terms/accept')
        .set('Authorization', CREATOR_AUTH);
      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.terms.authoritativeVersionNumber).toBe(2);
      expect(acceptRes.body.data.terms.pendingVersionNumber).toBeNull();
    });
  });
});
