import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../web/sdk-auth-state.mjs';
const signal=()=>new AbortController().signal;
// FIXTURE configuration metadata for refusal/race guards only.
function fixture(){let calls=0;const credentials={describeRecord:async()=>{calls++;return {configured:true,kind:'grant',writable:true};}};const llm={listProviders:()=>[{id:'openai-codex',name:'declared'}]};const values={credentials,llm};return {values,credentials,llm,ctx:{get:key=>values[key]},calls:()=>calls};}
test('shared login/logout is rejected; SDK refresh is not routed through browser guard',()=>{
 assert.throws(()=>S.assertBrowserCredentialMutationAllowed('/absolute/home'),{code:'SHARED_LOGIN_RECORD_BROWSER_MUTATION_DISABLED'});
 assert.doesNotThrow(()=>S.assertBrowserCredentialMutationAllowed(undefined));
});
test('only public describe metadata is delivered, no account/allowance promise',async()=>{
 const f=fixture(),state=await S.readRouteLoginRecordState(f.ctx,{signal:signal()});
 assert.equal(f.calls(),1);assert.equal(state.record.configured,true);
 assert.equal(state.accountAssociation,'UNKNOWN');assert.equal(state.allowance,'UNKNOWN');assert.equal(state.paidCreditRestriction,'UNDECLARED');
 assert.equal(state.authentication,'NOT_RESOLVED');
 assert.equal(Object.hasOwn(state,'token'),false);
});
test('provider replacement during official describe refuses delivery',async()=>{
 const f=fixture();f.credentials.describeRecord=async()=>{f.values.credentials={};return {configured:true,kind:'grant',writable:true};};
 await assert.rejects(S.readRouteLoginRecordState(f.ctx,{signal:signal()}),{code:'AUTH_CONFIGURATION_PROVIDER_CHANGED'});
});
test('cancellation and missing credential metadata provider stop before SDK read',async()=>{
 const f=fixture(),control=new AbortController();control.abort();
 await assert.rejects(S.readRouteLoginRecordState(f.ctx,{signal:control.signal}),{name:'AbortError'});
 assert.equal(f.calls(),0);delete f.values.credentials;
 await assert.rejects(S.readRouteLoginRecordState(f.ctx,{signal:signal()}),{code:'OFFICIAL_CREDENTIAL_METADATA_UNAVAILABLE'});
});
test('public result allowlists metadata and excludes unexpected value fields',async()=>{
 const f=fixture();f.credentials.describeRecord=async()=>({configured:true,kind:'grant',writable:true,unexpectedValue:'FIXTURE_SENTINEL'});
 const state=await S.readRouteLoginRecordState(f.ctx,{signal:signal()});
 assert.deepEqual(state.record,{configured:true,kind:'grant',writable:true});
 assert.equal(JSON.stringify(state).includes('FIXTURE_SENTINEL'),false);
});
