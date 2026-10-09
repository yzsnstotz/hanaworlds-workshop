import test from 'node:test';
import assert from 'node:assert/strict';
import { recordKeyFor } from '@deepseek-ai/dsh-llm-pi-ai';
import { readCodexAllowance, noCashDecision } from '../web/account-allowance.mjs';

// FIXTURE credential service and usage endpoint: shape of the official harness credential seam
// and of the official Codex client's /wham/usage payload. No network, no real grant.
const ACCESS='fixture-access-token-not-real',ACCOUNT='fixture-account-1';
function credentials(record) {
 const reads=[];return {reads,async readRecord(key){reads.push(key);return key===recordKeyFor('openai-codex')?record:undefined;},
  async modifyRecord(){throw Error('no refresh expected: token valid for hours');}};
}
const grant={kind:'grant',payload:{type:'oauth',access:ACCESS,refresh:'fixture-refresh',expires:Date.now()+6*3600e3,accountId:ACCOUNT}};
const usage=(over={})=>({plan_type:'plus',rate_limit:{allowed:true,limit_reached:false,primary_window:{used_percent:12,limit_window_seconds:18000,reset_after_seconds:100,reset_at:1},secondary_window:{used_percent:30,limit_window_seconds:604800,reset_after_seconds:100,reset_at:2}},
 credits:{has_credits:false,unlimited:false,balance:'0'},spend_control:null,rate_limit_reached_type:null,...over});
const ctxOf=c=>({get:name=>name==='credentials'?c:undefined});

test('allowance read: official grant auth + account header to /wham/usage; sanitized result never carries the token or raw account id',async()=>{
 const c=credentials(grant);let seen;
 const fetchImpl=async(url,init)=>{seen={url,headers:init.headers};return new Response(JSON.stringify(usage()),{status:200,headers:{'content-type':'application/json'}});};
 const a=await readCodexAllowance(ctxOf(c),{signal:new AbortController().signal,fetchImpl});
 assert.equal(seen.url,'https://chatgpt.com/backend-api/wham/usage');
 assert.equal(seen.headers.authorization,`Bearer ${ACCESS}`);assert.equal(seen.headers['chatgpt-account-id'],ACCOUNT);
 assert.ok(c.reads.every(k=>k===recordKeyFor('openai-codex')));
 const text=JSON.stringify(a);assert.equal(text.includes(ACCESS),false);assert.equal(text.includes(ACCOUNT),false);assert.match(a.accountRef,/^sha256-[0-9a-f]{16}$/);
 assert.deepEqual(noCashDecision(a).code,'INCLUDED_ONLY_NO_CREDITS');assert.equal(noCashDecision(a,{maxIncludedUsedPercent:10}).code,'INCLUDED_HEADROOM_BELOW_SETTING');
});
test('decision: credits are reported and guarded, never a reason to dispatch; refuses by name on unlimited, unknown credits, exhausted window, limit reached, workspace plan; usage HTTP error and no login are named',async()=>{
 const read=async payload=>readCodexAllowance(ctxOf(credentials(grant)),{signal:new AbortController().signal,fetchImpl:async()=>new Response(JSON.stringify(payload),{status:200})});
 assert.equal(noCashDecision(await read(usage({credits:{has_credits:true,unlimited:false,balance:'5'}}))).code,'INCLUDED_ONLY_CREDITS_GUARDED');
 assert.equal(noCashDecision(await read(usage({credits:{has_credits:false,unlimited:false,balance:'0.01'}}))).code,'INCLUDED_ONLY_CREDITS_GUARDED');
 assert.equal(noCashDecision(await read(usage({credits:{has_credits:false,unlimited:true,balance:null}}))).code,'CREDITS_UNLIMITED');
 assert.equal(noCashDecision(await read(usage({credits:null}))).code,'CREDITS_STATE_UNKNOWN');
 const full=usage();full.rate_limit.secondary_window.used_percent=98;assert.equal(noCashDecision(await read(full)).code,'INCLUDED_HEADROOM_BELOW_SETTING');
 assert.equal(noCashDecision(await read(usage({rate_limit_reached_type:{type:'rate_limit_reached'}}))).code,'INCLUDED_LIMIT_NOT_AVAILABLE');
 assert.equal(noCashDecision(await read(usage({plan_type:'self_serve_business_usage_based'}))).code,'PLAN_NOT_INCLUDED_SUBSCRIPTION');
 await assert.rejects(readCodexAllowance(ctxOf(credentials(grant)),{signal:new AbortController().signal,fetchImpl:async()=>new Response('no',{status:401})}),e=>e.code==='USAGE_READ_FAILED'&&e.details.status===401);
 await assert.rejects(readCodexAllowance(ctxOf(credentials(undefined)),{signal:new AbortController().signal,fetchImpl:async()=>assert.fail('no request without a grant')}),e=>e.code==='ROUTE_NOT_SIGNED_IN');
});
test('per-call guard: every REAL openai-codex prepareCall re-reads first and refuses by name before dispatch; other providers untouched',async()=>{
 const {guardRealDispatch}=await import('../web/account-allowance.mjs');
 const prepared=[];const llm={prepareCall:async config=>{prepared.push(config.provider);return {config};}};
 const ctx={get:name=>name==='llm'?llm:undefined};let next=usage();const decisions=[];
 const lift=guardRealDispatch(ctx,{read:async()=>({...await readCodexAllowance(ctxOf(credentials(grant)),{signal:new AbortController().signal,fetchImpl:async()=>new Response(JSON.stringify(next),{status:200})})}),settings:()=>({maxIncludedUsedPercent:97}),record:d=>decisions.push(d.code)});
 await llm.prepareCall({provider:'openai-codex',model:'gpt-5.6-luna'});
 next=usage({rate_limit:{allowed:false,limit_reached:true,primary_window:null,secondary_window:null}});
 await assert.rejects(llm.prepareCall({provider:'openai-codex',model:'gpt-5.6-luna'}),e=>e.message==='REAL_DISPATCH_REFUSED_INCLUDED_LIMIT_NOT_AVAILABLE');
 await llm.prepareCall({provider:'hanaworlds-fixture',model:'fixture-vision-1'});
 assert.deepEqual(prepared,['openai-codex','hanaworlds-fixture']);assert.deepEqual(decisions,['INCLUDED_ONLY_NO_CREDITS','INCLUDED_LIMIT_NOT_AVAILABLE']);
 lift();
});
