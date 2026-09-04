/**
 * Integration tests for Payment routes.
 *
 * Tests the HTTP layer for:
 * - POST /deals/:id/fund       — fund a deal
 * - POST /deals/:id/refund     — refund a funded deal
 * - GET  /deals/:id/payment-status — get payment status
 *
 * Strategy: Mock the PaymentService module to control its behavior. Tests
 * focus on the HTTP shape: authentication, status codes, error mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------------------
// Mock the PaymentService module
// ---------------------------------------------------------------------------------------

const mockFundDeal = vi.fn();
const mockRefundDeal = vi.fn();
const mockGetPaymentStatus = vi.fn();

vi.mock('../../src/services/PaymentService.js', () => ({
  paymentService: {
    fundDeal: (...args: unknown[]) => mockFundDeal(...args),
    refundDeal: (...args: unknown[]) => mockRefundDeal(...args),
    getPaymentStatus: (...args: unknown[]) => mockGetPaymentStatus(...args),
  },
}));

// Now safe to import
const { default: paymentRouter } = await import('../../src/routes/payment.routes.js');
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
import { ConflictError } from '../../src/middleware/errorHandler.js';

// ---------------------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------------------

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/deals', paymentRouter);
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
// Tests — Authentication
// ---------------------------------------------------------------------------------------

describe('Payment Routes — Authentication', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('POST /deals/:id/fund returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/fund').send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_010');
  });

  it('POST /deals/:id/refund returns 401 without auth', async () => {
    const res = await request(app).post('/deals/deal-1/refund').send({});
    expect(res.status).toBe(401);
  });

  it('GET /deals/:id/payment-status returns 401 without auth', async () => {
    const res = await request(app).get('/deals/deal-1/payment-status');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/fund
// ---------------------------------------------------------------------------------------

describe('Payment Routes — POST /deals/:id/fund', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 201 with funded status on success', async () => {
    mockFundDeal.mockResolvedValue({
      dealId: 'deal-1',
      paymentId: 'payment-1',
      fundingStatus: 'FUNDED',
    });
    const res = await request(app)
      .post('/deals/deal-1/fund')
      .set('Authorization', authHeader());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fundingStatus).toBe('FUNDED');
    expect(res.body.data.paymentId).toBe('payment-1');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockFundDeal.mockResolvedValue({
      dealId: 'deal-1',
      paymentId: 'payment-1',
      fundingStatus: 'FUNDED',
    });
    await request(app)
      .post('/deals/deal-1/fund')
      .set(
        'Authorization',
        authHeader({ userId: 'brand-2', email: 'b2@test.com', role: 'BRAND' }),
      );

    expect(mockFundDeal).toHaveBeenCalledWith(
      'deal-1',
      expect.objectContaining({ id: 'brand-2', role: 'BRAND' }),
    );
  });

  it('returns 400 when service throws InvalidStateError (wrong state)', async () => {
    mockFundDeal.mockRejectedValue(
      new InvalidStateError("Cannot fund deal in state 'DRAFT'"),
    );
    const res = await request(app)
      .post('/deals/deal-1/fund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when service throws UnauthorizedAccessError', async () => {
    mockFundDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only the deal brand can fund this deal'),
    );
    const res = await request(app)
      .post('/deals/deal-1/fund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_011');
  });

  it('returns 409 when service throws ConflictError (already funded)', async () => {
    mockFundDeal.mockRejectedValue(
      new ConflictError("Deal has already been funded"),
    );
    const res = await request(app)
      .post('/deals/deal-1/fund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RES_002');
  });

  it('returns 400 when service throws NotFound', async () => {
    mockFundDeal.mockRejectedValue(
      new InvalidStateError("Deal 'nonexistent' not found"),
    );
    const res = await request(app)
      .post('/deals/nonexistent/fund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------
// Tests — POST /deals/:id/refund
// ---------------------------------------------------------------------------------------

describe('Payment Routes — POST /deals/:id/refund', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with refunded status on success', async () => {
    mockRefundDeal.mockResolvedValue({
      dealId: 'deal-1',
      paymentId: 'refund-1',
      fundingStatus: 'REFUNDED',
    });
    const res = await request(app)
      .post('/deals/deal-1/refund')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fundingStatus).toBe('REFUNDED');
    expect(res.body.data.paymentId).toBe('refund-1');
  });

  it('returns 400 when deal is not in FUNDED state', async () => {
    mockRefundDeal.mockRejectedValue(
      new InvalidStateError("Cannot refund deal with fundingStatus 'NOT_FUNDED'"),
    );
    const res = await request(app)
      .post('/deals/deal-1/refund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEAL_001');
  });

  it('returns 403 when service throws UnauthorizedAccessError', async () => {
    mockRefundDeal.mockRejectedValue(
      new UnauthorizedAccessError('Only the deal brand can refund this deal'),
    );
    const res = await request(app)
      .post('/deals/deal-1/refund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 409 when service throws ConflictError (concurrent refund — P0-2 fix)', async () => {
    // P0-2: The old code threw InvalidStateError on concurrent refund,
    // which mapped to HTTP 500. The fix makes it throw ConflictError (409).
    mockRefundDeal.mockRejectedValue(
      new ConflictError('Deal was modified by another request. Please reload and retry.'),
    );
    const res = await request(app)
      .post('/deals/deal-1/refund')
      .set('Authorization', authHeader());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RES_002');
  });
});

// ---------------------------------------------------------------------------------------
// Tests — GET /deals/:id/payment-status
// ---------------------------------------------------------------------------------------

describe('Payment Routes — GET /deals/:id/payment-status', () => {
  let app: Application;

  beforeEach(() => {
    app = buildTestApp();
    vi.clearAllMocks();
  });

  it('returns 200 with payment status', async () => {
    mockGetPaymentStatus.mockResolvedValue({
      dealId: 'deal-1',
      fundingStatus: 'FUNDED',
      paymentId: null,
    });
    const res = await request(app)
      .get('/deals/deal-1/payment-status')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fundingStatus).toBe('FUNDED');
  });

  it('returns NOT_FUNDED for an unfunded deal', async () => {
    mockGetPaymentStatus.mockResolvedValue({
      dealId: 'deal-1',
      fundingStatus: 'NOT_FUNDED',
      paymentId: null,
    });
    const res = await request(app)
      .get('/deals/deal-1/payment-status')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.fundingStatus).toBe('NOT_FUNDED');
  });

  it('returns the actual provider paymentId for a funded deal (P1-5 fix)', async () => {
    // P1-5: Previously paymentId was always null. Now it is the
    // provider's payment/charge ID, persisted on the Payment record.
    mockGetPaymentStatus.mockResolvedValue({
      dealId: 'deal-1',
      fundingStatus: 'FUNDED',
      paymentId: 'sim_payment_xxx',
    });
    const res = await request(app)
      .get('/deals/deal-1/payment-status')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe('sim_payment_xxx');
  });

  it('passes user ID and role from JWT to service', async () => {
    mockGetPaymentStatus.mockResolvedValue({
      dealId: 'deal-1',
      fundingStatus: 'NOT_FUNDED',
      paymentId: null,
    });
    await request(app)
      .get('/deals/deal-1/payment-status')
      .set(
        'Authorization',
        authHeader({ userId: 'creator-1', email: 'c@test.com', role: 'CREATOR' }),
      );

    expect(mockGetPaymentStatus).toHaveBeenCalledWith(
      'deal-1',
      'creator-1',
      'CREATOR',
    );
  });
});
