import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WorkshopV1 } from '../src/index.mjs';
import * as contracts from 'hanaworlds-contracts/v4';
import { buildAuthority } from './helpers/build-authority.mjs';

function fixture() {
  const chain = JSON.parse(readFileSync(new URL(
    '../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url)))
    .validCases[0].materializedChain;
  const state = { context: { currentSession: 's1', activeWorldRef: 'fixture-world',
    orderedSelectedObjectRefs: [], sessionRevision: 'srev-1', selectionRevision: 'sel-1' },
    turns: [{ turnRef: 'turn-1', turnRevision: 'fixture-turn-4', text: '建石屋',
      media: [], intentDigest: contracts.digestValue('intent', chain.painterRequest.intent).sha256,
      actionReceiptDigest: null }],
    confirmedIntents: { 'turn-1': { intent: chain.painterRequest.intent,
      brief: chain.painterRequest.referenceBrief, confirmationInputId: 'core-confirm-1' } },
    pendingPlacement: null, lastPlacement: null, lastBuild: null, lastCompiled: null,
    lastAnalysis: null, pendingApply: null, pendingUndo: null, receipts: [] };
  const calls = [];
  let current = true;
  let historyAllowed = true;
  const store = {
    async get() { return structuredClone(state); },
    async replace(_id, _identity, expected, next) {
      assert.equal(state.context.sessionRevision, expected);
      Object.assign(state, structuredClone(next));
    },
  };
  const workshop = new WorkshopV1({
    sessionPersistence: { async open() { return { header: { id: 's1', version: 2,
      createdAt: 1, cwd: null }, async read() { return { events: [] }; }, async close() {} }; } },
    projectionStore: store,
    authority: { async verify(body) { return { current, actorRef: body.actorRef,
      sessionRef: body.sessionRef, authorizationRef: body.authorizationRef,
      worldRef: 'fixture-world', surface: 'SHELL',
      allowedActions: ['INSPECT', 'ANALYZE', 'APPLY_RECOVERABLE',
        ...(historyAllowed ? ['HISTORY'] : [])] }; } },
    canvas: { contractHandshake: contracts.contractHandshake,
      async call(operation, body) {
        calls.push({ operation, body });
        if (operation !== 'InspectPlacementRegion') throw Error(`unexpected ${operation}`);
        if (body.anchor.kind === 'NAMED_PLAYER')
          return { ...chain.canvasInspectResponse, requestId: body.requestId };
        return { contractVersion: 'canvas/v4', requestId: body.requestId,
          result: { outcome: 'PLACEMENT_CHOICE_REQUIRED', choice: {
            anchorKind: 'DEFAULT_PLAYER', reasons: ['MULTIPLE_ONLINE_PLAYERS'],
            options: ['NAME_PLAYER', 'PICK_WORLD_POINT'], candidatePlayerNames: ['alice'],
            placementSettings: { frontGapCells: 2, forwardSearchCells: 16,
              lateralSearchCells: 8, verticalSearchCells: 4, settingsRevision: 'settings-1' },
            observedWorldRevision: 'world-1' } }, error: null, unavailableSettings: null };
      } },
  });
  return { workshop, state, calls, revoke() { current = false; },
    revokeHistory() { historyAllowed = false; },
    fullPath({ linked = true, wrongReadbackDigest = false,
      interruptApply = false } = {}) {
      state.turns[0].media = chain.painterRequest.referenceBrief.media;
      let applied;
      workshop.canvas.call = async (operation, body) => {
        calls.push({ operation, body });
        const envelope = result => ({ contractVersion: 'canvas/v4',
          requestId: body.requestId, result, error: null });
        if (operation === 'InspectPlacementRegion')
          return { ...chain.canvasInspectResponse, requestId: body.requestId };
        if (operation === 'ListObjects') return envelope({ worldRef: 'fixture-world',
          registryRevision: 'registry-1', objects: applied ? [{ worldRef: 'fixture-world',
            objectRef: 'object-a', objectRevision: 'object-1', displayName: '石屋',
            nameRevision: 'name-1', creationSequence: 1, status: 'READY' }] : [] });
        if (operation === 'AnalyzeAffectedObjects') return envelope({
          contractVersion: 'canvas/v2', worldRef: 'fixture-world',
          worldRevision: body.expectedRevision,
          registryRevision: body.expectedRegistryRevision,
          selectionRevision: body.expectedSelectionRevision,
          operationDigest: body.operationDigest, orderedSelectedRefs: [],
          affectedObjectRefs: [] });
        if (operation === 'ApplyRecoverableCommit') {
          if (interruptApply) throw Error('Canvas transport interrupted');
          applied = { contractVersion: 'canvas/v2', transactionId: body.transactionId,
            operationDigest: body.operationDigest,
            transactionPayloadDigest: 'a'.repeat(64), status: 'VERIFIED',
            previousWorldRevision: body.expectedWorldRevision,
            observedWorldRevision: 'world-after', readbackDigest: 'c'.repeat(64),
            restoreStatus: 'NOT_REQUIRED', error: null };
          return envelope(applied);
        }
        if (operation === 'HistoryQuery') return envelope({ worldRef: 'fixture-world',
          objectRef: body.objectRef, historyRevision: 'history-1',
          headTransactionId: linked ? applied.transactionId : 'external-tx',
          undoAvailable: linked, redoAvailable: false,
          entries: linked ? [{ transactionId: applied.transactionId,
            originTransactionId: null, affectedObjectRefs: ['object-a'],
            operationDigest: applied.operationDigest,
            beforeImageDigest: 'd'.repeat(64),
            expectedAfterReadbackDigest: wrongReadbackDigest ?
              'e'.repeat(64) : applied.readbackDigest,
            receiptDigest: contracts.digestValue('receipt', applied).sha256,
            historyRevision: 'history-1', status: 'VERIFIED' }] : [] });
        throw Error(`unexpected Canvas ${operation}`);
      };
      workshop.painter = { contractHandshake: contracts.contractHandshake,
        async call(_op, body) { return { ...chain.painterResponse,
          requestId: body.requestId }; } };
      workshop.brush = { contractHandshake: contracts.contractHandshake,
        async compile(body) { return { ...chain.brushResponse,
          requestId: body.requestId }; } };
      workshop.catalogue = { async read() { return chain.painterRequest.catalogue; } };
      workshop.safety = { async read() { return chain.painterRequest.safetyProfile; } };
      workshop.compilerConfig = { async read() { return {
        compilationConfig: chain.brushRequest.compilationConfig,
        compilerRevision: chain.brushRequest.compilerRevision }; } };
      workshop.applyAuthority = buildAuthority(request());
    } };
}

const request = (requestId = 'build-1') => ({ contractVersion: 'session/v2',
  actorRef: 'user', sessionRef: 's1', requestId, authorizationRef: 'grant',
  worldRef: 'fixture-world', expectedTurnRevision: 'fixture-turn-4' });

test('current confirmed build returns the exact placement frame and replays it without a second inspection', async () => {
  const f = fixture();
  const first = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(first.error, null);
  assert.equal(first.result.outcome, 'CHOICE_REQUIRED');
  assert.equal(first.result.stage, 'PLACEMENT');
  assert.equal(first.result.frame.sessionRef, 's1');
  assert.equal(first.result.frame.turnRevision, 'fixture-turn-4');
  assert.equal(f.calls.length, 1);
  const again = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.deepEqual(again.result, first.result);
  assert.equal(f.calls.length, 1);
  const reordered = Object.fromEntries(Object.entries(request()).reverse());
  assert.deepEqual((await f.workshop.call('AdvanceCurrentBuild', reordered)).result,
    first.result);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.workshop.call('AdvanceCurrentBuild', {
    ...request(), authorizationRef: 'other-grant' })).error.code,
    'TRANSACTION_CONFLICT');
  assert.equal(f.calls.length, 1);
});

test('wrong turn, world, and revoked original grant stop before Canvas', async () => {
  const f = fixture();
  assert.equal((await f.workshop.call('AdvanceCurrentBuild', {
    ...request(), expectedTurnRevision: 'old-turn' })).error.code, 'TURN_REVISION_MISMATCH');
  assert.equal((await f.workshop.call('AdvanceCurrentBuild', {
    ...request(), worldRef: 'other-world' })).error.code, 'WORLD_NOT_BOUND');
  f.revoke();
  assert.equal((await f.workshop.call('AdvanceCurrentBuild', request())).error.code,
    'AUTHORIZATION_REVOKED');
  assert.equal(f.calls.length, 0);
});

test('a published Shell choice advances the same turn without a caller supplied placement ID', async () => {
  const f = fixture();
  const first = await f.workshop.call('AdvanceCurrentBuild', request());
  const frame = first.result.frame;
  const action = frame.actions.find(item => item.inputKinds.includes('SELECT_CHOICE'));
  const projection = { contractVersion: 'interaction-surface/v2',
    sessionRef: 's1', turnRevision: frame.turnRevision,
    frameRef: frame.frameRef, frameRevision: frame.frameRevision,
    actionId: action.actionId, orderedTargetRefs: [],
    intentDigest: f.state.turns[0].intentDigest, operationDigest: null,
    analysisDigest: null, decisionRevision: null };
  const chosen = await f.workshop.call('InvokeAction', {
    contractVersion: 'interaction-surface/v3', actorRef: 'user', sessionRef: 's1',
    requestId: 'choice-request', authorizationRef: 'grant',
    turnRevision: frame.turnRevision, frameRevision: frame.frameRevision,
    frameRef: frame.frameRef, actionId: action.actionId,
    invocationId: 'choice-invocation', surfaceAction: projection,
    surfaceActionDigest: action.surfaceActionDigest,
    input: { kind: 'SELECT_CHOICE', value: 'alice' } });
  assert.equal(chosen.error, null);
  assert.equal(f.state.lastPlacement.outcome, 'REGION_INSPECTED');
  assert.deepEqual(f.calls.at(-1).body.anchor,
    { kind: 'NAMED_PLAYER', engineActorName: 'alice' });
});

test('one public action advances the current durable turn through Apply and returns only a linked Canvas readback', async () => {
  const f = fixture(); f.fullPath();
  const first = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(first.error, null);
  assert.equal(first.result.outcome, 'VERIFIED');
  assert.equal(first.result.receipt.status, 'VERIFIED');
  assert.equal(f.state.turns[0].actionReceiptDigest,
    contracts.digestValue('receipt', first.result.receipt).sha256);
  assert.deepEqual(f.calls.map(row => row.operation), [
    'InspectPlacementRegion', 'ListObjects', 'AnalyzeAffectedObjects',
    'ApplyRecoverableCommit', 'ListObjects', 'HistoryQuery']);
  const again = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.deepEqual(again.result, first.result);
  assert.equal(f.calls.filter(row => row.operation === 'ApplyRecoverableCommit').length, 1);
});

test('Canvas VERIFIED without linked current history remains unconfirmed', async () => {
  const f = fixture(); f.fullPath({ linked: false });
  const result = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(result.error.code, 'READBACK_FAILED');
  assert.equal(f.state.turns[0].actionReceiptDigest, null);
  assert.equal(f.state.pendingApply.status, 'VERIFIED');
  assert.equal(f.calls.filter(row => row.operation === 'ApplyRecoverableCommit').length, 1);
});

test('a history entry with a different world readback digest cannot confirm Apply', async () => {
  const f = fixture(); f.fullPath({ wrongReadbackDigest: true });
  const result = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(result.error.code, 'READBACK_FAILED');
  assert.equal(f.state.turns[0].actionReceiptDigest, null);
});

test('verified Apply remains unconfirmed when current history authorization is absent', async () => {
  const f = fixture(); f.fullPath(); f.revokeHistory();
  const result = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(result.error.code, 'AUTHORIZATION_REVOKED');
  assert.equal(f.state.turns[0].actionReceiptDigest, null);
});

test('unknown Canvas transport remains pending with one durable reserved Apply', async () => {
  const f = fixture(); f.fullPath({ interruptApply: true });
  const result = await f.workshop.call('AdvanceCurrentBuild', request());
  assert.equal(result.error, null);
  assert.equal(result.result.outcome, 'PENDING');
  assert.equal(result.result.stage, 'APPLY');
  assert.equal(f.state.pendingApply.status, 'RESERVED');
  assert.equal(f.state.turns[0].actionReceiptDigest, null);
});
