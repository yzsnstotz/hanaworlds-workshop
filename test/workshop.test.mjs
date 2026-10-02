import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { WorkshopV1, apply } from '../src/index.mjs';

class CoreSessions {
  logs = new Map();
  async create(header) {
    assert.equal(header.version, SESSION_FORMAT_VERSION);
    assert.equal(header.isSeeded, false);
    if (this.logs.has(header.id)) throw Error('exists');
    const row = { meta: header, events: [], owned: true, flushes: 0 };
    this.logs.set(header.id, row);
    return this.#handle(row, 'write');
  }
  async open(id, access) {
    const row = this.logs.get(id);
    if (!row) { const error = Error('not found'); error.name = 'SessionPersistenceNotFoundError'; throw error; }
    if (access === 'write') {
      if (row.owned) throw Error('already owned');
      row.owned = true;
    }
    return this.#handle(row, access);
  }
  #handle(row, access) {
    return { async read() { return { eventState: 'exclusive', events: structuredClone(row.events) }; },
      async append(events) { assert.equal(access, 'write');
        assert.equal(events[0].seq, row.events.length); row.events.push(...structuredClone(events)); },
      async flush() { assert.equal(access, 'write'); row.flushes++; },
      async close() { if (access === 'write') row.owned = false; } };
  }
}

function setup(overrides = {}) {
  const sessions = new CoreSessions();
  const calls = [];
  const workshop = new WorkshopV1({
    sessionPersistence: sessions,
    authority: { async verify(request) { return { current: true, actorRef: request.actorRef, sessionRef: request.sessionRef, authorizationRef: request.authorizationRef, surface: 'SHELL', allowedActions: ['READ', 'APPEND', 'INSPECT', 'SELECT', 'ANALYZE', 'APPLY_RECOVERABLE'] }; } },
    capabilities: { providerRef: 'core', capabilityRevision: '1', worldRef: null, engineBounds: null, limits: [], recoveryGuarantee: null, stateProfile: null, regionProtectionWriters: [], sessionDeleteSupported: false, imageMediaTypes: ['image/png'], model: 'gpt-5.6-luna' },
    ...overrides,
  });
  return { workshop, sessions, calls };
}

const start = (sessionRef = 's1') => ({ contractVersion: 'session/v2', actorRef: 'user', sessionRef, requestId: `start-${sessionRef}`, authorizationRef: 'grant', expectedRevision: null });

test('uses Core SessionPersistence for a durable session across Workshop instances', async () => {
  const { workshop, sessions } = setup();
  const created = await workshop.call('StartOrResumeSession', start());
  assert.equal(created.error, null);
  assert.equal(created.result.context.currentSession, 's1');
  assert.equal(sessions.logs.get('s1').events.length > 0, true);
  const resumed = new WorkshopV1({ sessionPersistence: sessions, authority: workshop.authority, capabilities: workshop.capabilities });
  const again = await resumed.call('StartOrResumeSession', { ...start(), requestId: 'resume', expectedRevision: created.result.context.sessionRevision });
  assert.equal(again.result.context.currentSession, 's1');
  assert.equal(again.result.context.sessionRevision, created.result.context.sessionRevision);
});

test('DSH plugin resolves late host ports and rejects stale Session revision', async () => {
  const ports = new Map();
  let service;
  apply({ get(name) { return ports.get(name); }, provide(name, value) {
    assert.equal(name, 'hanaworldsWorkshopV1'); service = value; } });
  const missing = await service.call('StartOrResumeSession', start());
  assert.equal(missing.error.code, 'CAPABILITY_UNAVAILABLE');
  const fixture = setup();
  ports.set('sessionPersistence', fixture.sessions);
  ports.set('hanaworldsAuthority', fixture.workshop.authority);
  ports.set('hanaworldsCapabilities', fixture.workshop.capabilities);
  const created = await service.call('StartOrResumeSession', start());
  assert.equal(created.error, null);
  const stale = await service.call('StartOrResumeSession', { ...start(),
    requestId: 'stale', expectedRevision: 'old-revision' });
  assert.equal(stale.error.code, 'STALE_REVISION');
});

const sha = data => createHash('sha256').update(data).digest('hex');
const controls = { purpose: null, dimensions: null, entrancePortalRefs: [], styleText: null };
const append = (rev, media = []) => ({ contractVersion: 'session/v2', actorRef: 'user',
  sessionRef: 's1', requestId: 'append-1', authorizationRef: 'grant', turnRef: 'turn-1',
  expectedRevision: rev, text: '请帮我建一个小屋', media, controls });

test('passes selected text and verified image together through Core attachment and gpt-5.6-luna route', async () => {
  const bytes = Buffer.from('image bytes');
  let modelCalls = 0, reads = 0;
  const { workshop } = setup({
    mediaAuthority: { async verify() { return { current: true, sessionRef: 's1' }; } },
    attachments: {
      async readImage(ref) { reads++; assert.equal(ref.attachmentId, 'img-1'); return { ref, data: bytes }; },
      async readImageRequest(ref) { return { attachment: ref, variantId: 'variant-1', data: bytes,
        mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }; },
    },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna', imagePolicy: { maxPixels: 1024, maxBytes: 1024 } },
    llm: { async *stream(options) { modelCalls++; assert.equal(options.model, 'gpt-5.6-luna');
      assert.equal(options.messages[0].content[0].text, '请帮我建一个小屋');
      assert.equal(options.messages[0].content[1].type, 'image');
      yield { type: 'text-delta', index: 0, text: '小屋要多宽？' };
      yield { type: 'finish', reason: 'stop' }; } },
  });
  const started = await workshop.call('StartOrResumeSession', start());
  const media = [{ attachmentRef: 'img-1', storedBytesDigest: sha(bytes),
    projectionVariantId: null, projectionBytesDigest: null, mediaType: 'image/png',
    bytes: bytes.length, width: 1, height: 1 }];
  const result = await workshop.call('AppendMultimodalTurn', append(started.result.context.sessionRevision, media));
  assert.equal(result.error, null);
  assert.equal(result.result.model, 'gpt-5.6-luna');
  assert.equal(result.result.resultText, '小屋要多宽？');
  assert.equal(result.result.clarification.code, 'AMBIGUOUS_INTENT');
  assert.equal(modelCalls, 1);
  assert.equal(reads, 1);
});

test('rejects media scope before reading bytes and never degrades corrupt image to text-only model call', async () => {
  const bytes = Buffer.from('image bytes');
  let reads = 0, modelCalls = 0;
  const base = { attachments: { async readImage(ref) { reads++; return { ref, data: bytes }; },
    async readImageRequest(ref) { return { attachment: ref, variantId: 'v', data: bytes, mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna', imagePolicy: { maxPixels: 1024, maxBytes: 1024 } },
    llm: { async *stream() { modelCalls++; yield { type: 'finish', reason: 'stop' }; } } };
  const media = [{ attachmentRef: 'img-1', storedBytesDigest: '0'.repeat(64),
    projectionVariantId: null, projectionBytesDigest: null, mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }];
  const denied = setup({ ...base, mediaAuthority: { async verify() { return { current: false }; } } });
  const deniedStart = await denied.workshop.call('StartOrResumeSession', start());
  const scope = await denied.workshop.call('AppendMultimodalTurn', append(deniedStart.result.context.sessionRevision, media));
  assert.equal(scope.error.code, 'PERMISSION_DENIED');
  assert.equal(reads, 0);
  const corrupt = setup({ ...base, mediaAuthority: { async verify() { return { current: true, sessionRef: 's1' }; } } });
  const corruptStart = await corrupt.workshop.call('StartOrResumeSession', start());
  const digest = await corrupt.workshop.call('AppendMultimodalTurn', append(corruptStart.result.context.sessionRevision, media));
  assert.equal(digest.error.code, 'MEDIA_DIGEST_MISMATCH');
  assert.equal(modelCalls, 0);
});

test('an answer to a clarification returns to the model, then requires explicit confirmation', async () => {
  const proposal = { kind: 'BUILD_STRUCTURE', text: '石屋', purpose: 'first building',
    dimensions: { width: 3, depth: 4, height: 5, unit: 'node' }, entrancePortalRefs: [] };
  const prompts = [];
  const { workshop } = setup({
    canvas: { contractHandshake: (await import('hanaworlds-contracts/v4')).contractHandshake,
      async call(_operation, request) { return { contractVersion: 'canvas/v4',
        requestId: request.requestId, error: null,
        result: { worldRef: request.worldRef, registryRevision: 'r1', objects: [] } }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream(options) { prompts.push(options.messages[0].content[0].text);
      yield { type: 'text-delta', index: 0,
        text: prompts.length === 1 ? '屋子要多大？' : JSON.stringify(proposal) };
      yield { type: 'finish', reason: 'stop' }; } },
  });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision));
  assert.equal(turn.result.clarification.question, '屋子要多大？');
  const current = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
  const followup = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'followup', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '宽3、深4、高5个节点' });
  assert.equal(followup.error, null);
  assert.match(prompts[1], /宽3、深4、高5个节点/);
  assert.match(followup.result.clarification.question, /3×4×5/);
  const current2 = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume-2' });
  const confirmed = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'confirm', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current2.result.context.sessionRevision,
    clarificationId: followup.result.clarification.clarificationId, answer: '确认' });
  assert.equal(confirmed.error, null);
  assert.equal(confirmed.result.clarification, null);
});

test('world switch preserves the same Core Session while clearing old-world selection', async () => {
  const contracts = await import('hanaworlds-contracts/v4');
  const { workshop } = setup({ canvas: { contractHandshake: contracts.contractHandshake,
    async call(operation, request) { assert.equal(operation, 'ListObjects'); return {
      contractVersion: 'canvas/v4', requestId: request.requestId, error: null,
      result: { worldRef: request.worldRef, registryRevision: 'registry-1', objects: [] } }; } } });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  assert.equal(switched.error, null);
  assert.equal(switched.result.context.currentSession, 's1');
  assert.equal(switched.result.context.activeWorldRef, 'world-a');
  assert.deepEqual(switched.result.context.orderedSelectedObjectRefs, []);
});

test('world switch refuses a caller supplied world without Canvas bound-world proof', async () => {
  const { workshop } = setup();
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch-unbound', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'unbound-world', selectionRevision: 'sel-1' });
  assert.equal(switched.error.code, 'CAPABILITY_UNAVAILABLE');
  const resumed = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
  assert.equal(resumed.result.context.activeWorldRef, null);
});

test('model receives earlier turns from the active world without old-world turn leakage', async () => {
  const prompts = [];
  const contracts = await import('hanaworlds-contracts/v4');
  const { workshop } = setup({
    canvas: { contractHandshake: contracts.contractHandshake,
      async call(_operation, request) { return { contractVersion: 'canvas/v4',
        requestId: request.requestId, error: null,
        result: { worldRef: request.worldRef, registryRevision: 'registry-1', objects: [] } }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream(options) { prompts.push(options.messages.map(m => m.content[0].text));
      yield { type: 'text-delta', index: 0, text: '请补充尺寸。' };
      yield { type: 'finish', reason: 'stop' }; } },
  });
  let current = await workshop.call('StartOrResumeSession', start());
  const switchTo = async (worldRef, requestId) => {
    const response = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
      actorRef: 'user', sessionRef: 's1', requestId, authorizationRef: 'grant',
      expectedRevision: current.result.context.sessionRevision, worldRef,
      selectionRevision: 'sel-1' });
    assert.equal(response.error, null); current = response;
  };
  const send = async (turnRef, text) => {
    const result = await workshop.call('AppendMultimodalTurn', {
      ...append(current.result.context.sessionRevision), requestId: `append-${turnRef}`,
      turnRef, text });
    assert.equal(result.error, null);
    current = await workshop.call('StartOrResumeSession', { ...start(), requestId: `resume-${turnRef}` });
  };
  await switchTo('world-a', 'switch-a');
  await send('turn-a1', '世界甲的小屋');
  await send('turn-a2', '继续世界甲');
  await switchTo('world-b', 'switch-b');
  await send('turn-b1', '世界乙的塔');
  assert.deepEqual(prompts[0], ['世界甲的小屋']);
  assert.deepEqual(prompts[1], ['世界甲的小屋', '继续世界甲']);
  assert.deepEqual(prompts[2], ['世界乙的塔']);
});

test('first confirmed structure sends DEFAULT_PLAYER and exact node footprint to Canvas, then offers only typed player choices', async () => {
  const canvasCalls = [];
  const canvas = { contractHandshake: (await import('hanaworlds-contracts/v4')).contractHandshake,
    async call(operation, request) { if (operation === 'ListObjects') return {
      contractVersion: 'canvas/v4', requestId: request.requestId, error: null,
      result: { worldRef: request.worldRef, registryRevision: 'registry-1', objects: [] } };
      canvasCalls.push({ operation, request }); return {
      contractVersion: 'canvas/v4', requestId: request.requestId,
      result: { outcome: 'PLACEMENT_CHOICE_REQUIRED', choice: {
        anchorKind: 'DEFAULT_PLAYER', reasons: ['MULTIPLE_ONLINE_PLAYERS'],
        options: ['NAME_PLAYER', 'PICK_WORLD_POINT'], candidatePlayerNames: ['alice', 'bob'],
        placementSettings: { frontGapCells: 2, forwardSearchCells: 16, lateralSearchCells: 8,
          verticalSearchCells: 4, settingsRevision: 'settings-1' }, observedWorldRevision: 'world-1' } },
      error: null, unavailableSettings: null }; } };
  const proposal = { kind: 'BUILD_STRUCTURE', text: '小石屋', purpose: 'first building',
    dimensions: { width: 3, depth: 4, height: 5, unit: 'node' }, entrancePortalRefs: [] };
  const { workshop } = setup({ canvas, modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream() { yield { type: 'text-delta', index: 0, text: JSON.stringify(proposal) }; yield { type: 'finish', reason: 'stop' }; } } });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision));
  assert.equal(turn.error, null);
  const answer = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'answer', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: (await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' })).result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
  assert.equal(answer.error, null);
  const placement = await workshop.beginFirstBuilding({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'place', invocationId: 'invoke-1' });
  assert.equal(placement.outcome, 'PLACEMENT_CHOICE_REQUIRED');
  assert.deepEqual(canvasCalls[0].request.anchor, { kind: 'DEFAULT_PLAYER', invocationId: 'invoke-1' });
  assert.deepEqual(canvasCalls[0].request.footprint, { widthCells: 3, depthCells: 4, heightCells: 5 });
  const select = placement.frame.actions.find(action => action.inputKinds.includes('SELECT_CHOICE'));
  assert.deepEqual(JSON.parse(JSON.stringify(select.choices)), [{ value: 'alice', label: 'alice' }, { value: 'bob', label: 'bob' }]);
  assert.equal(placement.frame.actions.some(action => action.inputKinds.includes('PICK_WORLD_POINT')), true);
  assert.equal(canvasCalls.length, 1);
  const actionProjection = placement.actionProjections[select.actionId];
  const choose = (value, requestId) => ({ contractVersion: 'interaction-surface/v3', actorRef: 'user',
    sessionRef: 's1', requestId, authorizationRef: 'grant', turnRevision: placement.frame.turnRevision,
    frameRevision: placement.frame.frameRevision, frameRef: placement.frame.frameRef,
    actionId: select.actionId, invocationId: `invoke-${requestId}`,
    surfaceAction: actionProjection, surfaceActionDigest: select.surfaceActionDigest,
    input: { kind: 'SELECT_CHOICE', value } });
  const forged = await workshop.call('InvokeAction', choose('mallory', 'bad-choice'));
  assert.equal(forged.error.code, 'INVALID_SELECTION');
  assert.equal(canvasCalls.length, 1);
  const picked = await workshop.call('InvokeAction', choose('alice', 'good-choice'));
  assert.equal(picked.error, null);
  assert.deepEqual(canvasCalls[1].request.anchor, { kind: 'NAMED_PLAYER', engineActorName: 'alice' });
});

test('passes the recorded RegionInspection unchanged into painter/v3 and rejects image-free structure planning', async () => {
  const fixtures = JSON.parse(readFileSync(new URL(import.meta.resolve('hanaworlds-contracts/v4/fixtures/placement-region-chain-v4'))));
  const chain = fixtures.validCases[0].materializedChain;
  const contracts = await import('hanaworlds-contracts/v4');
  const bytes = Buffer.from('image bytes');
  const painterCalls = [];
  const canvasCalls = [];
  const canvas = { contractHandshake: contracts.contractHandshake,
    async call(operation, request) {
      canvasCalls.push({ operation, request });
      if (operation === 'InspectPlacementRegion')
        return { ...chain.canvasInspectResponse, requestId: request.requestId };
      if (operation === 'ListObjects') return { contractVersion: 'canvas/v4', requestId: request.requestId,
        result: { worldRef: 'fixture-world', registryRevision: 'registry-1', objects: [] }, error: null };
      if (operation === 'AnalyzeAffectedObjects') return { contractVersion: 'canvas/v4',
        requestId: request.requestId, error: null, result: { contractVersion: 'canvas/v2',
          worldRef: 'fixture-world', worldRevision: request.expectedRevision,
          registryRevision: request.expectedRegistryRevision,
          selectionRevision: request.expectedSelectionRevision,
          operationDigest: request.operationDigest, orderedSelectedRefs: [], affectedObjectRefs: [] } };
      if (operation === 'ApplyRecoverableCommit') return { contractVersion: 'canvas/v4',
        requestId: request.requestId, error: null,
        result: { contractVersion: 'canvas/v2', transactionId: request.transactionId,
          operationDigest: request.operationDigest, transactionPayloadDigest: 'a'.repeat(64),
          status: 'VERIFIED', previousWorldRevision: request.expectedWorldRevision,
          observedWorldRevision: 'world-after', readbackDigest: 'c'.repeat(64),
          restoreStatus: 'NOT_REQUIRED', error: null } };
      throw Error(`unexpected ${operation}`);
    } };
  const painter = { contractHandshake: contracts.contractHandshake,
    async call(operation, request) { painterCalls.push({ operation, request }); return { ...chain.painterResponse, requestId: request.requestId }; } };
  const brushCalls = [];
  const brush = { handshake() { return contracts.contractHandshake; },
    compile(request) { brushCalls.push(request); return { ...chain.brushResponse, requestId: request.requestId }; } };
  const proposal = { kind: 'BUILD_STRUCTURE', text: '小石屋', purpose: 'first building',
    dimensions: { width: 1, depth: 1, height: 1, unit: 'node' }, entrancePortalRefs: [] };
  const base = { canvas, painter, brush,
    applyAuthority: { async issue(binding) { return { contractVersion: 'world-adapter/v2',
      authorizerRef: 'engine-authorizer', actorRef: binding.actorRef, grantEpoch: 'epoch-1',
      bindingRef: 'verified-binding', worldRef: binding.worldRef, sessionRef: binding.sessionRef,
      turnRevision: binding.turnRevision, intentDigest: binding.intentDigest,
      surfaceActionDigest: 'b'.repeat(64), allowedAction: 'APPLY_RECOVERABLE',
      transactionId: binding.transactionId, operationDigest: binding.operationDigest,
      worldRevision: binding.worldRevision, selectionRevision: binding.selectionRevision,
      analysisDigest: binding.analysisDigest, decisionRevision: null }; } },
    catalogue: { async read() { return chain.painterRequest.catalogue; } },
    safety: { async read() { return chain.painterRequest.safetyProfile; } },
    compilerConfig: { async read() { return { compilationConfig: chain.brushRequest.compilationConfig,
      compilerRevision: chain.brushRequest.compilerRevision }; } },
    mediaAuthority: { async verify() { return { current: true, sessionRef: 's1' }; } },
    attachments: { async readImage(ref) { return { ref, data: bytes }; },
      async readImageRequest(ref) { return { attachment: ref, variantId: 'v1', data: bytes, mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna', imagePolicy: { maxPixels: 1024, maxBytes: 1024 } },
    llm: { async *stream() { yield { type: 'text-delta', index: 0, text: JSON.stringify(proposal) }; yield { type: 'finish', reason: 'stop' }; } } };
  async function ready(media) {
    const { workshop } = setup(base);
    const first = await workshop.call('StartOrResumeSession', start());
    const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2', actorRef: 'user',
      sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant', expectedRevision: first.result.context.sessionRevision,
      worldRef: 'fixture-world', selectionRevision: 'sel-1' });
    const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision, media));
    const current = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
    const confirmation = await workshop.call('AnswerClarification', { contractVersion: 'session/v2', actorRef: 'user',
      sessionRef: 's1', requestId: 'answer', authorizationRef: 'grant', turnRef: 'turn-1',
      expectedRevision: current.result.context.sessionRevision,
      clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
    assert.equal(confirmation.error, null);
    const placement = await workshop.beginFirstBuilding({ actorRef: 'user', sessionRef: 's1',
      authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'place', invocationId: 'invoke-1' });
    assert.equal(placement.outcome, 'REGION_INSPECTED');
    return workshop;
  }
  const withoutImage = await ready([]);
  await assert.rejects(() => withoutImage.createBuildPlan({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'paint' }), { code: 'IMAGE_REQUIRED' });
  const media = [{ attachmentRef: 'img-1', storedBytesDigest: sha(bytes), projectionVariantId: null,
    projectionBytesDigest: null, mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }];
  const withImage = await ready(media);
  const result = await withImage.createBuildPlan({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'paint' });
  assert.equal(result.buildDigest, chain.painterResponse.result.buildDigest);
  assert.equal(painterCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(painterCalls[0].request.regionInspection)), chain.adapterInspectResponse.result.inspection);
  const compiled = await withImage.compileCurrentBuild({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'compile' });
  assert.equal(compiled.operationDigest, chain.brushResponse.result.operationDigest);
  assert.equal(brushCalls.length, 1);
  assert.equal(brushCalls[0].targetFacts.source, 'REGION_INSPECTED');
  const analysis = await withImage.analyzeCurrentBuild({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'analyze' });
  assert.deepEqual(JSON.parse(JSON.stringify(analysis.affectedObjectRefs)), []);
  const applied = await withImage.applyCurrentBuild({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'apply' });
  assert.equal(applied.status, 'VERIFIED');
  const applyRequest = canvasCalls.find(call => call.operation === 'ApplyRecoverableCommit').request;
  assert.equal(applyRequest.regionInspectionBinding.inspectionId, chain.adapterInspectResponse.result.inspection.inspectionId);
  assert.deepEqual(JSON.parse(JSON.stringify(applyRequest.regionInspectionBinding.build)), chain.painterResponse.result.build);
  const current = await withImage.call('StartOrResumeSession', { ...start(), requestId: 'after-apply' });
  const recorded = await withImage.call('RecordActionReceipt', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'record', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current.result.context.sessionRevision,
    actionId: 'confirmed-apply', domainReceiptDigest: contracts.digestValue('receipt', applied).sha256 });
  assert.equal(recorded.error, null);
  assert.equal(recorded.result.briefDigest, painterCalls[0].request.referenceBriefDigest);
});

test('uses fresh Canvas inventory names for object selection and refuses an unoffered ref', async () => {
  const contracts = await import('hanaworlds-contracts/v4');
  const operations = [];
  const canvas = { contractHandshake: contracts.contractHandshake,
    async call(operation, request) { operations.push(operation); if (operation === 'ListObjects') return {
      contractVersion: 'canvas/v4', requestId: request.requestId, error: null,
      result: { worldRef: 'world-a', registryRevision: 'registry-1', objects: [
        { worldRef: 'world-a', objectRef: 'opaque-a', objectRevision: 'obj-1',
          displayName: '石屋', nameRevision: 'name-1', creationSequence: 1, status: 'READY' },
      ] } }; if (operation === 'SetObjectSelection') return { contractVersion: 'canvas/v4',
      requestId: request.requestId, error: null, result: { sessionRef: 's1', worldRef: 'world-a',
        selectedObjectRefs: request.objectRefs, selectionRevision: 'sel-2' } }; throw Error('unexpected'); } };
  const { workshop } = setup({ canvas });
  const first = await workshop.call('StartOrResumeSession', start());
  await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2', actorRef: 'user',
    sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  const inventory = await workshop.listObjects({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', requestId: 'list' });
  assert.equal(inventory.objects[0].displayName, '石屋');
  await assert.rejects(() => workshop.selectObjects({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', requestId: 'bad', objectRefs: ['manual-id'] }), { code: 'INVALID_SELECTION' });
  assert.equal(operations.filter(x => x === 'SetObjectSelection').length, 0);
  const selected = await workshop.selectObjects({ actorRef: 'user', sessionRef: 's1',
    authorizationRef: 'grant', requestId: 'select', objectRefs: ['opaque-a'] });
  assert.deepEqual(JSON.parse(JSON.stringify(selected.selectedObjectRefs)), ['opaque-a']);
  assert.equal(operations.filter(x => x === 'SetObjectSelection').length, 1);
});

test('an uncertain Apply reuses its durable Canvas request after Workshop restart', async () => {
  const fixtures = JSON.parse(readFileSync(new URL(import.meta.resolve('hanaworlds-contracts/v4/fixtures/placement-region-chain-v4'))));
  const request = fixtures.validCases[0].materializedChain.applyRequest;
  const contracts = await import('hanaworlds-contracts/v4');
  const calls = [];
  const canvas = { contractHandshake: contracts.contractHandshake,
    async call(operation, actual) {
      assert.equal(operation, 'ApplyRecoverableCommit');
      calls.push(structuredClone(actual));
      if (calls.length === 1) throw Error('connection lost after possible effect');
      return { contractVersion: 'canvas/v4', requestId: actual.requestId, error: null,
        result: { contractVersion: 'canvas/v2', transactionId: actual.transactionId,
          operationDigest: actual.operationDigest, transactionPayloadDigest: 'a'.repeat(64),
          status: 'VERIFIED', previousWorldRevision: actual.expectedWorldRevision,
          observedWorldRevision: 'world-after', readbackDigest: 'c'.repeat(64),
          restoreStatus: 'NOT_REQUIRED', error: null } };
    } };
  const { workshop, sessions } = setup({ canvas });
  await workshop.call('StartOrResumeSession', start(request.sessionRef));
  const log = sessions.logs.get(request.sessionRef);
  const state = structuredClone(log.events.at(-1).data);
  state.pendingApply = { request, turnRef: 'turn-1', status: 'RESERVED' };
  const handle = await sessions.open(request.sessionRef, 'write');
  await handle.append([{ type: 'hanaworlds/workshop-state/v1',
    seq: log.events.length, time: Date.now(), data: state, ignorable: true }]);
  await handle.flush();
  await handle.close();
  const body = { actorRef: request.actorRef, sessionRef: request.sessionRef,
    authorizationRef: request.authorizationRef, turnRef: 'turn-1', requestId: 'retry-1' };
  await assert.rejects(() => workshop.applyCurrentBuild(body));
  const restarted = new WorkshopV1({ sessionPersistence: sessions,
    authority: workshop.authority, canvas });
  const recovered = await restarted.applyCurrentBuild({ ...body, requestId: 'retry-2' });
  assert.equal(recovered.status, 'VERIFIED');
  assert.deepEqual(calls, [request, request]);
  const cached = await restarted.applyCurrentBuild({ ...body, requestId: 'retry-3' });
  assert.equal(cached.status, 'VERIFIED');
  assert.equal(calls.length, 2);
});

test('fixed Core delete seam fails honestly and resource reopen does not depend on old Session log', async () => {
  const contracts = await import('hanaworlds-contracts/v4');
  const stored = new Map();
  const resources = { async persist(request) { stored.set(request.artifactRef, request.manifest); return {
    manifest: request.manifest, resourceManifestDigest: request.resourceManifestDigest, durable: true }; },
  async reopen(request) { return { artifactRef: request.artifactRef,
    manifest: stored.get(request.artifactRef), resourceManifestDigest: request.resourceManifestDigest }; } };
  const { workshop, sessions } = setup({ resources });
  const first = await workshop.call('StartOrResumeSession', start());
  const manifest = { profileVersion: 'saved-work-resources/v2', workId: 'existing-build',
    workRevision: 'build-rev-1', resources: [{ resourceId: 'build-payload',
      ownerRef: 'existing-build', bytesDigest: 'a'.repeat(64), mediaType: 'application/json',
      bytes: 8, purpose: 'BUILD_PAYLOAD' }] };
  const resourceManifestDigest = contracts.digestValue('saved-work-resources', manifest).sha256;
  const persisted = await workshop.call('PersistRequiredArtifactResources', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'save-resources', authorizationRef: 'grant',
    artifactRef: 'artifact-1', manifest, resourceManifestDigest });
  assert.equal(persisted.result.durable, true);
  const deletion = await workshop.call('DeleteSession', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'delete', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision });
  assert.equal(deletion.error.code, 'SESSION_DELETE_UNSUPPORTED');
  sessions.logs.clear();
  const reopened = await workshop.call('ReopenExistingArtifact', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'reopen', authorizationRef: 'grant',
    artifactRef: 'artifact-1', workRevision: 'build-rev-1', resourceManifestDigest });
  assert.equal(reopened.error, null);
  assert.equal(reopened.result.artifactRef, 'artifact-1');
});
