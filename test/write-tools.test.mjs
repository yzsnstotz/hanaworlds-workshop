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
// S1-WS-WRITE-TOOLS-01: two self-described write modes of the same skill. Peers/world are FIXTURE.
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
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'wt-'));
 let requests=0;const server=createServer((q,s)=>{requests++;s.writeHead(200,{'content-type':'image/png'});s.end(png);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ctx=new Context();
 try{
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
  for(const [k,v] of Object.entries({hanaworldsCanvasV5:f.canvas,hanaworldsPainterV2PictureBlocks:f.painter,hanaworldsBrushV3:f.brush,hanaworldsCatalogue:{read:async()=>clone(sample.request.catalogue)},hanaworldsSafetyProfile:{read:async()=>clone(sample.request.safetyProfile)},hanaworldsCompilerConfig:{read:async()=>({compilationConfig:config,compilerRevision:'fixture-compiler'})},hanaworldsCapabilities:f.capabilities,llm:{async *stream(){f.modelCalls++;throw Error('second model forbidden');}}}))ctx.provide(k,v);
  await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');f.readFacts=q=>ws.readBuildProposalProviderFacts(q);
  const append=async(id,event)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
  const r={ctx,ws,append,url:`http://127.0.0.1:${server.address().port}/picture`,requests:()=>requests,root};
  try{await fn(r);}finally{await r.ws.projectionStore.close();}
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


const W=await import(entry);
const pkg=JSON.parse(await readFile(join(entryDir,'..','package.json')));
const log=(evidence,value)=>console.log(JSON.stringify({evidence,workshop:pkg.version,contracts:C.contractHandshake.contracts,...value}));
const codes=a=>a.unmet.map(u=>u.code);

test('both write tools self-describe purpose, input, typical scale, prerequisites and effects; no threshold field',()=>{
 assert.deepEqual([...W.WRITE_MODES],['cells','region']);
 for(const mode of W.WRITE_MODES){const d=W.writeToolDescriptors[mode];
  for(const k of ['title','purpose','whenToUse','notFor','input','effects'])assert.ok(typeof d[k]==='string'&&d[k].length>20,`${mode}.${k}`);
  assert.equal(d.typicalScale.unit,'node');assert.match(d.typicalScale.note,/not a limit/);assert.match(d.typicalScale.note,/never truncates/);
  assert.ok(d.requires.length>=5);assert.match(d.effects,/No world write/);
  const flat=JSON.stringify(d);assert.doesNotMatch(flat,/"(max|min|limit|threshold)[A-Za-z]*":/i,'descriptor carries no enforced numeric threshold');}
 assert.match(W.writeToolDescriptors.region.input,/never means air/);assert.match(W.writeToolDescriptors.region.input,/explicit air/);
 assert.match(W.writeToolSkillGuidance,/not limits/);assert.match(W.writeToolSkillGuidance,/do not silently switch modes or shrink the target/);
 log('WRITE_TOOL_DESCRIPTORS',{descriptors:W.writeToolDescriptors,skillGuidance:W.writeToolSkillGuidance});
});

test('region capability: same protocol major + required capability, wrong major or missing is explicit (FIXTURE handshakes)',()=>{
 const hs=caps=>({...C.contractHandshake,capabilities:caps});
 const peers=caps=>({painter:{contractHandshake:hs(caps)},brush:{contractHandshake:hs(caps)},canvas:{contractHandshake:hs(caps)}});
 const ok=W.regionCapabilityUnmet({ownHandshake:hs([W.REGION_CAPABILITY]),peers:peers([W.REGION_CAPABILITY])});
 assert.deepEqual(ok,[]);
 const v2=W.regionCapabilityUnmet({ownHandshake:hs([W.REGION_CAPABILITY]),peers:{...peers([W.REGION_CAPABILITY]),canvas:{contractHandshake:hs(['region-voxel-block/v2'])}}});
 assert.deepEqual(v2.map(u=>u.code),['CAPABILITY_MAJOR_MISMATCH']);assert.match(v2[0].need,/advertises region-voxel-block\/v2/);
 const missing=W.regionCapabilityUnmet({ownHandshake:hs([]),peers:peers([W.REGION_CAPABILITY])});assert.deepEqual(missing.map(u=>u.code),['CAPABILITY_MISSING']);
 // On the actual 0.4.2 schema an extra handshake field is itself refused: the real gate stays closed until region v1 bytes.
 assert.ok(codes(W.evaluateWriteMode('region',{ownHandshake:hs([W.REGION_CAPABILITY]),peers:peers([W.REGION_CAPABILITY])})).includes('PEER_INCOMPATIBLE'));
 const oldPeer=W.evaluateWriteMode('cells',{ownHandshake:C.contractHandshake,peers:{brush:{contractHandshake:C.contractHandshake},canvas:{contractHandshake:C.contractHandshake},painter:{contractHandshake:{...C.contractHandshake,wireVersions:['painter/v3']}}}});
 assert.deepEqual(codes(oldPeer),['PEER_INCOMPATIBLE']);
 const absent=W.evaluateWriteMode('cells',{ownHandshake:C.contractHandshake,peers:{}});assert.deepEqual(codes(absent),['PEER_UNAVAILABLE','PEER_UNAVAILABLE','PEER_UNAVAILABLE']);
 assert.deepEqual(codes(W.evaluateWriteMode('bulk',{})),['UNKNOWN_WRITE_MODE']);
 for(const u of [...v2,...missing,...oldPeer.unmet,...absent.unmet])assert.ok(u.need&&u.remedy,'every unmet need explains itself and its remedy');
 log('REGION_CAPABILITY_FIXTURE',{sameMajor:ok,wrongMajor:v2,missing,oldPeer,absent,fixture:'handshake.capabilities field and token name pending actual Contracts region v1'});
});

test('cells mode on real contracts 0.4.2: availability by Session → image brief → Painter → Brush → Canvas → same build Undo',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const before=await r.ws.describeWriteTools('s1');assert.deepEqual(codes(before.tools[0].availability),['SESSION_NOT_FOUND']);
  const {media,advance}=await imageBrief(r,f);
  const described=await r.ws.describeWriteTools('s1');const [cells,region]=described.tools;
  assert.equal(cells.mode,'cells');assert.equal(cells.availability.available,true,JSON.stringify(cells.availability));
  assert.equal(region.availability.available,false);
  const context=await r.ws.readBuildProposalContext({...advance,requestId:'read-context'});
  assert.deepEqual(clone(context.referenceBrief.media),[media]);
  const sent=await r.ws.submitWriteProposal('cells',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)});
  assert.equal(sent.mode,'cells');assert.equal(sent.availability.available,true);assert.equal(sent.response.error,null,JSON.stringify(sent));
  assert.deepEqual(clone(f.painterContexts[0].referenceBrief.media),[media],'image media preserved into Painter');
  assert.deepEqual(await r.ws.submitWriteProposal('cells',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)}),sent,'exact duplicate returns stored result');
  assert.equal(f.calls.filter(c=>c==='ValidateBuildProposal').length,1);
  const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);
  assert.deepEqual(f.calls.filter(c=>['ValidateBuildProposal','BuildDocument','ApplyRecoverableCommit','Readback'].includes(c)),['ValidateBuildProposal','BuildDocument','ApplyRecoverableCommit','Readback']);
  assert.deepEqual((await r.ws.describeWriteTools('s1')).currentBuild,{turnRef:'image-turn',writeMode:'cells',outcome:'VERIFIED'});
  const undo=await call(r,'UndoCurrentBuild',{requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(undo.status,'VERIFIED');assert.equal(f.undoWrites,1);assert.equal(f.modelCalls,0);
  log('CELLS_MODE_CHAIN',{before:before.tools.map(t=>t.availability),after:described.tools.map(t=>t.availability),media,painterSawMedia:true,proposalMode:sent.mode,outcome:built.outcome,currentBuild:{writeMode:'cells'},undo:undo.status,canvasWrites:f.writes,undoWrites:f.undoWrites,modelCalls:f.modelCalls,peers:'FIXTURE'});
 });
});

test('region mode on real contracts 0.4.2 is not available: explains needs, zero Painter calls, zero writes, no fallback to cells',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);
  const context=await r.ws.readBuildProposalContext({...advance,requestId:'read-context'});
  const sent=await r.ws.submitWriteProposal('region',{...context,requestId:'region-proposal',proposal:clone(sample.request.proposal)});
  assert.equal(sent.response.error?.code,'CAPABILITY_UNAVAILABLE');assert.equal(sent.availability.available,false);
  assert.deepEqual(codes(sent.availability),['CAPABILITY_MISSING','CAPABILITY_MISSING','CAPABILITY_MISSING','CAPABILITY_MISSING']);
  assert.match(sent.availability.unmet[0].need,/Installed hanaworlds-contracts advertising region-voxel-block\/v1/);
  assert.equal(f.calls.includes('ValidateBuildProposal'),false);assert.equal(f.writes,0);
  assert.equal((await r.ws.describeWriteTools('s1')).currentBuild,null,'no silent cells fallback build was recorded');
  const unknown=await r.ws.submitWriteProposal('bulk',{...context,requestId:'bulk-proposal',proposal:clone(sample.request.proposal)});
  assert.equal(unknown.response.error?.code,'CAPABILITY_UNAVAILABLE');assert.deepEqual(codes(unknown.availability),['UNKNOWN_WRITE_MODE']);
  // The same captured context still accepts an explicit cells choice afterwards (skill decides, Workshop does not).
  const cells=await r.ws.submitWriteProposal('cells',{...context,requestId:'cells-proposal',proposal:clone(sample.request.proposal)});assert.equal(cells.response.error,null);
  const replay=await r.ws.submitWriteProposal('region',{...context,requestId:'cells-proposal',proposal:clone(sample.request.proposal)});assert.equal(replay.response.error?.code,'CAPABILITY_UNAVAILABLE');
  log('REGION_UNAVAILABLE_042',{response:sent.response,availability:sent.availability,painterCalls:0,worldWrites:f.writes,unknownMode:unknown.availability,peers:'FIXTURE'});
 });
});

test('wrong current world connection rejects a write proposal before Painter',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readBuildProposalContext({...advance,requestId:'read-context'});
  f.local.connectionIncarnationRef='reopened-socket';
  const sent=await r.ws.submitWriteProposal('cells',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)});
  assert.ok(['CURRENT_WORLD_MISMATCH','TARGET_FACTS_STALE'].includes(sent.response.error?.code),JSON.stringify(sent.response));
  assert.equal(f.calls.includes('ValidateBuildProposal'),false);assert.equal(f.writes,0);
  log('WRONG_CONNECTION_REJECT',{error:sent.response.error,painterCalls:0,worldWrites:0});
 });
});
