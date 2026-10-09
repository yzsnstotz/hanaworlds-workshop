import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import workshopPlugin from '../src/index.mjs';
import { WorkshopProjectionStore } from '../src/projection-store.mjs';
import { contractHandshake, digestValue } from '../vendor/contracts/dist/v4/index.mjs';

async function mount(root) {
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, {
    root: join(root, 'core'), compression: 'none' }).await();
  await ctx.plugin(Storage).await();
  await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
  await ctx.plugin(StorageDomain, { backend: 'json' }).await();
  return { ctx, store: new WorkshopProjectionStore(() => ctx.get('storageDomain')) };
}

test('real DSH Core JSONL and Workshop projection reopen only a Canvas-linked build receipt', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-BUILD-ENTRY-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'real-build-entry-'));
  const receipt = { contractVersion: 'canvas/v2', transactionId: 'apply-tx',
    operationDigest: 'a'.repeat(64), transactionPayloadDigest: 'b'.repeat(64),
    status: 'VERIFIED', previousWorldRevision: 'world-1',
    observedWorldRevision: 'world-2', readbackDigest: 'c'.repeat(64),
    restoreStatus: 'NOT_REQUIRED', error: null };
  const request = { contractVersion: 'session/v2', actorRef: 'actor-a',
    sessionRef: 'session-build', requestId: 'advance-original',
    authorizationRef: 'grant-original', worldRef: 'world-a',
    expectedTurnRevision: 'turn-1' };
  let first;
  try {
    first = await mount(root);
    const header = { version: SESSION_FORMAT_VERSION, id: request.sessionRef,
      createdAt: 1000, cwd: '/isolated/workshop', isSeeded: false };
    const writer = await first.ctx.sessionPersistence.create(header);
    await writer.append([{ type: 'turn/start', seq: 0, time: 1001,
      data: { turn: 1 } }]);
    await writer.close();
    const core = await first.ctx.sessionPersistence.open(request.sessionRef, 'read');
    const identity = { id: core.header.id, version: core.header.version,
      createdAt: core.header.createdAt, cwd: core.header.cwd };
    assert.equal((await core.read()).events[0].type, 'turn/start');
    await core.close();
    await first.store.create(request.sessionRef, identity, {
      context: { currentSession: request.sessionRef, activeWorldRef: 'world-a',
        orderedSelectedObjectRefs: [], sessionRevision: 'revision-1',
        selectionRevision: 'selection-1' },
      turns: [{ turnRef: 'turn-a', turnRevision: 'turn-1', text: '建一块',
        actionReceiptDigest: null }],
      turnWorldRefs: { 'turn-a': 'world-a' },
      confirmedIntents: { 'turn-a': { intent: { confirmedIntent: {
        kind: 'BUILD_STRUCTURE' } }, confirmationInputId: 'core-confirm' } },
      lastCompiled: { turnRef: 'turn-a', inspection: { targetFacts: {
        sampledBounds: { min: [0, 0, 0], max: [0, 0, 0] } } } },
      pendingApply: { turnRef: 'turn-a', status: 'VERIFIED', request: {
        actorRef: 'actor-a', sessionRef: request.sessionRef,
        authorizationRef: 'grant-original', worldRef: 'world-a',
        transactionId: 'apply-tx', operationDigest: receipt.operationDigest },
      response: { result: receipt } }, receipts: [], pendingUndo: null,
    });
    await first.store.close(); await first.ctx.fiber.dispose(); first = null;

    let current = true;
    const calls = [];
    const authority = { async verify(body) { return { current,
      actorRef: body.actorRef, sessionRef: body.sessionRef,
      authorizationRef: body.authorizationRef, worldRef: 'world-a',
      allowedActions: ['APPLY_RECOVERABLE', 'HISTORY'] }; } };
    const canvas = { contractHandshake, async call(operation, body) {
      calls.push(operation);
      const envelope = result => ({ contractVersion: 'canvas/v4',
        requestId: body.requestId, result, error: null });
      if (operation === 'ListObjects') return envelope({ worldRef: 'world-a',
        registryRevision: 'registry-1', objects: [{ worldRef: 'world-a',
          objectRef: 'object-a', objectRevision: 'object-1', displayName: '石块',
          nameRevision: 'name-1', creationSequence: 1, status: 'READY' }] });
      if (operation === 'HistoryQuery') return envelope({ worldRef: 'world-a',
        objectRef: 'object-a', historyRevision: 'history-1',
        headTransactionId: 'apply-tx', undoAvailable: true, redoAvailable: false,
        entries: [{ transactionId: 'apply-tx', originTransactionId: null,
          affectedObjectRefs: ['object-a'], operationDigest: receipt.operationDigest,
          beforeImageDigest: 'd'.repeat(64),
          expectedAfterReadbackDigest: receipt.readbackDigest,
          receiptDigest: digestValue('receipt', receipt).sha256,
          historyRevision: 'history-1', status: 'VERIFIED' }] });
      throw Error(`unexpected ${operation}`);
    } };
    const second = await mount(root);
    try {
      second.ctx.provide('hanaworldsAuthority', authority);
      second.ctx.provide('hanaworldsCanvasV4', canvas);
      await second.ctx.plugin(workshopPlugin).await();
      const workshop = second.ctx.get('hanaworldsWorkshopV1');
      assert.equal((await workshop.call('AdvanceCurrentBuild', {
        ...request, sessionRef: 'other-session', requestId: 'wrong-session' }))
        .error.code, 'SESSION_NOT_FOUND');
      const result = await workshop.call('AdvanceCurrentBuild', request);
      assert.equal(result.error, null);
      assert.equal(result.result.outcome, 'VERIFIED');
      assert.equal((await workshop.projectionStore.get(request.sessionRef, identity))
        .turns[0].actionReceiptDigest, digestValue('receipt', receipt).sha256);
      assert.deepEqual(calls, ['ListObjects', 'HistoryQuery']);
      assert.equal((await workshop.call('AdvanceCurrentBuild', {
        ...request, authorizationRef: 'new-grant', requestId: 'wrong-grant' }))
        .error.code, 'READBACK_FAILED');
      current = false;
      assert.equal((await workshop.call('AdvanceCurrentBuild', request))
        .error.code, 'AUTHORIZATION_REVOKED');
      assert.deepEqual(calls, ['ListObjects', 'HistoryQuery']);
    } finally { await second.store.close(); await second.ctx.fiber.dispose(); }

    const third = await mount(root);
    try {
      current = true;
      third.ctx.provide('hanaworldsAuthority', authority);
      third.ctx.provide('hanaworldsCanvasV4', canvas);
      await third.ctx.plugin(workshopPlugin).await();
      const workshop = third.ctx.get('hanaworldsWorkshopV1');
      const replay = await workshop.call('AdvanceCurrentBuild', request);
      assert.equal(replay.error, null);
      assert.equal(replay.result.outcome, 'VERIFIED');
      assert.deepEqual(calls, ['ListObjects', 'HistoryQuery']);
      assert.ok((await readdir(join(root, 'core'), { recursive: true }))
        .some(name => name.endsWith('.jsonl')));
    } finally { await third.store.close(); await third.ctx.fiber.dispose(); }
  } finally {
    if (first) { await first.store.close(); await first.ctx.fiber.dispose(); }
    await rm(root, { recursive: true, force: true });
  }
});
