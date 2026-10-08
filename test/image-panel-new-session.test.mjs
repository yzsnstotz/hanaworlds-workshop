// Panel image link in a brand-new conversation, driven afterwards by the real
// native AgentLoop. Real: Cordis, dsh-session/SessionStore, AgentRegistry,
// AgentLoop, JSONL persistence, local attachments, HTTP download, Workshop.
// FIXTURE: the model adapter (scripted text answer that records each request).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Sessions from '@deepseek-ai/dsh-session';
import Agents from '@deepseek-ai/dsh-agent';
import Projections from '@deepseek-ai/dsh-session-projection';
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
const {default:plugin,WorkshopV3}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
const PROVIDER='fixture-vision',MODEL='fixture-vision-1';

/** FIXTURE model: answers with fixed text and records the exact request it received. */
class FixtureVision extends LlmAdapter {
 requests=[];
 providerInfo(provider){return {id:provider,name:'FIXTURE vision'};}
 async resolveModel(provider,model){return {provider,id:model,name:'FIXTURE vision',inputModalities:['text','image'],context:{contextWindow:100000}};}
 async *stream(options){
  this.requests.push(options.messages.map(m=>({role:m.role,content:m.content.map(p=>p.type==='image'?{type:'image',attachmentId:p.attachment?.attachmentId??p.attachmentId??null}:{type:p.type,text:p.text})})));
  yield {type:'block-start',index:0,blockType:'text'};
  yield {type:'text-delta',index:0,text:'FIXTURE reply'};
  yield {type:'block-end',index:0,block:{type:'text',text:'FIXTURE reply'}};
  yield {type:'finish',reason:'stop'};
 }
}

async function mount(root){
 const ctx=new Context();
 await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();
 await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
 await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();
 await ctx.plugin(Sessions).await();await ctx.plugin(Projections).await();await ctx.plugin(Agents).await();
 await ctx.plugin(Llm).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();await ctx.plugin(AgentLoop).await();
 const model=new FixtureVision();ctx.llm.registerAdapter([PROVIDER],model);
 await ctx.plugin(plugin).await();
 return {ctx,model,ws:ctx.get('hanaworldsWorkshop')};
}
async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'new-session-'));
 let requests=0;const server=createServer((q,s)=>{requests++;s.writeHead(200,{'content-type':q.url==='/not-image'?'text/html':'image/png'});s.end(q.url==='/not-image'?'<html>':png);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const r=await mount(root),url=`http://127.0.0.1:${server.address().port}/picture`;
 try{await fn({...r,root,url,downloads:()=>requests});}
 finally{await r.ctx.fiber.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
}
const signal=()=>new AbortController().signal;
async function fresh(r){
 const sessionId=`fresh-${randomUUID()}`;
 const handle=await r.ctx.agents.create({sessionId,agentOptions:{provider:PROVIDER,model:MODEL}});
 const session=r.ctx.sessions.get(sessionId);assert.equal(session,handle.agent.session);
 assert.equal(session.surface.nodes.length,0,'a brand-new conversation has no surface yet');
 return {sessionId,handle,session,agent:handle.agent};
}
async function durable(r,id){const h=await r.ctx.sessionPersistence.open(id,'read');try{return (await h.read()).events;}finally{await h.close();}}
const prompt=text=>({id:`prompt-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'text',text}]});

test('new conversation: panel link, then the first real Loop turn keeps the system head first and the model receives the image',async()=>setup(async r=>{
 const {sessionId,agent,session}=await fresh(r);
 const out=await r.ws.downloadImageForPanel(session,r.url,signal());
 assert.equal(out.sessionRef,sessionId);assert.equal(r.downloads(),1);assert.equal(out.status,'QUEUED_FOR_NEXT_TURN');
 assert.equal(sha(Buffer.from(out.data,'base64')),out.media.storedBytesDigest);assert.equal(out.image.mediaType,'image/png');
 assert.equal(session.surface.nodes.length,0,'the panel did not write before the system head');
 assert.equal(agent.status,'idle','the panel did not wake the model');assert.equal(r.model.requests.length,0);
 const pending=await durable(r,sessionId);assert.ok(pending.some(e=>e.type==='agent/inbox/spliced'),'queued input is durable');
 agent.followup(prompt('描述这张图片里的结构'));await agent.whenIdle();await r.ctx.sessions.flush(session);
 console.log(JSON.stringify({diagnostic:'live',status:agent.status,live:session.snapshotEvents().map(e=>e.type)}));
 const events=await durable(r,sessionId);
 if(process.env.HW_DUMP_EVENTS)console.log(JSON.stringify({diagnostic:'first-turn-events',events:events.slice(0,12)}));
 const surface=events.filter(e=>e.surfaceOp!==undefined);
 assert.equal(surface[0]?.type,'system/message','system prompt is surface node 0');
 const imageEvent=events.find(e=>e.type==='user/message'&&e.data.content?.some(p=>p.type==='image'&&p.attachment.attachmentId===out.image.attachmentId));
 assert.ok(imageEvent,'the panel image is a durable user/message in the same conversation');
 assert.equal(imageEvent.data.id,out.sourceMessageId);
 assert.ok(events.some(e=>e.type==='assistant/message'),'the real Loop completed a model step');
 assert.equal(r.model.requests.length,1);
 const sent=r.model.requests[0];assert.equal(sent[0].role,'system');
 assert.ok(sent.some(m=>m.role==='user'&&m.content.some(p=>p.type==='image'&&p.attachmentId===out.image.attachmentId)),'the model request carries the panel image');
 const back=await r.ws.readPanelImage(session,out.image.attachmentId,signal());
 assert.equal(back.status,'ATTACHED');assert.equal(back.media.storedBytesDigest,out.media.storedBytesDigest);
 // A second turn and another link now use the ordinary started-conversation path.
 const second=await r.ws.downloadImageForPanel(session,r.url,signal());assert.equal(second.status,'ATTACHED');
 agent.followup(prompt('再看这一张'));await agent.whenIdle();await r.ctx.sessions.flush(session);
 assert.equal(r.model.requests.length,2);await durable(r,sessionId);
 console.log(JSON.stringify({evidence:'NEW_SESSION_PANEL_LINK_REAL_LOOP',sessionId,image:out.image,storedBytesDigest:out.media.storedBytesDigest,firstSurface:surface.slice(0,3).map(e=>e.type),modelRequests:r.model.requests.length,model:'FIXTURE',worldWrites:0}));
}));

test('new conversation without a live Agent is refused by name before any download or write',async()=>setup(async r=>{
 const {sessionId,session,handle}=await fresh(r);
 // A Host composition that provides Sessions but no Agent registry.
 const noAgents=new WorkshopV3({sessions:r.ctx.sessions,sessionPersistence:r.ctx.sessionPersistence,projectionStore:r.ws.projectionStore,attachments:r.ctx.attachments});
 await assert.rejects(noAgents.downloadImageForPanel(session,r.url,signal()),/CONVERSATION_AGENT_REQUIRED/);
 assert.equal(r.downloads(),0);assert.equal(session.surface.nodes.length,0);assert.equal(handle.agent.inbox.nextStep.length,0);
 assert.deepEqual((await durable(r,sessionId)).filter(e=>e.type==='user/message'),[]);
}));

test('new conversation: non-image link is refused, nothing is queued, and the next link still works',async()=>setup(async r=>{
 const {session,agent}=await fresh(r);
 await assert.rejects(r.ws.downloadImageForPanel(session,r.url.replace('/picture','/not-image'),signal()),/IMAGE_TYPE_UNSUPPORTED/);
 assert.equal(agent.inbox.nextStep.length+agent.inbox.nextTurn.length,0);assert.equal(session.surface.nodes.length,0);
 const out=await r.ws.downloadImageForPanel(session,r.url,signal());assert.equal(out.status,'QUEUED_FOR_NEXT_TURN');
 assert.equal(agent.inbox.nextStep.length+agent.inbox.nextTurn.length,1);
}));
