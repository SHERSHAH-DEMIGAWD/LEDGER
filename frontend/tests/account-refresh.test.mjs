import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Exercise the real hooks with controlled effects and network completion.
// This scheduler makes the pre-effect render and stale-response races explicit;
// it does not substitute deal, identity or request-selection logic.
function hookScheduler() {
  const slots = [];
  const pending = new Map();
  let cursor = 0;
  const changed = (before, after) => !before || before.length !== after.length ||
    before.some((value, index) => !Object.is(value, after[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) pending.set(index, { effect, deps });
    },
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => { throw new Error('Unexpected context consumer'); },
  };
  return {
    react,
    render(fn, ...args) { cursor = 0; return fn(...args); },
    commit() {
      for (const [index, { effect, deps }] of pending) {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      }
      pending.clear();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function events() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name, event) { for (const listener of listeners.get(name) ?? []) listener(event); },
  };
}

async function loadModule(path, dependencies, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { context });
  await module.link((name) => {
    const exports = dependencies[name];
    if (!exports) throw new Error(`Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

async function dealsHarness() {
  const scheduler = hookScheduler();
  const requests = [];
  let user = { id: 'brand', role: 'BRAND' };
  const window = { ...events(), setInterval: () => 1, clearInterval() {} };
  const document = { ...events(), visibilityState: 'visible' };
  const module = await loadModule('hooks/useDeals.ts', {
    react: scheduler.react,
    '../contexts/AuthContext': { useAuth: () => ({ user }) },
    '../services/dealApi': { dealApi: { listDeals(options) {
      const request = { ...deferred(), user: user?.id, options };
      requests.push(request);
      return request.promise;
    } } },
  }, { window, document });
  return {
    ...scheduler, requests,
    render: (options) => scheduler.render(module.useDeals, options),
    setUser(next) { user = next; },
  };
}

test('account switch hides previous records before effects and ignores late responses', async () => {
  const h = await dealsHarness();
  assert.equal(h.render().loading, true);
  h.commit();
  h.requests[0].resolve({ deals: [{ id: 'brand-deal' }], total: 1 });
  await new Promise(setImmediate);
  assert.equal(h.render().deals[0].id, 'brand-deal');
  h.render().refetch();
  h.render();
  h.commit();

  h.setUser({ id: 'creator', role: 'CREATOR' });
  const firstCreatorRender = h.render();
  assert.deepEqual(plain(firstCreatorRender.deals), []);
  assert.equal(firstCreatorRender.total, 0);
  assert.equal(firstCreatorRender.loading, true);
  h.commit();
  h.requests[2].resolve({ deals: [{ id: 'creator-deal' }], total: 1 });
  await new Promise(setImmediate);
  h.requests[1].resolve({ deals: [{ id: 'late-brand-deal' }], total: 1 });
  await new Promise(setImmediate);
  assert.deepEqual(plain(h.render().deals), [{ id: 'creator-deal' }]);
  assert.deepEqual(h.requests.map((request) => request.user), ['brand', 'brand', 'creator']);
  h.unmount();
});

test('refetch invalidates an earlier result immediately and failed refresh clears stale records', async () => {
  const h = await dealsHarness();
  h.render();
  h.commit();
  h.render().refetch();
  // Complete the old request before the refetch effect gets a chance to run.
  h.requests[0].resolve({ deals: [{ id: 'stale-deal' }], total: 1 });
  await new Promise(setImmediate);
  assert.deepEqual(plain(h.render().deals), []);
  h.commit();
  h.requests[1].resolve({ deals: [{ id: 'fresh-deal' }], total: 1 });
  await new Promise(setImmediate);
  assert.equal(h.render().deals[0].id, 'fresh-deal');
  h.render().refetch();
  h.render();
  h.commit();
  h.requests[2].reject(new Error('Disconnected'));
  await new Promise(setImmediate);
  const failed = h.render();
  assert.deepEqual(plain(failed.deals), []);
  assert.equal(failed.total, 0);
  assert.equal(failed.loading, false);
  assert.equal(typeof failed.error, 'string');
  h.unmount();
});

test('sign-out hides records immediately and never requests an anonymous deal list', async () => {
  const h = await dealsHarness();
  h.render();
  h.commit();
  h.requests[0].resolve({ deals: [{ id: 'private-deal' }], total: 1 });
  await new Promise(setImmediate);
  assert.equal(h.render().total, 1);
  h.setUser(null);
  assert.deepEqual(plain(h.render().deals), []);
  assert.equal(h.render().loading, false);
  h.commit();
  h.render().refetch();
  h.render();
  h.commit();
  assert.equal(h.requests.length, 1);
  h.unmount();
});

test('AuthProvider follows another tab account switch/sign-out without overwriting shared identity', async () => {
  const scheduler = hookScheduler();
  const window = { ...events(), localStorage: {} };
  let storedUser = { id: 'brand', role: 'BRAND' };
  let storageWrites = 0;
  const module = await loadModule('contexts/AuthContext.tsx', {
    react: scheduler.react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-router-dom': { useNavigate: () => () => {} },
    '../services/auth': {
      clearAuth() { storedUser = null; storageWrites++; },
      getMockUser: () => storedUser,
      MOCK_USER_STORAGE_KEY: 'ledger.auth.mockUser',
      setMockUser(value) { storedUser = value; storageWrites++; },
      setAccessToken() {},
    },
    '../config/seedUsers': { findSeedUser: () => null, toMockUserHeader: () => null },
  }, { window });
  const render = () => scheduler.render(module.AuthProvider, { children: null }).props.value;
  assert.equal(render().user.id, 'brand');
  scheduler.commit();
  storedUser = { id: 'creator', role: 'CREATOR' };
  window.dispatch('storage', { key: 'unrelated-key', storageArea: window.localStorage });
  assert.equal(render().user.id, 'brand');
  window.dispatch('storage', { key: 'ledger.auth.mockUser', storageArea: window.localStorage });
  assert.equal(render().user.id, 'creator');
  scheduler.commit();
  assert.equal(storageWrites, 0);
  storedUser = null;
  window.dispatch('storage', { key: null, storageArea: window.localStorage });
  assert.equal(render().user, null);
  assert.equal(storageWrites, 0);
  scheduler.unmount();
});
