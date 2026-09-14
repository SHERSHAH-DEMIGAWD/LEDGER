import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const plain = (value) => JSON.parse(JSON.stringify(value));
async function harness() {
  const context = vm.createContext({ console });
  const requests = [];
  let deal = { id: 'review/id', brandId: 'brand', creatorId: 'creator', status: 'IN_PROGRESS',
    brand: { id: 'brand', name: 'Brand', email: 'brand@example.com' }, creator: { id: 'creator', name: 'Creator', email: 'creator@example.com' },
    fundingStatus: 'FUNDED', paymentRecordId: 'payment-row', acceptedVersionNumber: 1,
    createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
    versions: [{ versionNumber: 1, isPending: false, terms: { title: 'Launch film', description: 'Film', deliverables: [], paymentAmount: 75000, currency: 'INR' } }],
  };
  let payment = { fundingStatus: 'FUNDED', paymentId: 'simulated', paymentStatus: 'SUCCEEDED' };
  let stateOverride = {};
  let failure;
  const statuses = { submit: 'SUBMITTED', 'request-revision': 'REVISION_REQUESTED', resubmit: 'SUBMITTED', approve: 'APPROVED', complete: 'COMPLETED', dispute: 'DISPUTED', resolve: 'RESOLVED' };
  const client = {
    async post(url, body) {
      requests.push(['POST', url, body]);
      if (failure) throw failure;
      const endpoint = url.split('/').at(-1);
      const status = statuses[endpoint] ?? { ACCEPT_RESOLUTION: 'APPROVED', REQUEST_REWORK: 'IN_PROGRESS', RELEASE_PAYMENT: 'COMPLETED' }[body.action];
      deal = { ...deal, status };
      // The client must reload; never trust the mutation's status as a snapshot.
      return { data: { data: { status: 'OUTDATED' } } };
    },
    async get(url) {
      requests.push(['GET', url]);
      if (failure) throw failure;
      const data = url.endsWith('/payment-status') ? payment : url.endsWith('/state')
        ? { state: { dealId: deal.id, status: deal.status, updatedAt: deal.updatedAt, isTerminal: deal.status === 'COMPLETED', availableActions: [], ...stateOverride } }
        : { deal };
      return { data: { success: true, data } };
    },
  };
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const compiled = async (name) => new vm.SourceTextModule(ts.transpileModule(
    await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText, { context });
  const normalizer = await compiled('dealNormalizer');
  await normalizer.link(() => { throw new Error('Unexpected import'); });
  await normalizer.evaluate();
  const module = await compiled('dealApi');
  await module.link((name) => name === './dealNormalizer' ? normalizer : name === './httpClient'
    ? synthetic({ getHttpClient: () => client }) : synthetic({ default: { isAxiosError: (error) => error?.isAxiosError === true } }));
  await module.evaluate();
  return { api: module.namespace.dealApi, normalizer: normalizer.namespace, requests,
    setState(value) { stateOverride = value; }, setPayment(value) { payment = value; },
    setFailure(value) { failure = value; }, get deal() { return deal; },
  };
}

for (const [action, endpoint, note] of [
  ['SUBMIT_DELIVERABLE', 'submit', 'Film shared.'], ['REQUEST_REVISION', 'request-revision', 'Shorten intro.'],
  ['RESUBMIT', 'resubmit'], ['APPROVE', 'approve'], ['RELEASE_PAYMENT', 'complete'],
  ['RAISE_DISPUTE', 'dispute', 'Scope mismatch.'], ['RESOLVE', 'resolve', 'Review agreed scope.'],
]) {
  test(`${action} uses /${endpoint} and verifies deal, payment and actions`, async () => {
    const h = await harness();
    const result = await h.api.transitionDeal('review/id', action, { note });
    assert.equal(result.ok, true);
    assert.notEqual(result.data.status, 'OUTDATED');
    assert.deepEqual(plain(h.requests), [
      ['POST', `/deals/review%2Fid/${endpoint}`, note ? { note } : {}],
      ['GET', '/deals/review%2Fid'], ['GET', '/deals/review%2Fid/payment-status'], ['GET', '/deals/review%2Fid/state'],
    ]);
    assert.equal(result.data.acceptedVersionNumber, 1);
    assert.equal(result.data.amount, 750);
  });
}

test('submit note is optional and resubmit never sends unsupported notes', async () => {
  const h = await harness();
  await h.api.transitionDeal('review/id', 'SUBMIT_DELIVERABLE');
  await h.api.transitionDeal('review/id', 'RESUBMIT', { note: 'Do not send this unsupported field.' });
  assert.deepEqual(plain(h.requests.filter(([method]) => method === 'POST').map((request) => request[2])), [{}, {}]);
});

for (const action of ['ACCEPT_RESOLUTION', 'REQUEST_REWORK', 'RELEASE_PAYMENT']) {
  test(`${action} from RESOLVED keeps the existing generic transition semantics`, async () => {
    const h = await harness();
    assert.equal((await h.api.transitionDeal('review/id', action, { fromStatus: 'RESOLVED' })).ok, true);
    assert.deepEqual(plain(h.requests[0]), ['POST', '/deals/review%2Fid/transition', { action }]);
  });
}

for (const state of [{ status: 'IN_PROGRESS' }, { updatedAt: '2026-09-14T00:00:01Z' }, { dealId: 'other' }, { isTerminal: true, availableActions: ['APPROVE'] }]) {
  test(`contradictory action snapshot fails closed: ${JSON.stringify(state)}`, async () => {
    const h = await harness();
    h.setState(state);
    const result = await h.api.transitionDeal('review/id', 'SUBMIT_DELIVERABLE');
    assert.equal(result.ok, false);
    assert.equal('data' in result, false);
  });
}

test('later delivery states cannot render verified work against an unconfirmed payment', async () => {
  const h = await harness();
  h.setPayment({ fundingStatus: 'FUNDED', paymentStatus: 'PENDING', paymentId: null });
  assert.equal((await h.api.transitionDeal('review/id', 'APPROVE')).ok, false);
});

for (const [status, kind] of [[401, 'auth'], [403, 'forbidden'], [400, 'validation'], [409, 'conflict'], [503, 'server'], [undefined, 'network']]) {
  test(`${kind} mutation failure never produces a successful local delivery state`, async () => {
    const h = await harness();
    h.setFailure({ isAxiosError: true, message: 'Rejected', response: status ? { status, data: { success: false, error: { code: 'DEAL_001', message: 'Rejected' } } } : undefined });
    const result = await h.api.transitionDeal('review/id', 'REQUEST_REVISION', { note: 'Change needed.' });
    assert.equal(result.ok, false);
    assert.equal(result.kind, kind);
    assert.equal(h.requests.length, 1);
    assert.equal(h.deal.status, 'IN_PROGRESS');
  });
}

test('normalizer preserves backend revision fields and all supported audit note kinds', async () => {
  const h = await harness();
  const deal = h.normalizer.normalizeDeal({ ...h.deal, latestRevisionNote: 'Revise intro.', latestRevisionNoteAuthorId: 'brand', latestRevisionNoteAt: h.deal.updatedAt });
  assert.equal(deal.latestRevisionNote, 'Revise intro.');
  assert.equal(deal.latestRevisionNoteAuthorId, 'brand');
  for (const key of ['note', 'revisionNote', 'disputeNote', 'resolutionNote']) {
    const event = h.normalizer.normalizeHistoryEntry({ id: 'event', action: 'DELIVERABLE.SUBMITTED', actorId: 'creator', actor: h.deal.creator, timestamp: h.deal.updatedAt, metadata: { [key]: '<script>plain recorded text</script>' } });
    assert.equal(event.note, '<script>plain recorded text</script>');
    assert.equal(event.actor, 'Creator');
  }
});
