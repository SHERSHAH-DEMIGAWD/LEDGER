import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual TypeScript client/normalizer without adding a test framework,
// starting a browser, or writing transpiled files. Only HTTP/auth are stubbed.
async function harness() {
  const context = vm.createContext({ console, setTimeout });
  const requests = [];
  let deal = {
    id: 'deal', brandId: 'brand', creatorId: 'creator', status: 'ACCEPTED',
    fundingStatus: 'NOT_FUNDED', acceptedVersionNumber: 2, paymentRecordId: null,
    createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z',
    versions: [1, 2, 3].map((versionNumber) => ({
      id: `v${versionNumber}`, versionNumber, isPending: versionNumber === 3,
      terms: { title: 'Deal', description: 'Delivery', paymentAmount: versionNumber * 10001, currency: 'USD' },
    })),
  };
  let payment = { fundingStatus: 'NOT_FUNDED', paymentStatus: null, paymentId: null };
  const client = {
    async get(url) {
      requests.push(['GET', url]);
      return { data: url.endsWith('/payment-status') ? { data: payment } : { data: { deal } } };
    },
    async post(url, body) {
      requests.push(['POST', url, body]);
      if (url.endsWith('/fund')) {
        deal = { ...deal, status: 'FUNDED', fundingStatus: 'FUNDED', paymentRecordId: 'row' };
        payment = { fundingStatus: 'FUNDED', paymentStatus: 'SUCCEEDED', paymentId: 'provider-payment' };
      } else {
        assert.equal(body.action, 'START');
        deal = { ...deal, status: 'IN_PROGRESS' };
      }
      return { data: { data: { deal } } };
    },
  };
  function synthetic(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  }
  const compiled = async (name) => new vm.SourceTextModule(ts.transpileModule(
    await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText, { context, initializeImportMeta(meta) { meta.env = { VITE_USE_MOCK_DEALS: 'false' }; } });
  const normalizer = await compiled('dealNormalizer');
  await normalizer.link(() => { throw new Error('Unexpected normalizer dependency'); });
  await normalizer.evaluate();
  const api = await compiled('dealApi');
  await api.link((specifier) => {
    if (specifier === './dealNormalizer') return normalizer;
    if (specifier === './httpClient') return synthetic({ getHttpClient: () => client });
    if (specifier === './auth') return synthetic({ getMockUser: () => null });
    if (specifier === 'axios') return synthetic({ default: { isAxiosError: () => false } });
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  await api.evaluate();
  return {
    api: api.namespace.dealApi, normalize: normalizer.namespace.normalizeDeal,
    requests, deal, setPayment(value) { payment = value; },
  };
}

test('payable amount uses accepted v2 even when v3 is pending or rejected', async () => {
  const h = await harness();
  for (const isPending of [true, false]) {
    h.deal.versions[2].isPending = isPending;
    assert.equal(h.normalize(h.deal).amount, 200.02);
    assert.equal(h.normalize(h.deal).amountFormatted, '$200.02');
  }
});

test('an invalid accepted pointer to pending terms fails closed', async () => {
  const h = await harness();
  h.deal.acceptedVersionNumber = 3;
  assert.equal(h.normalize(h.deal), null);
});

test('FUND uses dedicated API and reloads deal/payment before START', async () => {
  const h = await harness();
  const funded = await h.api.transitionDeal('deal', 'FUND');
  assert.equal(funded.ok, true);
  assert.equal(funded.data.status, 'FUNDED');
  assert.equal(funded.data.paymentStatus, 'SUCCEEDED');
  assert.equal(funded.data.amount, 200.02);
  assert.deepEqual(h.requests.map(([method, url]) => [method, url]), [
    ['POST', '/deals/deal/fund'], ['GET', '/deals/deal'], ['GET', '/deals/deal/payment-status'],
  ]);
  const started = await h.api.transitionDeal('deal', 'START');
  assert.equal(started.data.status, 'IN_PROGRESS');
});

test('mixed deal/payment snapshots cannot render ACCEPTED with new funding', async () => {
  const h = await harness();
  h.setPayment({ fundingStatus: 'FUNDED', paymentStatus: 'SUCCEEDED', paymentId: 'payment' });
  await assert.rejects(h.api.getDeal('deal'), /Funding changed while loading/);
});

test('a funded lifecycle with a pending payment is rejected', async () => {
  const h = await harness();
  h.deal.status = 'FUNDED';
  h.deal.fundingStatus = 'FUNDED';
  h.deal.paymentRecordId = 'row';
  h.setPayment({ fundingStatus: 'FUNDED', paymentStatus: 'PENDING', paymentId: null });
  await assert.rejects(h.api.getDeal('deal'), /Funding could not be verified/);
});

test('a torn payment-status response cannot render success beside NOT_FUNDED', async () => {
  const h = await harness();
  h.setPayment({ fundingStatus: 'NOT_FUNDED', paymentStatus: 'SUCCEEDED', paymentId: 'payment' });
  await assert.rejects(h.api.getDeal('deal'), /Funding changed while loading/);
});
