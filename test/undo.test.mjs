import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopV1 } from '../src/index.mjs';
import { contractHandshake, digestValue, ContractError } from '../vendor/contracts/dist/v4/index.mjs';

const digest = value => digestValue('receipt', value).sha256;
const applyReceipt = { contractVersion: 'canvas/v2', transactionId: 'apply-tx',
  operationDigest: 'a'.repeat(64), transactionPayloadDigest: 'b'.repeat(64),
  status: 'VERIFIED', previousWorldRevision: 'world-0',
  observedWorldRevision: 'world-1', readbackDigest: 'c'.repeat(64),
  restoreStatus: 'NOT_REQUIRED', error: null };
const targetFacts = { profileVersion: 'target-facts/v2', source: 'INSPECTED',
  worldRef: 'world-a', objectRef: 'object-a', worldRevision: 'world-1',
  objectRevision: 'object-1', buildDigest: null, planRevision: null,
  catalogueDigest: 'd'.repeat(64), frameDigest: 'e'.repeat(64),
  sampledBounds: { min: [0, 0, 0], max: [0, 0, 0] },
  coverageDigest: 'f'.repeat(64), occupiedCells: [], knownEmptyCells: [[0, 0, 0]],
  unknownCells: [], portals: [], usableVolume: null };
const entry = { transactionId: 'apply-tx', originTransactionId: null,
  affectedObjectRefs: ['object-a'], operationDigest: applyReceipt.operationDigest,
  beforeImageDigest: '1'.repeat(64), expectedAfterReadbackDigest: applyReceipt.readbackDigest,
  receiptDigest: digest(applyReceipt), historyRevision: 'history-1', status: 'VERIFIED' };
const request = (operation, extra = {}) => ({ contractVersion: 'session/v2',
  actorRef: 'actor-a', sessionRef: 'session-a', requestId: `request-${operation}`,
  authorizationRef: 'grant-a', worldRef: 'world-a', ...extra });

function fixture() {
  const core = { header: { id: 'session-a', version: 1, createdAt: 1, cwd: null },
    events: [] };
  const state = { context: { currentSession: 'session-a', activeWorldRef: 'world-a',
    orderedSelectedObjectRefs: [], sessionRevision: 'session-1', selectionRevision: 'selection-1' },
    turns: [{ turnRef: 'turn-a', turnRevision: 'turn-1', text: '建一块',
      actionReceiptDigest: digest(applyReceipt) }],
    receipts: [{ turnRef: 'turn-a', actionId: 'apply', domainReceiptDigest: digest(applyReceipt) }],
    pendingApply: { turnRef: 'turn-a', status: 'VERIFIED',
      request: { actorRef: 'actor-a', sessionRef: 'session-a', worldRef: 'world-a',
        authorizationRef: 'grant-a', transactionId: 'apply-tx',
        authorizationBinding: { intentDigest: '2'.repeat(64), surfaceActionDigest: '3'.repeat(64) } },
      response: { result: applyReceipt } },
    lastCompiled: { turnRef: 'turn-a', inspection: { targetFacts } } };
  let current = structuredClone(state);
  let allowed = true;
  let world = 'world-a';
  let undoDenial = null;
  let undoTransportFailure = false;
  let moveHead = true;
  let linkUndo = true;
  let afterReadFailures = 0;
  let serviceStatus = 'RECOVERY_PENDING';
  let serviceReceipt = null;
  let serviceAllowed = true;
  let serviceFailure = null;
  let history = { worldRef: 'world-a', objectRef: 'object-a',
    historyRevision: 'history-1', headTransactionId: 'apply-tx',
    entries: [entry], undoAvailable: true, redoAvailable: false };
  const calls = [];
  const canvas = { contractHandshake, async call(operation, body) {
    calls.push({ operation, body: structuredClone(body) });
    const envelope = result => ({ contractVersion: 'canvas/v4',
      requestId: body.requestId, result, error: null });
    if (operation === 'ReadPendingUndoResult' || operation === 'RecoverPendingUndo') {
      if (serviceFailure) throw serviceFailure;
      return envelope({ sessionRef: body.sessionRef, worldRef: body.worldRef,
        originalUndoRequestId: body.originalUndoRequestId,
        status: serviceStatus, receipt: serviceReceipt });
    }
    if (operation === 'ListObjects') return envelope({ worldRef: 'world-a',
      registryRevision: 'registry-1', objects: [{ worldRef: 'world-a', objectRef: 'object-a',
        objectRevision: 'object-1', displayName: '石块', nameRevision: 'name-1',
        creationSequence: 1, status: 'READY' }] });
    if (operation === 'HistoryQuery') {
      if (history.historyRevision === 'history-2' && afterReadFailures > 0) {
        afterReadFailures -= 1;
        throw Error('history transport unavailable');
      }
      return envelope(history);
    }
    if (operation === 'InspectObject') return envelope(targetFacts);
    if (operation === 'Undo') {
      if (undoTransportFailure) throw Error('Undo transport interrupted');
      if (undoDenial) return { contractVersion: 'canvas/v4',
        requestId: body.requestId, result: null, error: undoDenial };
      const receipt = { ...applyReceipt, transactionId: body.transactionId,
        operationDigest: '4'.repeat(64), previousWorldRevision: body.expectedWorldRevision,
        observedWorldRevision: 'world-2', readbackDigest: '5'.repeat(64) };
      if (moveHead) history = { ...history, historyRevision: 'history-2',
        headTransactionId: null, undoAvailable: false, redoAvailable: true,
        entries: linkUndo ? [...history.entries, { ...entry,
          transactionId: body.transactionId, originTransactionId: 'apply-tx',
          operationDigest: receipt.operationDigest, receiptDigest: digest(receipt),
          historyRevision: 'history-2' }] : history.entries };
      return envelope(receipt);
    }
    throw Error(`unexpected Canvas ${operation}`);
  } };
  const persistence = { async open(id, mode) {
    assert.equal(id, 'session-a'); assert.equal(mode, 'read');
    return { header: core.header, async read() { return { events: core.events }; },
      async close() {} };
  } };
  const projectionStore = { async get() { return structuredClone(current); },
    async replace(_id, _identity, expected, next) {
      assert.equal(expected, current.context.sessionRevision);
      current = structuredClone(next);
    } };
  const authority = { async verifyService(body) { return { current: serviceAllowed,
    domainOwner: 'hanaworlds-workshop', serviceRecoveryRef: body.serviceRecoveryRef,
    actorRef: body.actorRef, sessionRef: body.sessionRef, worldRef: body.worldRef,
    authorizationRef: body.authorizationRef,
    allowedActions: ['RecoverPendingUndo'] }; },
    async verify(body) { return { current: allowed,
    actorRef: body.actorRef, sessionRef: body.sessionRef,
    authorizationRef: body.authorizationRef, worldRef: world,
    allowedActions: ['HISTORY', 'UNDO'] }; } };
  const create = () => new WorkshopV1({ sessionPersistence: persistence,
    projectionStore, canvas, authority, capabilities: {} });
  return { create, calls, revoke: () => { allowed = false; },
    reauthorize: () => { allowed = true; },
    revokeService: () => { serviceAllowed = false; },
    serviceResult: (status, receipt = null) => { serviceStatus = status; serviceReceipt = receipt; },
    failService: error => { serviceFailure = error; },
    switchWorld: () => { world = 'world-b'; },
    setPeer: handshake => { canvas.contractHandshake = handshake; },
    denyUndo: error => { undoDenial = error; },
    interruptUndo: () => { undoTransportFailure = true; },
    resumeUndo: () => { undoTransportFailure = false; },
    keepHead: () => { moveHead = false; },
    omitUndoEntry: () => { linkUndo = false; },
    failNextAfterRead: () => { afterReadFailures = 1; },
    setHistory: value => { history = value; }, state: () => current };
}

const recovery = (extra = {}) => ({ contractVersion: 'session/v2',
  actorRef: 'actor-a', sessionRef: 'session-a', requestId: 'recovery-1',
  authorizationRef: 'grant-a', worldRef: 'world-a',
  serviceRecoveryRef: 'trusted-service-1', ...extra });

test('service recovery rejects absent and forged pending Undo without Canvas calls', async () => {
  const f = fixture();
  const absent = await f.create().recoverPendingUndo(recovery());
  assert.equal(absent.error.code, 'TRANSACTION_CONFLICT');
  assert.equal(f.calls.length, 0);
  f.failNextAfterRead();
  await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  const before = f.calls.length;
  for (const changed of [{ sessionRef: 'other-session' }, { worldRef: 'other-world' },
    { authorizationRef: 'other-grant' }, { actorRef: 'other-actor' },
    { originalUndoRequestId: 'forged' }, { transactionId: 'forged' }]) {
    const denied = await f.create().recoverPendingUndo(recovery(changed));
    assert.ok(denied.error);
  }
  assert.equal(f.calls.length, before);
});

test('revoked player can recover only the original durable Undo through authenticated service', async () => {
  const f = fixture(); f.failNextAfterRead();
  await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  const receipt = f.state().pendingUndo.receipt;
  f.serviceResult('VERIFIED', receipt);
  f.revoke();
  const result = await f.create().recoverPendingUndo(recovery());
  assert.equal(result.error, null);
  assert.equal(result.result.status, 'VERIFIED');
  assert.equal(result.result.originalUndoRequestId, 'request-uncertain-read');
  assert.equal(result.result.receipt.transactionId, receipt.transactionId);
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  assert.equal(digest(f.state().pendingUndo.receipt), digest(receipt));
  assert.equal(f.calls.at(-1).operation, 'ReadPendingUndoResult');
  assert.equal(f.calls.at(-1).body.originalUndoRequestId, 'request-uncertain-read');
  assert.equal('transactionId' in f.calls.at(-1).body, false);
  f.reauthorize();
  const reopened = await f.create().call('ReadCurrentUndoStatus', request('after-recovery'));
  assert.equal(reopened.error, null);
  assert.equal(reopened.result.availability, 'NO_UNDO_AT_HEAD');
  assert.equal(f.state().pendingUndo.status, 'VERIFIED');
  assert.equal(f.calls.filter(row => row.operation === 'Undo').length, 1);
  f.revoke();
  assert.equal((await f.create().call('UndoCurrentBuild', request('new', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }))).error.code,
  'AUTHORIZATION_REVOKED');
  f.revokeService();
  assert.equal((await f.create().recoverPendingUndo(recovery())).error.code,
    'PERMISSION_DENIED');
});

test('pending and unknown service outcomes never turn an unverified receipt into success', async () => {
  const f = fixture(); f.failNextAfterRead();
  await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  f.revoke();
  const pending = await f.create().recoverPendingUndo(recovery());
  assert.equal(pending.result.status, 'RECOVERY_PENDING');
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  assert.equal(f.calls.at(-1).operation, 'RecoverPendingUndo');
  f.serviceResult('UNKNOWN');
  const unknown = await f.create().recoverPendingUndo(recovery());
  assert.equal(unknown.result.status, 'UNKNOWN');
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  f.serviceResult('VERIFIED', { ...f.state().pendingUndo.receipt,
    transactionId: 'foreign-tx' });
  const forged = await f.create().recoverPendingUndo(recovery());
  assert.ok(forged.error);
  assert.equal(forged.result, null);
});

test('rolled back Canvas recovery stays durable and minimal after player revocation', async () => {
  const f = fixture(); f.interruptUndo();
  await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(f.state().pendingUndo.status, 'RESERVED');
  f.revoke();
  f.serviceResult('ROLLED_BACK');
  const rolled = await f.create().recoverPendingUndo(recovery());
  assert.deepEqual(JSON.parse(JSON.stringify(rolled.result)),
    { sessionRef: 'session-a', worldRef: 'world-a',
    originalUndoRequestId: 'request-uncertain-read', status: 'ROLLED_BACK',
    receipt: null });
  assert.equal(f.state().pendingUndo.status, 'ROLLED_BACK');
  f.reauthorize();
  const status = await f.create().call('ReadCurrentUndoStatus', request('after-rollback'));
  assert.equal(status.error, null);
  assert.equal(status.result.availability, 'AVAILABLE');
  const old = await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(old.error.code, 'UNDO_CONFLICT');
  assert.equal(f.calls.filter(row => row.operation === 'Undo').length, 1);
  f.failService(Error('Canvas transport lost'));
  const repeated = await f.create().recoverPendingUndo(recovery());
  assert.equal(repeated.result.status, 'ROLLED_BACK');
  assert.equal(repeated.result.receipt, null);
  f.resumeUndo();
  const fresh = await f.create().call('UndoCurrentBuild', request('fresh-after-rollback', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(fresh.error, null);
  assert.equal(fresh.result.status, 'VERIFIED');
  assert.deepEqual(f.calls.filter(row => row.operation === 'Undo').map(row =>
    row.body.requestId), ['request-uncertain-read', 'request-fresh-after-rollback']);
});

test('a reserved Undo recovers the same Canvas transaction without resending ordinary Undo', async () => {
  const f = fixture(); f.interruptUndo();
  await f.create().call('UndoCurrentBuild', request('crashed-send', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  const pending = f.state().pendingUndo;
  assert.equal(pending.status, 'RESERVED');
  f.revoke();
  const stillPending = await f.create().recoverPendingUndo(recovery());
  assert.equal(stillPending.result.status, 'RECOVERY_PENDING');
  assert.equal(f.state().pendingUndo.status, 'RESERVED');
  f.serviceResult('VERIFIED', { ...applyReceipt,
    transactionId: pending.request.transactionId });
  const recovered = await f.create().recoverPendingUndo(recovery());
  assert.equal(recovered.error, null);
  assert.equal(recovered.result.status, 'VERIFIED');
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  assert.equal(f.calls.at(-1).body.originalUndoRequestId, 'request-crashed-send');
  f.reauthorize();
  const unverifiedHead = await f.create().call('ReadCurrentUndoStatus', request('head-unverified'));
  assert.equal(unverifiedHead.error.code, 'READBACK_FAILED');
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  assert.deepEqual(f.calls.filter(row => row.operation === 'Undo').map(row =>
    row.body.requestId), ['request-crashed-send']);
});

test('Canvas rollback cannot contradict a locally recorded VERIFIED Undo receipt', async () => {
  const f = fixture(); f.failNextAfterRead();
  await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  f.revoke(); f.serviceResult('ROLLED_BACK');
  const contradicted = await f.create().recoverPendingUndo(recovery());
  assert.equal(contradicted.result, null);
  assert.equal(contradicted.error.code, 'READBACK_FAILED');
});

test('status matches this Session verified Apply to the current author head and Undo reads it back', async () => {
  const f = fixture();
  const status = await f.create().call('ReadCurrentUndoStatus', request('status'));
  assert.equal(status.error, null);
  assert.equal(status.result.availability, 'AVAILABLE');
  assert.equal(status.result.turnRef, 'turn-a');
  assert.deepEqual(JSON.parse(JSON.stringify(status.result.head)),
    { historyRevision: 'history-1', headTransactionId: 'apply-tx' });
  const undone = await f.create().call('UndoCurrentBuild', request('undo', {
    expectedTurnRevision: status.result.turnRevision,
    expectedHistoryRevision: status.result.head.historyRevision }));
  assert.equal(undone.error, null);
  assert.equal(undone.result.status, 'VERIFIED');
  assert.deepEqual(JSON.parse(JSON.stringify(undone.result.afterHead)),
    { historyRevision: 'history-2', headTransactionId: null });
  const reopened = await f.create().call('ReadCurrentUndoStatus', request('reopened'));
  assert.equal(reopened.result.availability, 'NO_UNDO_AT_HEAD');
  assert.deepEqual(reopened.result.head, undone.result.afterHead);
  assert.deepEqual(f.calls.filter(row => row.operation === 'Undo').map(row =>
    [row.body.historyTransactionId, row.body.expectedHistoryRevision,
      row.body.expectedWorldRevision, row.body.expectedObjectRevisions['object-a']]),
  [['apply-tx', 'history-1', 'world-1', 'object-1']]);
});

test('reopening after a verified Canvas Undo resumes the durable history readback', async () => {
  const f = fixture(); f.failNextAfterRead();
  const first = await f.create().call('UndoCurrentBuild', request('uncertain-read', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(first.result, null);
  assert.equal(f.state().pendingUndo.status, 'CANVAS_VERIFIED');
  const reopened = await f.create().call('ReadCurrentUndoStatus', request('reopen-after-read'));
  assert.equal(reopened.error, null);
  assert.equal(reopened.result.availability, 'NO_UNDO_AT_HEAD');
  assert.equal(reopened.result.head.historyRevision, 'history-2');
  assert.equal(f.state().pendingUndo.status, 'VERIFIED');
  assert.equal(f.calls.filter(row => row.operation === 'Undo').length, 1);
});

test('an older Canvas peer cannot advertise the undo operation', async () => {
  const f = fixture();
  f.setPeer({ ...contractHandshake, contracts: 'hanaworlds-contracts@0.3.1' });
  const status = await f.create().call('ReadCurrentUndoStatus', request('old-peer'));
  assert.equal(status.error.code, 'UNSUPPORTED_VERSION');
  assert.equal(f.calls.length, 0);
});

test('revocation, world change, absent receipt and external head all fail without Undo', async () => {
  const revoked = fixture(); revoked.revoke();
  assert.equal((await revoked.create().call('ReadCurrentUndoStatus', request('revoked'))).error.code,
    'AUTHORIZATION_REVOKED');
  const switched = fixture(); switched.switchWorld();
  assert.equal((await switched.create().call('ReadCurrentUndoStatus', request('switched'))).error.code,
    'WORLD_NOT_BOUND');
  const missing = fixture(); missing.state().receipts.length = 0;
  assert.equal((await missing.create().call('ReadCurrentUndoStatus', request('missing'))).result.availability,
    'NO_VERIFIED_BUILD');
  const conflict = fixture(); conflict.setHistory({ worldRef: 'world-a', objectRef: 'object-a',
    historyRevision: 'history-2', headTransactionId: 'other-tx', entries: [entry],
    undoAvailable: true, redoAvailable: false });
  const status = await conflict.create().call('ReadCurrentUndoStatus', request('conflict'));
  assert.equal(status.result.availability, 'NO_UNDO_AT_HEAD');
  assert.equal(conflict.calls.some(row => row.operation === 'Undo'), false);
});

test('stale CAS, mismatched durable receipt and changed world stop before Canvas Undo', async () => {
  const stale = fixture();
  const rejected = await stale.create().call('UndoCurrentBuild', request('stale', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-old' }));
  assert.equal(rejected.error.code, 'STALE_REVISION');
  assert.equal(stale.calls.some(row => row.operation === 'Undo'), false);

  const corrupt = fixture();
  corrupt.state().receipts[0].domainReceiptDigest = '0'.repeat(64);
  const absent = await corrupt.create().call('ReadCurrentUndoStatus', request('absent'));
  assert.equal(absent.error.code, 'SAVED_RESOURCE_UNAVAILABLE');
  assert.equal(corrupt.calls.length, 0);

  const switched = fixture();
  const status = await switched.create().call('ReadCurrentUndoStatus', request('before-switch'));
  switched.switchWorld();
  const changed = await switched.create().call('UndoCurrentBuild', request('after-switch', {
    expectedTurnRevision: status.result.turnRevision,
    expectedHistoryRevision: status.result.head.historyRevision }));
  assert.equal(changed.error.code, 'WORLD_NOT_BOUND');
  assert.equal(switched.calls.some(row => row.operation === 'Undo'), false);
});

test('Canvas rejection and a VERIFIED receipt without history rollback never report success', async () => {
  const denied = fixture();
  denied.denyUndo(new ContractError('UNDO_CONFLICT', 'validate',
    'EXTERNAL_EDIT_CONFLICT').publicError);
  const rejected = await denied.create().call('UndoCurrentBuild', request('denied', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(rejected.result, null);
  assert.equal(rejected.error.code, 'UNDO_CONFLICT');

  const falseVerified = fixture(); falseVerified.keepHead();
  const notMoved = await falseVerified.create().call('UndoCurrentBuild', request('not-moved', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(notMoved.result, null);
  assert.equal(notMoved.error.code, 'READBACK_FAILED');
  assert.equal(falseVerified.state().pendingUndo.status, 'CANVAS_VERIFIED');

  const unlinked = fixture(); unlinked.omitUndoEntry();
  const noEntry = await unlinked.create().call('UndoCurrentBuild', request('unlinked', {
    expectedTurnRevision: 'turn-1', expectedHistoryRevision: 'history-1' }));
  assert.equal(noEntry.result, null);
  assert.equal(noEntry.error.code, 'READBACK_FAILED');
});
