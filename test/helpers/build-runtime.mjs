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
import { contractHandshake, digestValue, ContractError, deriveCurrentBuildAuthorization,
  validateCurrentBuildAuthorizedApply } from 'hanaworlds-contracts/v4';
import { worldFixture, capabilities, startRequest, switchRequest } from './world-context.mjs';

const { default: workshopPlugin } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../../src/index.mjs');
export const chain = JSON.parse(await readFile(new URL('../../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url))).validCases[0].materializedChain;
export const plain = value => JSON.parse(JSON.stringify(value));

// All model, plan, Canvas, Brush, policy and grant data here are explicit fixtures.
// Only Cordis/DSH Core JSONL and Workshop code/projection persistence are real.
export function fixture(changePlan = x => x) {
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

export async function mount(root, f) {
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'core'), compression: 'none' }).await();
  await ctx.plugin(Storage).await();
  await ctx.plugin(StorageJson, { root: join(root, 'projection') }).await();
  await ctx.plugin(StorageDomain, { backend: 'json' }).await();
  const ports = {
    hanaworldsAuthority: f.authority, hanaworldsCanvasV4: f.canvas, hanaworldsCapabilities: capabilities,
    hanaworldsTextPlanSource: f.textPlanSource, hanaworldsBrushV2: f.brush,
    hanaworldsProposalAuthority: f.proposalAuthority,
    hanaworldsPainterV2PictureBlocks: f.painter ?? { contractHandshake, call() { assert.fail('text must not invoke image Painter'); } },
    hanaworldsCatalogue: { read: async () => plain(chain.painterRequest.catalogue) },
    hanaworldsSafetyProfile: { read: async () => plain(chain.painterRequest.safetyProfile) },
    hanaworldsCompilerConfig: { read: async () => ({ compilationConfig: plain(chain.brushRequest.compilationConfig), compilerRevision: chain.brushRequest.compilerRevision }) },
    hanaworldsApplyAuthority: f.applyAuthority ?? { contractHandshake, readCurrentBuildContext() {}, async issue(facts) {
      f.issueCalls.push(plain(facts));
      // Explicit unavailable Host fixture; no synthetic action digest/grant.
      throw new ContractError('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    } },
    hanaworldsModelRoute: { provider: 'explicit-model-fixture', model: 'gpt-5.6-luna' },
    llm: f.llm ?? { async *stream() {
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

export async function confirm(runtime, f) {
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
    controls: f.controls ?? { purpose: null, dimensions: null, entrancePortalRefs: [], styleText: null } });
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

export async function withRuntime(f, fn) {
  const base = process.env.HW_RUNTIME_ROOT ?? join(homedir(), '.cache/hanaworlds-runs/S1-WS-BUILD-ENTRY-01/text-20261006');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'runtime-'));
  const runtime = await mount(root, f);
  try { await fn(runtime, root); }
  finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
}

// Explicit Host fixture: captured outer invocation and durable issuance live in
// this fixture, not in Workshop. No hard-coded authorization/action digest.
export function authorize(f) {
  f.issued = null; f.contextChanges = {}; f.afterIssue = async () => {};
  f.afterVerify = async () => {}; f.verifyCalls = 0; f.applyCount = 0;
  f.authContext = facts => {
    const p = f.buildParent;
    const binding = { actorRef: p.actorRef, sessionRef: p.sessionRef, worldRef: p.worldRef,
      authorizationRef: p.authorizationRef, sessionIncarnationRef: 'real-fixture-incarnation',
      hostIssuerRef: 'fixture-host', engineActorName: 'fixture-player', expectedGrantRef: 'native-grant-1',
      bindingRef: 'binding-1', grantEpoch: 'epoch-1', allowedActions: ['APPLY_RECOVERABLE'] };
    return { capturedParent: p, capturedApply: facts.apply, originalBinding: binding, currentBinding: binding,
      verifiedBinding: { authorizerRef: 'fixture-engine',
        actorRef: binding.actorRef, bindingRef: binding.bindingRef, worldRef: binding.worldRef,
        grantEpoch: binding.grantEpoch, allowedActions: binding.allowedActions },
      liveSessionIncarnationRef: binding.sessionIncarnationRef,
      workshopServiceRef: 'workshop-instance', expectedWorkshopServiceRef: 'workshop-instance',
      canvasServiceRef: 'canvas-instance', expectedCanvasServiceRef: 'canvas-instance',
      grantStatus: 'CURRENT', invocationStatus: 'ACTIVE', currentTurnRef: 'text-turn',
      currentTurnRevision: p.expectedTurnRevision, currentConfirmationInputId: 'confirm-text',
      currentIntentDigest: digestValue('intent', facts.intent).sha256,
      currentOperationDigest: facts.apply.operationDigest, currentAnalysisDigest: facts.apply.analysisDigest,
      turnStatus: 'CURRENT_CONFIRMED', currentStage: 'APPLY',
      replay: f.issued ? 'EXACT_REPLAY' : 'NEW', priorAuthorization: f.issued,
      ...f.contextChanges };
  };
  f.applyAuthority = { contractHandshake, async issue(facts) {
    f.issueCalls.push(plain(facts));
    f.issued = plain(deriveCurrentBuildAuthorization(facts, f.authContext(facts)));
    await f.afterIssue(facts);
    return plain(f.issued);
  }, async readCurrentBuildContext(facts, issued, request) {
    f.verifyCalls++;
    assert.deepEqual(plain(issued), f.issued);
    const context = plain(f.authContext(facts));
    validateCurrentBuildAuthorizedApply(request, f.issued, facts, context);
    await f.afterVerify(facts);
    return context;
  } };
  const canvasCall = f.canvas.call.bind(f.canvas);
  f.canvas.call = async (operation, body) => {
    const response = result => ({ contractVersion: 'canvas/v4', requestId: body.requestId, result, error: null });
    if (operation === 'ApplyRecoverableCommit') {
      f.applyCount++;
      (f.applyRequests ??= []).push(plain(body));
      validateCurrentBuildAuthorizedApply(body, f.issued, f.issued.action.facts, f.authContext(f.issued.action.facts));
      f.receipt = { contractVersion: 'canvas/v2', transactionId: body.transactionId,
        operationDigest: body.operationDigest, transactionPayloadDigest: 'a'.repeat(64), status: 'VERIFIED',
        previousWorldRevision: body.expectedWorldRevision, observedWorldRevision: 'fixture-world-after',
        readbackDigest: 'c'.repeat(64), restoreStatus: 'NOT_REQUIRED', error: null };
      if (f.interruptApply) throw Error('fixture lost Canvas response');
      if (f.afterApply) await f.afterApply();
      return response(f.receipt);
    }
    if (operation === 'ListObjects' && f.receipt) return response({ worldRef: body.worldRef, registryRevision: 'after',
      objects: [{ worldRef: body.worldRef, objectRef: 'object-1', objectRevision: 'object-v1', displayName: '石块',
        nameRevision: 'name-v1', creationSequence: 1, status: 'READY' }] });
    if (operation === 'HistoryQuery') return response({ worldRef: body.worldRef, objectRef: body.objectRef,
      historyRevision: 'history-v1', headTransactionId: f.receipt.transactionId, undoAvailable: true, redoAvailable: false,
      entries: [{ transactionId: f.receipt.transactionId, originTransactionId: null, affectedObjectRefs: ['object-1'],
        operationDigest: f.receipt.operationDigest, beforeImageDigest: 'd'.repeat(64),
        expectedAfterReadbackDigest: f.receipt.readbackDigest, receiptDigest: digestValue('receipt', f.receipt).sha256,
        historyRevision: 'history-v1', status: 'VERIFIED' }] });
    return canvasCall(operation, body);
  };
  return f;
}