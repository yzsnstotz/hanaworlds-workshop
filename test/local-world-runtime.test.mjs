import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import * as C from 'hanaworlds-contracts';
const sample = JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/main'))));
const {default: plugin} = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');
const clone = structuredClone, D = (k,v) => C.digestValue(k,v).sha256;
const config = {profileVersion:'compilation-config/v2',backendProfileId:'static-local',worldeditRevision:'static-1',nodeWriteSemantics:'explicit-nodeName-param2-static-v2',overlapRule:'last-writer-wins',effectOrder:'numeric-x-y-z',compressionRule:'exact-final-effects-only'};
const stateProfile={profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'};
// All peers and world data are FIXTURE; Workshop, Cordis, Core and domain persistence are real.
function fixture() {
 const f={local:clone(sample.request.localContext),calls:[],writes:0,undoWrites:0,modelCalls:0,history:[],receipt:null,rolledBack:false};
 f.context=()=>({currentSession:'s1',activeWorldRef:f.local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'canvas-selection-1',selectionRevision:f.local.selectionRevision,localContext:clone(f.local)});
 f.capabilities={providerRef:'fixture-host',capabilityRevision:'cap-1',worldRef:f.local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile,sessionDeleteSupported:false,imageMediaTypes:[],model:null};
 f.painter={contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-building-exterior-painter',protocols:[{protocol:'painter',major:4,minor:0}],capabilities:[],provenance:{packageName:'hanaworlds-building-exterior-painter',packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}},async call(op,q){assert.equal(op,'ValidateBuildProposal'); f.calls.push(op); C.validateBuildProposalRequest(q); C.validateBuildProposalContext(q,await f.readFacts(q));
   const result=clone(sample.response.result); result.invocationId=q.invocationId;
   return {contractVersion:'painter/v4',requestId:q.requestId,result,error:null};}};
 // K3: Workshop checks Brush by its public ProtocolHandshake (BUILD major 3 + per-cell capability).
 f.brush={contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-brush',protocols:[{protocol:'BUILD',major:3,minor:0}],capabilities:['BUILD/V3:per-cell-compile'],provenance:{packageName:'hanaworlds-brush',packageVersion:'fixture',sourceRevision:null,artifactDigest:null}},async compile(q){f.calls.push('BuildDocument'); C.validateBoundRequest('BUILD/V3','BuildDocument',q);
   const effects=[{position:clone(q.build.operations[0].min),...q.build.materials[q.build.operations[0].materialRef]}];
   const projection={contractVersion:'operations/v3',buildDigest:q.buildDigest,compilerRevision:q.compilerRevision,compilationConfigDigest:q.compilationConfigDigest,worldRef:q.worldRef,frameDigest:q.targetFacts.frameDigest,catalogueDigest:q.catalogueDigest,targetFactsDigest:q.targetFactsDigest,effects};
   return {contractVersion:'BUILD/V3',requestId:q.requestId,result:{projection,operationDigest:D('operations',projection),readBounds:q.targetFacts.sampledBounds,writeBounds:q.build.declaredBounds},error:null};}};
 const row=receipt=>({transactionId:receipt.transactionId,originTransactionId:null,affectedObjectRefs:['object-1'],operationDigest:receipt.operationDigest,beforeImageDigest:'d'.repeat(64),expectedAfterReadbackDigest:receipt.readbackDigest,receiptDigest:D('receipt',receipt),historyRevision:'history-1',status:'VERIFIED'});
 f.canvas={contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-canvas',protocols:[{protocol:'canvas',major:5,minor:0}],capabilities:[],provenance:{packageName:'hanaworlds-canvas',packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}},async call(op,q){f.calls.push(op); C.validateBoundRequest('canvas/v5',op,q);
   const response=result=>({contractVersion:'canvas/v5',requestId:q.requestId,result,error:null});
   if(op==='ReadWorldSelectionContext')return response({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap-1',connections:[]},selection:{status:'BOUND',connectionRef:f.local.connectionRef,context:f.context()}});
   assert.deepEqual(clone(q.localContext),f.local);
   if(op==='InspectPlacementRegion')return {...response({outcome:'REGION_INSPECTED',inspection:clone(sample.request.regionInspection)}),unavailableSettings:null};
   if(op==='ListObjects')return response({worldRef:q.worldRef,registryRevision:'registry-1',objects:f.receipt&&!f.rolledBack?[{worldRef:q.worldRef,objectRef:'object-1',objectRevision:f.undone?'object-2':'object-1',displayName:'石块',nameRevision:'name-1',creationSequence:1,status:'READY'}]:[]});
   if(op==='AnalyzeAffectedObjects')return response({contractVersion:'canvas/v5',worldRef:q.worldRef,worldRevision:q.expectedRevision,registryRevision:q.expectedRegistryRevision,selectionRevision:q.expectedSelectionRevision,operationDigest:q.operationDigest,orderedSelectedRefs:[],affectedObjectRefs:f.conflict?['existing-object']:[]});
   if(op==='ApplyRecoverableCommit'){
     f.writes++; f.applied=clone(q);
     f.receipt={contractVersion:'canvas/v5',transactionId:q.transactionId,operationDigest:q.operationDigest,transactionPayloadDigest:'a'.repeat(64),status:f.rollback?'ROLLED_BACK':'VERIFIED',previousWorldRevision:q.expectedWorldRevision,observedWorldRevision:'world-after',readbackDigest:'c'.repeat(64),restoreStatus:f.rollback?'VERIFIED_RESTORED':'NOT_REQUIRED',error:null,localContext:clone(f.local)};
     if(f.rollback){ f.rolledBack=true; f.worldNodes=[]; } else {f.worldNodes=clone(q.operations.effects);f.history=[row(f.receipt)];}
     return response(f.receipt);
   }
   if(op==='Readback')return response(f.badReadback?{...f.receipt,readbackDigest:'f'.repeat(64)}:f.receipt);
   if(op==='HistoryQuery')return response({worldRef:q.worldRef,objectRef:q.objectRef,historyRevision:f.undone?'history-2':'history-1',headTransactionId:f.undone?(f.badUndoHead?null:f.history.at(-1).transactionId):f.receipt.transactionId,entries:clone(f.history),undoAvailable:!f.undone,redoAvailable:!!f.undone});
   if(op==='InspectObject')return response({...clone(sample.request.targetFacts),source:'INSPECTED',objectRef:'object-1',worldRevision:'world-after',objectRevision:'object-1',buildDigest:null,planRevision:null});
   if(op==='Undo'){
     f.undoWrites++;f.undoRequest=clone(q);f.undone=true;f.worldNodes=[];
     const receipt={...f.receipt,transactionId:q.transactionId,operationDigest:'e'.repeat(64),previousWorldRevision:'world-after',observedWorldRevision:'world-undo',readbackDigest:'b'.repeat(64)};
     f.history.push({...row(receipt),originTransactionId:q.historyTransactionId,historyRevision:'history-2'});return response(receipt);
   }
   throw Error(`unexpected fixture operation ${op}`);
 }};
 return f;
}
async function mount(root,f) {
 const ctx=new Context(); await ctx.plugin(JsonlSessionPersistence,{root:join(root,'core'),compression:'none'}).await();
 await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
 for(const [k,v] of Object.entries({hanaworldsCanvasV5:f.canvas,hanaworldsPainterV2PictureBlocks:f.painter,hanaworldsBrushV3:f.brush,hanaworldsCatalogue:{read:async()=>clone(sample.request.catalogue)},hanaworldsSafetyProfile:{read:async()=>clone(sample.request.safetyProfile)},hanaworldsCompilerConfig:{read:async()=>({compilationConfig:config,compilerRevision:'fixture-compiler'})},hanaworldsCapabilities:f.capabilities,llm:{async *stream(){f.modelCalls++;throw Error('second model forbidden');}}}))ctx.provide(k,v);
 await ctx.plugin(plugin).await();const workshop=ctx.get('hanaworldsWorkshop');f.readFacts=q=>workshop.readBuildProposalProviderFacts(q);
 return {ctx,workshop,async close(){await workshop.projectionStore.close();await ctx.fiber.dispose();}};
}
async function withRuntime(f,fn){const base=process.env.HW_RUNTIME_ROOT??new URL('../../local-world/runtime/',import.meta.url).pathname;await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'run-'));const r=await mount(root,f);try{await fn(r,root);}finally{await r.close();await rm(root,{recursive:true,force:true});}}
const start={contractVersion:'session/v3',sessionRef:'s1',requestId:'start',expectedRevision:null};
async function call(r,op,q){const res=await r.workshop.call(op,q);assert.equal(res.error,null,JSON.stringify(res));return res.result;}
async function ready(r,f){
 const writer=await r.ctx.sessionPersistence.create({version:SESSION_FORMAT_VERSION,id:'s1',createdAt:100,cwd:'/isolated/local-world',isSeeded:false});await writer.append([{type:'turn/start',seq:0,time:101,data:{turn:1}}]);await writer.close();
 const s=await call(r,'StartOrResumeSession',start);
 const switched=await call(r,'SwitchWorldContext',{contractVersion:'session/v3',sessionRef:'s1',requestId:'switch',expectedRevision:s.context.sessionRevision,worldRef:f.local.worldRef,selectionRevision:f.local.selectionRevision,localContext:f.local});
 const turn=await call(r,'AppendMultimodalTurn',{...start,requestId:'input',expectedRevision:switched.context.sessionRevision,turnRef:'turn-1',text:'建一块石头',media:[],controls:{purpose:'first building',dimensions:{width:1,depth:1,height:1,unit:'node'},entrancePortalRefs:[],styleText:null},localContext:f.local});
 const current=await call(r,'StartOrResumeSession',start);
 const writer2=await r.ctx.sessionPersistence.open('s1','write');await writer2.append([{type:'user/message',seq:1,time:102,surfaceOp:'append',data:{id:'confirm',role:'user',source:{kind:'user'},content:[{type:'text',text:'确认'}]}}]);await writer2.close();
 await call(r,'AnswerClarification',{...start,requestId:'confirm',expectedRevision:current.context.sessionRevision,turnRef:'turn-1',clarificationId:turn.clarification.clarificationId,answer:'确认',localContext:f.local});
 const advance={contractVersion:'session/v3',sessionRef:'s1',requestId:'advance',worldRef:f.local.worldRef,expectedTurnRevision:turn.turnRevision,localContext:f.local};
 const context=await r.workshop.readBuildProposalContext({...advance,requestId:'read-context'});
 const proposal={...context,requestId:'proposal',proposal:clone(sample.request.proposal)};
 const submitted=await r.workshop.submitBuildProposal(proposal);assert.equal(submitted.error,null,JSON.stringify(submitted));
 return {advance,proposal};
}
test('local text proposal → build → durable duplicate → original Undo uses real Core and zero second model',async()=>{
 const f=fixture();await withRuntime(f,async(r,root)=>{const {advance}=await ready(r,f);const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);assert.equal(f.modelCalls,0);
 await r.close();const reopened=await mount(root,f);try{
 assert.deepEqual(await call(reopened,'AdvanceCurrentBuild',advance),built);assert.equal(f.writes,1);
 const undo={contractVersion:'session/v3',sessionRef:'s1',requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'};
 const status=await call(reopened,'ReadCurrentUndoStatus',{contractVersion:'session/v3',sessionRef:'s1',requestId:'status',worldRef:f.local.worldRef,localContext:f.local});assert.equal(status.availability,'AVAILABLE');
 const result=await call(reopened,'UndoCurrentBuild',undo);assert.equal(result.status,'VERIFIED');assert.equal(f.undoRequest.historyTransactionId,built.receipt.transactionId);assert.equal(f.undoWrites,1);
 assert.deepEqual(await call(reopened,'UndoCurrentBuild',undo),result);assert.equal(f.undoWrites,1);
 }finally{await reopened.close();}});
});

test('wrong current connection rejects proposal consumption and Canvas writes',async()=>{
 const f=fixture();await withRuntime(f,async r=>{const {advance}=await ready(r,f);f.local.connectionIncarnationRef='reopened-socket';
 const response=await r.workshop.call('AdvanceCurrentBuild',advance);assert.equal(response.error?.code,'CURRENT_WORLD_MISMATCH');assert.equal(f.writes,0);});
});
test('existing object footprint conflict stops before Apply',async()=>{
 const f=fixture();f.conflict=true;await withRuntime(f,async r=>{const {advance}=await ready(r,f);
 const response=await r.workshop.call('AdvanceCurrentBuild',advance);assert.equal(response.error?.code,'OTHER_OBJECTS_AFFECTED');assert.equal(f.writes,0);});
});
test('Canvas whole rollback is retained as failure and never advertises Undo success',async()=>{
 const f=fixture();f.rollback=true;await withRuntime(f,async r=>{const {advance}=await ready(r,f);
 const response=await r.workshop.call('AdvanceCurrentBuild',advance);assert.equal(response.error?.mutationState,'ROLLED_BACK');assert.equal(f.writes,1);assert.deepEqual(f.worldNodes,[]);
 assert.deepEqual(await r.workshop.call('AdvanceCurrentBuild',advance),response);assert.equal(f.writes,1);
 const status=await call(r,'ReadCurrentUndoStatus',{contractVersion:'session/v3',sessionRef:'s1',requestId:'rollback-status',worldRef:f.local.worldRef,localContext:f.local});assert.equal(status.availability,'NO_VERIFIED_BUILD');});
});
test('mismatched Canvas readback cannot publish VERIFIED or cause a duplicate write',async()=>{
 const f=fixture();f.badReadback=true;await withRuntime(f,async r=>{const {advance}=await ready(r,f);
 const response=await r.workshop.call('AdvanceCurrentBuild',advance);assert.equal(response.error?.code,'READBACK_MISMATCH');assert.equal(response.error?.mutationState,'UNKNOWN');assert.equal(f.writes,1);
 assert.deepEqual(await r.workshop.call('AdvanceCurrentBuild',advance),response);assert.equal(f.writes,1);});
});
test('Painter rejects invalid geometry before Brush or Canvas transaction',async()=>{
 const f=fixture();await withRuntime(f,async r=>{const {advance,proposal}=await ready(r,f);
 // A new public generation context is needed to replace the prior proposal.
 const context=await r.workshop.readBuildProposalContext({...advance,requestId:'replacement'});
 const bad={...context,requestId:'bad-proposal',proposal:clone(proposal.proposal)};bad.proposal.boxes[0].max[0]=Number.MAX_SAFE_INTEGER;
 const response=await r.workshop.submitBuildProposal(bad);assert.equal(response.error?.code,'BUILD_INVALID');assert.equal(f.calls.includes('BuildDocument'),false);assert.equal(f.writes,0);});
});
