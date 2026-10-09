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

test('real Core JSONL and Workshop JSON projection reopen a revoked pending Undo', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-UNDO-RECOVERY-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'real-core-recovery-'));
  const sessionRef = 'session-recovery';
  const originalUndoRequestId = 'undo-original';
  const applyReceipt = { contractVersion: 'canvas/v2', transactionId: 'apply-tx',
    operationDigest: '1'.repeat(64), transactionPayloadDigest: '2'.repeat(64),
    status: 'VERIFIED', previousWorldRevision: 'world-0',
    observedWorldRevision: 'world-1', readbackDigest: '3'.repeat(64),
    restoreStatus: 'NOT_REQUIRED', error: null };
  const digest = value => digestValue('receipt', value).sha256;
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
  let identity;
  try {
    first = await mount(root);
    const header = { version: SESSION_FORMAT_VERSION, id: sessionRef,
      createdAt: 1000, cwd: '/isolated/workshop', isSeeded: false };
    const handle = await first.ctx.sessionPersistence.create(header);
    await handle.append([{ type: 'turn/start', seq: 0, time: 1001,
      data: { turn: 1 } }]);
    await handle.close();
    const core = await first.ctx.sessionPersistence.open(sessionRef, 'read');
    identity = { id: core.header.id, version: core.header.version,
      createdAt: core.header.createdAt, cwd: core.header.cwd };
    assert.equal((await core.read()).events[0].type, 'turn/start');
    await core.close();
    await first.store.create(sessionRef, identity, {
      context: { currentSession: sessionRef, activeWorldRef: 'world-a',
        orderedSelectedObjectRefs: [], sessionRevision: 'revision-1',
        selectionRevision: 'selection-1' },
      turns: [{ turnRef: 'turn-a', turnRevision: 'turn-1', text: '建一块',
        actionReceiptDigest: digest(applyReceipt) }],
      receipts: [{ turnRef: 'turn-a', actionId: 'apply',
        domainReceiptDigest: digest(applyReceipt),
        apply: { request: { actorRef: 'actor-a', sessionRef, worldRef: 'world-a',
          transactionId: 'apply-tx' }, response: applyReceipt,
          sampledBounds: { min: [0, 0, 0], max: [0, 0, 0] } } }],
      pendingUndo: { request: undo, turnRef: 'turn-a', turnRevision: 'turn-1',
        expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1',
        beforeHead: { historyRevision: 'history-1', headTransactionId: 'apply-tx' },
        expectedAfterHeadTransactionId: null,
        affectedObjectRefs: ['object-a'], status: 'RESERVED' },
    });
    await first.store.close(); await first.ctx.fiber.dispose(); first = null;

    const second = await mount(root);
    try {
      const calls = [];
      let serviceStatus = 'UNKNOWN';
      let serviceReceipt = null;
      let serviceAllowed = true;
      const workshop = new WorkshopV1({
        sessionPersistence: second.ctx.sessionPersistence,
        projectionStore: second.store,
        authority: {
          async verify() { return { current: false }; },
          async verifyService(body) { return { current: serviceAllowed,
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
              originalUndoRequestId, status: serviceStatus,
              receipt: serviceReceipt }, error: null };
        } },
      });
      serviceAllowed = false;
      const wrongService = await workshop.recoverPendingUndo(request);
      assert.equal(wrongService.error.code, 'PERMISSION_DENIED');
      serviceAllowed = true;
      const wrongSession = await workshop.recoverPendingUndo({
        ...request, sessionRef: 'other-session' });
      assert.equal(wrongSession.error.code, 'SESSION_NOT_FOUND');
      const wrongWorld = await workshop.recoverPendingUndo({
        ...request, worldRef: 'world-b' });
      assert.equal(wrongWorld.error.code, 'PERMISSION_DENIED');
      assert.equal(calls.length, 0);
      const unknown = await workshop.recoverPendingUndo(request);
      assert.equal(unknown.result.status, 'UNKNOWN');
      assert.equal((await second.store.get(sessionRef, identity)).pendingUndo.status,
        'RESERVED');
      serviceStatus = 'VERIFIED';
      serviceReceipt = { ...receipt, transactionId: 'foreign-tx' };
      const contradictory = await workshop.recoverPendingUndo(request);
      assert.equal(contradictory.error.code, 'READBACK_FAILED');
      assert.equal((await second.store.get(sessionRef, identity)).pendingUndo.status,
        'RESERVED');
      serviceReceipt = receipt;
      const recovered = await workshop.recoverPendingUndo(request);
      assert.equal(recovered.error, null);
      assert.equal(recovered.result.status, 'VERIFIED');
      const persisted = await second.store.get(sessionRef, identity);
      assert.equal(persisted.pendingUndo.status, 'CANVAS_VERIFIED');
      assert.equal(digest(persisted.pendingUndo.receipt), digest(receipt));
      assert.deepEqual(calls.map(call => call.operation),
        ['ReadPendingUndoResult', 'ReadPendingUndoResult', 'ReadPendingUndoResult']);
      assert.equal(calls.at(-1).body.originalUndoRequestId, originalUndoRequestId);
      assert.equal('transactionId' in calls.at(-1).body, false);
      assert.equal((await workshop.call('UndoCurrentBuild', {
        contractVersion: 'session/v2', actorRef: 'actor-a', sessionRef,
        requestId: 'new-undo', authorizationRef: 'old-grant', worldRef: 'world-a',
        expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1',
      })).error.code, 'AUTHORIZATION_REVOKED');
      assert.ok((await readdir(join(root, 'core'), { recursive: true })).some(
        name => name.endsWith('.jsonl')));
    } finally { await second.store.close(); await second.ctx.fiber.dispose(); }

    const third = await mount(root);
    try {
      const calls = [];
      const reopened = await third.store.get(sessionRef, identity);
      assert.equal(reopened.pendingUndo.status, 'CANVAS_VERIFIED');
      const workshop = new WorkshopV1({
        sessionPersistence: third.ctx.sessionPersistence, projectionStore: third.store,
        authority: { async verify(body) { return { current: true,
          actorRef: body.actorRef, sessionRef: body.sessionRef,
          authorizationRef: body.authorizationRef, worldRef: body.worldRef,
          allowedActions: ['HISTORY', 'UNDO'] }; } },
        canvas: { contractHandshake, async call(operation, body) {
          calls.push({ operation, body });
          if (operation === 'HistoryQuery') return { contractVersion: 'canvas/v4',
            requestId: body.requestId, error: null,
            result: { worldRef: 'world-a', objectRef: 'object-a',
              historyRevision: 'history-2', headTransactionId: null,
              undoAvailable: false, redoAvailable: true,
              entries: [{ transactionId: 'apply-tx', originTransactionId: null,
                affectedObjectRefs: ['object-a'], operationDigest: applyReceipt.operationDigest,
                beforeImageDigest: '4'.repeat(64),
                expectedAfterReadbackDigest: applyReceipt.readbackDigest,
                receiptDigest: digest(applyReceipt), historyRevision: 'history-1',
                status: 'VERIFIED' },
              { transactionId: 'undo-tx', originTransactionId: 'apply-tx',
                affectedObjectRefs: ['object-a'], operationDigest: receipt.operationDigest,
                beforeImageDigest: '5'.repeat(64),
                expectedAfterReadbackDigest: receipt.readbackDigest,
                receiptDigest: digest(receipt), historyRevision: 'history-2',
                status: 'VERIFIED' }] } };
          if (operation === 'ListObjects') return { contractVersion: 'canvas/v4',
            requestId: body.requestId, error: null,
            result: { worldRef: 'world-a', registryRevision: 'registry-1',
              objects: [{ worldRef: 'world-a', objectRef: 'object-a',
                objectRevision: 'object-1', displayName: '石块',
                nameRevision: 'name-1', creationSequence: 1, status: 'READY' }] } };
          throw Error(`unexpected Canvas ${operation}`);
        } }, capabilities: {},
      });
      const status = await workshop.call('ReadCurrentUndoStatus', {
        contractVersion: 'session/v2', actorRef: 'actor-a', sessionRef,
        requestId: 'after-restart', authorizationRef: 'old-grant', worldRef: 'world-a' });
      assert.equal(status.error, null);
      assert.equal(status.result.availability, 'NO_UNDO_AT_HEAD');
      assert.equal((await third.store.get(sessionRef, identity)).pendingUndo.status, 'VERIFIED');
      assert.equal(calls.filter(call => call.operation === 'Undo').length, 0);
    } finally { await third.store.close(); await third.ctx.fiber.dispose(); }
  } finally {
    if (first) { await first.store.close(); await first.ctx.fiber.dispose(); }
    await rm(root, { recursive: true, force: true });
  }
});
