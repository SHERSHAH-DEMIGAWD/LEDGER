import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// Real routes, services, repository and state machine; only persistence/provider
// are substituted. Rollback is modeled so failed verification cannot commit work.
const db = vi.hoisted(() => ({ deal: {} as any, payment: null as any, events: [] as any[] }));
vi.mock('../../src/db.js', () => {
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]) =>
    value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value);
  const client: any = {
    deal: {
      findUnique: async () => structuredClone(db.deal),
      updateMany: async ({ where, data }: any) => {
        if (!matches(db.deal, where)) return { count: 0 };
        Object.assign(db.deal, data);
        return { count: 1 };
      },
    },
    payment: {
      create: async ({ data }: any) => {
        if (db.payment) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate payment', { code: 'P2002', clientVersion: '5.22.0' });
        }
        return (db.payment = { id: 'payment-row', ...data });
      },
      findUnique: async ({ where }: any) => db.payment && matches(db.payment, where) ? structuredClone(db.payment) : null,
      update: async ({ data }: any) => Object.assign(db.payment, data),
      delete: async () => { db.payment = null; },
    },
    dealVersion: {
      findUnique: async ({ where }: any) => db.deal.versions.find((v: any) => v.versionNumber === where.dealId_versionNumber.versionNumber),
      findFirst: async ({ where, orderBy }: any) => {
        const versions = db.deal.versions.filter((v: any) => matches(v, where));
        if (orderBy?.versionNumber === 'desc') versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber);
        return versions[0] ?? null;
      },
    },
    auditLog: { create: async ({ data }: any) => { db.events.push(data); return data; } },
  };
  // Model serialization on the shared deal row, including loser rollback.
  let transactionQueue = Promise.resolve();
  client.$transaction = (fn: any) => {
    const result = transactionQueue.then(async () => {
      const snapshot = structuredClone(db);
      try { return await fn(client); }
      catch (error) {
        // A losing row transaction must not erase a concurrent service's
        // audit append, which is outside that row transaction.
        db.deal = snapshot.deal;
        db.payment = snapshot.payment;
        throw error;
      }
    });
    transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  return { prisma: client };
});

import { PaymentService } from '../../src/services/PaymentService.js';
import { transitionDeal } from '../../src/services/DealService.js';
import { dealRepository } from '../../src/repositories/DealRepository.js';
import dealRoutes from '../../src/routes/deal.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { prisma } from '../../src/db.js';

const brand = { id: 'brand', role: 'BRAND' as const };
const creator = { id: 'creator', role: 'CREATOR' as const };
const provider = {
  createIntent: vi.fn(),
  createIdempotentIntent: vi.fn(),
  confirm: vi.fn(),
};
const service = new PaymentService(provider);
afterEach(() => { vi.useRealTimers(); });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.deal = {
    id: 'deal', brandId: 'brand', creatorId: 'creator', status: 'ACCEPTED',
    fundingStatus: 'NOT_FUNDED', paymentRecordId: null, acceptedVersionNumber: 1,
    contractId: null, latestRevisionNote: null, latestRevisionNoteAuthorId: null,
    latestRevisionNoteAt: null, createdAt: new Date(0), updatedAt: new Date(0),
    versions: [{ id: 'v1', dealId: 'deal', versionNumber: 1, isPending: false, createdAt: new Date(0),
      terms: { title: 'Deal', description: 'Delivery', deliverables: [{ title: 'Video', description: 'Video' }], paymentAmount: 50000, currency: 'USD' } }],
  };
  db.payment = null;
  db.events = [];
  provider.createIdempotentIntent.mockImplementation(async (id, amount, currency) => ({ id, amount, currency, status: 'PENDING', metadata: {} }));
  provider.confirm.mockResolvedValue({ id: 'provider-payment', amount: 50000, currency: 'USD', status: 'SUCCEEDED', metadata: {} });
});

describe('verified funding lifecycle', () => {
  it('charges accepted v2 rather than a newer rejected proposal', async () => {
    db.deal.versions.push(
      { ...db.deal.versions[0], id: 'v2', versionNumber: 2, terms: { ...db.deal.versions[0].terms, paymentAmount: 65000 } },
      { ...db.deal.versions[0], id: 'v3', versionNumber: 3, isPending: false, terms: { ...db.deal.versions[0].terms, paymentAmount: 99000 } },
    );
    db.deal.acceptedVersionNumber = 2;
    await service.fundDeal('deal', brand);
    expect(db.payment.amount).toBe(65000);
    expect(provider.createIdempotentIntent).toHaveBeenCalledWith(expect.any(String), 65000, 'USD', expect.any(Object));
  });

  it('blocks funding while a term proposal is pending', async () => {
    db.deal.versions.push({
      ...db.deal.versions[0], id: 'v2', versionNumber: 2, isPending: true,
      terms: { ...db.deal.versions[0].terms, paymentAmount: 90000 },
    });
    await expect(service.fundDeal('deal', brand)).rejects.toThrow(
      'Cannot fund a deal while a term proposal is pending',
    );
    expect(db.payment).toBeNull();
    expect(provider.createIdempotentIntent).not.toHaveBeenCalled();
  });

  it('concurrent funding attempts confirm one payment only', async () => {
    const results = await Promise.allSettled([service.fundDeal('deal', brand), service.fundDeal('deal', brand)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(provider.confirm).toHaveBeenCalledTimes(1);
    expect(db.payment.status).toBe('SUCCEEDED');
    expect(db.deal).toMatchObject({ status: 'FUNDED', fundingStatus: 'FUNDED' });
  });

  it('concurrent START attempts in the same millisecond produce one transition', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
    await service.fundDeal('deal', brand);
    const results = await Promise.allSettled([transitionDeal('deal', 'START', creator), transitionDeal('deal', 'START', brand)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.deal.status).toBe('IN_PROGRESS');
    expect(db.events.filter((e) => e.action === 'DEAL.STATE_CHANGED')).toHaveLength(1);
  });

  it('rejects direct work and rework from ACCEPTED even with a successful payment row', async () => {
    db.deal.paymentRecordId = 'payment-row';
    db.payment = { id: 'payment-row', dealId: 'deal', status: 'SUCCEEDED' };
    for (const action of ['START', 'REQUEST_REWORK'] as const) {
      await expect(transitionDeal('deal', action, creator)).rejects.toThrow();
    }
    expect(db.deal.status).toBe('ACCEPTED');
  });
  it('funds accepted terms atomically and permits the creator to start work', async () => {
    await service.fundDeal('deal', brand);
    expect(db.payment).toMatchObject({ status: 'SUCCEEDED', amount: 50000, paymentId: 'provider-payment' });
    expect(db.deal).toMatchObject({ status: 'FUNDED', fundingStatus: 'FUNDED', paymentRecordId: 'payment-row' });
    expect(await service.getPaymentStatus('deal', 'creator', 'CREATOR')).toMatchObject({ paymentStatus: 'SUCCEEDED', fundingStatus: 'FUNDED' });
    await transitionDeal('deal', 'START', creator);
    expect(db.deal.status).toBe('IN_PROGRESS');
  });

  it('does not advertise funding or allow work during provider confirmation', async () => {
    provider.confirm.mockImplementation(async () => {
      expect(db.deal).toMatchObject({ status: 'ACCEPTED', fundingStatus: 'NOT_FUNDED' });
      expect(db.payment.status).toBe('PENDING');
      expect(await service.getPaymentStatus('deal', 'brand', 'BRAND')).toMatchObject({ fundingStatus: 'NOT_FUNDED', paymentStatus: 'PENDING', paymentId: null });
      await expect(transitionDeal('deal', 'START', creator)).rejects.toThrow();
      return { id: 'provider-payment', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} };
    });
    await service.fundDeal('deal', brand);
    expect(db.deal.status).toBe('FUNDED');
  });

  it('failed confirmation leaves ACCEPTED/NOT_FUNDED and allows retry', async () => {
    provider.confirm.mockRejectedValueOnce(new Error('Payment failed'));
    await expect(service.fundDeal('deal', brand)).rejects.toThrow('Payment failed');
    expect(db.deal).toMatchObject({ status: 'ACCEPTED', fundingStatus: 'NOT_FUNDED', paymentRecordId: null });
    expect(db.payment).toBeNull();
    expect(db.events).toHaveLength(0);
    await service.fundDeal('deal', brand);
    expect(db.deal.status).toBe('FUNDED');
  });

  it('rejects generic FUND over HTTP without changing state or calling the provider', async () => {
    const app = express();
    app.use(express.json());
    app.use('/deals', dealRoutes);
    app.use(errorHandler);
    const token = jwt.sign({ userId: 'brand', email: 'brand@ledger.test', role: 'BRAND' }, process.env.JWT_SECRET!);
    const result = await request(app).post('/deals/deal/transition').set('Authorization', `Bearer ${token}`).send({ action: 'FUND' });
    expect(result.status).toBe(400);
    expect(db.deal.status).toBe('ACCEPTED');
    expect(db.payment).toBeNull();
    expect(provider.confirm).not.toHaveBeenCalled();
  });

  it.each(['NOT_FUNDED', 'REFUNDED'])('blocks work with funding status %s', async (fundingStatus) => {
    db.deal.status = 'FUNDED';
    db.deal.fundingStatus = fundingStatus;
    await expect(transitionDeal('deal', 'START', creator)).rejects.toThrow('successfully funded');
    expect(db.deal.status).toBe('FUNDED');
  });

  it.each([null, 'PENDING', 'REFUNDED'])('blocks work with missing/unsuccessful payment %s', async (status) => {
    db.deal.status = 'FUNDED';
    db.deal.fundingStatus = 'FUNDED';
    db.deal.paymentRecordId = 'payment-row';
    db.payment = status ? { id: 'payment-row', dealId: 'deal', status } : null;
    await expect(transitionDeal('deal', 'START', creator)).rejects.toThrow('successfully funded');
    expect(db.deal.status).toBe('FUNDED');
  });

  it('repository rolls back work if payment validation fails inside the transaction', async () => {
    db.deal.status = 'FUNDED';
    db.deal.fundingStatus = 'FUNDED';
    await expect(dealRepository.updateStatus('deal', 'IN_PROGRESS', db.deal.updatedAt, 'creator', 'CREATOR')).rejects.toThrow('successfully funded');
    expect(db.deal.status).toBe('FUNDED');
  });

  it('preserves role and participant authorization', async () => {
    await expect(service.fundDeal('deal', creator)).rejects.toThrow();
    await expect(service.fundDeal('deal', { id: 'outsider', role: 'BRAND' })).rejects.toThrow();
    await service.fundDeal('deal', brand);
    await expect(transitionDeal('deal', 'START', { id: 'outsider', role: 'CREATOR' })).rejects.toThrow();
    expect(db.deal.status).toBe('FUNDED');
  });

  it('retains a confirmed claim if atomic finalization fails, blocking a blind retry', async () => {
    provider.confirm.mockImplementation(async () => {
      db.deal.updatedAt = new Date(0); // concurrent terms update
      return { id: 'provider-payment', status: 'SUCCEEDED', amount: 50000, currency: 'USD', metadata: {} };
    });
    await expect(service.fundDeal('deal', brand)).rejects.toThrow('Reconciliation required');
    expect(db.deal).toMatchObject({ status: 'ACCEPTED', fundingStatus: 'NOT_FUNDED' });
    expect(db.payment.status).toBe('PENDING');
    await expect(service.fundDeal('deal', brand)).rejects.toThrow('payment record already exists');
    expect(provider.confirm).toHaveBeenCalledTimes(1);
  });

  it('rolls back payment success and lifecycle together if the funding audit fails', async () => {
    vi.spyOn(prisma.auditLog, 'create').mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.fundDeal('deal', brand)).rejects.toThrow('Reconciliation required');
    expect(db.deal).toMatchObject({ status: 'ACCEPTED', fundingStatus: 'NOT_FUNDED', paymentRecordId: null });
    expect(db.payment.status).toBe('PENDING');
    expect(db.events).toHaveLength(0);
  });
});
