import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as C from 'hanaworlds-contracts';
const {default:plugin,WorkshopV3}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sample=JSON.parse(await (await import('node:fs/promises')).readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const local=sample.request.localContext;
const header=id=>({version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/image-fixture',isSeeded:false});
// A conversation the native Loop has started: system prompt is protected surface node 0 (Core v4).
const started=()=>[{type:'turn/start',seq:0,time:99,data:{turn:1}},{type:'step/start',seq:1,time:99,data:{turn:1,step:1}},{type:'system/message',seq:2,time:99,surfaceOp:'append',data:{turn:1,step:1,message:{id:'fixture-system',role:'system',source:{kind:'system-prompt'},content:[{type:'text',text:'fixture system prompt'}]}}}];
const user=(id,text,extra=[])=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text},...extra]}});
async function mount(root){
 const ctx=new Context();await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();
 await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
 await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
 const caps={providerRef:'fixture-host',capabilityRevision:'cap1',worldRef:local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile:{profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'},sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null};
 ctx.provide('hanaworldsCapabilities',caps);
 ctx.provide('hanaworldsCanvasV5',{contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-canvas',protocols:[{protocol:'canvas',major:7,minor:0}],capabilities:[],provenance:{packageName:'hanaworlds-canvas',packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}},async call(op,q){assert.equal(op,'ReadWorldSelectionContext','image tool must never write world');return {contractVersion:'canvas/v7',requestId:q.requestId,result:{sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap1',connections:[]},selection:{status:'BOUND',connectionRef:local.connectionRef,context:{currentSession:q.sessionRef,activeWorldRef:local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'c1',selectionRevision:local.selectionRevision,localContext:local}}},error:null};}});
 ctx.provide('llm',{async stream(){assert.fail('no model calls');}});
 await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');
 return {ctx,ws,async append(id,event){const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}},async close(){await ws.projectionStore.close();await ctx.fiber.dispose();}};
}
async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'image-'));
 let requests=0,onSlow;const server=createServer((q,s)=>{requests++;if(q.url==='/slow'){s.writeHead(200,{'content-type':'image/png'});s.write(png.subarray(0,8));onSlow?.();return;}s.writeHead(200,{'content-type':'image/png'});s.end(q.url==='/not-image'?Buffer.from('not an image'):png);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const r=await mount(root),url=`http://127.0.0.1:${server.address().port}/picture`;
 try{for(const id of ['s1','s2']){const w=await r.ctx.sessionPersistence.create(header(id));await w.append(started());await w.close();}await r.append('s1',user('user-image',`照这个建造 ${url} ${url.replace('/picture','/not-image')}`));await r.append('s2',user('other','不要图片'));
 const execute=(args={url},id='s1',signal=new AbortController().signal)=>r.ctx.tools.execute({name:'hanaworlds_download_image',callId:`download-${id}`,arguments:args,signal,agent:{ctx:r.ctx,session:{header:header(id)}}});
 await fn({...r,root,url,execute,requests:()=>requests,whenSlow:fn=>{onSlow=fn;}});
 }finally{await r.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
}
async function call(r,op,fields){const q={contractVersion:'session/v5',sessionRef:'s1',requestId:op,...(op==='ReadSessionTurnDetails'?{localContext:local}:{expectedRevision:null}),...fields};const out=await r.ws.call(op,q);assert.equal(out.error,null,JSON.stringify(out));return out.result;}

test('real HTTP → actual attachment store → native image result → same brief and durable reopen',async()=>setup(async r=>{
 const out=await r.execute();assert.equal(out.isError,false,JSON.stringify(out));assert.equal(r.requests(),1);
 const image=out.content.find(p=>p.type==='image');assert.ok(image,'native result carries actual image block');const read=await r.ctx.attachments.readImage(image.attachment);
 assert.equal(out.value.downloadSha256,sha(png));assert.equal(out.value.downloadBytes,png.length);assert.equal(read.ref.mediaType,'image/png');assert.equal(sha(read.data),out.value.media.storedBytesDigest);assert.equal(out.value.media.attachmentRef,image.attachment.attachmentId);
 // Host/agent-loop persistence boundary is explicit fixture; actual Core JSONL stores its public result.
 await r.append('s1',{type:'assistant/message',time:100,surfaceOp:'append',data:{turn:1,step:1,stream:[],message:{id:'fixture-assistant',role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'tool-call',id:'download-s1',name:'hanaworlds_download_image',arguments:JSON.stringify({url:r.url})}]}}});
 await r.append('s1',{type:'tool/call',time:100,data:{turn:1,step:1,callId:'download-s1',name:'hanaworlds_download_image',arguments:JSON.stringify({url:r.url})}});
 await r.append('s1',{type:'tool/result',time:101,surfaceOp:'append',data:{turn:1,step:1,message:{id:'image-result',role:'tool',toolCallId:'download-s1',source:{kind:'tool',callId:'download-s1'},isError:false,content:out.content}}});
 const started=await call(r,'StartOrResumeSession',{});
 const switched=await call(r,'SwitchWorldContext',{expectedRevision:started.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});
 const input=await call(r,'AppendMultimodalTurn',{expectedRevision:switched.context.sessionRevision,turnRef:'image-turn',text:'图片中的房子',media:[out.value.media],controls:{placement:null,purpose:'house',dimensions:{width:3,height:3,depth:3,unit:'node'},entrancePortalRefs:[],styleText:null,siteRules:{requireEntranceConnectivity:false,entranceClearance:null,hazardPolicy:{forbidLiquid:true,maximumDamagePerSecond:0},optionalLightRule:null}},localContext:local});
 await r.append('s1',user('confirm','确认'));const fresh=await call(r,'StartOrResumeSession',{});
 await call(r,'AnswerClarification',{requestId:'confirm',expectedRevision:fresh.context.sessionRevision,turnRef:'image-turn',clarificationId:input.clarification.clarificationId,answer:'确认',localContext:local});
 const details=await call(r,'ReadSessionTurnDetails',{});assert.deepEqual(details.turns[0].confirmedBrief.media,[out.value.media]);
 const h=await r.ctx.sessionPersistence.open('s1','read');const log=await h.read();await h.close();assert.deepEqual(log.events.find(e=>e.type==='tool/result').data.message.content.find(p=>p.type==='image'),image);
 await r.close();const reopened=await mount(r.root);try{const d=await call(reopened,'ReadSessionTurnDetails',{});assert.deepEqual(d.turns[0].confirmedBrief.media,[out.value.media]);assert.deepEqual(Buffer.from((await reopened.ctx.attachments.readImage(image.attachment)).data),Buffer.from(read.data));}finally{await reopened.close();}
 console.log(JSON.stringify({evidence:'REAL_HTTP_CORE_ATTACHMENTS_TOOL_RUNTIME',sessionRef:'s1',sourceMessageId:out.value.sourceMessageId,downloadSha256:sha(png),downloadBytes:png.length,media:out.value.media,worldWrites:0,modelCalls:0,hostAgentLoop:'FIXTURE'}));
}));
test('wrong Session cannot download another Session user link or consume its media',async()=>setup(async r=>{
 const denied=await r.execute({url:r.url},'s2');assert.equal(denied.isError,true);assert.equal(r.requests(),0);
 const out=await r.execute();assert.equal(out.isError,false,JSON.stringify(out));
 const s=await r.ws.call('StartOrResumeSession',{contractVersion:'session/v5',sessionRef:'s2',requestId:'start',expectedRevision:null});
 const switched=await r.ws.call('SwitchWorldContext',{contractVersion:'session/v5',sessionRef:'s2',requestId:'switch',expectedRevision:s.result.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});
 const refused=await r.ws.call('AppendMultimodalTurn',{contractVersion:'session/v5',sessionRef:'s2',requestId:'input',expectedRevision:switched.result.context.sessionRevision,turnRef:'wrong',text:'house',media:[out.value.media],controls:{placement:null,purpose:null,dimensions:null,entrancePortalRefs:[],styleText:null,siteRules:null},localContext:local});assert.ok(refused.error);
}));
test('cancelled execution, missing media service, and lying image content refuse without attachment result',async()=>setup(async r=>{
 const ctl=new AbortController();ctl.abort();assert.equal((await r.execute({url:r.url},'s1',ctl.signal)).isError,true);assert.equal(r.requests(),0);
 const nonImage=await r.execute({url:r.url.replace('/picture','/not-image')});assert.equal(nonImage.isError,true);assert.equal(nonImage.content.some(p=>p.type==='image'),false);
 const missing=new WorkshopV3({sessionPersistence:r.ctx.sessionPersistence,projectionStore:r.ws.projectionStore});await assert.rejects(missing.downloadImage(r.url,{signal:new AbortController().signal,agent:{session:{header:header('s1')}}}),/MEDIA_UNAVAILABLE/);assert.equal(r.requests(),1);
}));

test('cancellation during real HTTP streaming returns no image and no brief binding',async()=>setup(async r=>{
 const slow=r.url.replace('/picture','/slow');await r.append('s1',user('slow-request',slow));
 const ctl=new AbortController();r.whenSlow(()=>ctl.abort());const out=await r.execute({url:slow},'s1',ctl.signal);
 assert.equal(r.requests(),1);assert.equal(out.isError,true);assert.equal(out.content.some(p=>p.type==='image'),false);
 const state=await r.ws.projectionStore.get('s1',{id:'s1',version:SESSION_FORMAT_VERSION,createdAt:100,cwd:'/image-fixture'});assert.deepEqual(state.images??{},{});
}));
test('existing uploaded Core image can bind a brief; unreferenced attachment cannot',async()=>setup(async r=>{
 const ref=await r.ctx.attachments.saveImage({data:png,mediaType:'image/png'});const stored=await r.ctx.attachments.readImage(ref);
 const media={attachmentRef:ref.attachmentId,storedBytesDigest:sha(stored.data),projectionVariantId:null,projectionBytesDigest:null,mediaType:ref.mediaType,bytes:ref.bytes,width:ref.width,height:ref.height};
 const start=await call(r,'StartOrResumeSession',{});let snapshot=await call(r,'SwitchWorldContext',{expectedRevision:start.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});
 const input={contractVersion:'session/v5',sessionRef:'s1',requestId:'missing-provenance',expectedRevision:snapshot.context.sessionRevision,turnRef:'upload-turn',text:'uploaded house',media:[media],controls:{placement:null,purpose:null,dimensions:null,entrancePortalRefs:[],styleText:null,siteRules:null},localContext:local};
 const denied=await r.ws.call('AppendMultimodalTurn',input);assert.equal(denied.error.code,'ATTACHMENT_REJECTED');
 await r.append('s1',user('upload','this house',[{type:'image',attachment:ref}]));snapshot=await call(r,'StartOrResumeSession',{});
 const accepted=await r.ws.call('AppendMultimodalTurn',{...input,requestId:'uploaded',expectedRevision:snapshot.context.sessionRevision});assert.equal(accepted.error,null,JSON.stringify(accepted));
 const result=await call(r,'StartOrResumeSession',{});assert.deepEqual(structuredClone(result.turns[0].media),[media]);assert.equal(r.requests(),0);
}));

// New panel path: real Session and Core/attachments/HTTP. The writer bridge is
// an explicit fixture standing in for the Host-owned Agent persistence lifecycle.
async function panelSession(r,id='s1') {
 const handle=await r.ctx.sessionPersistence.open(id,'read');
 const log=await handle.read(); const hdr=handle.header; await handle.close();
 const session=Session.create(id,log.events,hdr); let offset=log.events.length;
 const sessions={get:key=>key===id?session:undefined,async flush(current){
  assert.equal(current,session);const writer=await r.ctx.sessionPersistence.open(id,'write');
  try {const events=session.snapshotEvents(offset);await writer.append(events);offset=session.seq;}finally{await writer.close();}
 }};
 r.ws=new WorkshopV3({sessions,sessionPersistence:r.ctx.sessionPersistence,projectionStore:r.ws.projectionStore,attachments:r.ctx.attachments});
 return session;
}
test('panel link is downloaded as real bytes and read back as an image in the same real Session without model/world calls',async()=>setup(async r=>{
 const session=await panelSession(r);
 assert.equal(typeof r.ws.downloadImageForPanel,'function','panel download public method is present');
 const out=await r.ws.downloadImageForPanel(session,r.url,new AbortController().signal);
 assert.equal(out.sessionRef,'s1');assert.equal(out.status,'ATTACHED');
 const readback=await r.ws.readPanelImage(session,out.image.attachmentId,new AbortController().signal);
 assert.deepEqual(readback.image,out.image);assert.equal(readback.media.storedBytesDigest,out.media.storedBytesDigest);
 assert.equal(sha(Buffer.from(readback.data,'base64')),out.media.storedBytesDigest);
 assert.equal(readback.image.width,2);assert.equal(readback.image.height,2);assert.equal(readback.image.mediaType,'image/png');
 const h=await r.ctx.sessionPersistence.open('s1','read');const log=await h.read();await h.close();
 assert.ok(log.events.some(e=>e.type==='user/message'&&e.data.content.some(c=>c.type==='image'&&c.attachment.attachmentId===out.image.attachmentId)));
 assert.equal(r.requests(),1);
 console.log(JSON.stringify({evidence:'PANEL_REAL_SESSION_HTTP_CORE_ATTACHMENTS',session:'s1',image:out.image,digest:out.media.storedBytesDigest,worldWrites:0,modelCalls:0,hostPersistenceLifecycle:'FIXTURE'}));
}));
test('panel rejects a borrowed foreign Session and undecodable bytes, and cannot read an unassociated image',async()=>setup(async r=>{
 const session=await panelSession(r);
 assert.equal(typeof r.ws.downloadImageForPanel,'function','panel download public method is present');
 const foreign=Session.create('s2',[],header('s2'));
 await assert.rejects(r.ws.downloadImageForPanel(foreign,r.url,new AbortController().signal),/SESSION_MISMATCH/);
 assert.equal(r.requests(),0);
 await assert.rejects(r.ws.readPanelImage(session,'unassociated',new AbortController().signal),/SESSION_NOT_FOUND|ATTACHMENT_REJECTED/);
 await assert.rejects(r.ws.downloadImageForPanel(session,r.url.replace('/picture','/not-image'),new AbortController().signal));
 const h=await r.ctx.sessionPersistence.open('s1','read');const log=await h.read();await h.close();
 assert.equal(log.events.some(e=>e.type==='user/message'&&e.data.content.some(c=>c.type==='image')),false);
}));

test('new SRC-only Gateway endpoints dispatch JSON to real image download and same Session attachment readback',async()=>setup(async r=>{
 const session=await panelSession(r);
 const {default:Registry}=await import('@deepseek-ai/dsh-typert-registry');
 const {default:Gateway}=await import('@deepseek-ai/dsh-api-gateway');
 const {WorkshopImageLinkPanelService}=await import(process.env.HW_PANEL_ENTRY??'../lib/panel-host.mjs');
 const {remoteMethods}=await import('@deepseek-ai/dsh-typert-protocol');
 const ctx=new Context();ctx.provide('sessions',r.ws.sessions);ctx.provide('hanaworldsWorkshop',r.ws);
 try {
  await ctx.plugin(Registry).await();await ctx.plugin(Gateway).await();
  const service=new WorkshopImageLinkPanelService(ctx);
  assert.deepEqual(remoteMethods(service).map(m=>m.method),['downloadLink','readLink']);
  const signal=new AbortController().signal;
  await assert.rejects(ctx.typertGateway.invoke({namespace:'hanaworldsWorkshopImageLinks',method:'downloadLink',args:{sessionRef:'unbound',url:r.url},signal}),/LIVE_SESSION_NOT_FOUND/);
  assert.equal(r.requests(),0);
  const downloaded=await ctx.typertGateway.invoke({namespace:'hanaworldsWorkshopImageLinks',method:'downloadLink',args:{sessionRef:session.id,url:r.url},signal});
  const readback=await ctx.typertGateway.invoke({namespace:'hanaworldsWorkshopImageLinks',method:'readLink',args:{sessionRef:session.id,attachmentRef:downloaded.image.attachmentId},signal});
  assert.equal(readback.status,'ATTACHED');assert.equal(readback.sessionRef,session.id);assert.deepEqual(readback.image,downloaded.image);
  assert.equal(sha(Buffer.from(readback.data,'base64')),readback.media.storedBytesDigest);
  console.log(JSON.stringify({evidence:'OFFICIAL_SRC_GATEWAY_NEW_ENDPOINTS_REAL_HTTP_ATTACHMENTS',namespace:'hanaworldsWorkshopImageLinks',methods:remoteMethods(service).map(m=>m.method),hostAgentPersistence:'FIXTURE',modelCalls:0,worldWrites:0,image:readback.image}));
 } finally {await ctx.fiber.dispose();}
}));
