import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import * as C from 'hanaworlds-contracts';
const { default: plugin } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');
const main = JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const seam = JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/session-world'))));
const capabilities = { providerRef: 'contracts-FIXTURE', capabilityRevision: 'cap-1',
  worldRef: main.request.localContext.worldRef, engineBounds: main.request.targetFacts.sampledBounds,
  limits: [], recoveryGuarantee: 'RECOVERABLE_VERIFIED',
  stateProfile: { profileVersion: 'state-profile/v2', nodeFields: ['nodeName', 'param1', 'param2'],
    metadataMode: 'exact', inventoryMode: 'exact', timerMode: 'exact', derivedLightMode: 'recompute-with-readback' },
  sessionDeleteSupported: false, imageMediaTypes: [], model: null,engineGuards:null };
const request = (operation, sessionRef = 's1') => operation === 'ListSessions'
  ? { contractVersion: 'session/v5', requestId: 'list' }
  : { contractVersion: 'session/v5', requestId: 'read-' + sessionRef, sessionRef };
async function tree(root, prefix = '') {
  const out = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(out, await tree(root, path));
    else out[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  return out;
}
// Official Core JSONL + Workshop/domain persistence are real; only Canvas/world
// capabilities are explicit contracts FIXTURE. No model, auth or World writer.
async function runtime(fn) {
  const base = process.env.HW_RUNTIME_ROOT;
  assert.ok(base, 'own runtime root required'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'formal-'));
  const ctx = new Context(); const canvasCalls = [];
  try {
    await ctx.plugin(Jsonl, { root: join(root, 'core'), compression: 'none' }).await();
    await ctx.plugin(Storage).await();
    await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
    await ctx.plugin(StorageDomain, { backend: 'json' }).await();
    ctx.provide('hanaworldsCapabilities', structuredClone(capabilities));
    const canvas = { contractHandshake: C.contractHandshake,
      protocolHandshake: { profileVersion: 'protocol-handshake/v1', component: 'hanaworlds-canvas',
        protocols: [{ protocol: 'canvas', major: 6, minor: 0 }], capabilities: [],
        provenance: { packageName: 'hanaworlds-canvas', packageVersion: 'contracts-FIXTURE', sourceRevision: null, artifactDigest: null } },
      async call(operation, body) {
        canvasCalls.push(operation);
        assert.equal(operation, 'ReadWorldSelectionContext', 'unsupported delete must never retire a Canvas selection');
        const id = await ws.call('ReadSessionIdentity', request('ReadSessionIdentity', body.sessionRef));
        assert.equal(id.error, null);
        const local = structuredClone(main.request.localContext);
        return { contractVersion: 'canvas/v7', requestId: body.requestId, error: null, result: {
          sessionRef: body.sessionRef, worldRef: body.worldRef,
          inventory: { capabilityRevision: 'cap-1', connections: [] },
          selection: { status: 'BOUND', connectionRef: local.connectionRef, context: {
            currentSession: body.sessionRef, sessionRevision: id.result.sessionRevision,
            activeWorldRef: local.worldRef, orderedSelectedObjectRefs: [],
            selectionRevision: local.selectionRevision, localContext: local } } } };
      } };
    ctx.provide('hanaworldsCanvasV5', canvas);
    await ctx.plugin(plugin).await();
    const ws = ctx.get('hanaworldsWorkshop');
    C.checkProtocolCompatibility(ws.protocolHandshake, [C.protocolRequirement('session/v5', [], 0)]);
    for (const [id, time] of [['s2', 200], ['s1', 100]]) {
      const h = await ctx.sessionPersistence.create({ version: SESSION_FORMAT_VERSION,
        id, createdAt: time, cwd: root, isSeeded: false });
      await h.flush(); await h.close();
    }
    await fn({ ws, ctx, root, canvasCalls });
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
}
function success(operation, body, response) {
  C.validateBoundResponse('session/v5', operation, body, response);
  assert.equal(response.error, null, JSON.stringify(response)); return response.result;
}
test('installed contracts identity and public fixture validate under the same installed package', () => {
  assert.equal(C.checkContractsVersion(C.contractHandshake.contracts).result, 'CONTRACTS_MAJOR_MATCH');
  assert.throws(() => C.checkContractHandshake({ ...C.contractHandshake, contracts: 'hanaworlds-contracts@0.5.6' }), e => e.code === 'UNSUPPORTED_VERSION');
  const f = seam.sessionDirectory.read;
  success('ReadSessionIdentity', f.request, f.response);
});
test('ReadSessionIdentity is world-independent and read-only before StartOrResume, with the same Workshop revision', async () => runtime(async r => {
  const before = await tree(r.root);
  const q = request('ReadSessionIdentity');
  const first = success('ReadSessionIdentity', q, await r.ws.call('ReadSessionIdentity', q));
  assert.equal(first.sessionRef, 's1');
  assert.deepEqual(success('ReadSessionIdentity', q, await r.ws.call('ReadSessionIdentity', q)), first);
  assert.deepEqual(await tree(r.root), before, 'readonly identity must not initialize projection or Core');
  const start = await r.ws.call('StartOrResumeSession', { contractVersion: 'session/v5', sessionRef: 's1', requestId: 'start', expectedRevision: null });
  assert.equal(start.error, null);
  assert.equal(start.result.context.activeWorldRef, null);
  assert.equal(start.result.context.sessionRevision, first.sessionRevision);
  assert.equal(start.result.sessionDeleteSupported, false);
  assert.equal(start.result.capabilities.sessionDeleteSupported, false);
  assert.equal(r.canvasCalls.length, 0);
}));
test('ListSessions enumerates trusted unbound Sessions in canonical order, with stable directory revision and no writes', async () => runtime(async r => {
  const before = await tree(r.root), q = request('ListSessions');
  const directory = success('ListSessions', q, await r.ws.call('ListSessions', q));
  assert.deepEqual(directory.sessions.map(s => s.sessionRef), ['s1', 's2']);
  for (const id of directory.sessions) assert.deepEqual(id, success('ReadSessionIdentity', request('ReadSessionIdentity', id.sessionRef), await r.ws.call('ReadSessionIdentity', request('ReadSessionIdentity', id.sessionRef))));
  assert.deepEqual(success('ListSessions', q, await r.ws.call('ListSessions', q)), directory);
  assert.deepEqual(await tree(r.root), before);
  assert.equal(r.canvasCalls.length, 0);
}));
test('unknown trusted Session is rejected and never becomes a Core or Workshop Session', async () => runtime(async r => {
  const before = await tree(r.root), q = request('ReadSessionIdentity', 'unknown');
  const response = await r.ws.call('ReadSessionIdentity', q);
  C.validateBoundResponse('session/v5', 'ReadSessionIdentity', q, response);
  assert.equal(response.error.code, 'SESSION_NOT_FOUND');
  assert.equal(await r.ctx.sessionPersistence.stat('unknown'), undefined);
  assert.deepEqual(await tree(r.root), before);
}));
test('fixed provider DeleteSession rejects DELETE_SEAM_ABSENT before any Canvas or Core/projection mutation, even if supplied capabilities claim support', async () => runtime(async r => {
  const read = request('ReadSessionIdentity');
  const identity = success('ReadSessionIdentity', read, await r.ws.call('ReadSessionIdentity', read));
  r.ctx.get('hanaworldsCapabilities').sessionDeleteSupported = true; // Explicit hostile capability FIXTURE.
  const before = await tree(r.root), q = { contractVersion: 'session/v5', sessionRef: 's1', requestId: 'delete', expectedRevision: identity.sessionRevision };
  const response = await r.ws.call('DeleteSession', q);
  C.validateBoundResponse('session/v5', 'DeleteSession', q, response);
  assert.equal(response.error.code, 'SESSION_DELETE_UNSUPPORTED');
  assert.equal(response.error.reason, 'DELETE_SEAM_ABSENT');
  assert.equal(response.result, null); assert.equal(r.canvasCalls.length, 0);
  assert.deepEqual(await tree(r.root), before);
  assert.deepEqual(success('ReadSessionIdentity', read, await r.ws.call('ReadSessionIdentity', read)), identity);
}));
test('Workshop revision changes consistently after its real projection mutation; Canvas can reenter the readonly identity port', async () => runtime(async r => {
  const start = await r.ws.call('StartOrResumeSession', { contractVersion: 'session/v5', sessionRef: 's1', requestId: 'start', expectedRevision: null });
  assert.equal(start.error, null);
  const local = structuredClone(main.request.localContext);
  const switched = await r.ws.call('SwitchWorldContext', { contractVersion: 'session/v5', sessionRef: 's1', requestId: 'switch', expectedRevision: start.result.context.sessionRevision,
    worldRef: local.worldRef, selectionRevision: local.selectionRevision, localContext: local });
  assert.equal(switched.error, null, JSON.stringify(switched));
  assert.notEqual(switched.result.context.sessionRevision, start.result.context.sessionRevision);
  const id = success('ReadSessionIdentity', request('ReadSessionIdentity'), await r.ws.call('ReadSessionIdentity', request('ReadSessionIdentity')));
  assert.equal(id.sessionRevision, switched.result.context.sessionRevision);
  const directory = success('ListSessions', request('ListSessions'), await r.ws.call('ListSessions', request('ListSessions')));
  assert.deepEqual(directory.sessions.find(s => s.sessionRef === 's1'), id);
}));
