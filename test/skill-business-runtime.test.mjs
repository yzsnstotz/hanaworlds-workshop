import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contractHandshake, digestValue } from 'hanaworlds-contracts/v4';
import { fixture, mount, confirm, withRuntime, authorize, plain } from './helpers/build-runtime.mjs';
const example = JSON.parse(await readFile(new URL('../vendor/contracts/fixtures/v4/proposal/text-build-proposal.json', import.meta.url)));
process.env.HW_RUNTIME_ROOT ??= new URL('../../runtimes/', import.meta.url).pathname;

function skillFixture() {
  const f = authorize(fixture());
  f.modelCalls = 0; f.proposalCalls = 0; f.providerChanges = {}; f.afterProposal = async () => {};
  f.controls = {  purpose: 'first building', dimensions: { width: 1, depth: 1, height: 1, unit: 'node' }, entrancePortalRefs: [], styleText: null, siteRules:{requireEntranceConnectivity:false,entranceClearance:null,hazardPolicy:{forbidLiquid:true,maximumDamagePerSecond:0},optionalLightRule:null} };
  f.llm = { async *stream() { f.modelCalls++; throw Error('skill must own interpretation'); } };
  const binding = context => ({ ...plain(example.facts.originalBinding), actorRef: context.actorRef,
    sessionRef: context.sessionRef, authorizationRef: context.authorizationRef, worldRef: context.worldRef,
    sessionIncarnationRef: f.incarnation, expectedGrantRef: f.grant });
  f.proposalAuthority = { contractHandshake,
    async capture(context) { f.captured = plain(context); f.capturedBinding = binding(context); return plain(f.capturedBinding); },
    async readProviderFacts(request, contexts) {
      assert.deepEqual(plain(contexts.sourceContext), f.captured);
      return { ...plain(example.facts), ...contexts, originalBinding: plain(f.capturedBinding),
        currentBinding: binding(request), liveSessionIncarnationRef: f.incarnation,
        grantStatus: f.current ? 'CURRENT' : 'REVOKED', invocationStatus: f.invocationStatus,
        replay: 'NEW', priorRequest: null, ...f.providerChanges };
    } };
  f.painter = { contractHandshake, async call(operation, request) {
    assert.equal(operation, 'ValidateBuildProposal'); f.proposalCalls++;
    const result = plain(example.response.result);
    result.invocationId = request.invocationId;
    result.buildDigest = digestValue('build', result.build).sha256;
    await f.afterProposal(request);
    return { contractVersion: 'painter/v3', requestId: request.requestId, result, error: null };
  } };
  return f;
}
async function ready(runtime, f) {
  const advance = await confirm(runtime, f); f.buildParent = advance;
  const context = await runtime.workshop.readBuildProposalContext({ ...advance, requestId: 'read-proposal' });
  return { advance, context, proposal: { ...context, requestId: 'submit-proposal', proposal: plain(example.request.proposal) } };
}

test('skill pure text uses original Core confirmation, public Painter and durable advance with zero Workshop model calls', async () => {
  const f = skillFixture();
  await withRuntime(f, async (runtime, root) => {
    const { advance, context, proposal } = await ready(runtime, f);
    assert.equal(f.modelCalls, 0); assert.equal(context.referenceBrief.media.length, 0);
    const response = await runtime.workshop.submitBuildProposal(proposal);
    assert.equal(response.error, null); assert.equal(f.proposalCalls, 1);
    await runtime.close();
    const reopened = await mount(root, f);
    try {
      const replay = await reopened.workshop.submitBuildProposal(proposal);
      assert.deepEqual(replay, response); assert.equal(f.proposalCalls, 1);
      const outcome = await reopened.workshop.call('AdvanceCurrentBuild', advance);
      assert.equal(outcome.error, null, JSON.stringify(outcome)); assert.equal(outcome.result.outcome, 'VERIFIED');
      assert.equal(f.applyCount, 1); assert.equal(f.planCalls.length, 0); assert.equal(f.modelCalls, 0);
    } finally { await reopened.close(); }
  });
});

for (const [name, mutate, code] of [
  ['actor spoof', r => { r.actorRef = 'model-actor'; }, 'AUTHORIZATION_REVOKED'],
  ['world spoof', r => { r.worldRef = 'model-world'; }, 'INTENT_UNCONFIRMED'],
  ['grant spoof', r => { r.authorizationRef = 'model-grant'; }, 'AUTHORIZATION_REVOKED'],
  ['context rebind', r => { r.referenceBrief.text += ' changed'; r.referenceBriefDigest = digestValue('reference-brief', r.referenceBrief).sha256;
    r.intent.referenceBriefDigest = r.referenceBriefDigest; r.intentDigest = digestValue('intent', r.intent).sha256; }, 'TARGET_FACTS_STALE'],
  ['unknown model confirmation field', r => { r.proposal.confirmed = true; }, 'UNKNOWN_REQUIRED_FIELD'],
]) test(`proposal rejects ${name}`, async () => {
  const f = skillFixture(); await withRuntime(f, async runtime => {
    const { proposal } = await ready(runtime, f); mutate(proposal);
    const response = await runtime.workshop.submitBuildProposal(proposal);
    assert.equal(response.error?.code, code); assert.equal(f.proposalCalls, 0); assert.equal(f.applyCount, 0);
  });
});

for (const [name, mutate, code] of [
  ['revoked original grant', f => { f.current = false; }, 'AUTHORIZATION_REVOKED'],
  ['native grant replaced', f => { f.grant = 'different-native'; }, 'PERMISSION_DENIED'],
  ['Session incarnation changed', f => { f.incarnation = 'different-incarnation'; }, 'PERMISSION_DENIED'],
  ['wrong service', f => { f.providerChanges.callerServiceRef = 'model-service'; }, 'PERMISSION_DENIED'],
  ['inactive invocation', f => { f.invocationStatus = 'CANCELLED'; }, 'PERMISSION_DENIED'],
  ['unknown grant', f => { f.providerChanges.grantStatus = 'UNKNOWN'; }, 'CAPABILITY_UNAVAILABLE'],
  ['operation delegation mismatch', f => { f.providerChanges.authorizedOperation = 'CreateBuildPlan'; }, 'SCHEMA_INVALID'],
]) test(`fresh provider rejects ${name} on replay`, async () => {
  const f = skillFixture(); await withRuntime(f, async runtime => {
    const { proposal } = await ready(runtime, f);
    const good = await runtime.workshop.submitBuildProposal(proposal); assert.equal(good.error, null);
    mutate(f);
    const response = await runtime.workshop.submitBuildProposal(proposal);
    assert.equal(response.error?.code, code); assert.equal(f.proposalCalls, 1); assert.equal(f.applyCount, 0);
  });
});

test('proposal payload conflict remains rejected across durable restart', async () => {
  const f = skillFixture(); await withRuntime(f, async (runtime, root) => {
    const { proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error, null);
    await runtime.close(); const reopened = await mount(root, f);
    try {
      const changed = plain(proposal); changed.proposal.boxes.push(plain(changed.proposal.boxes[0]));
      assert.equal((await reopened.workshop.submitBuildProposal(changed)).error?.code, 'REPLAY_MISMATCH');
      assert.equal(f.proposalCalls, 1);
    } finally { await reopened.close(); }
  });
});

test('late cancellation cannot be consumed by AdvanceCurrentBuild or silently use the fixed planner', async () => {
  const f = skillFixture(), controller = new AbortController();
  f.afterProposal = async () => controller.abort();
  await withRuntime(f, async runtime => {
    const { advance, proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal, { signal: controller.signal })).error?.code, 'CAPABILITY_UNAVAILABLE');
    const response = await runtime.workshop.call('AdvanceCurrentBuild', advance);
    assert.equal(response.error?.code, 'TARGET_REQUIRED'); assert.equal(f.planCalls.length, 0); assert.equal(f.applyCount, 0);
  });
});

test('late grant revocation after Painter rejects plan before compilation', async () => {
  const f = skillFixture(); f.afterProposal = async () => { f.current = false; };
  await withRuntime(f, async runtime => {
    const { proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error?.code, 'AUTHORIZATION_REVOKED');
    assert.equal(f.brushCalls.length, 0); assert.equal(f.applyCount, 0);
  });
});

test('fresh provider change after proposal and before compile rejects stale plan', async () => {
  const f = skillFixture(); await withRuntime(f, async runtime => {
    const { advance, proposal, context } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error, null);
    const changed = plain(context); changed.regionInspection.inspectionId = 'changed-inspection';
    f.providerChanges.currentContext = changed;
    const response = await runtime.workshop.call('AdvanceCurrentBuild', advance);
    assert.equal(response.error?.code, 'PERMISSION_DENIED'); assert.equal(f.brushCalls.length, 0); assert.equal(f.applyCount, 0);
  });
});

test('lost apply result stays PENDING and resumes exact durable request after restart', async () => {
  const f = skillFixture(); f.interruptApply = true;
  await withRuntime(f, async (runtime, root) => {
    const { advance, proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error, null);
    const response = await runtime.workshop.call('AdvanceCurrentBuild', advance);
    assert.equal(response.error, null); assert.equal(response.result.outcome, 'PENDING');
    await runtime.close(); f.interruptApply = false;
    const reopened = await mount(root, f);
    try {
      const recovered = await reopened.workshop.call('AdvanceCurrentBuild', advance);
      assert.equal(recovered.error, null); assert.equal(recovered.result.outcome, 'VERIFIED');
      assert.deepEqual(f.applyRequests[0], f.applyRequests[1]);
      assert.equal(f.proposalCalls, 1); assert.equal(f.brushCalls.length, 1); assert.equal(f.issueCalls.length, 1);
    } finally { await reopened.close(); }
  });
});

test('cancellation during durable success write removes the consumable plan', async () => {
  const f = skillFixture(), controller = new AbortController();
  await withRuntime(f, async runtime => {
    const { advance, proposal } = await ready(runtime, f);
    const store = runtime.workshop.projectionStore, replace = store.replace.bind(store);
    store.replace = async (...args) => {
      await replace(...args);
      if (args[3].lastBuild?.proposalRequest) controller.abort();
    };
    const result = await runtime.workshop.submitBuildProposal(proposal, { signal: controller.signal });
    assert.equal(result.error?.code, 'CAPABILITY_UNAVAILABLE');
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error?.code, 'PERMISSION_DENIED');
    assert.equal((await runtime.workshop.call('AdvanceCurrentBuild', advance)).error?.code, 'TARGET_REQUIRED');
    assert.equal(f.applyCount, 0);
  });
});

test('new context invalidates consumption of previous proposal without rebinding it', async () => {
  const f = skillFixture(); await withRuntime(f, async runtime => {
    const { advance, proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error, null);
    await runtime.workshop.readBuildProposalContext({ ...advance, requestId: 'next-generation' });
    assert.equal((await runtime.workshop.call('AdvanceCurrentBuild', advance)).error?.code, 'PERMISSION_DENIED');
    assert.equal(f.applyCount, 0);
  });
});

test('late provider revocation during Brush consumption never reaches Canvas apply', async () => {
  const f = skillFixture(); const compile = f.brush.compile;
  f.brush.compile = request => { const result = compile(request); f.current = false; return result; };
  await withRuntime(f, async runtime => {
    const { advance, proposal } = await ready(runtime, f);
    assert.equal((await runtime.workshop.submitBuildProposal(proposal)).error, null);
    const result = await runtime.workshop.call('AdvanceCurrentBuild', advance);
    assert.equal(result.error?.code, 'AUTHORIZATION_REVOKED'); assert.equal(f.brushCalls.length, 1); assert.equal(f.applyCount, 0);
  });
});
