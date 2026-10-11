import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import Sessions from '@deepseek-ai/dsh-session';
import Agents, { installModelSelection } from '@deepseek-ai/dsh-agent';
import Projections from '@deepseek-ai/dsh-session-projection';
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
const {default:Workshop}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');

// Only the provider is a fixture: Core, registry, loop, model selection, storage,
// Workshop and the same-session prompt/reply path are the actual published APIs.
class FixtureModel extends LlmAdapter {
 requests=[]; fail=false;
 providerInfo(provider){return {id:provider,name:'FIXTURE'};}
 async resolveModel(provider,model){return {provider,id:model,name:model,inputModalities:['text'],context:{contextWindow:100000}};}
 async *stream(options){
  this.requests.push(options);
  if(this.fail)throw Error('FIXTURE_CREDENTIAL_UNAVAILABLE');
  const text=`FIXTURE reply from ${options.model}`;
  yield {type:'block-start',index:0,blockType:'text'};
  yield {type:'text-delta',index:0,text};
  yield {type:'block-end',index:0,block:{type:'text',text}};
  yield {type:'finish',reason:'stop'};
 }
}
async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT??tmpdir();await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'conversation-'));
 const ctx=new Context();
 try{
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Sessions).await();await ctx.plugin(Projections).await();await ctx.plugin(Agents).await();
  await ctx.plugin(Llm).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();await ctx.plugin(AgentLoop).await();
  const model=new FixtureModel();ctx.llm.registerAdapter(['fixture'],model);
  const selection={current:{provider:'fixture',model:'host-choice-A'},assembled:undefined};
  ctx.provide('agentDefaultModel',{currentSelection:()=>selection.current});
  await ctx.plugin(Workshop).await();
  const handle=await ctx.agents.create({sessionId:'conversation',setup(agentCtx){installModelSelection(agentCtx,selection);}});
  const session=handle.agent.session,ws=ctx.get('hanaworldsWorkshop');
  await fn({ctx,ws,model,selection,session,agent:handle.agent,root});
 }finally{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
}
const signal=()=>new AbortController().signal;
test('Workshop displays the host model, sends through the live Loop and persists its actual reply',()=>setup(async r=>{
 const before=await r.ws.readConversationForPanel(r.session,signal());
 assert.equal(before.model.model,'host-choice-A');assert.deepEqual(before.items,[]);assert.equal(r.model.requests.length,0);
 const out=await r.ws.sendConversationForPanel(r.session,'你好',signal());
 assert.equal(out.model.model,'host-choice-A');assert.equal(out.items.at(-1).text,'FIXTURE reply from host-choice-A');
 assert.equal(out.items.at(-2).text,'你好');assert.equal(r.model.requests.length,1);
 const persisted=await r.ctx.sessionPersistence.open('conversation','read');
 try{const events=(await persisted.read()).events;assert.ok(events.some(e=>e.type==='request/header'&&e.data.header.config.model==='host-choice-A'));assert.ok(events.some(e=>e.type==='assistant/message'));}finally{await persisted.close();}
 r.selection.current={provider:'fixture',model:'host-choice-B'};
 r.session.append('model/selection',r.selection.current);
 assert.equal((await r.ws.readConversationForPanel(r.session,signal())).model.model,'host-choice-B');
 const next=await r.ws.sendConversationForPanel(r.session,'换个模型再问',signal());
 assert.equal(next.model.model,'host-choice-B');assert.equal(next.items.at(-1).model,'host-choice-B');
 assert.deepEqual(r.model.requests.map(q=>q.model),['host-choice-A','host-choice-B']);
}));
test('a failed model turn never reuses an earlier answer as success',()=>setup(async r=>{
 await r.ws.sendConversationForPanel(r.session,'成功一轮',signal());r.model.fail=true;
 await assert.rejects(r.ws.sendConversationForPanel(r.session,'这轮应该失败',signal()),/FIXTURE_CREDENTIAL_UNAVAILABLE/);
 assert.equal((await r.ws.readConversationForPanel(r.session,signal())).items.filter(i=>i.role==='assistant').length,1);
}));
test('no selected model, foreign Session, empty input and an aborted caller cannot dispatch',()=>setup(async r=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(r.ws.sendConversationForPanel(r.session,'',signal()),/QUESTION_REQUIRED/);
 await assert.rejects(r.ws.sendConversationForPanel({...r.session,header:r.session.header},'hello',signal()),/SESSION_MISMATCH/);
 await assert.rejects(r.ws.sendConversationForPanel(r.session,'hello',controller.signal));
 r.selection.current=undefined;
 await assert.rejects(r.ws.sendConversationForPanel(r.session,'hello',signal()),/MODEL_SELECTION_UNAVAILABLE/);
 assert.equal(r.model.requests.length,0);assert.equal(r.session.surface.nodes.length,0);
}));
test('two simultaneous submissions cannot both enter one idle Agent',()=>setup(async r=>{
 const results=await Promise.allSettled([
  r.ws.sendConversationForPanel(r.session,'第一句',signal()),
  r.ws.sendConversationForPanel(r.session,'重复发送',signal())
 ]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
 assert.match(results[1].reason.message,/AGENT_BUSY/);assert.equal(r.model.requests.length,1);
}));
test('the existing source-mode Gateway dispatches the conversation read/send remotes to the same live Agent',()=>setup(async r=>{
 const {default:Registry}=await import('@deepseek-ai/dsh-typert-registry');
 const {default:Gateway}=await import('@deepseek-ai/dsh-api-gateway');
 const {WorkshopConversationPanelService}=await import(process.env.HW_PANEL_ENTRY??'../lib/panel-host.mjs');
 const {remoteMethods}=await import('@deepseek-ai/dsh-typert-protocol');
 const ctx=new Context();ctx.provide('sessions',r.ctx.sessions);ctx.provide('hanaworldsWorkshop',r.ws);
 try{
  await ctx.plugin(Registry).await();await ctx.plugin(Gateway).await();
  const remote=new WorkshopConversationPanelService(ctx);
  assert.deepEqual(remoteMethods(remote).map(m=>m.method),['read','send']);
  const invoke=(method,args)=>ctx.typertGateway.invoke({namespace:'hanaworldsWorkshopConversation',method,args,signal:signal()});
  await assert.rejects(invoke('send',{sessionRef:'absent',text:'hello'}),/LIVE_SESSION_NOT_FOUND/);
  assert.equal((await invoke('read',{sessionRef:'conversation'})).model.model,'host-choice-A');
  assert.equal((await invoke('send',{sessionRef:'conversation',text:'hello'})).items.at(-1).text,'FIXTURE reply from host-choice-A');
  assert.equal(r.model.requests.length,1);
 }finally{await ctx.fiber.dispose();}
}));
