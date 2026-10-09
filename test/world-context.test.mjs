import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResponse } from 'hanaworlds-contracts/v4';
import { WorkshopV1 } from '../src/index.mjs';
import { worldFixture, memoryPorts, capabilities, startRequest, switchRequest,
  plain, denied } from './helpers/world-context.mjs';

async function setup() {
  const f = worldFixture(); const ports = memoryPorts();
  const workshop = new WorkshopV1({ ...ports, capabilities,
    authority: f.authority, canvas: f.canvas });
  const opened = await workshop.call('StartOrResumeSession', startRequest);
  assert.equal(opened.error, null);
  const body = switchRequest(opened.result.context.sessionRevision);
  f.capture(body);
  return { f, ports, workshop, body };
}

test('first world selection uses public Canvas CAS, selects before objects, then rechecks', async () => {
  const { f, workshop, body, ports } = await setup();
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error, null);
  assert.deepEqual(f.calls.map(x => x.operation), ['ReadWorldSelectionContext',
    'SelectWorldConnection', 'ReadWorldSelectionContext', 'ListObjects', 'ReadWorldSelectionContext']);
  assert.equal(f.calls[1].request.expectedRevision, 'canvas-actual-empty-cas');
  assert.equal(f.calls[1].request.connectionRef, 'connection-world-a');
  assert.equal(response.result.context.activeWorldRef, 'world-a');
  assert.equal(ports.row.writes[0].context.activeWorldRef, null);
  assert.equal(ports.row.state.context.activeWorldRef, 'world-a');
  assert.deepEqual(plain(validateResponse('session/v2', 'SwitchWorldContext', response)), plain(response));
});

test('existing Canvas binding is read even when Workshop is new; switch uses old Canvas world and CAS', async () => {
  const { f, workshop, body } = await setup();
  f.selection = { status: 'BOUND', connectionRef: 'old-connection', context: {
    currentSession: 's1', activeWorldRef: 'old-world', orderedSelectedObjectRefs: [],
    sessionRevision: 'old-canvas-cas', selectionRevision: 'old-selection' } };
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error, null);
  assert.equal(f.calls[1].operation, 'SwitchWorldConnection');
  assert.equal(f.calls[1].request.worldRef, 'old-world');
  assert.equal(f.calls[1].request.fromWorldRef, 'old-world');
  assert.equal(f.calls[1].request.toWorldRef, 'world-a');
  assert.equal(f.calls[1].request.expectedRevision, 'old-canvas-cas');
});

test('same-world reopen and lost selection receipt recover via current public context, never replay guessed CAS', async () => {
  const { f, workshop, body, ports } = await setup();
  f.afterCall = async operation => { if (operation === 'SelectWorldConnection') throw Error('lost receipt'); };
  const lost = await workshop.call('SwitchWorldContext', body);
  assert.equal(lost.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(ports.row.state.context.activeWorldRef, null);
  f.afterCall = async () => {}; f.calls.length = 0;
  const reopened = new WorkshopV1({ ...ports, capabilities, authority: f.authority, canvas: f.canvas });
  const current = await reopened.call('StartOrResumeSession', startRequest);
  const retry = switchRequest(current.result.context.sessionRevision, { requestId: 'new-live-invoke' });
  f.capture(retry);
  const answer = await reopened.call('SwitchWorldContext', retry);
  assert.equal(answer.error, null);
  assert.deepEqual(f.calls.map(x => x.operation),
    ['ReadWorldSelectionContext', 'ListObjects', 'ReadWorldSelectionContext']);
});

for (const [name, patch, code] of [
  ['READ only', { actions: ['READ'] }, 'AUTHORIZATION_REVOKED'],
  ['revoked', { current: false }, 'AUTHORIZATION_REVOKED'],
  ['cancelled', { invocationStatus: 'CANCELLED' }, 'PERMISSION_DENIED'],
  ['ended', { invocationStatus: 'ENDED' }, 'PERMISSION_DENIED'],
  ['missing incarnation', { incarnation: null }, 'SESSION_NOT_FOUND'],
  ['wrong world', { proofOverrides: { worldRef: 'wrong' } }, 'PERMISSION_DENIED'],
  ['wrong actor', { proofOverrides: { actorRef: 'wrong' } }, 'AUTHORIZATION_REVOKED'],
  ['wrong session', { proofOverrides: { sessionRef: 'wrong' } }, 'AUTHORIZATION_REVOKED'],
  ['wrong original auth', { proofOverrides: { authorizationRef: 'wrong' } }, 'AUTHORIZATION_REVOKED'],
]) test(`entry rejects ${name} before Canvas`, async () => {
  const { f, workshop, body, ports } = await setup(); Object.assign(f, patch);
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error.code, code); assert.equal(f.calls.length, 0);
  assert.equal(ports.row.state.context.activeWorldRef, null);
});

for (const phase of ['ReadWorldSelectionContext', 'SelectWorldConnection', 'ListObjects']) {
  for (const [name, patch, code] of [
    ['revocation', { current: false }, 'AUTHORIZATION_REVOKED'],
    ['cancellation', { invocationStatus: 'CANCELLED' }, 'PERMISSION_DENIED'],
    ['incarnation replacement', { incarnation: 'inc-2' }, 'PERMISSION_DENIED'],
    ['grant replacement', { grant: 'native-2' }, 'AUTHORIZATION_REVOKED'],
    ['invocation replacement', { invocation: 'invoke-2' }, 'PERMISSION_DENIED'],
  ]) test(`late ${name} after ${phase} refuses readiness`, async () => {
    const { f, workshop, body, ports } = await setup();
    f.afterCall = async op => { if (op === phase) Object.assign(f, patch); };
    const response = await workshop.call('SwitchWorldContext', body);
    assert.equal(response.error.code, code);
    assert.equal(response.result, null); assert.equal(ports.row.state.context.activeWorldRef, null);
  });
}

test('cancellation during durable ready save clears the projection before rejecting', async () => {
  const { f, workshop, body, ports } = await setup();
  ports.row.onReplace = async state => { if (state.context.activeWorldRef) f.invocationStatus = 'CANCELLED'; };
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error.code, 'PERMISSION_DENIED');
  assert.equal(ports.row.state.context.activeWorldRef, null);
});

test('empty and ambiguous candidates cannot fabricate a connection', async () => {
  for (const count of [0, 2]) {
    const { f, workshop, body } = await setup();
    const candidate = f.context().inventory.connections[0];
    f.candidates = Array.from({ length: count }, (_, n) => ({ ...candidate, connectionRef: `candidate-${n}` }));
    const response = await workshop.call('SwitchWorldContext', body);
    assert.equal(response.error.code, count ? 'CAPABILITY_UNAVAILABLE' : 'CONNECTION_NOT_FOUND');
    assert.deepEqual(f.calls.map(x => x.operation), ['ReadWorldSelectionContext']);
  }
});

test('Canvas refusal and transport failures are legal public errors with no ready state', async () => {
  for (const code of ['ADAPTER_UNAVAILABLE', 'CONNECTION_UNAUTHORIZED', 'WORLD_NOT_BOUND', 'STALE_REVISION']) {
    const { f, workshop, body, ports } = await setup();
    f.beforeCall = async operation => { if (operation === 'SelectWorldConnection') throw denied(code); };
    const response = await workshop.call('SwitchWorldContext', body);
    assert.equal(response.error.code, code);
    validateResponse('session/v2', 'SwitchWorldContext', response);
    assert.equal(ports.row.state.context.activeWorldRef, null);
  }
});

test('wrong correlated read/selection/inventory responses and concurrent Canvas switch reject', async () => {
  for (const phase of ['ReadWorldSelectionContext', 'SelectWorldConnection', 'ListObjects', 'final-context']) {
    const { f, workshop, body, ports } = await setup(); let reads = 0;
    f.changeResponse = (response, operation) => {
      if (operation === 'ReadWorldSelectionContext') reads++;
      if (operation === phase) response.requestId = 'unrelated';
      if (phase === 'final-context' && reads === 3) response.result.selection.context.sessionRevision = 'concurrent';
      return response;
    };
    const response = await workshop.call('SwitchWorldContext', body);
    assert.ok(response.error); assert.equal(response.result, null);
    assert.equal(ports.row.state.context.activeWorldRef, null);
  }
});

test('old advertised capability fails before Canvas and errors self-validate', async () => {
  const { f, workshop, body } = await setup();
  f.canvas.contractHandshake = { ...f.canvas.contractHandshake, contracts: 'hanaworlds-contracts@0.3.5' };
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error.code, 'UNSUPPORTED_VERSION'); assert.equal(f.calls.length, 0);
  validateResponse('session/v2', 'SwitchWorldContext', response);
});

test('a selected connection becoming unavailable before objects is rejected', async () => {
  const { f, workshop, body, ports } = await setup();
  f.afterCall = async operation => {
    if (operation === 'SelectWorldConnection') f.candidates = [{
      ...f.context().inventory.connections[0], readiness: 'CONNECTION_UNAUTHORIZED' }];
  };
  const response = await workshop.call('SwitchWorldContext', body);
  assert.equal(response.error.code, 'CONNECTION_UNAUTHORIZED');
  assert.equal(f.calls.some(x => x.operation === 'ListObjects'), false);
  assert.equal(ports.row.state.context.activeWorldRef, null);
});

test('failed target switch cannot leave the old Workshop world ready', async () => {
  const { f, workshop, body, ports } = await setup();
  const ready = await workshop.call('SwitchWorldContext', body);
  assert.equal(ready.error, null);
  const next = switchRequest(ready.result.context.sessionRevision,
    { worldRef: 'world-b', requestId: 'switch-b' });
  f.capture(next);
  f.afterCall = async op => { if (op === 'SwitchWorldConnection') throw Error('lost response'); };
  const response = await workshop.call('SwitchWorldContext', next);
  assert.equal(response.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(ports.row.state.context.activeWorldRef, null);
});

test('an incorrect Workshop CAS never selects or alters readiness', async () => {
  const { f, workshop, body, ports } = await setup();
  const before = structuredClone(ports.row.state);
  const response = await workshop.call('SwitchWorldContext', { ...body, expectedRevision: 'guessed' });
  assert.equal(response.error.code, 'STALE_REVISION');
  assert.equal(f.calls.length, 0); assert.deepEqual(ports.row.state, before);
});
