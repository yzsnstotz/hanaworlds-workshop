import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { contractHandshake, digestValue, ContractError } from 'hanaworlds-contracts/v4';
import { worldFixture, capabilities, startRequest, switchRequest } from './helpers/world-context.mjs';

const { default: workshopPlugin } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');
const chain = JSON.parse(await readFile(new URL('../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url))).validCases[0].materializedChain;
const plain = value => JSON.parse(JSON.stringify(value));

// All model, plan, Canvas, Brush, policy and grant data here are explicit fixtures.
// Only Cordis/DSH Core JSONL and Workshop code/projection persistence are real.
function fixture(changePlan = x => x) {
  const f = worldFixture();
  const verify = f.authority.verify.bind(f.authority);
  f.authority.verify = async (body, operation) => ({ ...await verify(body, operation),
    allowedActions: ['READ', 'SELECT', 'APPEND', 'INSPECT', 'ANALYZE', 'APPLY_RECOVERABLE', 'HISTORY'] });
  f.planCalls = []; f.brushCalls = []; f.buildCalls = []; f.issueCalls = [];
  const worldCall = f.canvas.call.bind(f.canvas);
  f.canvas.call = async (operation, body) => {
    if (['ReadWorldSelectionContext', 'SelectWorldConnection'].includes(operation)) return worldCall(operation, body);
    f.buildCalls.push(operation);
    const response = result => ({ contractVersion: 'canvas/v4', requestId: body.requestId, result, error: null });
    if (operation === 'InspectPlacementRegion') return { ...plain(chain.canvasInspectResponse), requestId: body.requestId };
    if (operation === 'ListObjects') return response({ worldRef: body.worldRef, registryRevision: 'registry-1', objects: [] });
    if (operation === 'AnalyzeAffectedObjects') return response({ contractVersion: 'canvas/v2', worldRef: body.worldRef,
      worldRevision: body.expectedRevision, registryRevision: body.expectedRegistryRevision,
      selectionRevision: body.expectedSelectionRevision, operationDigest: body.operationDigest,
      orderedSelectedRefs: [], affectedObjectRefs: [] });
    throw Error(`unexpected world operation ${operation}`);
  };
  f.textPlanSource = { contractHandshake, async createBuildPlan(input) {
    f.planCalls.push(plain(input));
    assert.deepEqual(input.referenceBrief.media, []);
    assert.equal(input.referenceBrief.text, '建一块石头');
    assert.equal(input.referenceBrief.sessionRef, 's1');
    assert.equal(input.referenceBrief.turnRevision, input.turnRevision);
    assert.equal(input.intent.referenceBriefDigest, input.referenceBriefDigest);
    assert.equal(digestValue('reference-brief', input.referenceBrief).sha256, input.referenceBriefDigest);
    assert.equal(digestValue('intent', input.intent).sha256, input.intentDigest);
    assert.equal(input.intent.intendedWorldRef, 'fixture-world');
    assert.deepEqual(plain(input.regionInspection), chain.canvasInspectResponse.result.inspection);
    assert.equal(Object.hasOwn(input, 'painterId'), false);
    return changePlan({ ...plain(chain.painterResponse.result), invocationId: input.invocationId }, f);
  } };
  f.brush = { contractHandshake, compile(input) {
    f.brushCalls.push(plain(input));
    return { ...plain(chain.brushResponse), requestId: input.requestId };
  } };
  return f;
}

async function mount(root, f) {
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'core'), compression: 'none' }).await();
  await ctx.plugin(Storage).await();
  await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
  await ctx.plugin(StorageDomain, { backend: 'json' }).await();
  const ports = {
    hanaworldsAuthority: f.authority, hanaworldsCanvasV4: f.canvas, hanaworldsCapabilities: capabilities,
    hanaworldsTextPlanSource: f.textPlanSource, hanaworldsBrushV2: f.brush,
    hanaworldsPainterV2PictureBlocks: { contractHandshake, call() { assert.fail('text must not invoke image Painter'); } },
    hanaworldsCatalogue: { read: async () => plain(chain.painterRequest.catalogue) },
    hanaworldsSafetyProfile: { read: async () => plain(chain.painterRequest.safetyProfile) },
    hanaworldsCompilerConfig: { read: async () => ({ compilationConfig: plain(chain.brushRequest.compilationConfig), compilerRevision: chain.brushRequest.compilerRevision }) },
    hanaworldsApplyAuthority: { async issue(facts) {
      f.issueCalls.push(plain(facts));
      // New default-build authorization contract is not yet an admitted input.
      // No synthetic surface-action digest or grant is minted by this fixture.
      throw new ContractError('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    } },
    hanaworldsModelRoute: { provider: 'explicit-model-fixture', model: 'gpt-5.6-luna' },
    llm: { async *stream() {
      yield { type: 'text-delta', index: 0, text: JSON.stringify({ kind: 'BUILD_STRUCTURE', text: '一块石头',
        purpose: 'fixture text build', dimensions: { width: 1, depth: 1, height: 1, unit: 'node' }, entrancePortalRefs: [] }) };
      yield { type: 'finish', reason: 'stop' };
    } },
  };
  for (const [name, value] of Object.entries(ports)) if (value) ctx.provide(name, value);
  await ctx.plugin(workshopPlugin).await();
  const workshop = ctx.get('hanaworldsWorkshopV1');
  return { ctx, workshop, async close() { await workshop.projectionStore.close(); await ctx.fiber.dispose(); } };
}

async function confirm(runtime, f) {
  const writer = await runtime.ctx.sessionPersistence.create({ version: SESSION_FORMAT_VERSION,
    id: 's1', createdAt: 100, cwd: '/isolated/workshop/text-plan', isSeeded: false });
  await writer.append([{ type: 'turn/start', seq: 0, time: 101, data: { turn: 1 } }]);
  await writer.close();
  const call = async (operation, body) => {
    const response = await runtime.workshop.call(operation, body);
    assert.equal(response.error, null, JSON.stringify(response.error)); return response.result;
  };
  const opened = await call('StartOrResumeSession', startRequest);
  const selected = switchRequest(opened.context.sessionRevision, { worldRef: 'fixture-world' });
  f.capture(selected);
  const switched = await call('SwitchWorldContext', selected);
  const turn = await call('AppendMultimodalTurn', { ...startRequest, requestId: 'text-input',
    expectedRevision: switched.context.sessionRevision, turnRef: 'text-turn', text: '建一块石头', media: [],
    controls: { purpose: null, dimensions: null, entrancePortalRefs: [], styleText: null } });
  const latest = await call('StartOrResumeSession', startRequest);
  const confirmation = await runtime.ctx.sessionPersistence.open('s1', 'write');
  await confirmation.append([{ type: 'user/message', seq: 1, time: 102, surfaceOp: 'append',
    data: { id: 'confirm-text', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '确认' }] } }]);
  await confirmation.close();
  await call('AnswerClarification', { ...startRequest, requestId: 'confirm-text', expectedRevision: latest.context.sessionRevision,
    turnRef: 'text-turn', clarificationId: turn.clarification.clarificationId, answer: '确认' });
  return { contractVersion: 'session/v2', actorRef: 'user', sessionRef: 's1', requestId: 'advance-text',
    authorizationRef: 'grant', worldRef: 'fixture-world', expectedTurnRevision: turn.turnRevision };
}

async function withRuntime(f, fn) {
  const base = join(homedir(), '.cache/hanaworlds-runs/S1-WS-BUILD-ENTRY-01/text-20261006');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'runtime-'));
  const runtime = await mount(root, f);
  try { await fn(runtime, root); }
  finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
}

test('public text AdvanceCurrentBuild uses real Core confirmation and durable plan/compile/analyze; no fake Apply authorization', async () => {
  const f = fixture();
  await withRuntime(f, async (runtime, root) => {
    const request = await confirm(runtime, f);
    const result = await runtime.workshop.call('AdvanceCurrentBuild', request);
    assert.equal(f.planCalls.length, 1, JSON.stringify(result.error));
    assert.equal(result.error.code, 'CAPABILITY_UNAVAILABLE');
    assert.equal(result.error.mutationState, 'NONE');
    assert.equal(f.brushCalls.length, 1); assert.equal(f.issueCalls.length, 1);
    assert.equal(f.buildCalls.includes('AnalyzeAffectedObjects'), true);
    assert.equal(f.buildCalls.includes('ApplyRecoverableCommit'), false);
    await runtime.close();
    const reopened = await mount(root, f);
    try {
      const replay = await reopened.workshop.call('AdvanceCurrentBuild', request);
      assert.equal(replay.error.code, 'CAPABILITY_UNAVAILABLE');
      assert.equal(f.planCalls.length, 1); assert.equal(f.brushCalls.length, 1);
      assert.equal(f.issueCalls.length, 2);
      const reader = await reopened.ctx.sessionPersistence.open('s1', 'read');
      assert.equal((await reader.read()).events[1].data.id, 'confirm-text'); await reader.close();
    } finally { await reopened.close(); }
  });
});

test('text plan source absent fails without invoking picture Painter or compiler', async () => {
  const f = fixture(); delete f.textPlanSource;
  await withRuntime(f, async runtime => {
    const result = await runtime.workshop.call('AdvanceCurrentBuild', await confirm(runtime, f));
    assert.equal(result.error.code, 'CAPABILITY_UNAVAILABLE');
    assert.equal(f.brushCalls.length, 0); assert.equal(f.issueCalls.length, 0);
  });
});

for (const [name, mutate, code] of [
  ['wrong invocation', p => ({ ...p, invocationId: 'other-session-invocation' }), 'TRANSACTION_CONFLICT'],
  ['unknown response field', p => ({ ...p, arbitrary: true }), 'UNKNOWN_REQUIRED_FIELD'],
  ['wrong build digest', p => ({ ...p, buildDigest: '0'.repeat(64) }), 'STALE_REVISION'],
  ['stale facts', p => { p.build.targetFactsDigest = '0'.repeat(64); p.buildDigest = digestValue('build', p.build).sha256; return p; }, 'STALE_REVISION'],
  ['wrong frame', p => { p.build.coordinateFrame.origin[0]++; p.buildDigest = digestValue('build', p.build).sha256; return p; }, 'STALE_REVISION'],
  ['wrong safety policy', p => { p.build.safetyProfileDigest = '0'.repeat(64); p.buildDigest = digestValue('build', p.build).sha256; return p; }, 'STALE_REVISION'],
  ['wrong catalogue', p => { p.build.catalogueDigest = '0'.repeat(64); p.buildDigest = digestValue('build', p.build).sha256; return p; }, 'STALE_REVISION'],
  ['substituted protection evidence', p => { p.build.witnesses.find(w => w.predicate === 'PROTECTION').facts.evidence.worldRef = 'other-world'; p.buildDigest = digestValue('build', p.build).sha256; return p; }, 'STALE_REVISION'],
  ['revocation during plan', (p, f) => { f.current = false; return p; }, 'AUTHORIZATION_REVOKED'],
  ['world change during plan', (p, f) => { f.target = 'other-world'; return p; }, 'WORLD_NOT_BOUND'],
]) test(`text planning rejects ${name} before persistence/compile`, async () => {
  const f = fixture(mutate);
  await withRuntime(f, async runtime => {
    const result = await runtime.workshop.call('AdvanceCurrentBuild', await confirm(runtime, f));
    assert.equal(f.planCalls.length, 1);
    assert.equal(result.error.code, code);
    assert.equal(f.brushCalls.length, 0); assert.equal(f.issueCalls.length, 0);
    const state = await runtime.workshop.projectionStore.get('s1', {
      id: 's1', version: SESSION_FORMAT_VERSION, createdAt: 100, cwd: '/isolated/workshop/text-plan' });
    assert.equal(state.lastBuild, undefined);
  });
});
