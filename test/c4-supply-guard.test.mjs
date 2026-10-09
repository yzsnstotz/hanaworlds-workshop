// New preparation guard checks only. No Core Session, runtime boot, user event,
// brief, Canvas selection, LocalFacts value, model adapter or world is created.
import test from 'node:test';
import assert from 'node:assert/strict';
let supply = {};
try { supply = await import('../web/c4-supply.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function create(getWorkshop) {
 assert.equal(typeof supply.createPainterLocalFactsPort, 'function', 'missing public Host callback bridge');
 return supply.createPainterLocalFactsPort(getWorkshop);
}
const controller = () => new AbortController();

test('missing current Workshop never supplies fabricated facts', async () => {
 const port = create(() => undefined);
 await assert.rejects(port.read({}, 'ValidateBuildProposal', {signal:controller().signal}), e => e.code === 'CAPABILITY_UNAVAILABLE');
});
test('CreateBuildPlan cannot consume the text-only getter', async () => {
 let reads = 0; const port = create(() => ({readBuildProposalProviderFacts(){ reads++; throw Error('must not call'); }}));
 await assert.rejects(port.read({}, 'CreateBuildPlan', {signal:controller().signal}), e => e.code === 'CAPABILITY_UNAVAILABLE');
 assert.equal(reads, 0);
});
test('cancelled request never enters the getter', async () => {
 let reads = 0; const port = create(() => ({readBuildProposalProviderFacts(){ reads++; throw Error('must not call'); }}));
 const abort=controller();abort.abort();
 await assert.rejects(port.read({}, 'ValidateBuildProposal', {signal:abort.signal}), e => e.name === 'AbortError');
 assert.equal(reads, 0);
});
test('getter failure is preserved, never replaced with request-derived facts', async () => {
 const denied=Error('exact request not retained'); const input={requestId:'input-only'};let seen;
 const owner={readBuildProposalProviderFacts(request){seen=request;return Promise.reject(denied);}};
 await assert.rejects(create(() => owner).read(input,'ValidateBuildProposal',{signal:controller().signal}), e => e === denied);
 assert.equal(seen,input);
});
test('replacement during await cannot release output', async () => {
 let release; const pending=new Promise(r => release=r);
 let current={readBuildProposalProviderFacts(){return pending;}};
 const operation=create(() => current).read({},'ValidateBuildProposal',{signal:controller().signal});
 current={};release(undefined); // No LocalFacts fixture is constructed or returned.
 await assert.rejects(operation, e => e.code === 'CAPABILITY_UNAVAILABLE');
});
test('cancellation during await cannot release output', async () => {
 let release; const pending=new Promise(r => release=r);const owner={readBuildProposalProviderFacts(){return pending;}};
 const abort=controller();const operation=create(() => owner).read({},'ValidateBuildProposal',{signal:abort.signal});
 abort.abort();release(undefined);
 await assert.rejects(operation, e => e.name === 'AbortError');
});
