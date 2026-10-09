import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as C from 'hanaworlds-contracts';
const {default:plugin}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
const sample=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const clone=structuredClone,local=clone(sample.request.localContext);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const header=id=>({version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/context-tool',isSeeded:false});
const user=(id,text,extra=[])=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text},...extra]}});
// Workshop, Cordis, official Tools, Core JSONL, domain storage and attachments are real; Canvas/catalogue/safety peers are FIXTURE.
async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'context-tool-'));
 const f={calls:[],writes:0};const ctx=new Context();
 await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();
 await ctx.plugin(StorageDomain,{backend:'json'}).await();await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
 ctx.provide('hanaworldsCapabilities',{providerRef:'fixture-host',capabilityRevision:'cap1',worldRef:local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile:{profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'},sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null});
 ctx.provide('hanaworldsCanvasV5',{contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-canvas',protocols:[{protocol:'canvas',major:5,minor:0}],capabilities:[],provenance:{packageName:'hanaworlds-canvas',packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}},async call(op,q){f.calls.push(op);C.validateBoundRequest('canvas/v5',op,q);
  const response=result=>({contractVersion:'canvas/v5',requestId:q.requestId,result,error:null});
  if(op==='ReadWorldSelectionContext')return response({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap1',connections:[]},selection:{status:'BOUND',connectionRef:local.connectionRef,context:{currentSession:q.sessionRef,activeWorldRef:local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'c1',selectionRevision:local.selectionRevision,localContext:clone(local)}}});
  if(op==='InspectPlacementRegion')return {...response({outcome:'REGION_INSPECTED',inspection:clone(sample.request.regionInspection)}),unavailableSettings:null};
  f.writes++;throw Error(`context tool must not reach ${op}`);}});
 ctx.provide('hanaworldsCatalogue',{read:async()=>clone(sample.request.catalogue)});
 ctx.provide('hanaworldsSafetyProfile',{read:async()=>clone(sample.request.safetyProfile)});
 await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');
 const append=async(id,...events)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append(events.map((e,i)=>({...e,seq:log.events.length+i})));}finally{await w.close();}};
 const tool=async(args,id='s1')=>{const out=await ctx.tools.execute({name:'hanaworlds_context',callId:`ctx-${Math.random()}`,arguments:args,signal:new AbortController().signal,agent:{ctx,session:{header:header(id)}}});return {...out,json:out.isError?null:JSON.parse(out.value.result),text:out.content.map(p=>p.text).join('')};};
 const bind=async(id='s1')=>{const s=await ws.call('StartOrResumeSession',{contractVersion:'session/v3',sessionRef:id,requestId:`start-${Math.random()}`,expectedRevision:null});
  const b=await ws.call('SwitchWorldContext',{contractVersion:'session/v3',sessionRef:id,requestId:`switch-${Math.random()}`,expectedRevision:s.result.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});assert.equal(b.error,null,JSON.stringify(b));};
 try{for(const id of ['s1','s2']){const w=await ctx.sessionPersistence.create(header(id));await w.append([{type:'turn/start',seq:0,time:99,data:{turn:1}}]);await w.close();}
  await fn({ctx,ws,f,append,tool,bind});}
 finally{await ws.projectionStore.close();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
}
const prepare={action:'prepare',purpose:'小屋',width:3,depth:4,height:3};

test('hanaworlds_context is registered by Workshop through the official tools service, next to the image tool',async()=>setup(async r=>{
 for(const name of ['hanaworlds_context','hanaworlds_download_image'])assert.equal(r.ctx.tools.get(name)?.name,name,`${name} registered`);
}));
test('unbound conversation: the tool says what it needs instead of guessing a world',async()=>setup(async r=>{
 await r.append('s1',user('ask','建一个小屋'));
 const out=await r.tool(prepare);assert.equal(out.isError,true);assert.match(out.text,/LOCAL_CONTEXT_REQUIRED: .*SwitchWorldContext/);
 assert.equal(r.f.writes,0);
}));
test('prepare → human confirm → read: actual user text, model controls incl. entrance portal refs, consent only from a new human message',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','照这个建一个小屋'));
 const prepared=await r.tool({...prepare,entrancePortalRefs:['portal-a']});assert.equal(prepared.isError,false,prepared.text);
 assert.equal(prepared.json.turnRef,'text:ask');assert.ok(prepared.json.clarification?.question);
 const again=await r.tool({...prepare,entrancePortalRefs:['portal-a']});assert.deepEqual(again.json,prepared.json,'same human message prepares once');
 const selfConfirm=await r.tool({action:'confirm'});assert.equal(selfConfirm.isError,true);assert.match(selfConfirm.text,/HUMAN_CONFIRMATION_REQUIRED/);
 const early=await r.tool({action:'read'});assert.equal(early.isError,true);assert.match(early.text,/INTENT_UNCONFIRMED/);
 await r.append('s1',user('yes','确认'));
 const confirmed=await r.tool({action:'confirm'});assert.equal(confirmed.isError,false,confirmed.text);assert.equal(confirmed.json.clarification,null);
 const read=await r.tool({action:'read'});assert.equal(read.isError,false,read.text);
 assert.deepEqual(read.json.context.intent.confirmedIntent.entrancePortalRefs,['portal-a']);assert.equal(read.json.context.intent.confirmedIntent.text,'照这个建一个小屋');
 assert.equal((await r.tool({action:'read'})).json.proposalRef,read.json.proposalRef,'stable context request per confirmed turn');
 // A corrected request after confirmation is a new turn; the old captured context is no longer current.
 await r.append('s1',user('change','改成5×5'));const changed=await r.tool({...prepare,width:5,depth:5});assert.equal(changed.isError,false,changed.text);
 const stale=await r.ws.readBuildProposalContext({contractVersion:'session/v3',sessionRef:'s1',requestId:read.json.proposalRef,worldRef:local.worldRef,expectedTurnRevision:read.json.context.turnRevision,localContext:local}).catch(e=>e);
 assert.equal(stale.code,'TURN_REVISION_MISMATCH');assert.equal(r.f.writes,0);
}));
test('images action lists only this conversation\'s images; prepare binds the selected one; foreign refs refused by name',async()=>setup(async r=>{
 await r.bind();const ref=await r.ctx.attachments.saveImage({data:png,mediaType:'image/png'});
 await r.append('s1',user('ask','照这张图建',[{type:'image',attachment:ref}]));
 const listed=await r.tool({action:'images'});assert.equal(listed.isError,false,listed.text);assert.deepEqual(listed.json.images.map(m=>m.attachmentRef),[ref.attachmentId]);
 assert.deepEqual((await r.tool({action:'images'},'s2')).json.images,[]);
 const foreign=await r.tool({...prepare,imageRefs:['not-here']});assert.equal(foreign.isError,true);assert.match(foreign.text,/ATTACHMENT_NOT_IN_SESSION/);
 const prepared=await r.tool(prepare);assert.equal(prepared.isError,false,prepared.text);assert.equal(prepared.json.turnRef,'image:ask');
 const snapshot=await r.ws.call('StartOrResumeSession',{contractVersion:'session/v3',sessionRef:'s1',requestId:'s',expectedRevision:null});
 assert.deepEqual(snapshot.result.turns[0].media.map(m=>m.attachmentRef),[ref.attachmentId]);
}));
