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
import invitationRoutes from '../../src/routes/invitation.routes.js';
import termsRoutes from '../../src/routes/terms.routes.js';
import paymentRoutes from '../../src/routes/payment.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { withMockUser } from '../../src/middleware/withMockUser.js';
import { config } from '../../src/config.js';
import { createDeal, inviteCreator, transitionDeal } from '../../src/services/DealService.js';

const brand = { id: '11111111-1111-4111-8111-111111111111', email: 'brand@example.com', role: 'BRAND' as const };
const creator = { id: '22222222-2222-4222-8222-222222222222', email: 'creator@example.com', role: 'CREATOR' as const };
const otherCreator = { id: '33333333-3333-4333-8333-333333333333', email: 'other@example.com', role: 'CREATOR' as const };
const otherBrand = { id: '44444444-4444-4444-8444-444444444444', email: 'other-brand@example.com', role: 'BRAND' as const };
const terms = { title: 'Launch film', description: 'A film for the product launch.',
  deliverables: [{ title: 'Film', description: 'One edited film', deadline: '2026-10-01' }],
  paymentAmount: 75000, currency: 'USD', timeline: { endDate: '2026-10-01' },
};
const app = express();
app.use(express.json());
app.use(withMockUser);
app.use('/deals', dealRoutes, termsRoutes, paymentRoutes);
app.use('/invitations', invitationRoutes);
app.use(errorHandler);
const authorization = (actor = brand) => `Bearer ${jwt.sign({ userId: actor.id, email: actor.email, role: actor.role }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
const post = (path: string, actor: typeof brand | typeof creator = brand, payload = {}) =>
  request(app).post(path).set('Authorization', authorization(actor as typeof brand)).send(payload);
const get = (path: string, actor: typeof brand | typeof creator = brand) =>
  request(app).get(path).set('Authorization', authorization(actor as typeof brand));
const initialProduction = config.server.isProduction;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));
  db.deals = [];
  db.payments = [];
  db.events = [];
  db.failAudit = '';
  db.users = [brand, creator, otherCreator, otherBrand].map((user) => ({ ...user,
    deletedAt: null, passwordHash: 'must-never-leak', profile: { name: user.role === 'BRAND' ? 'Brand Person' : 'Creator Person', company: 'Company' },
  }));
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(config.server, 'isProduction', { value: initialProduction });
});

async function draft() {
  const response = await post('/deals', brand, { terms });
  expect(response.status).toBe(201);
  return response.body.data.deal.id as string;
}
async function pending() {
  const id = await draft();
  expect((await post(`/deals/${id}/invite`, brand, { creatorEmail: creator.email })).status).toBe(200);
  return id;
}

describe('Create → invite → authoritative response', () => {
  it('creates, invites by exact email, accepts, and exposes accepted terms plus the funding action to the brand', async () => {
    const id = await draft();
    const created = (await get(`/deals/${id}`)).body.data.deal;
    expect(created).toMatchObject({ status: 'DRAFT', creatorId: null, creator: null, acceptedVersionNumber: 1,
      brand: { id: brand.id, name: 'Brand Person', email: brand.email } });
    expect(JSON.stringify(created)).not.toContain('must-never-leak');
    const invite = await post(`/deals/${id}/invite`, brand, { creatorEmail: ' CREATOR@EXAMPLE.COM ' });
    expect(invite.status).toBe(200);
    expect(invite.body.data.deal).toMatchObject({ status: 'PENDING_ACCEPTANCE', creator: { name: 'Creator Person' } });
    const inbox = await get('/invitations', creator);
    expect(inbox.body.data.invitations).toHaveLength(1);
    expect(inbox.body.data.invitations[0]).toMatchObject({ id, terms, brand: { name: 'Brand Person' } });
    expect((await get('/invitations', otherCreator)).body.data.invitations).toEqual([]);
    expect((await post(`/invitations/${id}/accept`, creator)).body.data.deal.status).toBe('ACCEPTED');
    expect((await get('/invitations', creator)).body.data.invitations).toEqual([]);
    expect((await get(`/deals/${id}/state`)).body.data.state).toMatchObject({
      status: 'ACCEPTED', availableActions: ['FUND'], updatedAt: new Date().toISOString(),
    });
    expect((await get(`/deals/${id}/terms`)).body.data).toMatchObject({
      terms: { authoritativeVersionNumber: 1, authoritativeTerms: terms, pendingTerms: null },
    });
    const history = (await get(`/deals/${id}/history`)).body.data.history;
    expect(history.map((event: any) => event.action)).toEqual(['DEAL.CREATED', 'DEAL.CREATOR_INVITED', 'DEAL.STATE_CHANGED', 'INVITATION.ACCEPTED']);
    expect(history.at(-1).actor).toEqual({ id: creator.id, name: 'Creator Person', email: creator.email });
  });

  it('declines terminally with no funding/start/reinvite actions or remaining inbox item', async () => {
    const id = await pending();
    expect((await post(`/invitations/${id}/decline`, creator)).body.data.deal.status).toBe('DECLINED');
    expect((await get(`/deals/${id}/state`)).body.data.state).toMatchObject({ status: 'DECLINED', isTerminal: true, availableActions: [] });
    expect((await get('/invitations', creator)).body.data.invitations).toEqual([]);
    for (const action of ['ACCEPT', 'FUND', 'START']) {
      expect((await post(`/deals/${id}/transition`, creator, { action })).status).toBe(400);
    }
    expect((await post(`/deals/${id}/invite`, brand, { creatorId: otherCreator.id })).status).toBe(400);
    expect(db.events.filter((event) => event.action === 'INVITATION.DECLINED')).toHaveLength(1);
  });

  it('continues a newly created and accepted invitation through the existing simulated funding and start routes', async () => {
    const id = await pending();
    expect((await post(`/deals/${id}/fund`, brand)).status).toBe(400);
    expect((await post(`/invitations/${id}/accept`, creator)).status).toBe(200);
    expect((await post(`/deals/${id}/transition`, creator, { action: 'START' })).status).toBe(400);
    expect((await post(`/deals/${id}/fund`, creator)).status).toBe(403);

    const funded = await post(`/deals/${id}/fund`, brand);
    expect(funded.status).toBe(201);
    expect(funded.body.data).toMatchObject({ dealId: id, fundingStatus: 'FUNDED' });
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]).toMatchObject({ dealId: id, amount: terms.paymentAmount, currency: terms.currency, status: 'SUCCEEDED' });
    expect((await get(`/deals/${id}/state`, creator)).body.data.state).toMatchObject({ status: 'FUNDED', availableActions: ['START'] });
    expect((await get(`/deals/${id}/payment-status`, creator)).body.data).toMatchObject({ fundingStatus: 'FUNDED', paymentStatus: 'SUCCEEDED' });

    expect((await post(`/deals/${id}/transition`, creator, { action: 'START' })).status).toBe(200);
    expect((await get(`/deals/${id}`, brand)).body.data.deal).toMatchObject({ status: 'IN_PROGRESS', fundingStatus: 'FUNDED', acceptedVersionNumber: 1 });
    expect((await get(`/deals/${id}/terms`, brand)).body.data.terms.authoritativeTerms).toEqual(terms);
    expect(db.events.filter((event) => event.dealId === id).map((event) => event.action)).toEqual([
      'DEAL.CREATED', 'DEAL.CREATOR_INVITED', 'DEAL.STATE_CHANGED', 'INVITATION.ACCEPTED', 'PAYMENT.FUNDED', 'DEAL.STATE_CHANGED',
    ]);
  });

  it('does not expose a later pending or rejected terms proposal as the invitation terms', async () => {
    const id = await pending();
    for (const isPending of [true, false]) {
      db.deals[0].versions[1] = { ...db.deals[0].versions[0], versionNumber: 2, isPending, terms: { ...terms, title: 'Unaccepted', paymentAmount: 99999 } };
      const inbox = (await get('/invitations', creator)).body.data.invitations;
      expect(inbox[0]).toMatchObject({ id, terms, latestVersionNumber: 1 });
    }
    expect((await post(`/invitations/${id}/accept`, creator)).body.data.deal.acceptedVersionNumber).toBe(1);
  });
});

describe('Server-side validation and authorization', () => {
  it('ignores development identity headers in production and uses the verified token identity', async () => {
    Object.defineProperty(config.server, 'isProduction', { value: true });
    const spoofed = await request(app).post('/deals').set('X-Mock-User', `BRAND:${brand.id}`).send({ terms });
    expect(spoofed.status).toBe(401);
    expect(db.deals).toEqual([]);

    const authenticated = await request(app).post('/deals')
      .set('Authorization', authorization(brand))
      .set('X-Mock-User', `CREATOR:${creator.id}`).send({ terms });
    expect(authenticated.status).toBe(201);
    expect(authenticated.body.data.deal.brandId).toBe(brand.id);
  });

  it('checks the database role for development persona requests', async () => {
    Object.defineProperty(config.server, 'isProduction', { value: false });
    const mismatch = await request(app).post('/deals').set('X-Mock-User', `BRAND:${creator.id}`).send({ terms });
    expect(mismatch.status).toBe(403);
    expect(db.deals).toEqual([]);
    const matching = await request(app).post('/deals').set('X-Mock-User', `BRAND:${brand.id}`).send({ terms });
    expect(matching.status).toBe(201);
    expect(matching.body.data.deal.brandId).toBe(brand.id);
  });

  it('requires authenticated brand creation and does not trust body actor claims', async () => {
    expect((await request(app).post('/deals').send({ terms })).status).toBe(401);
    expect((await post('/deals', creator, { terms, role: 'BRAND', brandId: brand.id })).status).toBe(400);
    expect(db.deals).toEqual([]);
    expect(db.events).toEqual([]);
    const response = await post('/deals', brand, { terms, brandId: otherBrand.id });
    expect(response.body.data.deal.brandId).toBe(brand.id);
  });

  it('requires one valid recipient and preserves UUID invitation compatibility', async () => {
    const id = await draft();
    for (const payload of [{}, { creatorEmail: 'creator' }, { creatorId: 'wrong' }, { creatorId: creator.id, creatorEmail: creator.email }]) {
      expect((await post(`/deals/${id}/invite`, brand, payload)).status).toBe(400);
    }
    expect((await post(`/deals/${id}/invite`, brand, { creatorId: creator.id })).status).toBe(200);
    expect((await post(`/deals/${id}/invite`, brand, { creatorId: creator.id })).status).toBe(400);
    expect(db.events.filter((event) => event.action === 'DEAL.CREATOR_INVITED')).toHaveLength(1);
  });

  it('rejects unknown, wrong-role, deleted, partial and ambiguous email recipients', async () => {
    const id = await draft();
    db.users.find((user) => user.id === otherCreator.id).deletedAt = new Date();
    for (const creatorEmail of ['missing@example.com', brand.email, otherCreator.email, 'creator@exampl.com']) {
      expect((await post(`/deals/${id}/invite`, brand, { creatorEmail })).status).toBe(400);
    }
    db.users.push({ ...db.users[1], id: 'duplicate', email: 'CREATOR@EXAMPLE.COM' });
    expect((await post(`/deals/${id}/invite`, brand, { creatorEmail: creator.email })).status).toBe(400);
    expect(db.deals[0]).toMatchObject({ status: 'DRAFT', creatorId: null });
  });

  it('rejects another brand inviting, another creator responding, and body identity spoofing', async () => {
    const id = await draft();
    expect((await post(`/deals/${id}/invite`, otherBrand, { creatorEmail: creator.email })).status).toBe(403);
    expect((await post(`/deals/${id}/invite`, creator, { creatorId: creator.id })).status).toBe(403);
    await post(`/deals/${id}/invite`, brand, { creatorId: creator.id });
    for (const actor of [otherCreator, brand]) {
      for (const action of ['accept', 'decline']) {
        expect((await post(`/invitations/${id}/${action}`, actor, { creatorId: creator.id, role: 'CREATOR' })).status).toBe(403);
      }
    }
    expect((await get(`/deals/${id}`, otherCreator)).status).toBe(403);
    expect(db.events.filter((event) => event.action.startsWith('INVITATION.'))).toEqual([]);
    expect(db.deals[0].status).toBe('PENDING_ACCEPTANCE');
  });

  it('blocks generic submission that would create a creatorless invitation', async () => {
    const id = await draft();
    const response = await post(`/deals/${id}/transition`, brand, { action: 'SUBMIT_FOR_ACCEPTANCE' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('/invite');
    expect(db.deals[0]).toMatchObject({ status: 'DRAFT', creatorId: null });
    expect(db.events).toHaveLength(1);
  });
});

describe('Invitation atomicity and conflicting actions', () => {
  it('serializes conflicting invites despite identical millisecond timestamps', async () => {
    const id = await draft();
    const results = await Promise.allSettled([inviteCreator(id, creator.id, brand), inviteCreator(id, otherCreator.id, brand)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(db.deals[0].status).toBe('PENDING_ACCEPTANCE');
    const events = db.events.filter((event) => event.action === 'DEAL.CREATOR_INVITED');
    expect(events).toHaveLength(1);
    expect(events[0].metadata.creatorId).toBe(db.deals[0].creatorId);
  });

  it('serializes accept versus decline and records only the winning outcome', async () => {
    const id = await pending();
    const results = await Promise.allSettled([transitionDeal(id, 'ACCEPT', creator), transitionDeal(id, 'DECLINE', creator)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(db.events.filter((event) => event.action === 'DEAL.STATE_CHANGED')).toHaveLength(1);
    const events = db.events.filter((event) => event.action.startsWith('INVITATION.'));
    expect(events).toHaveLength(1);
    expect(events[0].metadata.toStatus).toBe(db.deals[0].status);
  });

  it('serializes cancel versus invite without partially assigning a cancelled draft', async () => {
    const id = await draft();
    const results = await Promise.allSettled([transitionDeal(id, 'CANCEL', brand), inviteCreator(id, creator.id, brand)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    if (db.deals[0].status === 'CANCELLED') expect(db.deals[0].creatorId).toBeNull();
    expect(db.events).toHaveLength(2);
  });

  it.each(['ACCEPT', 'DECLINE'] as const)('gives generic %s the same audit events as the invitation route', async (action) => {
    const id = await pending();
    expect((await post(`/deals/${id}/transition`, creator, { action })).status).toBe(200);
    expect(db.events.filter((event) => event.action === `INVITATION.${action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'}`)).toHaveLength(1);
  });

  it('rolls back creation and its terms if the creation audit fails', async () => {
    db.failAudit = 'DEAL.CREATED';
    await expect(createDeal(terms, brand)).rejects.toThrow('Audit unavailable');
    expect(db.deals).toEqual([]);
    expect(db.events).toEqual([]);
  });

  it('rolls back creator assignment and state if invitation audit fails', async () => {
    const id = await draft();
    db.failAudit = 'DEAL.CREATOR_INVITED';
    await expect(inviteCreator(id, creator.id, brand)).rejects.toThrow('Audit unavailable');
    expect(db.deals[0]).toMatchObject({ status: 'DRAFT', creatorId: null });
    expect(db.events).toHaveLength(1);
  });

  it.each(['ACCEPT', 'DECLINE'] as const)('rolls back %s and both events if its invitation audit fails', async (action) => {
    const id = await pending();
    db.failAudit = `INVITATION.${action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'}`;
    await expect(transitionDeal(id, action, creator)).rejects.toThrow('Audit unavailable');
    expect(db.deals[0].status).toBe('PENDING_ACCEPTANCE');
    expect(db.events).toHaveLength(2);
  });
});
