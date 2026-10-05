import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { worldFixture, capabilities, startRequest, switchRequest } from './helpers/world-context.mjs';

// Optional entry is the identical npm-packed installation used by the component
// self-test. All Host/Canvas/Adapter/game facts remain explicitly fixture-owned.
const { default: workshopPlugin } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');

async function mount(root, fixture) {
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'core'), compression: 'none' }).await();
  await ctx.plugin(Storage).await();
  await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
  await ctx.plugin(StorageDomain, { backend: 'json' }).await();
  ctx.provide('hanaworldsAuthority', fixture.authority);
  ctx.provide('hanaworldsCanvasV4', fixture.canvas);
  ctx.provide('hanaworldsCapabilities', capabilities);
  await ctx.plugin(workshopPlugin).await();
  const workshop = ctx.get('hanaworldsWorkshopV1');
  return { ctx, workshop, async close() {
    await workshop.projectionStore.close(); await ctx.fiber.dispose();
  } };
}

test('real DSH/Core JSONL and Workshop durable world context survive reopen and fail closed', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-WORLD-CONTEXT-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'runtime-selftest-'));
  const fixture = worldFixture(); let runtime;
  try {
    runtime = await mount(root, fixture);
    const writer = await runtime.ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION, id: 's1', createdAt: 100,
      cwd: '/isolated/workshop', isSeeded: false });
    await writer.append([{ type: 'turn/start', seq: 0, time: 101, data: { turn: 1 } }]);
    await writer.close();
    let opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    assert.equal(opened.error, null);
    const first = switchRequest(opened.result.context.sessionRevision);
    fixture.capture(first);
    const result = await runtime.workshop.call('SwitchWorldContext', first);
    assert.equal(result.error, null);
    assert.equal(result.result.context.activeWorldRef, 'world-a');
    assert.equal(fixture.calls[1].operation, 'SelectWorldConnection');
    await runtime.close(); runtime = null;

    runtime = await mount(root, fixture);
    opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    assert.equal(opened.result.context.activeWorldRef, 'world-a');
    assert.equal(opened.result.context.sessionRevision, result.result.context.sessionRevision);
    const core = await runtime.ctx.sessionPersistence.open('s1', 'read');
    assert.equal(core.header.createdAt, 100);
    assert.equal((await core.read()).events[0].type, 'turn/start');
    await core.close();
    assert.ok((await readdir(join(root, 'core'), { recursive: true })).some(x => x.endsWith('.jsonl')));
    const same = switchRequest(opened.result.context.sessionRevision, { requestId: 'same-world' });
    fixture.capture(same); fixture.calls.length = 0;
    const sameResult = await runtime.workshop.call('SwitchWorldContext', same);
    assert.equal(sameResult.error, null);
    assert.equal(fixture.calls.some(x => /^(Select|Switch)WorldConnection$/.test(x.operation)), false);
    const next = switchRequest(sameResult.result.context.sessionRevision,
      { worldRef: 'world-b', requestId: 'next-world' });
    fixture.capture(next); fixture.calls.length = 0;
    const nextResult = await runtime.workshop.call('SwitchWorldContext', next);
    assert.equal(nextResult.error, null);
    assert.equal(fixture.calls[1].operation, 'SwitchWorldConnection');
    assert.equal(fixture.calls[1].request.fromWorldRef, 'world-a');
    const cancelled = switchRequest(nextResult.result.context.sessionRevision,
      { worldRef: 'world-c', requestId: 'cancel-after-select' });
    fixture.capture(cancelled);
    fixture.afterCall = async op => { if (op === 'SwitchWorldConnection') fixture.invocationStatus = 'CANCELLED'; };
    const rejected = await runtime.workshop.call('SwitchWorldContext', cancelled);
    assert.equal(rejected.error.code, 'PERMISSION_DENIED');
    await runtime.close(); runtime = null;

    fixture.invocationStatus = 'ACTIVE'; fixture.afterCall = async () => {};
    runtime = await mount(root, fixture);
    opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    assert.equal(opened.result.context.activeWorldRef, null);
    const recover = switchRequest(opened.result.context.sessionRevision,
      { worldRef: 'world-c', requestId: 'recover-current-canvas' });
    fixture.capture(recover); fixture.calls.length = 0;
    const recovered = await runtime.workshop.call('SwitchWorldContext', recover);
    assert.equal(recovered.error, null);
    assert.equal(fixture.calls.some(x => /^(Select|Switch)WorldConnection$/.test(x.operation)), false);
    fixture.current = false;
    const revoked = switchRequest(recovered.result.context.sessionRevision,
      { worldRef: 'world-c', requestId: 'revoked' });
    fixture.capture(revoked); fixture.calls.length = 0;
    assert.equal((await runtime.workshop.call('SwitchWorldContext', revoked)).error.code, 'AUTHORIZATION_REVOKED');
    assert.equal(fixture.calls.length, 0);
  } finally {
    if (runtime) await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});
