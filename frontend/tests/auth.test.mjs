import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function harness(env = {}) {
  const storage = new Map();
  const events = [];
  const window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent: (event) => events.push(event.type),
  };
  const context = vm.createContext({ console, window, Event: class { constructor(type) { this.type = type; } } });
  const handlers = {};
  const axios = {
    isAxiosError: (error) => error?.isAxiosError === true,
    create: (config) => {
      handlers.config = config;
      return { interceptors: {
        request: { use: (fn) => { handlers.request = fn; } },
        response: { use: (_, fn) => { handlers.error = fn; } },
      } };
    },
  };
  const compiled = async (name) => new vm.SourceTextModule(ts.transpileModule(
    await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText, { context, initializeImportMeta(meta) { meta.env = env; } });
  const auth = await compiled('auth');
  await auth.link(() => { throw new Error('Unexpected dependency'); });
  await auth.evaluate();
  const client = await compiled('httpClient');
  const axiosModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', axios); }, { context });
  await client.link((name) => name === './auth' ? auth : axiosModule);
  await client.evaluate();
  client.namespace.getHttpClient();
  return { auth: auth.namespace, handlers, storage, events };
}

const brand = { id: 'brand-id', email: 'brand@example.com', name: 'Brand', role: 'BRAND' };

test('development personas require explicit opt-in and are unavailable in production', async () => {
  for (const env of [{ DEV: true }, { DEV: false, VITE_ENABLE_DEV_PERSONAS: 'true' }]) {
    const h = await harness(env);
    h.auth.setMockUser(brand);
    assert.equal(h.auth.getMockUser(), null);
    assert.equal(h.auth.getMockUserHeader(), null);
  }
  const h = await harness({ DEV: true, VITE_ENABLE_DEV_PERSONAS: 'true' });
  h.auth.setMockUser(brand);
  assert.equal(h.auth.getMockUserHeader(), 'BRAND:brand-id');
});

test('JWT authentication never sends a development header that overrides the real account', async () => {
  const h = await harness({ DEV: true, VITE_ENABLE_DEV_PERSONAS: 'true' });
  h.auth.setMockUser(brand);
  h.auth.setAccessToken('real-access-token');
  const request = h.handlers.request({ headers: {} });
  assert.equal(request.headers.Authorization, 'Bearer real-access-token');
  assert.equal(request.headers['X-Mock-User'], undefined);
  assert.equal(h.handlers.config.withCredentials, true);
});

test('corrupt cached account shapes do not become authenticated UI identities', async () => {
  const h = await harness({ DEV: true, VITE_ENABLE_DEV_PERSONAS: 'true' });
  for (const user of [null, [], { id: 'id' }, { ...brand, role: 'OWNER' }]) {
    h.storage.set('ledger.auth.mockUser', JSON.stringify(user));
    assert.equal(h.auth.getMockUser(), null);
  }
});

test('401 expires the rejected current session and signals protected routes', async () => {
  const h = await harness();
  h.auth.setAccessToken('expired');
  h.auth.setMockUser(brand);
  const error = { isAxiosError: true, response: { status: 401 }, config: { headers: { Authorization: 'Bearer expired' } } };
  await assert.rejects(h.handlers.error(error));
  assert.equal(h.auth.getAccessToken(), null);
  assert.equal(h.auth.getMockUser(), null);
  assert.deepEqual(h.events, ['ledger:auth-expired']);
});

test('a late 401 from a previous account cannot sign out the current account', async () => {
  const h = await harness();
  h.auth.setAccessToken('new-session');
  h.auth.setMockUser(brand);
  const error = { isAxiosError: true, response: { status: 401 }, config: { headers: { Authorization: 'Bearer previous-session' } } };
  await assert.rejects(h.handlers.error(error));
  assert.equal(h.auth.getAccessToken(), 'new-session');
  assert.equal(h.auth.getMockUser().id, brand.id);
  assert.deepEqual(h.events, []);
});
