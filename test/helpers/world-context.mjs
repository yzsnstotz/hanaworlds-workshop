import assert from 'node:assert/strict';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { contractHandshake, ContractError, validateWorldContextDelegation,
  validateResponse } from 'hanaworlds-contracts/v4';

export const plain = value => JSON.parse(JSON.stringify(value));
export function worldFixture() {
  const f = { current: true, invocationStatus: 'ACTIVE', incarnation: 'inc-1',
    grant: 'native-1', invocation: 'invoke-1', actions: ['READ', 'SELECT'],
    calls: [], proofCalls: [], selection: { status: 'UNBOUND', sessionRef: 's1',
      sessionRevision: 'canvas-actual-empty-cas' }, parent: null, target: 'world-a',
    candidates: null, afterCall: async () => {}, beforeCall: async () => {},
    changeResponse: x => x, originalBinding: null };
  const binding = () => ({ sessionRef: 's1', sessionIncarnationRef: f.incarnation,
    hostIssuerRef: 'fixture-host', worldRef: f.target, engineActorName: 'player',
    expectedGrantRef: f.grant, authorizationRef: 'grant', actorRef: 'user',
    bindingRef: 'binding-1', grantEpoch: 'epoch-1', allowedActions: f.actions });
  f.context = () => ({ actorRef: 'user', sessionRef: 's1', authorizationRef: 'grant',
    worldRef: f.target, selection: structuredClone(f.selection), inventory: {
      capabilityRevision: 'adapter-cap-real', connections: f.candidates ?? [{
        adapterId: 'fixture-adapter', connectionRef: `connection-${f.target}`,
        worldRef: f.target, displayName: f.target, capabilityRevision: 'adapter-cap-real',
        payloadVersion: '0.2.0', readiness: 'READY' }] } });
  f.authority = { async verify(body, operation) {
    f.proofCalls.push(operation);
    return { current: f.current, actorRef: 'user', sessionRef: 's1',
      authorizationRef: 'grant', worldRef: f.target, surface: 'SHELL',
      allowedActions: f.actions, sessionIncarnationRef: f.incarnation,
      nativeGrantRef: f.grant, invocationRef: f.invocation,
      invocationStatus: f.invocationStatus, grantStatus: f.current ? 'CURRENT' : 'REVOKED',
      ...f.proofOverrides };
  } };
  f.canvas = { contractHandshake, async call(operation, request) {
    f.calls.push({ operation, request: structuredClone(request) });
    await f.beforeCall(operation, request);
    // Explicit Host/Canvas/Adapter fixture: only captured active parent and
    // original grant facts authorize a child, using the public pure checker.
    validateWorldContextDelegation(f.parent, operation, request, {
      parentRequest: f.parent, child: { operation, request },
      originalBinding: f.originalBinding, currentBinding: binding(),
      liveSessionIncarnationRef: f.incarnation, grantStatus: f.current ? 'CURRENT' : 'REVOKED',
      invocationStatus: f.invocationStatus,
      context: operation === 'ReadWorldSelectionContext' ? null : f.context() });
    let result;
    if (operation === 'ReadWorldSelectionContext') result = f.context();
    else if (['SelectWorldConnection', 'SwitchWorldConnection'].includes(operation)) {
      const context = { currentSession: 's1', activeWorldRef: f.target,
        orderedSelectedObjectRefs: [], sessionRevision: `canvas-cas-${f.calls.length}`,
        selectionRevision: `canvas-selection-${f.calls.length}` };
      f.selection = { status: 'BOUND', connectionRef:
        request.connectionRef ?? request.toConnectionRef, context };
      result = context;
    } else if (operation === 'ListObjects') result = {
      worldRef: f.target, registryRevision: 'objects-real', objects: [] };
    else throw Error(`unexpected operation ${operation}`);
    const response = plain(validateResponse('canvas/v4', operation, {
      contractVersion: 'canvas/v4', requestId: request.requestId, result, error: null }));
    await f.afterCall(operation, request);
    return f.changeResponse(response, operation);
  } };
  f.capture = body => { f.parent = structuredClone(body); f.target = body.worldRef;
    f.originalBinding = binding(); };
  return f;
}

export function memoryPorts() {
  const header = { id: 's1', version: SESSION_FORMAT_VERSION, createdAt: 100,
    cwd: '/isolated/workshop', isSeeded: false };
  const row = { state: null, writes: [], onReplace: async () => {} };
  return { row, sessionPersistence: { async open(id, access) {
    assert.equal(id, 's1'); assert.equal(access, 'read');
    return { header: structuredClone(header), async read() { return { events: [] }; },
      async close() {} };
  } }, projectionStore: {
    async get() { return structuredClone(row.state); },
    async create(id, identity, state) { row.state = structuredClone(state); },
    async replace(id, identity, expected, state) {
      assert.equal(row.state.context.sessionRevision, expected);
      row.state = structuredClone(state); row.writes.push(structuredClone(state));
      await row.onReplace(state);
    },
  }, header };
}

export const capabilities = { providerRef: 'fixture-host', capabilityRevision: 'host-not-canvas',
  worldRef: null, engineBounds: null, limits: [], recoveryGuarantee: null, stateProfile: null,
  regionProtectionWriters: [], sessionDeleteSupported: false, imageMediaTypes: [], model: null,engineGuards:null };
export const startRequest = { contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
  requestId: 'start', authorizationRef: 'grant', expectedRevision: null };
export const switchRequest = (revision, overrides = {}) => ({ contractVersion: 'session/v2',
  actorRef: 'user', sessionRef: 's1', requestId: 'switch-1', authorizationRef: 'grant',
  expectedRevision: revision, worldRef: 'world-a', selectionRevision: 'workshop-selection', ...overrides });
export const denied = code => new ContractError(code, 'validate', 'REQUIRED_FACT_UNKNOWN');
