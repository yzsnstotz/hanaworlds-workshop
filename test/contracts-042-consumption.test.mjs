import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Differential gate for the exact contracts 0.4.2 image line only. Old 0.2.1 algorithm/HTTP matrices are not repeated.
const entry=process.env.HW_WORKSHOP_PACKAGE_ENTRY??new URL('../src/index.mjs',import.meta.url).href;
const {default:plugin}=await import(entry);
const entryDir=dirname(entry.startsWith('file:')?fileURLToPath(entry):entry);
const sample=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const clone=structuredClone,D=(k,v)=>C.digestValue(k,v).sha256;
const config={profileVersion:'compilation-config/v2',backendProfileId:'static-local',worldeditRevision:'static-1',nodeWriteSemantics:'explicit-nodeName-param2-static-v2',overlapRule:'last-writer-wins',effectOrder:'numeric-x-y-z',compressionRule:'exact-final-effects-only'};
const stateProfile={profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'};
const header=id=>({version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/contracts-042',isSeeded:false});
const user=(id,text)=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text}]}});
// Painter/Brush/Canvas/world are FIXTURE peers; Workshop, Cordis, Core JSONL, domain storage, attachments, Tools and HTTP are real.
function fixture(){
 const f={local:clone(sample.request.localContext),calls:[],writes:0,undoWrites:0,modelCalls:0,history:[],receipt:null,painterContexts:[]};
 const ctx=()=>({currentSession:'s1',activeWorldRef:f.local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'canvas-selection-1',selectionRevision:f.local.selectionRevision,localContext:clone(f.local)});
 f.capabilities={providerRef:'fixture-host',capabilityRevision:'cap-1',worldRef:f.local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile,sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null};
 f.painter={contractHandshake:C.contractHandshake,async call(op,q){f.calls.push(op);C.validateBuildProposalRequest(q);const facts=await f.readFacts(q);C.validateBuildProposalContext(q,facts);f.painterContexts.push(clone(facts.sourceContext));
   const result=clone(sample.response.result);result.invocationId=q.invocationId;return {contractVersion:'painter/v4',requestId:q.requestId,result,error:null};}};
 f.brush={contractHandshake:C.contractHandshake,async compile(q){f.calls.push('BuildDocument');C.validateBoundRequest('BUILD/V3','BuildDocument',q);
   const effects=[{position:clone(q.build.operations[0].min),...q.build.materials[q.build.operations[0].materialRef]}];
   const projection={contractVersion:'operations/v3',buildDigest:q.buildDigest,compilerRevision:q.compilerRevision,compilationConfigDigest:q.compilationConfigDigest,worldRef:q.worldRef,frameDigest:q.targetFacts.frameDigest,catalogueDigest:q.catalogueDigest,targetFactsDigest:q.targetFactsDigest,effects};
   return {contractVersion:'BUILD/V3',requestId:q.requestId,result:{projection,operationDigest:D('operations',projection),readBounds:q.targetFacts.sampledBounds,writeBounds:q.build.declaredBounds},error:null};}};
 const row=r=>({transactionId:r.transactionId,originTransactionId:null,affectedObjectRefs:['object-1'],operationDigest:r.operationDigest,beforeImageDigest:'d'.repeat(64),expectedAfterReadbackDigest:r.readbackDigest,receiptDigest:D('receipt',r),historyRevision:'history-1',status:'VERIFIED'});
 f.canvas={contractHandshake:C.contractHandshake,async call(op,q){f.calls.push(op);C.validateBoundRequest('canvas/v5',op,q);
   const ok=result=>({contractVersion:'canvas/v5',requestId:q.requestId,result,error:null});
   if(op==='ReadWorldSelectionContext')return ok({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap-1',connections:[]},selection:{status:'BOUND',connectionRef:f.local.connectionRef,context:ctx()}});
   if(op==='InspectPlacementRegion')return {...ok({outcome:'REGION_INSPECTED',inspection:clone(sample.request.regionInspection)}),unavailableSettings:null};
   if(op==='ListObjects')return ok({worldRef:q.worldRef,registryRevision:'registry-1',objects:f.receipt?[{worldRef:q.worldRef,objectRef:'object-1',objectRevision:f.undone?'object-2':'object-1',displayName:'石块',nameRevision:'name-1',creationSequence:1,status:'READY'}]:[]});
   if(op==='AnalyzeAffectedObjects')return ok({contractVersion:'canvas/v5',worldRef:q.worldRef,worldRevision:q.expectedRevision,registryRevision:q.expectedRegistryRevision,selectionRevision:q.expectedSelectionRevision,operationDigest:q.operationDigest,orderedSelectedRefs:[],affectedObjectRefs:[]});
   if(op==='ApplyRecoverableCommit'){f.writes++;f.receipt={contractVersion:'canvas/v5',transactionId:q.transactionId,operationDigest:q.operationDigest,transactionPayloadDigest:'a'.repeat(64),status:'VERIFIED',previousWorldRevision:q.expectedWorldRevision,observedWorldRevision:'world-after',readbackDigest:'c'.repeat(64),restoreStatus:'NOT_REQUIRED',error:null,localContext:clone(f.local)};f.history=[row(f.receipt)];return ok(f.receipt);}
   if(op==='Readback')return ok(f.receipt);
   if(op==='HistoryQuery')return ok({worldRef:q.worldRef,objectRef:q.objectRef,historyRevision:f.undone?'history-2':'history-1',headTransactionId:f.undone?null:f.receipt.transactionId,entries:clone(f.history),undoAvailable:!f.undone,redoAvailable:!!f.undone});
   if(op==='InspectObject')return ok({...clone(sample.request.targetFacts),source:'INSPECTED',objectRef:'object-1',worldRevision:'world-after',objectRevision:'object-1',buildDigest:null,planRevision:null});
   if(op==='Undo'){f.undoWrites++;f.undone=true;const r={...f.receipt,transactionId:q.transactionId,operationDigest:'e'.repeat(64),previousWorldRevision:'world-after',observedWorldRevision:'world-undo',readbackDigest:'b'.repeat(64)};f.history.push({...row(r),originTransactionId:q.historyTransactionId,historyRevision:'history-2'});return ok(r);}
   throw Error(`unexpected fixture operation ${op}`);}};
 return f;
}
async function withRuntime(f,fn){
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'c042-'));
 let requests=0;const server=createServer((q,s)=>{requests++;s.writeHead(200,{'content-type':'image/png'});s.end(png);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ctx=new Context();
 try{
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
  for(const [k,v] of Object.entries({hanaworldsCanvasV5:f.canvas,hanaworldsPainterV2PictureBlocks:f.painter,hanaworldsBrushV3:f.brush,hanaworldsCatalogue:{read:async()=>clone(sample.request.catalogue)},hanaworldsSafetyProfile:{read:async()=>clone(sample.request.safetyProfile)},hanaworldsCompilerConfig:{read:async()=>({compilationConfig:config,compilerRevision:'fixture-compiler'})},hanaworldsCapabilities:f.capabilities,llm:{async *stream(){f.modelCalls++;throw Error('second model forbidden');}}}))ctx.provide(k,v);
  await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');f.readFacts=q=>ws.readBuildProposalProviderFacts(q);
  const append=async(id,event)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
  try{await fn({ctx,ws,append,url:`http://127.0.0.1:${server.address().port}/picture`,requests:()=>requests});}finally{await ws.projectionStore.close();}
 }finally{await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
}
const base={contractVersion:'session/v3',sessionRef:'s1'};
async function call(r,op,q){const out=await r.ws.call(op,{...base,...q});assert.equal(out.error,null,JSON.stringify(out));return out.result;}
// Downloads the user's image link through the real tool and confirms a brief whose media is non-empty.
async function imageBrief(r,f){
 const w=await r.ctx.sessionPersistence.create(header('s1'));await w.append([{type:'turn/start',seq:0,time:99,data:{turn:1}}]);await w.close();
 await r.append('s1',user('user-image',`照这个建造 ${r.url}`));
 const out=await r.ctx.tools.execute({name:'hanaworlds_download_image',callId:'download-s1',arguments:{url:r.url},signal:new AbortController().signal,agent:{ctx:r.ctx,session:{header:header('s1')}}});
 assert.equal(out.isError,false,JSON.stringify(out));assert.ok(out.content.some(p=>p.type==='image'));
 // Host agent-loop persistence of the native result is FIXTURE; Core JSONL is real.
 await r.append('s1',{type:'step/start',time:100,data:{turn:1,step:1}});
 await r.append('s1',{type:'assistant/message',time:100,surfaceOp:'append',data:{turn:1,step:1,stream:[],message:{id:'fixture-assistant',role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'tool-call',id:'download-s1',name:'hanaworlds_download_image',arguments:JSON.stringify({url:r.url})}]}}});
 await r.append('s1',{type:'tool/call',time:100,data:{turn:1,step:1,callId:'download-s1',name:'hanaworlds_download_image',arguments:JSON.stringify({url:r.url})}});
 await r.append('s1',{type:'tool/result',time:101,surfaceOp:'append',data:{turn:1,step:1,message:{id:'image-result',role:'tool',toolCallId:'download-s1',source:{kind:'tool',callId:'download-s1'},isError:false,content:out.content}}});
 const s=await call(r,'StartOrResumeSession',{requestId:'start',expectedRevision:null});
 const sw=await call(r,'SwitchWorldContext',{requestId:'switch',expectedRevision:s.context.sessionRevision,worldRef:f.local.worldRef,selectionRevision:f.local.selectionRevision,localContext:f.local});
 const turn=await call(r,'AppendMultimodalTurn',{requestId:'input',expectedRevision:sw.context.sessionRevision,turnRef:'image-turn',text:'图片中的石块',media:[out.value.media],controls:{purpose:'first building',dimensions:{width:1,depth:1,height:1,unit:'node'},entrancePortalRefs:[],styleText:null},localContext:f.local});
 await r.append('s1',user('confirm','确认'));const cur=await call(r,'StartOrResumeSession',{requestId:'start',expectedRevision:null});
 await call(r,'AnswerClarification',{requestId:'confirm',expectedRevision:cur.context.sessionRevision,turnRef:'image-turn',clarificationId:turn.clarification.clarificationId,answer:'确认',localContext:f.local});
 const advance={...base,requestId:'advance',worldRef:f.local.worldRef,expectedTurnRevision:turn.turnRevision,localContext:f.local};
 return {media:out.value.media,advance};
}

test('exact contracts 0.4.2 handshake, Workshop public exports and no game-asset consumption',async()=>{
 const pkg=JSON.parse(await readFile(join(entryDir,'..','package.json')));
 assert.equal(C.version,'0.4.2');assert.equal(C.contractHandshake.contracts,'hanaworlds-contracts@0.4.2');assert.equal(pkg.version,'0.2.2');
 const used=new Set();for(const n of (await readdir(entryDir)).filter(n=>n.endsWith('.mjs')))for(const m of (await readFile(join(entryDir,n),'utf8')).matchAll(/\bC\.([A-Za-z_]\w*)/g))used.add(m[1]);
 const missing=[...used].filter(n=>!(n in C));assert.deepEqual(missing,[]);assert.ok(used.size>=15);
 assert.equal(used.has('validateMaterialSources'),false,'Workshop must not read world material sources');
 const f=fixture();await withRuntime(f,async r=>{assert.deepEqual(r.ws.contractHandshake,C.contractHandshake);
  const {advance}=await imageBrief(r,f);
  f.painter.contractHandshake={...C.contractHandshake,contracts:'hanaworlds-contracts@0.4.0'};
  const context=await r.ws.readBuildProposalContext({...advance,requestId:'read-context'});
  const refused=await r.ws.submitBuildProposal({...context,requestId:'old-peer',proposal:clone(sample.request.proposal)});
  assert.ok(refused.error,'0.4.0 Painter peer must be refused');assert.equal(f.calls.includes('ValidateBuildProposal'),false);assert.equal(f.writes,0);
  console.log(JSON.stringify({evidence:'EXACT_042_HANDSHAKE',workshop:pkg.version,contracts:C.contractHandshake.contracts,usedExports:[...used].sort(),oldPeerError:refused.error.code,painterCalls:0,worldWrites:f.writes}));});
});

test('image MediaBinding brief → proposal context → Painter validation → build → same-transaction Undo under 0.4.2',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {media,advance}=await imageBrief(r,f);
  const context=await r.ws.readBuildProposalContext({...advance,requestId:'read-context'});
  assert.deepEqual(clone(context.referenceBrief.media),[media],'confirmed image media reaches the public proposal context');
  const submitted=await r.ws.submitBuildProposal({...context,requestId:'proposal',proposal:clone(sample.request.proposal)});assert.equal(submitted.error,null,JSON.stringify(submitted));
  assert.deepEqual(clone(f.painterContexts[0].referenceBrief.media),[media]);
  const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);
  const undo=await call(r,'UndoCurrentBuild',{requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(undo.status,'VERIFIED');assert.equal(f.undoWrites,1);assert.equal(f.modelCalls,0);assert.equal(r.requests(),1);
  console.log(JSON.stringify({evidence:'IMAGE_BRIEF_PROPOSAL_042',media,painterSawMedia:true,outcome:built.outcome,undo:undo.status,canvasWrites:f.writes,undoWrites:f.undoWrites,modelCalls:f.modelCalls,httpRequests:r.requests(),peers:'FIXTURE'}));});
});
