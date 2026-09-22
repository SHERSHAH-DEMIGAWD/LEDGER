import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars-long-here';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-at-least-32-chars-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

// Exercise real HTTP/auth/service/repository/state-machine code. Only Prisma
// persistence is substituted, with serialized transactions and full rollback.
const db = vi.hoisted(() => ({
  deals: [] as any[], users: [] as any[], payments: [] as any[], events: [] as any[], failAudit: '',
}));
vi.mock('../../src/db.js', () => {
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]: any) => {
    if (key === 'AND') return value.every((condition: any) => matches(row, condition));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === 'object') {
      if (value.in) return value.in.includes(row[key]);
      if (value.mode === 'insensitive') return row[key].toLowerCase() === value.equals.toLowerCase();
    }
    return row[key] === value;
  });
  const project = (row: any) => row ? structuredClone({ ...row,
    brand: db.users.find((user) => user.id === row.brandId),
    creator: db.users.find((user) => user.id === row.creatorId) ?? null,
  }) : null;
  const client: any = {
    deal: {
      create: async ({ data }: any) => {
        const id = `deal-${db.deals.length + 1}`;
        const row = { ...data, id, creatorId: null, contractId: null, paymentRecordId: null,
          latestRevisionNote: null, latestRevisionNoteAuthorId: null, latestRevisionNoteAt: null,
          createdAt: new Date(), updatedAt: new Date(),
          versions: [{ ...data.versions.create, id: `${id}-v1`, dealId: id, createdAt: new Date() }],
        };
        db.deals.push(row);
        return project(row);
      },
      findUnique: async ({ where }: any) => project(db.deals.find((row) => matches(row, where))),
      findMany: async ({ where }: any) => db.deals.filter((row) => matches(row, where)).map(project),
      updateMany: async ({ where, data }: any) => {
        const row = db.deals.find((item) => matches(item, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: {
      findUnique: async ({ where }: any) => structuredClone(db.users.find((row) => matches(row, where)) ?? null),
      findMany: async ({ where, take }: any) => structuredClone(db.users.filter((row) => matches(row, where)).slice(0, take)),
    },
    payment: {
      create: async ({ data }: any) => {
        const row = { ...data, id: `payment-${db.payments.length + 1}` };
        db.payments.push(row);
        return structuredClone(row);
      },
      findUnique: async ({ where }: any) => structuredClone(db.payments.find((row) => matches(row, where)) ?? null),
      update: async ({ where, data }: any) => {
        const row = db.payments.find((item) => matches(item, where));
        if (!row) throw new Error('Payment not found');
        return Object.assign(row, data);
      },
      delete: async ({ where }: any) => {
        db.payments = db.payments.filter((row) => !matches(row, where));
      },
    },
    dealVersion: {
      findFirst: async ({ where, orderBy }: any) => {
        const versions = db.deals.flatMap((deal) => deal.versions).filter((row: any) => matches(row, where));
        if (orderBy?.versionNumber === 'desc') versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber);
        return structuredClone(versions[0] ?? null);
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (data.action === db.failAudit) throw new Error('Audit unavailable');
        const event = { ...data, id: `audit-${db.events.length}`, timestamp: new Date() };
        db.events.push(event);
        return event;
      },
      findMany: async ({ where }: any) => db.events.filter((row) => matches(row, where)).map((row) => ({
        ...row, actor: db.users.find((user) => user.id === row.actorId) ?? null,
      })),
    },
  };
  let queue = Promise.resolve();
  client.$transaction = (callback: any) => {
    const result = queue.then(async () => {
      const snapshot = structuredClone(db);
      try { return await callback(client); }
      catch (error) { Object.assign(db, snapshot); throw error; }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  return { prisma: client };
});

import dealRoutes from '../../src/routes/deal.routes.js';
import submissionRoutes from '../../src/routes/submission.routes.js';
import disputeRoutes from '../../src/routes/dispute.routes.js';
import paymentRoutes from '../../src/routes/payment.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { withMockUser } from '../../src/middleware/withMockUser.js';
import { submissionService } from '../../src/services/SubmissionService.js';
import { disputeService } from '../../src/services/DisputeService.js';

const brand = { id: '550e8400-e29b-41d4-a716-446655440001', role: 'BRAND' as const, email: 'brand-1@ledger.test' };
const creator = { id: '550e8400-e29b-41d4-a716-446655440004', role: 'CREATOR' as const, email: 'alex-1@ledger.test' };
const hrt = { id: '550e8400-e29b-41d4-a716-446655440008', role: 'HRT' as const, email: 'hrt@ledger.test' };
const admin = { id: '550e8400-e29b-41d4-a716-446655440007', role: 'ADMIN' as const, email: 'admin@ledger.test' };
const outsider = { id: '550e8400-e29b-41d4-a716-446655440005', role: 'CREATOR' as const, email: 'jordan-1@ledger.test' };
type Actor = typeof brand | typeof creator | typeof hrt | typeof admin | typeof outsider;
const terms = { title: 'Autumn launch film', description: 'Create the launch film for the autumn collection.',
  paymentAmount: 75000, currency: 'INR', deliverables: [{ title: 'Launch film', description: 'One edited 30-second film, shared with the brand outside Ledger.' }] };
const app = express();
app.use(express.json());
app.use(withMockUser);
app.use(['/deals', '/api/deals'], dealRoutes, submissionRoutes, disputeRoutes, paymentRoutes);
app.use(errorHandler);
const authorization = (actor: Actor) => `Bearer ${jwt.sign({ userId: actor.id, role: actor.role, email: actor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
const post = (path: string, actor: Actor, body = {}) => request(app).post(`/deals/review-deal/${path}`).set('Authorization', authorization(actor)).send(body);
const get = (path: string, actor: Actor = brand) => request(app).get(`/deals/review-deal${path}`).set('Authorization', authorization(actor));

function seed() {
  db.users = [brand, creator, hrt, admin, outsider].map((actor) => ({ ...actor, deletedAt: null,
    profile: { name: actor === brand ? 'Acme Studios' : actor === creator ? 'Alex Rivera' : actor === hrt ? 'HRT Reviewer' : actor === admin ? 'System Admin' : 'Jordan Lee' },
  }));
  db.deals = [{ id: 'review-deal', brandId: brand.id, creatorId: creator.id, status: 'IN_PROGRESS',
    fundingStatus: 'FUNDED', paymentRecordId: 'funded-payment', acceptedVersionNumber: 1, contractId: null,
    latestRevisionNote: null, latestRevisionNoteAuthorId: null, latestRevisionNoteAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    versions: [{ id: 'terms-v1', dealId: 'review-deal', versionNumber: 1, isPending: false, terms, createdAt: new Date() }],
  }];
  db.payments = [{ id: 'funded-payment', dealId: 'review-deal', paymentId: 'simulated-payment', status: 'SUCCEEDED', amount: 75000, currency: 'INR' }];
  db.events = [];
  db.failAudit = '';
}

beforeEach(() => { seed(); });
afterEach(() => { vi.useRealTimers(); });

describe('Delivery through real HTTP, services and repository with substituted Prisma', () => {
  it('submits, requests revision, resubmits, approves and completes with authoritative notes and audit', async () => {
    expect((await post('submit', creator, { note: 'Film shared for review.' })).body.data.status).toBe('SUBMITTED');
    expect((await post('request-revision', brand, { note: 'Shorten the introduction.' })).body.data.status).toBe('REVISION_REQUESTED');
    expect((await get('', creator)).body.data.deal).toMatchObject({ latestRevisionNote: 'Shorten the introduction.', latestRevisionNoteAuthorId: brand.id });
    expect((await post('resubmit', creator)).body.data.deal.status).toBe('SUBMITTED');
    expect((await post('approve', brand)).body.data.status).toBe('APPROVED');
    expect((await post('complete', brand)).body.data.status).toBe('COMPLETED');
    expect((await get('/state')).body.data.state).toMatchObject({ status: 'COMPLETED', isTerminal: true, availableActions: [] });
    expect((await get('')).body.data.deal).toMatchObject({ fundingStatus: 'FUNDED', acceptedVersionNumber: 1 });
    expect(db.events.map((event) => event.action)).toEqual(['DELIVERABLE.SUBMITTED', 'DELIVERABLE.REVISION_REQUESTED', 'DEAL.STATE_CHANGED', 'DELIVERABLE.APPROVED', 'PAYMENT.RELEASED']);
    expect(db.events[0].metadata.note).toBe('Film shared for review.');
    expect(db.events[2].metadata.action).toBe('RESUBMIT');
    expect((await post('submit', creator)).status).toBe(400);
    // Completion is a record update only; the existing simulated funding row is unchanged.
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0].status).toBe('SUCCEEDED');
  });

  it.each([hrt, admin])('resolves disputes as $role and returns to approval/completion', async (resolver) => {
    await post('submit', creator);
    expect((await post('dispute', brand, { note: 'Scope needs clarification.' })).body.data.status).toBe('DISPUTED');
    expect((await get('/state', hrt)).body.data.state.availableActions).toEqual(['RESOLVE']);
    expect((await post('resolve', resolver, { note: 'Use the agreed scope for review.' })).body.data.status).toBe('RESOLVED');
    expect((await get('', hrt)).body.data.deal.latestRevisionNote).toBe('Use the agreed scope for review.');
    expect((await post('transition', brand, { action: 'ACCEPT_RESOLUTION' })).body.data.deal.status).toBe('APPROVED');
    expect((await post('complete', brand)).body.data.status).toBe('COMPLETED');
    expect(db.events.filter((event) => event.action.startsWith('DISPUTE.'))).toHaveLength(2);
  });

  it('preserves the existing resolved-to-rework and direct-completion transitions', async () => {
    await post('submit', creator);
    await post('dispute', brand, { note: 'Rework needed.' });
    await post('resolve', hrt, { note: 'Revise the introduction.' });
    expect((await post('transition', creator, { action: 'REQUEST_REWORK' })).body.data.deal.status).toBe('IN_PROGRESS');
    await post('submit', creator);
    await post('dispute', brand, { note: 'Review again.' });
    await post('resolve', hrt, { note: 'Both participants can close the record.' });
    expect((await post('transition', brand, { action: 'RELEASE_PAYMENT' })).body.data.deal.status).toBe('COMPLETED');
  });

  it('rejects unauthorized roles, unrelated creators, missing notes and invalid transitions', async () => {
    expect((await request(app).post('/deals/review-deal/submit')).status).toBe(401);
    for (const actor of [brand, outsider, hrt, admin]) expect((await post('submit', actor)).status).toBe(403);
    expect((await post('complete', brand)).status).toBe(400);
    await post('submit', creator);
    for (const action of ['request-revision', 'approve', 'complete', 'dispute']) {
      expect((await post(action, creator, { note: 'Not authorized.' })).status).toBe(403);
    }
    for (const action of ['request-revision', 'dispute']) expect((await post(action, brand)).status).toBe(400);
    expect((await post('resubmit', creator)).status).toBe(400);
    await post('dispute', brand, { note: 'Review scope.' });
    for (const actor of [brand, creator]) expect((await post('resolve', actor, { note: 'Not authorized.' })).status).toBe(403);
    expect((await post('resolve', hrt)).status).toBe(400);
    expect(db.events).toHaveLength(2);
  });

  it('cannot bypass required lifecycle notes through the generic transition route', async () => {
    db.deals[0].status = 'SUBMITTED';
    for (const action of ['REQUEST_REVISION', 'RAISE_DISPUTE'] as const) {
      const response = await post('transition', brand, { action });
      expect(response.status).toBe(400);
      expect(db.deals[0].status).toBe('SUBMITTED');
      expect(db.events).toEqual([]);
    }

    db.deals[0].status = 'DISPUTED';
    const response = await post('transition', hrt, { action: 'RESOLVE' });
    expect(response.status).toBe(400);
    expect(db.deals[0].status).toBe('DISPUTED');
    expect(db.events).toEqual([]);
  });

  it.each([
    ['IN_PROGRESS', 'submit', creator, 'DELIVERABLE.SUBMITTED'],
    ['SUBMITTED', 'request-revision', brand, 'DELIVERABLE.REVISION_REQUESTED'],
    ['SUBMITTED', 'approve', brand, 'DELIVERABLE.APPROVED'],
    ['APPROVED', 'complete', brand, 'PAYMENT.RELEASED'],
    ['SUBMITTED', 'dispute', brand, 'DISPUTE.RAISED'],
    ['DISPUTED', 'resolve', hrt, 'DISPUTE.RESOLVED'],
  ] as const)('rolls back %s / %s when its audit fails', async (status, path, actor, event) => {
    db.deals[0].status = status;
    db.failAudit = event;
    expect((await post(path, actor, { note: 'Must commit with the record.' })).status).toBe(500);
    expect(db.deals[0]).toMatchObject({ status, latestRevisionNote: null });
    expect(db.events).toEqual([]);
  });

  it('rejects competing approval, revision and dispute writes even in the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));
    db.deals[0].status = 'SUBMITTED';
    db.deals[0].updatedAt = new Date();
    const results = await Promise.allSettled([
      submissionService.requestRevision('review-deal', 'Revision', brand),
      submissionService.approveDeliverable('review-deal', brand),
      disputeService.raiseDispute('review-deal', 'Dispute', brand),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(db.events).toHaveLength(1);
    expect(db.events[0].metadata.toStatus).toBe(db.deals[0].status);
  });
});
