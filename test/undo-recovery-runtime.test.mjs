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
import { WorkshopV1 } from '../src/index.mjs';
import { WorkshopProjectionStore } from '../src/projection-store.mjs';
import { contractHandshake } from '../vendor/contracts/dist/v4/index.mjs';

async function mount(root) {
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, {
    root: join(root, 'core'), compression: 'none' }).await();
  await ctx.plugin(Storage).await();
  await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
  await ctx.plugin(StorageDomain, { backend: 'json' }).await();
  return { ctx, store: new WorkshopProjectionStore(() => ctx.get('storageDomain')) };
}

test('real Core JSONL and Workshop JSON projection reopen a revoked pending Undo', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-UNDO-RECOVERY-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'real-core-recovery-'));
  const sessionRef = 'session-recovery';
  const originalUndoRequestId = 'undo-original';
  const receipt = { contractVersion: 'canvas/v2', transactionId: 'undo-tx',
    operationDigest: 'a'.repeat(64), transactionPayloadDigest: 'b'.repeat(64),
    status: 'VERIFIED', previousWorldRevision: 'world-0',
    observedWorldRevision: 'world-1', readbackDigest: 'c'.repeat(64),
    restoreStatus: 'NOT_REQUIRED', error: null };
  const undo = { contractVersion: 'canvas/v4', actorRef: 'actor-a', sessionRef,
    requestId: originalUndoRequestId, authorizationRef: 'old-grant',
    worldRef: 'world-a', objectRef: 'object-a', transactionId: 'undo-tx',
    historyTransactionId: 'apply-tx', expectedHistoryRevision: 'history-1',
    expectedWorldRevision: 'world-1', expectedObjectRevisions: { 'object-a': 'object-1' },
    intentDigest: 'd'.repeat(64), surfaceActionDigest: 'e'.repeat(64) };
  const request = { contractVersion: 'session/v2', actorRef: 'actor-a', sessionRef,
    requestId: 'recovery-query', authorizationRef: 'old-grant',
    worldRef: 'world-a', serviceRecoveryRef: 'host-service' };
  let first;
  try {
    first = await mount(root);
    const header = { version: SESSION_FORMAT_VERSION, id: sessionRef,
      createdAt: 1000, cwd: '/isolated/workshop', isSeeded: false };
    const handle = await first.ctx.sessionPersistence.create(header);
    await handle.append([{ type: 'turn/start', seq: 0, time: 1001,
      data: { turn: 1 } }]);
    await handle.close();
    const core = await first.ctx.sessionPersistence.open(sessionRef, 'read');
    const identity = { id: core.header.id, version: core.header.version,
      createdAt: core.header.createdAt, cwd: core.header.cwd };
    assert.equal((await core.read()).events[0].type, 'turn/start');
    await core.close();
    await first.store.create(sessionRef, identity, {
      context: { currentSession: sessionRef, activeWorldRef: 'world-a',
        orderedSelectedObjectRefs: [], sessionRevision: 'revision-1',
        selectionRevision: 'selection-1' }, turns: [],
      pendingUndo: { request: undo, turnRef: 'turn-a', turnRevision: 'turn-1',
        expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1',
        beforeHead: { historyRevision: 'history-1', headTransactionId: 'apply-tx' },
        affectedObjectRefs: ['object-a'], status: 'CANVAS_VERIFIED', receipt },
    });
    await first.store.close(); await first.ctx.fiber.dispose(); first = null;

    const second = await mount(root);
    try {
      const calls = [];
      const workshop = new WorkshopV1({
        sessionPersistence: second.ctx.sessionPersistence,
        projectionStore: second.store,
        authority: {
          async verify() { return { current: false }; },
          async verifyService(body) { return { current: true,
            domainOwner: 'hanaworlds-workshop',
            serviceRecoveryRef: body.serviceRecoveryRef,
            actorRef: body.actorRef, sessionRef: body.sessionRef,
            worldRef: body.worldRef, authorizationRef: body.authorizationRef,
            allowedActions: ['RecoverPendingUndo'] }; },
        },
        canvas: { contractHandshake, async call(operation, body) {
          calls.push({ operation, body });
          return { contractVersion: 'canvas/v4', requestId: body.requestId,
            result: { sessionRef, worldRef: 'world-a',
              originalUndoRequestId, status: 'VERIFIED', receipt }, error: null };
        } },
      });
      const recovered = await workshop.recoverPendingUndo(request);
      assert.equal(recovered.error, null);
      assert.equal(recovered.result.status, 'VERIFIED');
      assert.deepEqual(calls.map(call => call.operation), ['ReadPendingUndoResult']);
      assert.equal(calls[0].body.originalUndoRequestId, originalUndoRequestId);
      assert.equal('transactionId' in calls[0].body, false);
      assert.equal((await workshop.call('UndoCurrentBuild', {
        contractVersion: 'session/v2', actorRef: 'actor-a', sessionRef,
        requestId: 'new-undo', authorizationRef: 'old-grant', worldRef: 'world-a',
        expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1',
      })).error.code, 'AUTHORIZATION_REVOKED');
      assert.ok((await readdir(join(root, 'core'), { recursive: true })).some(
        name => name.endsWith('.jsonl')));
    } finally { await second.store.close(); await second.ctx.fiber.dispose(); }
  } finally {
    if (first) { await first.store.close(); await first.ctx.fiber.dispose(); }
    await rm(root, { recursive: true, force: true });
  }
});
