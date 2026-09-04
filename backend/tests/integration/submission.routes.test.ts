/**
 * Integration tests for Submission routes.
 *
 * Tests the HTTP layer for:
 * - POST /deals/:id/submit          — submit deliverables
 * - POST /deals/:id/request-revision — request revision
 * - POST /deals/:id/approve         — approve deliverables
 * - POST /deals/:id/complete        — complete deal (release payment)
 *
 * Strategy: Mock the SubmissionService module to control behavior. Tests
 * focus on HTTP shape: authentication, authorization, validation, status codes,
 * and error mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the SubmissionService module
// ---------------------------------------------------------------------------------------

const mockSubmitDeliverable = vi.fn();
const mockRequestRevision = vi.fn();
const mockApproveDeliverable = vi.fn();
const mockReleasePayment = vi.fn();

vi.mock('../../src/services/SubmissionService.js', () => ({
  submissionService: {
    submitDeliverable: (...args: unknown[]) => mockSubmitDeliverable(...args),
    requestRevision: (...args: unknown[]) => mockRequestRevision(...args),
    approveDeliverable: (...args: unknown[]) => mockApproveDeliverable(...args),
    releasePayment: (...args: unknown[]) => mockReleasePayment(...args),
  },
}));

// Now safe to import
const { default: submissionRouter } = await import('../../src/routes/submission.routes.js');
const { errorHandler, notFoundHandler } = await import(
  '../../src/middleware/errorHandler.js'
);

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
  app.use('/deals', submissionRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function makeToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function authHeader(
  payload = { userId: 'creator-1', email: 'creator@test.com', role: 'CREATOR' },
): string {
  return `Bearer ${makeToken(payload)}`;
}

// ---------------------------------------------------------------------------------------
// Tests — Authentication
// ---------------------------------------------------------------------------------------

describe('Submission Routes — Authentication', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('POST /deals/:id/submit returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/submit').send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('POST /deals/:id/request-revision returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/request-revision').send({ note: 'Fix it' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('POST /deals/:id/approve returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/approve').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('POST /deals/:id/complete returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/complete').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_010');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/submit
// ---------------------------------------------------------------------------------------

describe('Submission Routes — POST /deals/:id/submit', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with submitted status on success', async () => {
    mockSubmitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }))
      .send({ note: 'Work is done!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('accepts submit without a note', async () => {
    mockSubmitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects submission note exceeding 5000 characters', async () => {
    const longNote = 'x'.repeat(5001);
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader())
      .send({ note: longNote });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockSubmitDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader({ userId: 'creator-2', email: 'c2@c.com', role: 'CREATOR' }))
      .send({ note: 'Done' });

    expect(mockSubmitDeliverable).toHaveBeenCalledWith(
      'deal-1',
      'Done',
      expect.objectContaining({ id: 'creator-2', role: 'CREATOR' }),
    );
  });

  it('returns 400 when service throws InvalidStateError (wrong state)', async () => {
    mockSubmitDeliverable.mockRejectedValue(
      new InvalidStateError("Cannot submit deliverables in state 'FUNDED'. Deal must be IN_PROGRESS."),
    );
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when service throws UnauthorizedAccessError', async () => {
    mockSubmitDeliverable.mockRejectedValue(
      new UnauthorizedAccessError('Only the assigned creator can submit deliverables for this deal'),
    );
    const res = await request(app)
      .post('/deals/deal-1/submit')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('returns 400 when deal not found', async () => {
    mockSubmitDeliverable.mockRejectedValue(
      new InvalidStateError("Deal 'nonexistent' not found"),
    );
    const res = await request(app)
      .post('/deals/nonexistent/submit')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/request-revision
// ---------------------------------------------------------------------------------------

describe('Submission Routes — POST /deals/:id/request-revision', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with IN_PROGRESS status on success', async () => {
    mockRequestRevision.mockResolvedValue({
      dealId: 'deal-1',
      status: 'IN_PROGRESS',
      revisionRequestedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({ note: 'Please fix the opening hook' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('requires revision note', async () => {
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rejects empty revision note', async () => {
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({ note: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rejects revision note exceeding 5000 characters', async () => {
    const longNote = 'x'.repeat(5001);
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({ note: longNote });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('returns 400 when service throws InvalidStateError (wrong state)', async () => {
    mockRequestRevision.mockRejectedValue(
      new InvalidStateError("Cannot request revision in state 'IN_PROGRESS'. Deal must be SUBMITTED."),
    );
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({ note: 'Fix it' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when creator tries to request revision', async () => {
    mockRequestRevision.mockRejectedValue(
      new UnauthorizedAccessError('Only the deal brand can request revisions'),
    );
    const res = await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }))
      .send({ note: 'Fix it' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockRequestRevision.mockResolvedValue({
      dealId: 'deal-1',
      status: 'IN_PROGRESS',
      revisionRequestedAt: new Date(),
    });
    await request(app)
      .post('/deals/deal-1/request-revision')
      .set('Authorization', authHeader({ userId: 'brand-2', email: 'b2@b.com', role: 'BRAND' }))
      .send({ note: 'Please revise' });

    expect(mockRequestRevision).toHaveBeenCalledWith(
      'deal-1',
      'Please revise',
      expect.objectContaining({ id: 'brand-2', role: 'BRAND' }),
    );
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/approve
// ---------------------------------------------------------------------------------------

describe('Submission Routes — POST /deals/:id/approve', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with APPROVED status on success', async () => {
    mockApproveDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('accepts empty body for approval', async () => {
    mockApproveDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(200);
  });

  it('returns 400 when service throws InvalidStateError (wrong state)', async () => {
    mockApproveDeliverable.mockRejectedValue(
      new InvalidStateError("Cannot approve deliverables in state 'IN_PROGRESS'. Deal must be SUBMITTED."),
    );
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when creator tries to approve', async () => {
    mockApproveDeliverable.mockRejectedValue(
      new UnauthorizedAccessError('Only the deal brand can approve deliverables'),
    );
    const res = await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockApproveDeliverable.mockResolvedValue({
      dealId: 'deal-1',
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    await request(app)
      .post('/deals/deal-1/approve')
      .set('Authorization', authHeader({ userId: 'brand-2', email: 'b2@b.com', role: 'BRAND' }))
      .send({});

    expect(mockApproveDeliverable).toHaveBeenCalledWith(
      'deal-1',
      expect.objectContaining({ id: 'brand-2', role: 'BRAND' }),
    );
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/complete
// ---------------------------------------------------------------------------------------

describe('Submission Routes — POST /deals/:id/complete', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with COMPLETED status on success', async () => {
    mockReleasePayment.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('accepts empty body for completion', async () => {
    mockReleasePayment.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(200);
  });

  it('returns 400 when service throws InvalidStateError (wrong state)', async () => {
    mockReleasePayment.mockRejectedValue(
      new InvalidStateError("Cannot release payment in state 'SUBMITTED'. Deal must be APPROVED."),
    );
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', authHeader({ userId: 'brand-1', email: 'b@b.com', role: 'BRAND' }))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when creator tries to complete', async () => {
    mockReleasePayment.mockRejectedValue(
      new UnauthorizedAccessError('Only the deal brand can release payment'),
    );
    const res = await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', authHeader({ userId: 'creator-1', email: 'c@c.com', role: 'CREATOR' }))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockReleasePayment.mockResolvedValue({
      dealId: 'deal-1',
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    await request(app)
      .post('/deals/deal-1/complete')
      .set('Authorization', authHeader({ userId: 'brand-2', email: 'b2@b.com', role: 'BRAND' }))
      .send({});

    expect(mockReleasePayment).toHaveBeenCalledWith(
      'deal-1',
      expect.objectContaining({ id: 'brand-2', role: 'BRAND' }),
    );
  });
});

// ---------------------------------------------------------------------------------------
// Tests — Not Found Handler
// ---------------------------------------------------------------------------------------

describe('Submission Routes — Not Found Handler', () => {
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
