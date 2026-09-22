import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const terms = {
  title: 'Launch video', description: 'Create a product launch video.',
  deliverables: [{ title: 'Video', description: 'One edited video', deadline: '2026-10-01' }],
  paymentAmount: 250025, currency: 'USD',
  timeline: { startDate: '2026-09-20', endDate: '2026-10-01' },
};
const brand = { id: 'brand-account', name: 'Actual Brand', email: 'brand@example.com' };
const creator = { id: 'creator-account', name: 'Actual Creator', email: 'creator@example.com' };
const payment = { fundingStatus: 'NOT_FUNDED', paymentStatus: null, paymentId: null };

function backendDeal(overrides = {}) {
  return {
    id: 'deal/id', brandId: brand.id, brand, creatorId: null, creator: null,
    status: 'DRAFT', fundingStatus: 'NOT_FUNDED', acceptedVersionNumber: null,
    paymentRecordId: null, contractId: null,
    createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
    versions: [{ id: 'version-1', versionNumber: 1, isPending: false, terms,
      createdAt: '2026-09-14T00:00:00Z' }],
    ...overrides,
  };
}

function backendInvitation(overrides = {}) {
  return {
    id: 'deal/id', brandId: brand.id, brand, status: 'PENDING_ACCEPTANCE',
    terms, latestVersionNumber: 1,
    createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
    ...overrides,
  };
}

const envelope = (data) => ({ data: { success: true, data } });
const plain = (value) => JSON.parse(JSON.stringify(value));

// Exercise the actual clients and translation layer in memory, with only HTTP
// substituted. Mock mode is deliberately enabled to catch local fallback state.
async function harness(respond) {
  const context = vm.createContext({ console, setTimeout });
  const requests = [];
  const client = Object.fromEntries(['get', 'post'].map((method) => [method, async (url, body) => {
    const request = [method.toUpperCase(), url, body];
    requests.push(request);
    return respond(...request);
  }]));
  function synthetic(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  }
  const compiled = async (name) => new vm.SourceTextModule(ts.transpileModule(
    await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText, { context, initializeImportMeta(meta) { meta.env = { VITE_USE_MOCK_DEALS: 'true' }; } });
  const normalizer = await compiled('dealNormalizer');
  await normalizer.link(() => { throw new Error('Unexpected normalizer dependency'); });
  await normalizer.evaluate();
  const http = synthetic({ getHttpClient: () => client });
  const api = await compiled('dealApi');
  await api.link((specifier) => {
    if (specifier === './dealNormalizer') return normalizer;
    if (specifier === './httpClient') return http;
    if (specifier === 'axios') return synthetic({ default: { isAxiosError: (error) => error?.isAxiosError === true } });
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  await api.evaluate();
  const invitations = await compiled('invitationApi');
  await invitations.link((specifier) => {
    if (specifier === './dealApi') return api;
    if (specifier === './dealNormalizer') return normalizer;
    if (specifier === './httpClient') return http;
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  await invitations.evaluate();
  return {
    api: api.namespace.dealApi, invitations: invitations.namespace.invitationApi,
    normalize: normalizer.namespace.normalizeDeal, requests,
  };
}

test('create sends complete terms and renders a draft without a fabricated creator', async () => {
  const h = await harness(() => envelope({ deal: backendDeal() }));
  const result = await h.api.createDeal(terms);
  assert.deepEqual(plain(h.requests), [['POST', '/deals', { terms }]]);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'DRAFT');
  assert.equal(result.data.amount, 2500.25);
  assert.deepEqual(plain(result.data.terms), terms);
  assert.deepEqual(plain(result.data.parties), [{ ...brand, role: 'Brand' }]);
  assert.equal(result.data.counterparties, 'Actual Brand');
});

test('invite sends an exact email and uses the server participant and pending status', async () => {
  const pending = backendDeal({ status: 'PENDING_ACCEPTANCE', creatorId: creator.id, creator });
  const h = await harness(() => envelope({ deal: pending }));
  const result = await h.api.inviteCreator('deal/id', { creatorEmail: 'creator@example.com' });
  assert.deepEqual(plain(h.requests), [['POST', '/deals/deal%2Fid/invite', { creatorEmail: 'creator@example.com' }]]);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'PENDING_ACCEPTANCE');
  assert.deepEqual(plain(result.data.parties[1]), { ...creator, role: 'Creator' });
  assert.equal(result.data.counterparties, 'Actual Brand · Actual Creator');
});

test('invitation inbox preserves real brand identity, complete terms and version', async () => {
  const h = await harness(() => envelope({ invitations: [backendInvitation({ latestVersionNumber: 4 })] }));
  const [invitation] = await h.invitations.listInvitations();
  assert.deepEqual(h.requests.map(([method, url]) => [method, url]), [['GET', '/invitations']]);
  assert.equal(invitation.brandName, brand.name);
  assert.equal(invitation.brandEmail, brand.email);
  assert.equal(invitation.brandId, brand.id);
  assert.equal(invitation.title, terms.title);
  assert.equal(invitation.description, terms.description);
  assert.equal(invitation.amountFormatted, '$2,500.25');
  assert.equal(invitation.deliverableCount, 1);
  assert.equal(invitation.termsVersionNumber, 4);
  assert.deepEqual(plain(invitation.terms), terms);
});

for (const [method, endpoint] of [['proposeTerms', 'propose'], ['acceptProposal', 'accept'], ['rejectProposal', 'reject']]) {
  test(`${method} refreshes the authoritative terms and payment instead of trusting a mutation response`, async () => {
    const authoritative = backendDeal({ status: 'ACCEPTED', acceptedVersionNumber: 1 });
    const h = await harness((verb, url) => {
      if (verb === 'POST') return envelope({ terms: { authoritativeVersionNumber: 99 } });
      if (url.endsWith('/payment-status')) return envelope(payment);
      return envelope({ deal: authoritative });
    });
    const result = await h.api[method]('deal/id', terms);
    assert.equal(result.ok, true);
    assert.equal(result.data.termsVersionNumber, 1);
    assert.deepEqual(plain(h.requests), [
      ['POST', `/deals/deal%2Fid/terms/${endpoint}`, endpoint === 'propose' ? { terms } : {}],
      ['GET', '/deals/deal%2Fid', null], ['GET', '/deals/deal%2Fid/payment-status', null],
    ]);
  });
}

for (const [action, status] of [['accept', 'ACCEPTED'], ['decline', 'DECLINED']]) {
  test(`${action} uses its dedicated endpoint and returns authoritative reloaded state`, async () => {
    const authoritative = backendDeal({ status, creatorId: creator.id, creator,
      acceptedVersionNumber: status === 'ACCEPTED' ? 1 : null });
    const h = await harness((method, url) => {
      // A stale mutation response must never become the final client state.
      if (method === 'POST') return envelope({ deal: backendDeal({ status: 'PENDING_ACCEPTANCE' }) });
      if (url.endsWith('/payment-status')) return envelope(payment);
      return envelope({ deal: authoritative });
    });
    const result = await h.invitations[`${action}Invitation`]('deal/id');
    assert.equal(result.ok, true);
    assert.equal(result.data.status, status);
    assert.equal(result.data.acceptedVersionNumber, authoritative.acceptedVersionNumber);
    assert.deepEqual(h.requests.map(([method, url]) => [method, url]), [
      ['POST', `/invitations/deal%2Fid/${action}`],
      ['GET', '/deals/deal%2Fid'], ['GET', '/deals/deal%2Fid/payment-status'],
    ]);
  });
}

for (const [status, kind] of [[409, 'conflict'], [undefined, 'network'], [503, 'server']]) {
  test(`${kind} errors fail closed for create, invite, accept and decline even in mock mode`, async () => {
    const error = Object.assign(new Error('HTTP request failed'), {
      isAxiosError: true,
      response: status ? { status, data: { success: false, error: { code: 'RES_002', message: 'Deal changed' } } } : undefined,
    });
    const h = await harness(() => { throw error; });
    assert.equal(h.api.isMock(), false);
    assert.equal(h.invitations.isMock(), false);
    const results = [
      await h.api.createDeal(terms),
      await h.api.inviteCreator('deal/id', { creatorEmail: creator.email }),
      await h.invitations.acceptInvitation('deal/id'),
      await h.invitations.declineInvitation('deal/id'),
    ];
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.equal(result.kind, kind);
      assert.equal('data' in result, false);
    }
    assert.equal(h.requests.length, 4);
    await assert.rejects(h.api.listDeals(), (actual) => actual === error);
    await assert.rejects(h.invitations.listInvitations(), (actual) => actual === error);
  });
}

test('successful mutation followed by failed authoritative reload is not reported as acceptance', async () => {
  const h = await harness((method) => {
    if (method === 'POST') return envelope({ deal: backendDeal({ status: 'ACCEPTED' }) });
    throw Object.assign(new Error('Disconnected'), { isAxiosError: true });
  });
  const result = await h.invitations.acceptInvitation('deal/id');
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'network');
  assert.equal('data' in result, false);
  assert.deepEqual(h.requests.map(([method, url]) => [method, url]), [
    ['POST', '/invitations/deal%2Fid/accept'], ['GET', '/deals/deal%2Fid'],
  ]);
});

test('sequential account reads use fresh HTTP results with no simulated invitation or deal store', async () => {
  let account = 'creator';
  const snapshots = {
    creator: { deals: [backendDeal({ status: 'PENDING_ACCEPTANCE', creatorId: creator.id, creator })],
      invitations: [backendInvitation()] },
    otherCreator: { deals: [], invitations: [] },
    brand: { deals: [backendDeal({ status: 'ACCEPTED', acceptedVersionNumber: 1, creatorId: creator.id, creator })],
      invitations: [] },
  };
  const h = await harness((method, url) => {
    assert.equal(method, 'GET');
    return url === '/invitations'
      ? envelope({ invitations: snapshots[account].invitations })
      : envelope({ deals: snapshots[account].deals });
  });
  assert.equal((await h.api.listDeals()).deals[0].status, 'PENDING_ACCEPTANCE');
  assert.equal((await h.invitations.listInvitations()).length, 1);
  account = 'otherCreator';
  assert.equal((await h.api.listDeals()).total, 0);
  assert.equal((await h.invitations.listInvitations()).length, 0);
  account = 'brand';
  assert.equal((await h.api.listDeals()).deals[0].status, 'ACCEPTED');
  assert.equal((await h.invitations.listInvitations()).length, 0);
  assert.deepEqual(h.requests.map(([method, url]) => [method, url]), [
    ['GET', '/deals'], ['GET', '/invitations'],
    ['GET', '/deals'], ['GET', '/invitations'],
    ['GET', '/deals'], ['GET', '/invitations'],
  ]);
});
