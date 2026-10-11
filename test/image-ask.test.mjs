// Image ask step on the real native AgentLoop. Real: Cordis, dsh-session,
// AgentRegistry, AgentLoop, system-prompt assembly, tool registry, JSONL,
// local attachments, HTTP download, Workshop. FIXTURE: the model adapter, which
// reads the stored bytes of every image it is handed and records them.
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
import Llm from '@deepseek-ai/dsh-llm';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Tools, { defineTool } from '@deepseek-ai/dsh-tools';
import Skills from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
const {default:BuildingSkill}=await import(process.env.HW_WORKSHOP_BUILDING_SKILL_ENTRY??'../src/building-skill.mjs');
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import { FixtureVisionModel, PROVIDER, MODEL } from './fixture-vision-model.mjs';
const {default:plugin,IMAGE_ASK_ALLOWED_TOOLS}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
const signal=()=>new AbortController().signal;

async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'image-ask-'));
 const server=createServer((q,s)=>{if(q.url==='/missing'){s.writeHead(404);return s.end();}s.writeHead(200,{'content-type':q.url==='/not-image'?'text/html':'image/png'});s.end(q.url==='/not-image'?'<html>':png);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ctx=new Context();
 try{
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();
  await ctx.plugin(Sessions).await();await ctx.plugin(Projections).await();await ctx.plugin(Agents).await();
  await ctx.plugin(Llm).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();await ctx.plugin(AgentLoop).await();
  const model=new FixtureVisionModel(()=>ctx.attachments);ctx.llm.registerAdapter([PROVIDER],model);
  await ctx.plugin(plugin).await();
  await ctx.plugin(Skills).await();
  await ctx.plugin(BuildingSkill).await();
  await ctx.plugin(ToolSkill).await();
  ctx.tools.register(defineTool({name:'fixture_world_write',description:'FIXTURE forbidden write tool',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{}}},async execute(){throw Error('FIXTURE_WRITE_MUST_NOT_RUN');}}));
  const base=`http://127.0.0.1:${server.address().port}`;
  await fn({ctx,model,ws:ctx.get('hanaworldsWorkshop'),url:`${base}/picture`,base});
 }finally{await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
}
async function conversation(r){
 const id=`ask-${randomUUID()}`;const {agent}=await r.ctx.agents.create({sessionId:id,agentOptions:{provider:PROVIDER,model:MODEL}});
 const lift=r.ws.prepareImageAsk(agent);return {id,agent,session:r.ctx.sessions.get(id),lift};
}
async function ask(r,c,text){
 c.agent.followup({id:`p-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'text',text}]});
 await c.agent.whenIdle();await r.ctx.sessions.flush(c.session);return r.model.requests.at(-1);
}
async function durable(r,id){const h=await r.ctx.sessionPersistence.open(id,'read');try{return (await h.read()).events;}finally{await h.close();}}

test('new conversation: local upload is queued, the first real Loop turn hands its actual bytes to the model with the official building skill catalog and no write tools',async()=>setup(async r=>{
 const c=await conversation(r);
 const out=await r.ws.attachImageForPanel(c.session,{data:png,mediaType:'image/png'},signal());
 assert.equal(out.status,'QUEUED_FOR_NEXT_TURN');assert.equal(out.sessionRef,c.id);assert.equal(out.image.width,2);
 assert.equal(sha(Buffer.from(out.data,'base64')),sha(png),'readback returns the uploaded bytes');
 assert.equal(r.model.requests.length,0,'attaching does not call the model');
 const sent=await ask(r,c,'描述这张图片里的建筑结构');
 assert.equal(r.model.requests.length,1);
 assert.deepEqual(sent.images.map(i=>[i.attachmentId,i.sha256,i.bytes]),[[out.image.attachmentId,sha(png),png.length]],'the model turn received the actual image bytes');
 assert.equal(sent.skillCatalog,true,'official tool-skill catalog reaches the model');
 assert.deepEqual([...sent.tools].sort(),[...IMAGE_ASK_ALLOWED_TOOLS].sort(),'only the read-only image tool is visible while describing');
 const events=await durable(r,c.id);
 assert.equal(events.find(e=>e.surfaceOp!==undefined)?.type,'system/message','system head stays surface node 0');
 assert.ok(events.some(e=>e.type==='assistant/message'));
 assert.equal((await r.ws.readPanelImage(c.session,out.image.attachmentId,signal())).status,'ATTACHED');
 console.log(JSON.stringify({evidence:'IMAGE_ASK_NEW_CONVERSATION_UPLOAD',conversation:c.id,image:out.image,modelReceived:sent,model:'FIXTURE',worldWrites:0}));
}));

test('started conversation: link and upload attach directly and the next turn carries both images; same conversation readback',async()=>setup(async r=>{
 const c=await conversation(r);
 await ask(r,c,'你好');
 const link=await r.ws.downloadImageForPanel(c.session,r.url,signal());assert.equal(link.status,'ATTACHED');
 const up=await r.ws.attachImageForPanel(c.session,{data:png,mediaType:'image/png'},signal());assert.equal(up.status,'ATTACHED');
 const sent=await ask(r,c,'这两张图是什么结构？');
 assert.deepEqual(sent.images.map(i=>i.attachmentId).sort(),[link.image.attachmentId,up.image.attachmentId].sort());
 assert.ok(sent.images.every(i=>i.sha256===sha(png)));
 for(const a of [link,up]){const back=await r.ws.readPanelImage(c.session,a.image.attachmentId,signal());assert.equal(back.sessionRef,c.id);assert.equal(back.status,'ATTACHED');}
}));

test('non-image, failed download and wrong declared type are refused by name; nothing is queued and the next image still works',async()=>setup(async r=>{
 const c=await conversation(r);
 await assert.rejects(r.ws.downloadImageForPanel(c.session,`${r.base}/not-image`,signal()),/IMAGE_TYPE_UNSUPPORTED/);
 await assert.rejects(r.ws.downloadImageForPanel(c.session,`${r.base}/missing`,signal()),/IMAGE_HTTP_FAILED/);
 await assert.rejects(r.ws.attachImageForPanel(c.session,{data:Buffer.from('<html>'),mediaType:'text/html'},signal()),/IMAGE_TYPE_UNSUPPORTED/);
 await assert.rejects(r.ws.attachImageForPanel(c.session,{data:Buffer.alloc(0),mediaType:'image/png'},signal()),/IMAGE_EMPTY/);
 await assert.rejects(r.ws.attachImageForPanel(c.session,{data:Buffer.from('not a png at all'),mediaType:'image/png'},signal()));
 assert.equal(c.agent.inbox.nextStep.length+c.agent.inbox.nextTurn.length,0);
 const ok=await r.ws.attachImageForPanel(c.session,{data:png,mediaType:'image/png'},signal());assert.equal(ok.status,'QUEUED_FOR_NEXT_TURN');
 assert.equal((await ask(r,c,'描述结构')).images.length,1);
}));

test('the image step is scoped to one agent and lifts cleanly',async()=>setup(async r=>{
 const a=await conversation(r);
 const {agent:plain}=await r.ctx.agents.create({sessionId:`plain-${randomUUID()}`,agentOptions:{provider:PROVIDER,model:MODEL}});
 plain.followup({id:'p',role:'user',source:{kind:'user'},content:[{type:'text',text:'hi'}]});await plain.whenIdle();
 assert.ok(r.model.requests.at(-1).tools.includes('fixture_world_write'),'another agent keeps its ordinary tools');
 await ask(r,a,'hi');assert.ok(!r.model.requests.at(-1).tools.includes('fixture_world_write'),'image agent cannot see write tools');
 a.lift();await ask(r,a,'hi');assert.ok(r.model.requests.at(-1).tools.includes('fixture_world_write'),'disposer restores ordinary tool visibility');
 assert.throws(()=>r.ws.prepareImageAsk(undefined),/CONVERSATION_AGENT_REQUIRED/);
}));
