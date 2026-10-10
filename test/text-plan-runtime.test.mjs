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
import { contractHandshake, digestValue, ContractError, deriveCurrentBuildAuthorization,
  validateCurrentBuildAuthorizedApply } from 'hanaworlds-contracts/v4';
import { worldFixture, capabilities, startRequest, switchRequest } from './helpers/world-context.mjs';

const { default: workshopPlugin } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');
const chain = JSON.parse(await readFile(new URL('../vendor/contracts/fixtures/v4/candidate/placement-region-chain-v4.json', import.meta.url))).validCases[0].materializedChain;
const plain = value => JSON.parse(JSON.stringify(value));

import { fixture, mount, confirm, withRuntime, authorize } from './helpers/build-runtime.mjs';

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



test('current-build authorization derives from durable public text facts, validates at use and reopens exact result', async () => {
  const f = authorize(fixture());
  await withRuntime(f, async (runtime, root) => {
    f.buildParent = await confirm(runtime, f);
    f.afterIssue = async facts => {
      const state = await runtime.workshop.projectionStore.get('s1', {
        id: 's1', version: SESSION_FORMAT_VERSION, createdAt: 100, cwd: '/isolated/workshop/text-plan' });
      assert.deepEqual(plain(state.buildEntries[f.buildParent.requestId].parentRequest), plain(f.buildParent));
      assert.deepEqual(plain(state.buildEntries[f.buildParent.requestId].authorizationFacts), plain(facts));
    };
    const result = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(result.error, null, JSON.stringify(result.error));
    assert.equal(result.result.outcome, 'VERIFIED');
    assert.equal(f.applyCount, 1); assert.ok(f.verifyCalls >= 3);
    assert.equal(f.issued.authorizationBinding.surfaceActionDigest,
      digestValue('current-build-action', f.issued.action).sha256);
    assert.equal(f.issued.action.facts.confirmationInputId, 'confirm-text');
    assert.equal(f.issued.action.facts.apply.requestId, f.buildParent.requestId + ':apply');
    await runtime.close();
    const reopened = await mount(root, f);
    try {
      assert.equal((await reopened.workshop.call('AdvanceCurrentBuild', f.buildParent)).result.outcome, 'VERIFIED');
      assert.equal(f.applyCount, 1);
    } finally { await reopened.close(); }
  });
});

for (const [label, configure, code] of [
  ['revoked grant', f => { f.contextChanges.grantStatus = 'REVOKED'; }, 'AUTHORIZATION_REVOKED'],
  ['expired grant', f => { f.contextChanges.grantStatus = 'EXPIRED'; }, 'AUTHORIZATION_REVOKED'],
  ['unknown grant', f => { f.contextChanges.grantStatus = 'UNKNOWN'; }, 'CAPABILITY_UNAVAILABLE'],
  ['cancelled invocation', f => { f.contextChanges.invocationStatus = 'CANCELLED'; }, 'PERMISSION_DENIED'],
  ['replaced Session', f => { f.contextChanges.liveSessionIncarnationRef = 'replacement'; }, 'PERMISSION_DENIED'],
  ['replaced Workshop', f => { f.contextChanges.workshopServiceRef = 'replacement'; }, 'PERMISSION_DENIED'],
  ['replaced Canvas', f => { f.contextChanges.canvasServiceRef = 'replacement'; }, 'PERMISSION_DENIED'],
  ['different parent actor', f => { f.buildParent = { ...f.buildParent, actorRef: 'attacker' }; }, 'PERMISSION_DENIED'],
  ['different current turn', f => { f.contextChanges.currentTurnRef = 'other'; }, 'TURN_REVISION_MISMATCH'],
  ['different confirmation', f => { f.contextChanges.currentConfirmationInputId = 'other'; }, 'TURN_REVISION_MISMATCH'],
  ['different operation', f => { f.contextChanges.currentOperationDigest = 'f'.repeat(64); }, 'STALE_REVISION'],
  ['replay conflict', f => { f.contextChanges.replay = 'CONFLICT'; }, 'REPLAY_MISMATCH'],
  ['unknown Host context field', f => { f.contextChanges.untrusted = true; }, 'UNKNOWN_REQUIRED_FIELD'],
  ['tampered issued digest', f => { f.afterIssue = async () => { f.issued.authorizationBinding.surfaceActionDigest = 'f'.repeat(64); }; }, 'NON_CANONICAL_AMBIGUITY'],
  ['unknown issuance field', f => { f.afterIssue = async () => { f.issued.extra = true; }; }, 'UNKNOWN_REQUIRED_FIELD'],
  ['tampered issued actor', f => { f.afterIssue = async () => {
    f.issued.authorizationBinding.actorRef = 'attacker';
    f.issued.authorizationBindingDigest = digestValue('authorization-binding', f.issued.authorizationBinding).sha256;
  }; }, 'PERMISSION_DENIED'],
  ['late revocation before reservation', f => { f.afterIssue = async () => { f.contextChanges.grantStatus = 'REVOKED'; }; }, 'AUTHORIZATION_REVOKED'],
  ['late revocation after reservation', f => { f.afterVerify = async () => { f.contextChanges.grantStatus = 'REVOKED'; }; }, 'AUTHORIZATION_REVOKED'],
  ['authority revoked while Host callback awaits', f => { f.afterVerify = async () => { f.current = false; }; }, 'AUTHORIZATION_REVOKED'],
]) test(`current-build authorization rejects ${label} before Canvas Apply`, async () => {
  const f = authorize(fixture());
  await withRuntime(f, async runtime => {
    const request = await confirm(runtime, f); f.buildParent = plain(request); configure(f);
    const result = await runtime.workshop.call('AdvanceCurrentBuild', request);
    assert.equal(result.error?.code, code, JSON.stringify(result));
    assert.equal(f.applyCount, 0);
    const opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    if (!opened.error) assert.equal(opened.result.turns.at(-1).actionReceiptDigest, null);
  });
});

for (const port of ['canvas', 'applyAuthority']) test(`current-build authorization rejects noncurrent ${port} peer`, async () => {
  const f = authorize(fixture());
  await withRuntime(f, async runtime => {
    f.buildParent = await confirm(runtime, f);
    f[port].contractHandshake = { ...contractHandshake, contracts: 'hanaworlds-contracts@0.3.8' };
    const result = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(result.error.code, 'UNSUPPORTED_VERSION'); assert.equal(f.applyCount, 0);
  });
});

test('current-build authorization does not publish a late VERIFIED response after revocation', async () => {
  const f = authorize(fixture());
  f.afterApply = async () => { f.contextChanges.grantStatus = 'REVOKED'; };
  await withRuntime(f, async runtime => {
    f.buildParent = await confirm(runtime, f);
    const result = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(result.error, null); assert.equal(result.result.outcome, 'PENDING'); assert.equal(f.applyCount, 1);
    const state = await runtime.workshop.projectionStore.get('s1', {
      id: 's1', version: SESSION_FORMAT_VERSION, createdAt: 100, cwd: '/isolated/workshop/text-plan' });
    assert.equal(state.pendingApply.status, 'RESERVED'); assert.equal(state.turns[0].actionReceiptDigest, null);
  });
});

test('current-build authorization restarts pending exact request and refuses stale grant before retry', async () => {
  const f = authorize(fixture()); f.interruptApply = true;
  await withRuntime(f, async (runtime, root) => {
    f.buildParent = await confirm(runtime, f);
    const pending = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(pending.result.outcome, 'PENDING'); assert.equal(f.applyCount, 1);
    await runtime.close(); const reopened = await mount(root, f);
    try {
      f.contextChanges.grantStatus = 'EXPIRED';
      assert.equal((await reopened.workshop.call('AdvanceCurrentBuild', f.buildParent)).error.code, 'AUTHORIZATION_REVOKED');
      assert.equal(f.applyCount, 1);
      f.contextChanges = {}; f.interruptApply = false;
      const result = await reopened.workshop.call('AdvanceCurrentBuild', f.buildParent);
      assert.equal(result.error, null); assert.equal(result.result.outcome, 'VERIFIED');
      assert.deepEqual(f.applyRequests[0], f.applyRequests[1]);
      assert.equal(f.issueCalls.length, 1); assert.equal(f.planCalls.length, 1);
    } finally { await reopened.close(); }
  });
});

test('current-build authorization preserves unsigned facts when Host issuance response is lost', async () => {
  const f = authorize(fixture());
  await withRuntime(f, async (runtime, root) => {
    f.buildParent = await confirm(runtime, f);
    f.afterIssue = async () => { throw Error('fixture lost issuance response after durable Host record'); };
    assert.equal((await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent)).error.code, 'CAPABILITY_UNAVAILABLE');
    const original = plain(f.issued);
    assert.equal(f.applyCount, 0);
    await runtime.close(); const reopened = await mount(root, f);
    try {
      f.afterIssue = async () => {};
      const result = await reopened.workshop.call('AdvanceCurrentBuild', f.buildParent);
      assert.equal(result.error, null); assert.equal(result.result.outcome, 'VERIFIED');
      assert.deepEqual(f.issued, original); assert.deepEqual(f.issueCalls[0], f.issueCalls[1]);
      assert.equal(f.planCalls.length, 1);
    } finally { await reopened.close(); }
  });
});

test('current-build authorization refuses an own durable turn changed during issuance', async () => {
  const f = authorize(fixture());
  await withRuntime(f, async runtime => {
    f.buildParent = await confirm(runtime, f);
    f.afterIssue = async () => {
      const identity = { id: 's1', version: SESSION_FORMAT_VERSION, createdAt: 100, cwd: '/isolated/workshop/text-plan' };
      const state = await runtime.workshop.projectionStore.get('s1', identity);
      state.turns[0].turnRevision = 'new-current-turn';
      await runtime.workshop.projectionStore.replace('s1', identity, state.context.sessionRevision, state);
    };
    const result = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(result.error.code, 'TURN_REVISION_MISMATCH'); assert.equal(f.applyCount, 0);
  });
});

test('current-build authorization admits a later confirmed turn without reusing the completed issuance', async () => {
  const f = authorize(fixture());
  await withRuntime(f, async runtime => {
    f.buildParent = await confirm(runtime, f);
    const first = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(first.error, null);
    const firstIssued = plain(f.issued);
    let opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    const turn = await runtime.workshop.call('AppendMultimodalTurn', { ...startRequest, requestId: 'next-text',
      expectedRevision: opened.result.context.sessionRevision, turnRef: 'next-turn', text: '建一块石头', media: [],
      controls:{ purpose: null, dimensions: null, entrancePortalRefs: [], styleText: null } });
    assert.equal(turn.error, null);
    opened = await runtime.workshop.call('StartOrResumeSession', startRequest);
    const writer = await runtime.ctx.sessionPersistence.open('s1', 'write');
    await writer.append([{ type: 'user/message', seq: 2, time: 103, surfaceOp: 'append',
      data: { id: 'confirm-next', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '确认' }] } }]);
    await writer.close();
    const confirmation = await runtime.workshop.call('AnswerClarification', { ...startRequest, requestId: 'confirm-next',
      expectedRevision: opened.result.context.sessionRevision, turnRef: 'next-turn',
      clarificationId: turn.result.clarification.clarificationId, answer: '确认' });
    assert.equal(confirmation.error, null);
    f.buildParent = { ...f.buildParent, requestId: 'advance-next', expectedTurnRevision: turn.result.turnRevision };
    f.issued = null; f.receipt = null;
    f.contextChanges = { currentTurnRef: 'next-turn', currentConfirmationInputId: 'confirm-next' };
    const second = await runtime.workshop.call('AdvanceCurrentBuild', f.buildParent);
    assert.equal(second.error, null, JSON.stringify(second.error));
    assert.equal(second.result.outcome, 'VERIFIED');
    assert.notEqual(f.issued.action.facts.apply.transactionId, firstIssued.action.facts.apply.transactionId);
    assert.notEqual(f.issued.authorizationBinding.surfaceActionDigest, firstIssued.authorizationBinding.surfaceActionDigest);
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
