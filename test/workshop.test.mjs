import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { WorkshopV1, apply } from '../src/index.mjs';
import * as contractsV4 from 'hanaworlds-contracts/v4';
import { worldFixture } from './helpers/world-context.mjs';

class CoreSessions {
  logs = new Map();
  constructor() {
    this.logs.set('s1', { meta: { version: SESSION_FORMAT_VERSION,
      id: 's1', createdAt: 1, isSeeded: false },
    events: [], owned: true, flushes: 0 });
  }
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
    return { header: row.meta,
      async read() { return { eventState: 'exclusive', events: structuredClone(row.events) }; },
      async append(events) { assert.equal(access, 'write');
        assert.equal(events[0].seq, row.events.length); row.events.push(...structuredClone(events)); },
      async flush() { assert.equal(access, 'write'); row.flushes++; },
      async close() { if (access === 'write') row.owned = false; } };
  }
}

class ProjectionStore {
  rows = new Map();
  writes = 0;
  async get(id, identity) {
    const row = this.rows.get(id);
    if (!row) return null;
    assert.deepEqual(row.identity, identity);
    return structuredClone(row.state);
  }
  async create(id, identity, state) {
    assert.equal(this.rows.has(id), false);
    this.rows.set(id, { identity, state: structuredClone(state) });
    this.writes++;
  }
  async replace(id, identity, expectedRevision, state) {
    const row = this.rows.get(id);
    assert.deepEqual(row.identity, identity);
    assert.equal(row.state.context.sessionRevision, expectedRevision);
    row.state = structuredClone(state);
    this.writes++;
  }
  state(id = 's1') { return this.rows.get(id)?.state; }
}

function setup(overrides = {}) {
  const sessions = new CoreSessions();
  const projectionStore = new ProjectionStore();
  const calls = [];
  const workshop = new WorkshopV1({
    sessionPersistence: sessions, projectionStore,
    authority: { async verify(request) { return { current: true, actorRef: request.actorRef, sessionRef: request.sessionRef, authorizationRef: request.authorizationRef, surface: 'SHELL', worldRef: request.worldRef, sessionIncarnationRef: 'inc-1', nativeGrantRef: 'native-1', invocationRef: 'invoke-1', invocationStatus: 'ACTIVE', grantStatus: 'CURRENT', allowedActions: ['READ', 'APPEND', 'INSPECT', 'SELECT', 'ANALYZE', 'APPLY_RECOVERABLE'] }; } },
    capabilities: { providerRef: 'core', capabilityRevision: '1', worldRef: null, engineBounds: null, limits: [], recoveryGuarantee: null, stateProfile: null, regionProtectionWriters: [], sessionDeleteSupported: false, imageMediaTypes: ['image/png'], model: 'gpt-5.6-luna' },
    ...overrides,
  });
  if (workshop.canvas) {
    // Existing model/build tests use a typed external world-selection fixture;
    // their original Canvas callback still owns all later build operations.
    const selection = worldFixture();
    const authority = workshop.authority;
    const canvas = workshop.canvas;
    workshop.authority = { async verify(body, operation) {
      const proof = await authority.verify(body, operation);
      if (operation !== 'SwitchWorldContext') return proof;
      if (selection.parent?.requestId !== body.requestId) selection.capture(body);
      return { ...await selection.authority.verify(body, operation), ...proof };
    } };
    workshop.canvas = { ...canvas, async call(operation, body) {
      if (['ReadWorldSelectionContext', 'SelectWorldConnection',
        'SwitchWorldConnection'].includes(operation)) return selection.canvas.call(operation, body);
      return canvas.call(operation, body);
    } };
  }
  return { workshop, sessions, projectionStore, calls };
}

const start = (sessionRef = 's1') => ({ contractVersion: 'session/v2', actorRef: 'user', sessionRef, requestId: `start-${sessionRef}`, authorizationRef: 'grant', expectedRevision: null });

test('action receipt cannot attach a verified Apply from another turn', async () => {
  const { workshop, projectionStore } = setup();
  const opened = await workshop.call('StartOrResumeSession', start());
  const state = projectionStore.state();
  state.turns.push({ turnRef: 'turn-a', turnRevision: 'rev-a', text: 'A' },
    { turnRef: 'turn-b', turnRevision: 'rev-b', text: 'B' });
  const receipt = { contractVersion: 'canvas/v2', transactionId: 'tx-a',
    operationDigest: 'a'.repeat(64), transactionPayloadDigest: 'b'.repeat(64),
    status: 'VERIFIED', previousWorldRevision: 'world-0',
    observedWorldRevision: 'world-1', readbackDigest: 'c'.repeat(64),
    restoreStatus: 'NOT_REQUIRED', error: null };
  state.pendingApply = { turnRef: 'turn-a', status: 'VERIFIED',
    request: { sessionRef: 's1', actorRef: 'user', worldRef: 'world-a',
      authorizationRef: 'grant', transactionId: 'tx-a' },
    response: { result: receipt } };
  const result = await workshop.call('RecordActionReceipt', {
    contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
    requestId: 'attach-wrong-turn', authorizationRef: 'grant',
    turnRef: 'turn-b', expectedRevision: opened.result.context.sessionRevision,
    actionId: 'apply', domainReceiptDigest: contractsV4.digestValue('receipt', receipt).sha256 });
  assert.equal(result.error.code, 'RECOVERY_PENDING');
  assert.equal(state.turns[1].actionReceiptDigest, undefined);
});

function recordUserInput(sessions, requestId, text, sessionRef = 's1') {
  const events = sessions.logs.get(sessionRef).events;
  events.push({ type: 'user/message', seq: events.length, time: Date.now(),
    surfaceOp: 'append',
    data: { id: requestId, role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text }] } });
}

test('uses the existing Core Session as read-only fact source and durable projection across Workshop instances', async () => {
  const { workshop, sessions, projectionStore } = setup();
  const created = await workshop.call('StartOrResumeSession', start());
  assert.equal(created.error, null);
  assert.equal(created.result.context.currentSession, 's1');
  assert.equal(sessions.logs.get('s1').events.length, 0);
  assert.equal(sessions.logs.get('s1').owned, true);
  assert.equal(projectionStore.writes, 1);
  const resumed = new WorkshopV1({ sessionPersistence: sessions, projectionStore,
    authority: workshop.authority, capabilities: workshop.capabilities });
  const again = await resumed.call('StartOrResumeSession', { ...start(), requestId: 'resume', expectedRevision: created.result.context.sessionRevision });
  assert.equal(again.result.context.currentSession, 's1');
  assert.equal(again.result.context.sessionRevision, created.result.context.sessionRevision);
});

test('DSH plugin resolves late host ports and rejects stale Session revision', async () => {
  const ports = new Map();
  const services = new Map();
  apply({ get(name) { return ports.get(name); }, provide(name, value) {
    services.set(name, value); } });
  assert.deepEqual([...services.keys()], ['hanaworldsWorkshopV1', 'hanaworldsWorkshop',
    'hanaworldsWorkshopLegacyHistoryV1']);
  const service = services.get('hanaworldsWorkshop');
  const legacy = services.get('hanaworldsWorkshopLegacyHistoryV1');
  assert.equal(typeof legacy.importArchive, 'function');
  assert.equal(typeof legacy.readArchive, 'function');
  assert.equal(service, services.get('hanaworldsWorkshopV1'));
  assert.equal(typeof service.invokeAction, 'function');
  assert.equal(typeof service.verifyFrameDelivery, 'function');
  const missing = await service.call('StartOrResumeSession', start());
  assert.equal(missing.error.code, 'CAPABILITY_UNAVAILABLE');
  const fixture = setup();
  ports.set('sessionPersistence', fixture.sessions);
  ports.set('storageDomain', { async open() { return {
    table() { return { get(id) { const row = fixture.projectionStore.rows.get(id);
      return row && { coreIdentity: row.identity, state: row.state }; },
    async put(id, row) { fixture.projectionStore.rows.set(id,
      { identity: row.coreIdentity, state: row.state }); },
    async update(id, update) { const row = fixture.projectionStore.rows.get(id);
      const next = update({ coreIdentity: row.identity, state: row.state });
      fixture.projectionStore.rows.set(id, { identity: next.coreIdentity,
        state: next.state }); } }; }, async close() {} }; } });
  ports.set('hanaworldsAuthority', fixture.workshop.authority);
  ports.set('hanaworldsCapabilities', fixture.workshop.capabilities);
  ports.set('hanaworldsBrushV2', { compile() {} });
  ports.set('hanaworldsPainterV2PictureBlocks', { call() {} });
  assert.equal(typeof service.brush.compile, 'function');
  assert.equal(typeof service.painter.call, 'function');
  const created = await service.call('StartOrResumeSession', start());
  assert.equal(created.error, null);
  const stale = await service.call('StartOrResumeSession', { ...start(),
    requestId: 'stale', expectedRevision: 'old-revision' });
  assert.equal(stale.error.code, 'STALE_REVISION');
});

test('DSH client contributes a Workshop panel and only typed offered Shell choices', () => {
  let definition;
  runInNewContext(readFileSync(new URL('../client.cjs', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
  });
  assert.equal(definition.id, 'hanaworlds-workshop');
  const client = definition.factory(name => {
    if (name === 'dsh-tauri') return { invoke() {} };
    assert.equal(name, 'react');
    return { createElement(type, props, ...children) { return { type, props, children }; },
      useState(value) { return [value, () => {}]; }, useEffect() {} };
  });
  const seats = [];
  client.apply({ slots: { inject(name, register) {
    seats.push(name); register();
  }, register(meta, component) { seats.push({ meta, component }); } } });
  assert.deepEqual(seats.filter(x => typeof x === 'string'),
    ['main', 'sidebar.panellist']);
  assert.equal(seats[1].meta.key, 'hanaworlds-workshop');
  assert.equal(seats[3].meta.id, 'hanaworlds-workshop');
  const offered = [];
  const frame = { content: '选择玩家', actions: [
    { actionId: 'choose', inputKinds: ['SELECT_CHOICE'], choices: [
      { value: 'alice', label: 'alice' }, { value: 'bob', label: 'bob' }] },
    { actionId: 'pick', inputKinds: ['PICK_WORLD_POINT'], choices: null },
  ] };
  const view = client.WorkshopChoiceFrame({ frame, onSelect: value => offered.push(value) });
  const buttons = view.children.filter(item => item?.type === 'button');
  assert.deepEqual(buttons.map(button => button.children[0]), ['alice', 'bob']);
  buttons[1].props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(offered)), [{ actionId: 'choose',
    input: { kind: 'SELECT_CHOICE', value: 'bob' } }]);
  assert.equal(view.children.at(-1).children[0], '也可以在游戏中选点。');
  const panelSeat = seats[1].component();
  assert.equal(panelSeat.type, client.WorkshopPanel);
  const panel = client.WorkshopPanel({ flow: { snapshot: () => ({ ready: true,
    busy: false, error: '', turns: [], reply: '', clarification: null,
    sessions: [], selectedSessionRef: null, details: [],
    legacyArchives: [], legacyArchive: null, legacyError: '' }),
    subscribe() { return () => {}; }, open() {} } });
  assert.equal(panel.children[1].props.role, 'status');
  assert.equal(panel.children.at(-1).type, 'form');
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

test('rejects a DSH LLM error finish even after a text delta', async () => {
  const { workshop, projectionStore } = setup({
    modelRoute: { provider: 'fixed-stub', model: 'gpt-5.6-luna' },
    llm: { async *stream() {
      yield { type: 'text-delta', index: 0, text: '看似完整的回答' };
      yield { type: 'finish', reason: { kind: 'error',
        failure: { code: 'FIXTURE_FAILURE', message: 'failed' } } };
    } },
  });
  const started = await workshop.call('StartOrResumeSession', start());
  const response = await workshop.call('AppendMultimodalTurn',
    append(started.result.context.sessionRevision));
  assert.equal(response.error.code, 'MODEL_REQUEST_FAILED');
  assert.equal(projectionStore.state().turns.length, 0);
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
  const { workshop, sessions, projectionStore } = setup({
    canvas: { contractHandshake: contractsV4.contractHandshake,
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
  const read = { contractVersion: 'session/v2', actorRef: 'user',
    sessionRef: 's1', requestId: 'read-1', authorizationRef: 'grant' };
  const early = await workshop.call('ReadSessionTurnDetails', read);
  assert.equal(early.error, null);
  assert.equal(early.result.turns[0].resultText, '屋子要多大？');
  assert.equal(early.result.turns[0].confirmedBrief, null);
  const current = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
  recordUserInput(sessions, 'followup', '宽3、深4、高5个节点');
  const followup = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'followup', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '宽3、深4、高5个节点' });
  assert.equal(followup.error, null);
  assert.match(prompts[1], /宽3、深4、高5个节点/);
  assert.match(followup.result.clarification.question, /3×4×5/);
  const current2 = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume-2' });
  recordUserInput(sessions, 'confirm', '确认');
  const confirmed = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'confirm', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current2.result.context.sessionRevision,
    clarificationId: followup.result.clarification.clarificationId, answer: '确认' });
  assert.equal(confirmed.error, null);
  assert.equal(confirmed.result.clarification, null);
  const reopened = new WorkshopV1({ sessionPersistence: sessions, projectionStore,
    authority: workshop.authority, capabilities: workshop.capabilities });
  const details = await reopened.call('ReadSessionTurnDetails',
    { ...read, requestId: 'read-after-reopen' });
  assert.equal(details.error, null);
  assert.equal(details.result.turns[0].userText, '请帮我建一个小屋');
  assert.equal(details.result.turns[0].resultText, '已确认建造意图。');
  assert.equal(details.result.turns[0].confirmedBrief.contractVersion, 'ReferenceBrief/v2');
  assert.equal(details.result.turns[0].confirmedBrief.sessionRef, 's1');
  assert.equal(details.result.turns[0].confirmedBrief.turnRevision,
    details.result.turns[0].turnRevision);
  reopened.authority = { async verify() { return { current: false }; } };
  const revoked = await reopened.call('ReadSessionTurnDetails',
    { ...read, requestId: 'read-revoked' });
  assert.equal(revoked.error.code, 'AUTHORIZATION_REVOKED');
});

test('a user correction replaces the pending proposal before confirmation', async () => {
  const contracts = contractsV4;
  let modelCalls = 0;
  const { workshop, sessions, projectionStore } = setup({
    canvas: { contractHandshake: contracts.contractHandshake,
      async call(_operation, request) { return { contractVersion: 'canvas/v4',
        requestId: request.requestId, error: null,
        result: { worldRef: request.worldRef, registryRevision: 'r1', objects: [] } }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream() { modelCalls++;
      yield { type: 'text-delta', index: 0, text: JSON.stringify({
        kind: 'BUILD_STRUCTURE', text: '石屋', purpose: 'first building',
        dimensions: { width: modelCalls === 1 ? 3 : 6, depth: 4, height: 5, unit: 'node' },
        entrancePortalRefs: [] }) };
      yield { type: 'finish', reason: 'stop' }; } },
  });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision));
  const current = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
  recordUserInput(sessions, 'correct', '改为宽6个节点');
  const corrected = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'correct', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '改为宽6个节点' });
  assert.equal(corrected.error, null);
  assert.equal(modelCalls, 2);
  assert.match(corrected.result.clarification.question, /6×4×5/);
  const current2 = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume-2' });
  recordUserInput(sessions, 'confirm', '确认');
  const confirmed = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'confirm', authorizationRef: 'grant',
    turnRef: 'turn-1', expectedRevision: current2.result.context.sessionRevision,
    clarificationId: corrected.result.clarification.clarificationId, answer: '确认' });
  assert.equal(confirmed.error, null);
  assert.equal(projectionStore.state().confirmedIntents['turn-1']
    .intent.confirmedIntent.dimensions.width, 6);
});

test('world switch preserves the same Core Session while clearing old-world selection', async () => {
  const contracts = contractsV4;
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
  const contracts = contractsV4;
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
  const canvas = { contractHandshake: contractsV4.contractHandshake,
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
  const { workshop, sessions, projectionStore } = setup({ canvas,
    authority: { async verify(request) { return { current: true,
      actorRef: request.actorRef, sessionRef: request.sessionRef,
      authorizationRef: request.authorizationRef, worldRef: 'world-a',
      engineActorName: 'initiator', surface: 'SHELL',
      allowedActions: ['READ', 'APPEND', 'INSPECT', 'SELECT'] }; } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream() { yield { type: 'text-delta', index: 0, text: JSON.stringify(proposal) }; yield { type: 'finish', reason: 'stop' }; } } });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision, worldRef: 'world-a', selectionRevision: 'sel-1' });
  const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision));
  assert.equal(turn.error, null);
  recordUserInput(sessions, 'invoke-1', '确认');
  const answer = await workshop.call('AnswerClarification', { contractVersion: 'session/v2',
    actorRef: 'user', sessionRef: 's1', requestId: 'invoke-1', authorizationRef: 'grant',
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
  const delivery = { worldRef: 'world-a', engineActorName: 'initiator',
    frame: placement.frame, authorizationRef: 'grant' };
  assert.deepEqual(await workshop.verifyFrameDelivery(delivery), { current: true,
    worldRef: 'world-a', engineActorName: 'initiator', sessionRef: 's1',
    authorizationRef: 'grant', actorRef: 'user' });
  await assert.rejects(() => workshop.verifyFrameDelivery({ ...delivery,
    engineActorName: 'other' }), { code: 'PERMISSION_DENIED' });
  await assert.rejects(() => workshop.verifyFrameDelivery({ ...delivery,
    frame: { ...placement.frame, content: 'stale or forged' } }),
  { code: 'INVALID_FRAME' });
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
  await assert.rejects(() => workshop.verifyFrameDelivery(delivery),
    { code: 'INVALID_FRAME' });
  workshop.authority = { async verify(request) { return { current: true,
    actorRef: request.actorRef, sessionRef: request.sessionRef,
    authorizationRef: request.authorizationRef, worldRef: 'world-a',
    engineActorName: 'initiator', surface: 'LUANTI',
    allowedActions: ['INSPECT'] }; } };
  const pending = projectionStore.state().pendingPlacement;
  const pick = pending.frame.actions.find(action => action.inputKinds.includes('PICK_WORLD_POINT'));
  const relay = { contractVersion: 'interaction-surface/v3', actorRef: 'user',
    sessionRef: 's1', requestId: 'relay-pick', invocationId: 'relay-pick',
    authorizationRef: 'grant', turnRevision: pending.frame.turnRevision,
    frameRevision: pending.frame.frameRevision, frameRef: pending.frame.frameRef,
    actionId: pick.actionId, surfaceAction: pending.projections[pick.actionId],
    surfaceActionDigest: pick.surfaceActionDigest,
    input: { kind: 'PICK_WORLD_POINT', pickRef: 'adapter-pick-1' } };
  await assert.rejects(() => workshop.invokeAction(relay,
    { worldRef: 'world-a', engineActorName: 'another-player' }),
  { code: 'PERMISSION_DENIED' });
  assert.equal(canvasCalls.length, 2);
  const receipt = await workshop.invokeAction(relay,
    { worldRef: 'world-a', engineActorName: 'initiator' });
  assert.equal(receipt.invocationId, 'relay-pick');
  assert.equal(receipt.accepted, true);
  assert.deepEqual(canvasCalls[2].request.anchor,
    { kind: 'PICKED_POINT', pickRef: 'adapter-pick-1' });
});

test('first building rejects a different same-Session relay before Canvas', async () => {
  const contracts = contractsV4;
  const canvasCalls = [];
  const proposal = { kind: 'BUILD_STRUCTURE', text: '石屋', purpose: 'first building',
    dimensions: { width: 3, depth: 4, height: 5, unit: 'node' }, entrancePortalRefs: [] };
  const { workshop, sessions, projectionStore } = setup({
    canvas: { contractHandshake: contracts.contractHandshake,
      async call(operation, request) {
        if (operation === 'ListObjects') return { contractVersion: 'canvas/v4',
          requestId: request.requestId, error: null,
          result: { worldRef: request.worldRef, registryRevision: 'r1', objects: [] } };
        canvasCalls.push(request);
        return { contractVersion: 'canvas/v4', requestId: request.requestId,
          result: { outcome: 'PLACEMENT_CHOICE_REQUIRED', choice: {
            anchorKind: 'DEFAULT_PLAYER', reasons: ['MULTIPLE_ONLINE_PLAYERS'],
            options: ['NAME_PLAYER', 'PICK_WORLD_POINT'], candidatePlayerNames: ['alice', 'bob'],
            placementSettings: { frontGapCells: 2, forwardSearchCells: 16,
              lateralSearchCells: 8, verticalSearchCells: 4, settingsRevision: 's1' },
            observedWorldRevision: 'w1' } }, error: null, unavailableSettings: null };
      } },
    modelRoute: { provider: 'host-oauth', model: 'gpt-5.6-luna' },
    llm: { async *stream() { yield { type: 'text-delta', index: 0,
      text: JSON.stringify(proposal) }; yield { type: 'finish', reason: 'stop' }; } },
  });
  const first = await workshop.call('StartOrResumeSession', start());
  const switched = await workshop.call('SwitchWorldContext', {
    contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
    requestId: 'switch', authorizationRef: 'grant',
    expectedRevision: first.result.context.sessionRevision,
    worldRef: 'world-a', selectionRevision: 'sel-1' });
  const turn = await workshop.call('AppendMultimodalTurn',
    append(switched.result.context.sessionRevision));
  const current = await workshop.call('StartOrResumeSession',
    { ...start(), requestId: 'resume' });
  const unlogged = await workshop.call('AnswerClarification', {
    contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
    requestId: 'relay-alice', authorizationRef: 'grant', turnRef: 'turn-1',
    expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
  assert.equal(unlogged.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(canvasCalls.length, 0);
  recordUserInput(sessions, 'relay-alice', '确认');
  const spoofed = await workshop.call('AnswerClarification', {
    contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
    requestId: 'relay-bob', authorizationRef: 'grant', turnRef: 'turn-1',
    expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
  assert.equal(spoofed.error.code, 'PERMISSION_DENIED');
  assert.equal(canvasCalls.length, 0);
  const confirmed = await workshop.call('AnswerClarification', {
    contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1',
    requestId: 'relay-alice', authorizationRef: 'grant', turnRef: 'turn-1',
    expectedRevision: current.result.context.sessionRevision,
    clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
  assert.equal(confirmed.error, null);
  const restarted = new WorkshopV1({ sessionPersistence: sessions, projectionStore,
    authority: workshop.authority, canvas: workshop.canvas });
  await assert.rejects(() => restarted.beginFirstBuilding({ actorRef: 'user',
    sessionRef: 's1', authorizationRef: 'grant', turnRef: 'turn-1',
    requestId: 'place-bob', invocationId: 'relay-bob' }),
  { code: 'PERMISSION_DENIED' });
  assert.equal(canvasCalls.length, 0);
  const placement = await restarted.beginFirstBuilding({ actorRef: 'user',
    sessionRef: 's1', authorizationRef: 'grant', turnRef: 'turn-1',
    requestId: 'place-alice', invocationId: 'relay-alice' });
  assert.equal(placement.outcome, 'PLACEMENT_CHOICE_REQUIRED');
  assert.deepEqual(canvasCalls[0].anchor,
    { kind: 'DEFAULT_PLAYER', invocationId: 'relay-alice' });
});

test('passes the recorded RegionInspection unchanged into painter/v3 and requires a separate text plan source', async () => {
  const fixtures = JSON.parse(readFileSync(new URL('../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url)));
  const chain = fixtures.validCases[0].materializedChain;
  const contracts = contractsV4;
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
    const { workshop, sessions } = setup(base);
    const first = await workshop.call('StartOrResumeSession', start());
    const switched = await workshop.call('SwitchWorldContext', { contractVersion: 'session/v2', actorRef: 'user',
      sessionRef: 's1', requestId: 'switch', authorizationRef: 'grant', expectedRevision: first.result.context.sessionRevision,
      worldRef: 'fixture-world', selectionRevision: 'sel-1' });
    const turn = await workshop.call('AppendMultimodalTurn', append(switched.result.context.sessionRevision, media));
    const current = await workshop.call('StartOrResumeSession', { ...start(), requestId: 'resume' });
    recordUserInput(sessions, 'invoke-1', '确认');
    const confirmation = await workshop.call('AnswerClarification', { contractVersion: 'session/v2', actorRef: 'user',
      sessionRef: 's1', requestId: 'invoke-1', authorizationRef: 'grant', turnRef: 'turn-1',
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
    authorizationRef: 'grant', turnRef: 'turn-1', requestId: 'paint' }), { code: 'CAPABILITY_UNAVAILABLE' });
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
  const contracts = contractsV4;
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
  const fixtures = JSON.parse(readFileSync(new URL('../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url)));
  const request = fixtures.validCases[0].materializedChain.applyRequest;
  const contracts = contractsV4;
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
  const { workshop, sessions, projectionStore } = setup({ canvas });
  sessions.logs.set(request.sessionRef, { meta: { version: SESSION_FORMAT_VERSION,
    id: request.sessionRef, createdAt: 2, isSeeded: false },
  events: [], owned: true, flushes: 0 });
  await workshop.call('StartOrResumeSession', start(request.sessionRef));
  const state = structuredClone(projectionStore.state(request.sessionRef));
  state.pendingApply = { request, turnRef: 'turn-1', status: 'RESERVED' };
  projectionStore.rows.get(request.sessionRef).state = state;
  const body = { actorRef: request.actorRef, sessionRef: request.sessionRef,
    authorizationRef: request.authorizationRef, turnRef: 'turn-1', requestId: 'retry-1' };
  await assert.rejects(() => workshop.applyCurrentBuild(body));
  const restarted = new WorkshopV1({ sessionPersistence: sessions, projectionStore,
    authority: workshop.authority, canvas });
  const recovered = await restarted.applyCurrentBuild({ ...body, requestId: 'retry-2' });
  assert.equal(recovered.status, 'VERIFIED');
  assert.deepEqual(calls, [request, request]);
  const cached = await restarted.applyCurrentBuild({ ...body, requestId: 'retry-3' });
  assert.equal(cached.status, 'VERIFIED');
  assert.equal(calls.length, 2);
});

test('fixed Core delete seam fails honestly and resource reopen does not depend on old Session log', async () => {
  const contracts = contractsV4;
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
