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
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import {createFixtureNativeFactsPort,validateNativeFactsScopedState} from 'hanaworlds-canvas/examples/native-facts-consumer.mjs';
const entry=process.env.HW_WORKSHOP_PACKAGE_ENTRY??new URL('../src/index.mjs',import.meta.url).href;
const {default:plugin,...W}=await import(entry);
const B=await import('hanaworlds-brush');
const P=await import('hanaworlds-building-exterior-painter');
const V=await import('hanaworlds-canvas');
const sample=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const clone=structuredClone,D=(k,v)=>C.digestValue(k,v).sha256;
const config={profileVersion:'compilation-config/v2',backendProfileId:'static-local',worldeditRevision:'static-1',nodeWriteSemantics:'explicit-nodeName-param2-static-v2',overlapRule:'last-writer-wins',effectOrder:'numeric-x-y-z',compressionRule:'exact-final-effects-only'};
const stateProfile={profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const header=id=>({version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/actual-peer-fixture',isSeeded:false});
const user=(id,text)=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text}]}});
// Only Adapter/world/native/Host facts are fixtures. No Painter/Brush/Canvas
// business response is supplied by this harness; actual packages own them.
function adapterFixture(){
 const f={local:clone(sample.request.localContext),calls:[],writes:0,undoWrites:0,modelCalls:0,world:new Map(),prepared:new Map(),original:new Map(),worldRevision:'world-0'};
 const records=positions=>positions.map(position=>clone(f.world.get(position.join(','))??{position,nodeName:position[1]===0?'fixture:stone':'air',param1:0,param2:0,metadata:{},inventory:{},timer:null}));
 f.records=records;
 f.capabilities={providerRef:'fixture-host',capabilityRevision:'cap-1',worldRef:f.local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile,sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null};
 const projection=(q,positions)=>({worldRef:q.worldRef,coveredPositions:clone(positions),records:records(positions),stateProfile:clone(q.stateProfile??stateProfile)});
 const receipt=(q,payload,operationDigest,before,after)=>({contractVersion:'canvas/v6',transactionId:q.transactionId,operationDigest,transactionPayloadDigest:payload,status:'VERIFIED',previousWorldRevision:before,observedWorldRevision:after,readbackDigest:D('readback',projection(q,q.scope?.checkedPositions??f.original.get(q.originTransactionId).positions)),restoreStatus:'NOT_REQUIRED',error:null,localContext:clone(q.localContext),guardRefusal:null,applyFailure:null});
 // NativeFacts comes only from Canvas0.5.3's complete public fixed provider.

 f.adapter={contractHandshake:C.contractHandshake,async call(op,q){
  f.calls.push({adapter:op,request:clone(q)});C.validateBoundRequest('world-adapter/v7',op,q);
  const ok=result=>{try{return C.validateBoundResponse('world-adapter/v7',op,q,{contractVersion:'world-adapter/v7',requestId:q.requestId,result,error:null});}catch(e){console.error('ADAPTER_FIXTURE_SCHEMA',op,e,JSON.stringify(result));throw e;}};
  if(op==='DiscoverConnections')return ok({capabilityRevision:'cap-1',connections:[{adapterId:'fixture-adapter',connectionRef:f.local.connectionRef,worldRef:f.local.worldRef,displayName:'Fixture world',capabilityRevision:'cap-1',payloadVersion:'world-adapter/v7',readiness:'READY',connectionIncarnationRef:f.local.connectionIncarnationRef}]});
  if(op==='ReadLocalConnection')return ok({connectionRef:f.local.connectionRef,connectionIncarnationRef:f.local.connectionIncarnationRef,worldRef:f.local.worldRef,payloadVersion:'world-adapter/v7',payloadDigest:'a'.repeat(64),capabilities:f.capabilities});
  if(op==='InspectRegion'){
   const targetFacts={...clone(sample.request.targetFacts),worldRevision:q.expectedWorldRevision};
   const inspection={...clone(sample.request.regionInspection),inspectionId:q.inspectionId,anchorKind:q.anchor.kind,targetFacts,targetFactsDigest:D('target-facts',targetFacts),evidence:{...clone(sample.request.regionInspection.evidence),worldRevision:q.expectedWorldRevision},placementSettings:clone(q.placementSettings)};
   return ok({outcome:'REGION_INSPECTED',inspection});
  }
  if(op==='InspectWorld'){
   assert.ok(f.targetObject,'Host object facts must come from actual Canvas public ListObjects');
   const positions=[[0,0,3],[0,1,3]],current=records(positions);
   return ok({...clone(sample.request.targetFacts),source:'INSPECTED',worldRevision:q.expectedWorldRevision,objectRef:f.targetObject.objectRef,objectRevision:f.targetObject.objectRevision,occupiedCells:current.filter(r=>r.nodeName!=='air').map(({position,nodeName,param2})=>({position,nodeName,param2})),knownEmptyCells:current.filter(r=>r.nodeName==='air').map(r=>r.position)});
  }
  if(op==='Readback')return ok({projection:projection(q,q.coveredPositions),readbackDigest:D('readback',projection(q,q.coveredPositions)),adapterExecutionRevision:'fixture-execution-1'});
  if(op==='PrepareRecoverableTransaction'){
   const before={...projection(q,q.scope.checkedPositions),worldRevision:f.worldRevision};
   const beforeImageDigest=D('before-image',before),payload={contractVersion:'world-adapter/v7',transactionId:q.transactionId,worldRef:q.worldRef,operationDigest:q.operationDigest,scopeDigest:q.scopeDigest,beforeImageDigest,localContext:clone(q.localContext)};
   const p={payload,transactionPayloadDigest:D('scoped-transaction-payload',payload),beforeImageDigest,scopeDigest:q.scopeDigest,guarantee:q.guarantee,stateProfile:clone(stateProfile),adapterExecutionRevision:'fixture-execution-1',beforeStateReadbackDigest:D('readback',projection(q,q.scope.checkedPositions))};
   f.prepared.set(q.transactionId,p);f.original.set(q.transactionId,{records:clone(before.records),positions:clone(before.coveredPositions)});return ok(p);
  }
  if(op==='ApplyCompiledTransaction'){
   const before=f.worldRevision;
   for(const effect of q.operations.effects)f.world.set(effect.position.join(','),{...records([effect.position])[0],nodeName:effect.nodeName,param2:effect.param2});
   f.writes++;f.worldRevision='world-1';return ok(receipt(q,q.preparedTransaction.transactionPayloadDigest,q.operationDigest,before,f.worldRevision));
  }
  if(op==='PrepareHistoryTransaction')return ok({originTransactionId:q.originTransactionId,transactionId:q.transactionId,direction:q.direction,historyOperationDigest:q.historyOperationDigest,transactionPayloadDigest:'e'.repeat(64),beforeImageDigest:q.originBeforeImageDigest,targetStateDigest:q.targetStateDigest,stateProfile:clone(stateProfile),adapterExecutionRevision:'fixture-execution-2',guarantee:q.guarantee,status:'PREPARED',localContext:clone(q.localContext)});
  if(op==='ApplyHistoryTransaction'){
   const before=f.worldRevision;for(const record of f.original.get(q.originTransactionId).records)f.world.set(record.position.join(','),clone(record));
   f.undoWrites++;f.worldRevision='world-2';return ok(receipt(q,q.preparedHistoryTransaction.transactionPayloadDigest,q.historyOperationDigest,before,f.worldRevision));
  }
  throw Error(`UNIMPLEMENTED_ADAPTER_FIXTURE:${op}`);
 }};
 return f;
}
async function withRuntime(f,fn){
 const base=process.env.HW_RUNTIME_ROOT;assert.ok(base,'own runtime root required');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'actual-'));
 const ctx=new Context();let ws;
 const server=createServer((q,s)=>{s.writeHead(200,{'content-type':'image/png'});s.end(png);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(root,'media')}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
  // Public constructor/store API: real Canvas fsynced fresh profile and operations.
  const publicNative=await createFixtureNativeFactsPort(C);
  f.native={async readScopedState(connectionRef,positions){const raw=validateNativeFactsScopedState(await publicNative.readScopedState(connectionRef,positions),C);f.calls.push({native:'readScopedState',connectionRef,positions:clone(positions),rawReturn:clone(raw),source:'Canvas0.5.3 public fixed fixture'});return raw;}};
  const store=await V.CanvasStore.open(join(root,'canvas'));
  f.canvas=new V.CanvasV5({store,adapter:f.adapter,nativeFacts:f.native,adapterId:'fixture-adapter'});await f.canvas.ready;assert.equal(f.canvas.status().storage,'READY');
  const realCanvasCall=f.canvas.call.bind(f.canvas);f.canvasCalls=[];
  f.canvas.call=async(op,q)=>{const out=await realCanvasCall(op,q);f.canvasCalls.push({operation:op,request:clone(q),response:clone(out)});return out;};
  const unbound=await f.canvas.call('ReadWorldSelectionContext',{contractVersion:'canvas/v6',sessionRef:'s1',requestId:'unbound',worldRef:f.local.worldRef});assert.equal(unbound.error,null,JSON.stringify(unbound));
  const selected=await f.canvas.call('SelectWorldConnection',{contractVersion:'canvas/v6',sessionRef:'s1',requestId:'select',worldRef:f.local.worldRef,connectionRef:f.local.connectionRef,connectionIncarnationRef:f.local.connectionIncarnationRef,expectedRevision:unbound.result.selection.sessionRevision,expectedContext:null});assert.equal(selected.error,null,JSON.stringify(selected));f.local=clone(selected.result.localContext);
  ctx.provide('hanaworldsPainterLocalFacts',{async read(q,operation){assert.equal(operation,'ValidateBuildProposal');const facts=await ws.readBuildProposalProviderFacts(q);f.painterFacts??=[];f.painterFacts.push(clone(facts));return facts;}});
  await ctx.plugin(P.default).await();f.painter=ctx.get(P.SERVICE);f.brush=new B.BrushV3();
  const services={hanaworldsCanvasV5:f.canvas,hanaworldsBrushV3:f.brush,hanaworldsCatalogue:{read:async()=>clone(sample.request.catalogue)},hanaworldsCompilerConfig:{read:async()=>({compilationConfig:config,compilerRevision:'fixture-compiler'})},hanaworldsCapabilities:f.capabilities,llm:{async *stream(){f.modelCalls++;throw Error('model forbidden');}}};
  for(const [k,v] of Object.entries(services))ctx.provide(k,v);
  await ctx.plugin(plugin).await();ws=ctx.get('hanaworldsWorkshop');
  const append=async(id,event)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
  await fn({ctx,ws,append,url:`http://127.0.0.1:${server.address().port}/picture`},root);
 }finally{
  if(process.env.HW_EVIDENCE_DIR){const fs=await import('node:fs/promises');await mkdir(process.env.HW_EVIDENCE_DIR,{recursive:true});await fs.writeFile(join(process.env.HW_EVIDENCE_DIR,'last-adapter-trace.json'),JSON.stringify(f.calls,null,2)+'\n');await fs.writeFile(join(process.env.HW_EVIDENCE_DIR,'public-canvas-trace.json'),JSON.stringify(f.canvasCalls,null,2)+'\n');await fs.writeFile(join(process.env.HW_EVIDENCE_DIR,'world-fixture-after.json'),JSON.stringify({records:f.records([[0,0,3],[0,1,3]]),buildWrites:f.writes,undoWrites:f.undoWrites,modelCalls:f.modelCalls},null,2)+'\n');await fs.cp(root,join(process.env.HW_EVIDENCE_DIR,'durable-runtime'),{recursive:true});}
  if(ws)await ws.projectionStore.close();await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});
 }
}
const base={contractVersion:'session/v4',sessionRef:'s1'};
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
 const turn=await call(r,'AppendMultimodalTurn',{requestId:'input',expectedRevision:sw.context.sessionRevision,turnRef:'image-turn',text:'图片中的石块',media:[out.value.media],controls:{purpose:'first building',dimensions:{width:1,depth:1,height:1,unit:'node'},entrancePortalRefs:[],styleText:null,siteRules:{requireEntranceConnectivity:false,entranceClearance:null,hazardPolicy:{forbidLiquid:true,maximumDamagePerSecond:0},optionalLightRule:null}},localContext:f.local});
 await r.append('s1',user('confirm','确认'));const cur=await call(r,'StartOrResumeSession',{requestId:'start',expectedRevision:null});
 await call(r,'AnswerClarification',{requestId:'confirm',expectedRevision:cur.context.sessionRevision,turnRef:'image-turn',clarificationId:turn.clarification.clarificationId,answer:'确认',localContext:f.local});
 const advance={...base,requestId:'advance',worldRef:f.local.worldRef,expectedTurnRevision:turn.turnRevision,localContext:f.local};
 return {media:out.value.media,advance};
}

test('ACTUAL three public peers: image proposal → real compile → durable Canvas readback → same-build Undo',async()=>{
 const f=adapterFixture();await withRuntime(f,async(r,root)=>{
  const peers={painter:f.painter,brush:f.brush,canvas:f.canvas};
  assert.equal(W.evaluateWriteMethod('PER_CELL',{ports:peers}).available,true);
  C.checkProtocolCompatibility(W.peerProtocolHandshake(f.painter),[C.protocolRequirement('painter-region/v2',W.WRITE_METHOD_PORTS.REGION.find(s=>s.field==='painterRegion').capabilities)]);
  for(const spec of W.WRITE_METHOD_PORTS.PER_CELL)C.checkProtocolCompatibility(W.peerProtocolHandshake(peers[spec.field]),[C.protocolRequirement(spec.wire,spec.capabilities,spec.minMinor??0)]);
  const {media,advance}=await imageBrief(r,f);const described=await r.ws.describeWriteTools('s1');assert.equal(described.tools[0].availability.available,true);assert.equal(described.tools[1].descriptor.method,'REGION');
  const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  const proposal=await r.ws.submitWriteProposal('PER_CELL',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)});assert.equal(proposal.response.error,null,JSON.stringify(proposal));assert.deepEqual(proposal.response.result.build.operations,sample.response.result.build.operations);
  assert.ok(f.painterFacts.length>=2);assert.deepEqual(f.painterFacts[0].sourceContext.referenceBrief.media,[media]);
  const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);assert.equal(f.records([[0,1,3]])[0].nodeName,'fixture:stone');
  const inventory=await f.canvas.call('ListObjects',{contractVersion:'canvas/v6',sessionRef:'s1',requestId:'objects',worldRef:f.local.worldRef,expectedRevision:null,localContext:f.local});assert.equal(inventory.error,null);assert.equal(inventory.result.objects.length,1);
  if(process.env.HW_EVIDENCE_DIR){const fs=await import('node:fs/promises');await fs.cp(join(root,'canvas'),join(process.env.HW_EVIDENCE_DIR,'canvas-durable-before-undo'),{recursive:true});await fs.cp(join(root,'projection'),join(process.env.HW_EVIDENCE_DIR,'workshop-durable-before-undo'),{recursive:true});}
  const object=inventory.result.objects[0];f.targetObject=clone(object);const history=await f.canvas.call('HistoryQuery',{contractVersion:'canvas/v6',sessionRef:'s1',requestId:'history',worldRef:f.local.worldRef,objectRef:object.objectRef,expectedHistoryRevision:null,localContext:f.local});assert.equal(history.error,null);assert.equal(history.result.headTransactionId,built.receipt.transactionId);
  const undo=await call(r,'UndoCurrentBuild',{requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:history.result.historyRevision});assert.equal(undo.status,'VERIFIED');const actualUndo=f.canvasCalls.find(x=>x.operation==='Undo').response.result;assert.equal(undo.afterHead.headTransactionId,actualUndo.transactionId);assert.notEqual(undo.afterHead.historyRevision,history.result.historyRevision);assert.equal(f.undoWrites,1);assert.equal(f.records([[0,1,3]])[0].nodeName,'air');assert.equal(f.modelCalls,0);
  if(process.env.HW_EVIDENCE_DIR){const fs=await import('node:fs/promises');await fs.cp(join(root,'canvas'),join(process.env.HW_EVIDENCE_DIR,'canvas-durable-after-undo'),{recursive:true});await fs.cp(join(root,'projection'),join(process.env.HW_EVIDENCE_DIR,'workshop-durable-after-undo'),{recursive:true});}
  console.log(JSON.stringify({evidence:'ACTUAL_THREE_PEER_NORMAL',contracts:C.contractHandshake,handshakes:Object.fromEntries(Object.entries(peers).map(([k,p])=>[k,W.peerProtocolHandshake(p)])),described,media,proposal:proposal.response,built,history:history.result,undo,adapterWrites:f.writes,adapterUndoWrites:f.undoWrites,worldAfterUndo:f.records([[0,1,3]]),modelCalls:f.modelCalls,boundary:'actual Workshop/Painter/Brush/Canvas; Adapter/world/native/Host facts FIXTURE'}));
 });
});

test('ACTUAL public peer requirements: both descriptors and REGION capabilities; named synthetic major/capability refusal',()=>{
 // Painter service handshake is exercised by the normal runtime test; module declarations below are read-only.
 const brush=new B.BrushV3();
 // The public per-cell and region requirements stay in the two descriptors.
 for(const method of W.WRITE_METHODS){const d=W.describeWriteMethod(method,{ports:{}}).descriptor;C.validateType('WriteMethodDescriptor',d);assert.match(d.typicalScale,/not a limit/);assert.match(d.typicalScale,/never truncates/);}
 C.checkProtocolCompatibility(W.peerProtocolHandshake(brush),[C.protocolRequirement('BUILD/V4',['BUILD/V4:per-cell-compile']),C.protocolRequirement('region-build/v1',['region-build/v1:compile-mapblock-chunks'])]);
 C.checkProtocolCompatibility(V.canvasProtocolHandshake,[C.protocolRequirement('canvas-region/v2',W.WRITE_METHOD_PORTS.REGION.find(s=>s.field==='canvasRegion').capabilities)]);
 const hs=W.peerProtocolHandshake(brush);const altered=clone(hs);altered.protocols.find(p=>p.protocol==='BUILD').major=4;
 assert.throws(()=>C.checkProtocolCompatibility(altered,[C.protocolRequirement('BUILD/V4',['BUILD/V4:per-cell-compile'])]),e=>e.code==='UNSUPPORTED_VERSION');
 const missing=clone(hs);missing.capabilities=missing.capabilities.filter(c=>c!=='BUILD/V4:per-cell-compile');
 assert.throws(()=>C.checkProtocolCompatibility(missing,[C.protocolRequirement('BUILD/V4',['BUILD/V4:per-cell-compile'])]),e=>e.code==='CAPABILITY_UNAVAILABLE');
 console.log(JSON.stringify({evidence:'ACTUAL_PUBLIC_REQUIREMENTS',brush:hs,canvasRegion:V.canvasProtocolHandshake,boundary:'actual public declarations; modified negative handshakes synthetic, no peer business response replacement'}));
});
