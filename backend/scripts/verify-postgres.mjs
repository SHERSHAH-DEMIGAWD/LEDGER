// Run after migrate deploy and seed, with a process-level DATABASE_URL.
// Creates verification records in a dedicated disposable DB; never deletes data.
// Starts/stops its own backend. Uses real JWT authentication and Prisma persistence.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Requires local PostgreSQL');
assert(/^\/ledger_(bootstrap|migration)_dev_\d{8}(?:_\d+)?$/.test(url.pathname),
  'Requires a dedicated disposable Ledger verification database');
const prisma = new PrismaClient();
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const server = spawn(process.execPath, ['--import', 'tsx', 'src/app.ts'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let calls = 0;
async function api(path, token, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  calls++;
  return data.data ?? data;
}
async function state(id, token, expected) {
  const { deal } = await api(`/deals/${id}`, token);
  assert.equal(deal.status, expected);
  const persisted = await prisma.deal.findUniqueOrThrow({ where: { id } });
  assert.equal(persisted.status, expected);
  return persisted;
}

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend startup timed out')), 20000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Backend exited: ${code}`)); });
    server.stdout.on('data', (data) => {
      if (data.toString().includes('Server running on port')) { clearTimeout(timer); resolve(); }
    });
  });
  assert.equal((await api('/health')).status, 'ok');
  await api('/deals', undefined, undefined, 401);
  const brand = await api('/auth/login', undefined, { email: 'brand-1@ledger.test', password: 'Test1234' });
  const creator = await api('/auth/login', undefined, { email: 'alex-1@ledger.test', password: 'Test1234' });
  const hrt = await api('/auth/login', undefined, { email: 'hrt@ledger.test', password: 'Test1234' });
  assert.equal(brand.user.role, 'BRAND');
  assert.equal(creator.user.role, 'CREATOR');
  assert.equal(hrt.user.role, 'HRT');
  const b = brand.accessToken, c = creator.accessToken, h = hrt.accessToken;
  assert((await api('/deals', b)).deals.length >= 3);
  await api('/deals/d1000000-0000-0000-0000-000000000001', b);
  const created = [];
  for (const scenario of ['revision', 'dispute']) {
    const terms = {
      title: `PostgreSQL verification ${scenario} ${Date.now()}`,
      description: 'Persistent workflow verification',
      deliverables: [{ title: 'Verification deliverable', description: 'Reviewable output' }],
      paymentAmount: 12000, currency: 'USD',
    };
    const { deal } = await api('/deals', b, { terms }, 201);
    const id = deal.id;
    created.push(id);
    await state(id, b, 'DRAFT');
    await api(`/deals/${id}/invite`, b, { creatorEmail: creator.user.email });
    await state(id, b, 'PENDING_ACCEPTANCE');
    const inbox = await api('/invitations', c);
    assert(JSON.stringify(inbox).includes(id));
    await api(`/invitations/${id}/accept`, c, {});
    await state(id, b, 'ACCEPTED');
    await api(`/deals/${id}/terms/propose`, b, { terms: { ...terms, paymentAmount: 15000 } }, 201);
    assert.equal((await api(`/deals/${id}/terms`, c)).terms.authoritativeVersionNumber, 1);
    await api(`/deals/${id}/terms/accept`, c, {});
    assert.equal((await api(`/deals/${id}/terms`, b)).terms.authoritativeVersionNumber, 2);
    await api(`/deals/${id}/fund`, c, {}, 403);
    await api(`/deals/${id}/fund`, b, {}, 201);
    const funded = await state(id, b, 'FUNDED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { dealId: id } });
    assert.equal(payment.id, funded.paymentRecordId);
    assert.equal(payment.amount, 15000);
    assert.equal(payment.currency, 'USD');
    assert.equal(payment.status, 'SUCCEEDED');
    assert.equal(funded.acceptedVersionNumber, 2);
    assert.equal((await api(`/deals/${id}/payment-status`, b)).paymentStatus, 'SUCCEEDED');
    await api(`/deals/${id}/transition`, c, { action: 'START' });
    await state(id, b, 'IN_PROGRESS');
    await api(`/deals/${id}/submit`, c, { note: 'Initial delivery' });
    await state(id, b, 'SUBMITTED');
    if (scenario === 'revision') {
      await api(`/deals/${id}/request-revision`, b, { note: 'Please revise the opening' });
      assert.equal((await state(id, c, 'REVISION_REQUESTED')).latestRevisionNote, 'Please revise the opening');
      await api(`/deals/${id}/resubmit`, c, {});
      await state(id, b, 'SUBMITTED');
      await api(`/deals/${id}/approve`, b, {});
    } else {
      await api(`/deals/${id}/dispute`, b, { note: 'Review delivery scope' });
      await state(id, b, 'DISPUTED');
      await api(`/deals/${id}/resolve`, h, { note: 'Delivery meets the agreed scope' });
      assert.equal((await state(id, b, 'RESOLVED')).latestRevisionNote, 'Delivery meets the agreed scope');
      await api(`/deals/${id}/transition`, b, { action: 'ACCEPT_RESOLUTION' });
    }
    await state(id, b, 'APPROVED');
    await api(`/deals/${id}/complete`, b, {});
    await state(id, b, 'COMPLETED');
    const { history } = await api(`/deals/${id}/history`, b);
    const actions = history.map((entry) => entry.action);
    for (const action of ['DEAL.CREATED', 'DEAL.TERMS_ACCEPTED', 'PAYMENT.RELEASED',
      ...(scenario === 'revision' ? ['DELIVERABLE.REVISION_REQUESTED'] : ['DISPUTE.RAISED', 'DISPUTE.RESOLVED'])]) {
      assert(actions.includes(action), `Missing ${action} in ${scenario} history`);
    }
    assert.equal(history.length, await prisma.auditLog.count({ where: { dealId: id } }));
    assert.equal(await prisma.payment.count({ where: { dealId: id } }), 1);
    console.log(`PASS ${scenario}: ${id}, COMPLETED, payment and audit persisted`);
  }
  console.log(`PASS PostgreSQL runtime: ${calls} HTTP checks, real JWTs, two complete workflows`);
  console.log(`Database retained: ${url.pathname.slice(1)}; created deals: ${created.join(', ')}`);
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
  await prisma.$disconnect();
}
