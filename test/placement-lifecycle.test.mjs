import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as C from 'hanaworlds-contracts';
const {default:Workshop}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
const fixture=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/confirmed-placement'))));
const sample=fixture.perCell.accept[0], clone=structuredClone, D=(k,v)=>C.digestValue(k,v).sha256;
const local=sample.request.localContext, observations=[];
const header=id=>({version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/placement-v2',isSeeded:false});
const user=(id,text)=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text}]}});
const handshake=(component,protocol,major,capabilities=[])=>({profileVersion:'protocol-handshake/v1',component,protocols:[{protocol,major,minor:0}],capabilities,provenance:{packageName:component,packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}});
async function setup(fn){
 const base=process.env.HW_RUNTIME_ROOT;if(!base)throw Error('own HW_RUNTIME_ROOT required');await mkdir(base,{recursive:true});const root=await mkdtemp(base+'/placement-');
 const ctx=new Context();const f={inspection:clone(fixture.inspections.view1),calls:[],painterRequests:[],applies:[],worldRevision:fixture.inspections.view1.targetFacts.worldRevision,responseCase:sample,recordedInspections:{}};let ws;
 try{
  await ctx.plugin(Jsonl,{root:root+'/core',compression:'none'}).await();await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:root+'/projection'}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
  ctx.provide('hanaworldsCapabilities',{providerRef:'fixture',capabilityRevision:'fixture',worldRef:local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile:{profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'},sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null});
  const selection=id=>({currentSession:id,activeWorldRef:local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'fixture-selection',selectionRevision:local.selectionRevision,localContext:clone(local)});
  ctx.provide('hanaworldsCanvasV5',{contractHandshake:C.contractHandshake,protocolHandshake:handshake('fixture-canvas','canvas',6),async call(op,q){
   C.validateBoundRequest('canvas/v6',op,q);f.calls.push({op,request:clone(q)});const ok=result=>({contractVersion:'canvas/v6',requestId:q.requestId,result,error:null,...(['ApplyRecoverableCommit','InspectPlacementRegion'].includes(op)?{guardRefusal:null}:{})});
   if(op==='ReadWorldSelectionContext')return ok({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'fixture',connections:[]},selection:{status:'BOUND',connectionRef:local.connectionRef,context:selection(q.sessionRef)}});
   if(op==='InspectPlacementRegion'){f.recordedInspections[f.inspection.inspectionId]=clone(f.inspection);return {...ok({outcome:'REGION_INSPECTED',inspection:clone(f.inspection)}),unavailableSettings:null};}
   if(op==='ListObjects')return ok({worldRef:q.worldRef,registryRevision:'registry-1',objects:f.receipt?[{worldRef:q.worldRef,objectRef:'object-1',objectRevision:'object-1',displayName:'fixture',nameRevision:'name-1',creationSequence:1,status:'READY'}]:[]});
   if(op==='AnalyzeAffectedObjects')return ok({contractVersion:'canvas/v6',worldRef:q.worldRef,worldRevision:f.worldRevision,registryRevision:q.expectedRegistryRevision,selectionRevision:q.expectedSelectionRevision,operationDigest:q.operationDigest,orderedSelectedRefs:[],affectedObjectRefs:[]});
   if(op==='ApplyRecoverableCommit'){
    C.checkConfirmedPlacementApply(q,f.recordedInspections[q.regionInspectionBinding.inspectionId],f.worldRevision);f.applies.push(clone(q));
    f.receipt={contractVersion:'canvas/v6',transactionId:q.transactionId,operationDigest:q.operationDigest,transactionPayloadDigest:'a'.repeat(64),status:'VERIFIED',previousWorldRevision:q.expectedWorldRevision,observedWorldRevision:'fixture-after',readbackDigest:'c'.repeat(64),restoreStatus:'NOT_REQUIRED',error:null,localContext:clone(local),guardRefusal:null,applyFailure:null};return ok(f.receipt);
   }
   if(op==='Readback')return ok(f.receipt);
   if(op==='HistoryQuery'){const r=f.receipt;return ok({worldRef:q.worldRef,objectRef:q.objectRef,historyRevision:'history-1',headTransactionId:r.transactionId,entries:[{transactionId:r.transactionId,originTransactionId:null,affectedObjectRefs:['object-1'],operationDigest:r.operationDigest,beforeImageDigest:'d'.repeat(64),expectedAfterReadbackDigest:r.readbackDigest,receiptDigest:D('receipt',r),historyRevision:'history-1',status:'VERIFIED'}],undoAvailable:true,redoAvailable:false});}
   throw Error('unexpected fixture operation '+op);
  }});
  ctx.provide('hanaworldsCatalogue',{read:async()=>clone(sample.request.catalogue)});
  const config=fixture.canvas.accept[0].submission.apply.operations;
  const compilationConfig={profileVersion:'compilation-config/v2',backendProfileId:'static-local',worldeditRevision:'static-1',nodeWriteSemantics:'explicit-nodeName-param2-static-v2',overlapRule:'last-writer-wins',effectOrder:'numeric-x-y-z',compressionRule:'exact-final-effects-only'};
  ctx.provide('hanaworldsCompilerConfig',{read:async()=>({compilationConfig,compilerRevision:config.compilerRevision})});
  ctx.provide('hanaworldsBrushV3',{contractHandshake:C.contractHandshake,protocolHandshake:handshake('fixture-brush','BUILD',4,['BUILD/V4:per-cell-compile']),async compile(q){
   C.validateBoundRequest('BUILD/V4','BuildDocument',q);// Effect positions are the published fixture's validated COVERAGE positions, never repaired real geometry.
   const positions=f.responseCase.response.result.build.witnesses.find(w=>w.predicate==='COVERAGE').facts.positions;
   const material=Object.values(q.build.materials)[0];const projection={...clone(config),buildDigest:q.buildDigest,compilerRevision:q.compilerRevision,compilationConfigDigest:q.compilationConfigDigest,targetFactsDigest:q.targetFactsDigest,frameDigest:q.targetFacts.frameDigest,effects:positions.map(position=>({position:clone(position),...material}))};
   C.validateExactEffects(q.build.operations,q.build.materials,projection.effects);return {contractVersion:'BUILD/V4',requestId:q.requestId,result:{projection,operationDigest:D('operations',projection),readBounds:q.targetFacts.sampledBounds,writeBounds:q.build.declaredBounds},error:null};
  }});
  ctx.provide('hanaworldsPainterV2PictureBlocks',{contractHandshake:C.contractHandshake,protocolHandshake:handshake('fixture-painter','painter',5),async call(op,q){
   assert.equal(op,'ValidateBuildProposal');C.validateBuildProposalRequest(q);const facts=await ws.readBuildProposalProviderFacts(q);C.validateBuildProposalContext(q,facts);f.painterRequests.push({request:clone(q),facts:clone(facts)});const result=clone(f.responseCase.response.result);result.invocationId=q.invocationId;return {contractVersion:'painter/v5',requestId:q.requestId,result,error:null};
  }});
  await ctx.plugin(Workshop).await();ws=ctx.get('hanaworldsWorkshop');
  for(const id of ['s1','s2']){const w=await ctx.sessionPersistence.create(header(id));await w.append([{type:'turn/start',seq:0,time:99,data:{turn:1}}]);await w.close();}
  const append=async(id,event)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
  const wire=async(op,fields,id='s1')=>ws.call(op,{contractVersion:'session/v4',sessionRef:id,...fields});
  const bind=async(id='s1')=>{const a=await wire('StartOrResumeSession',{requestId:'start',expectedRevision:null},id);assert.equal(a.error,null,JSON.stringify(a));const b=await wire('SwitchWorldContext',{requestId:'switch',expectedRevision:a.result.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local},id);assert.equal(b.error,null,JSON.stringify(b));};
  const tool=async(args,id='s1')=>{const out=await ctx.tools.execute({name:'hanaworlds_context',callId:'context-'+Math.random(),arguments:args,signal:new AbortController().signal,agent:{ctx,session:{header:header(id)}}});return {...out,json:out.isError?null:JSON.parse(out.value.result),text:out.content.map(x=>x.text??'').join('')};};
  const requireTool=async(args,id='s1')=>{const a=await tool(args,id);assert.equal(a.isError,false,a.text);return a.json;};
  await fn({ctx,ws,f,wire,bind,append,tool,requireTool,root});
  observations.push({runtimeRoot:root,calls:f.calls,painterRequests:f.painterRequests,fixtureApplies:f.applies,scope:'SOURCE/FIXTURE; actual official Core/Tools/storage/Workshop, peer fixtures; no model/native/real World writes'});
 }finally{await ws?.projectionStore.close();await ctx.fiber.dispose();}
}
const dimensions={width:3,depth:1,height:1};
const preparedFields={purpose:'first building',...dimensions,siteRules:sample.request.referenceBrief.controls.siteRules,imageRefs:[]};
async function proposeA(r){await r.bind();await r.append('s1',user('ask','请先选格并展示给我确认'));const source=await r.requireTool({action:'placement',...dimensions});const prepared=await r.requireTool({action:'prepare',...preparedFields,placementSourceRef:source.placementSourceRef,placementTarget:fixture.placements.A.target});return {source,prepared};}
async function confirm(r,id='yes'){await r.append('s1',user(id,'确认'));return r.requireTool({action:'confirm'});}

test('structured A is publicly displayed, confirmed by a new human, retained across a new view and reaches exact callback/apply',async()=>setup(async r=>{
 assert.deepEqual(r.ws.protocolHandshake.protocols.map(p=>({...p})),[{protocol:'session',major:4,minor:0}]);
 const {source,prepared}=await proposeA(r);
 assert.deepEqual(source.inspection,fixture.inspections.view1);assert.deepEqual(prepared.placement,fixture.placements.A);
 assert.ok(prepared.clarification.question.includes(JSON.stringify(fixture.placements.A.target)),'authoritative question shows the exact structured target');
 assert.equal((await r.tool({action:'confirm'})).isError,true,'model cannot self-confirm');
 await confirm(r);r.f.inspection=clone(fixture.inspections.view2);
 const read=await r.requireTool({action:'read'});assert.deepEqual(read.context.regionInspection,fixture.inspections.view1);assert.equal(C.canonicalJSON(C.confirmedPlacementOf(read.context.intent,read.context.referenceBrief)),C.canonicalJSON(fixture.placements.A));
 assert.equal(r.f.calls.filter(c=>c.op==='InspectPlacementRegion').length,1,'no post-confirmation re-sampling/rebase');
 const request={...read.context,requestId:read.proposalRef+':proposal',proposal:clone(sample.request.proposal)};
 const out=await r.ws.submitBuildProposal(request);assert.equal(out.error,null,JSON.stringify(out));assert.equal(r.f.painterRequests.length,1);
 assert.deepEqual(await r.ws.submitBuildProposal(request),out,'exact request replay retains result');assert.equal(r.f.painterRequests.length,1,'no redispatch');
 const apply=await r.wire('AdvanceCurrentBuild',{requestId:'advance',worldRef:local.worldRef,expectedTurnRevision:read.context.turnRevision,localContext:local});assert.equal(apply.error,null,JSON.stringify(apply));assert.equal(r.f.applies.length,1);
 assert.equal(C.canonicalJSON(r.f.applies[0].regionInspectionBinding.confirmedPlacement),C.canonicalJSON(C.confirmedPlacementBinding(read.context.intent)));
}));

test('an anchored extent is confirmed once and permits the published subset effect set inside it',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','请展示整个定位范围'));
 const source=await r.requireTool({action:'placement',...dimensions});r.f.responseCase=fixture.perCell.accept[1];
 const target=r.f.responseCase.request.intent.confirmedIntent.placement.target;
 const prepared=await r.requireTool({action:'prepare',...preparedFields,placementSourceRef:source.placementSourceRef,placementTarget:target});assert.deepEqual(prepared.placement.target,target);
 await confirm(r);const read=await r.requireTool({action:'read'});
 const out=await r.ws.submitBuildProposal({...read.context,requestId:read.proposalRef+':proposal',proposal:clone(r.f.responseCase.request.proposal)});assert.equal(out.error,null,JSON.stringify(out));
 const apply=await r.wire('AdvanceCurrentBuild',{requestId:'advance-extent',worldRef:local.worldRef,expectedTurnRevision:read.context.turnRevision,localContext:local});assert.equal(apply.error,null,JSON.stringify(apply));assert.equal(r.f.applies[0].operations.effects.length,2);assert.equal(r.f.applies[0].regionInspectionBinding.confirmedPlacement.placement.target.kind,'ANCHORED_EXTENT');
}));

test('a direct wire cannot fabricate an unretained placement and leave an orphan turn',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','请先提议位置'));
 const snap=await r.wire('StartOrResumeSession',{requestId:'snapshot',expectedRevision:null});
 const rejected=await r.wire('AppendMultimodalTurn',{requestId:'ask',turnRef:'text:ask',text:'请先提议位置',media:[],controls:clone(sample.request.referenceBrief.controls),localContext:local,expectedRevision:snap.result.context.sessionRevision});
 assert.equal(rejected.error.code,'INTENT_UNCONFIRMED');assert.equal(rejected.error.reason,'IDENTITY_UNVERIFIED');
 const after=await r.wire('StartOrResumeSession',{requestId:'snapshot-after',expectedRevision:null});assert.equal(after.result.turns.length,0);assert.equal(r.f.applies.length,0);
}));

test('direct wire cannot prepare an old source after a different actual human request arrived',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','请先提议位置'));await r.requireTool({action:'placement',...dimensions});
 await r.append('s1',user('changed','先不要建，换个要求'));
 const snap=await r.wire('StartOrResumeSession',{requestId:'snapshot',expectedRevision:null});
 const rejected=await r.wire('AppendMultimodalTurn',{requestId:'ask',turnRef:'text:ask',text:'请先提议位置',media:[],controls:clone(sample.request.referenceBrief.controls),localContext:local,expectedRevision:snap.result.context.sessionRevision});
 assert.equal(rejected.error?.code,'INTENT_UNCONFIRMED');assert.equal(rejected.error?.reason,'IDENTITY_UNVERIFIED');
 const after=await r.wire('StartOrResumeSession',{requestId:'snapshot-after',expectedRevision:null});assert.equal(after.result.turns.length,0);assert.equal(r.f.applies.length,0);
}));

test('direct wire must use the public creator bounds check, even with a retained source identity',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','请先提议位置'));r.f.inspection=clone(fixture.inspections.view2);await r.requireTool({action:'placement',...dimensions});
 const snap=await r.wire('StartOrResumeSession',{requestId:'snapshot',expectedRevision:null});
 const placement={...clone(fixture.placements.newB),target:clone(fixture.proposal.reject[0].target)};
 const rejected=await r.wire('AppendMultimodalTurn',{requestId:'ask',turnRef:'text:ask',text:'请先提议位置',media:[],controls:{...clone(sample.request.referenceBrief.controls),placement},localContext:local,expectedRevision:snap.result.context.sessionRevision});
 assert.equal(rejected.error?.code,'TARGET_FACTS_INCOMPLETE');assert.equal(rejected.error?.reason,'INVALID_GEOMETRY');
 const after=await r.wire('StartOrResumeSession',{requestId:'snapshot-after',expectedRevision:null});assert.equal(after.result.turns.length,0);
}));

test('A cannot become B or a new view/frame/world; incomplete or foreign source is refused',async()=>setup(async r=>{
 const {source}=await proposeA(r);await confirm(r);const read=await r.requireTool({action:'read'});
 const request={...read.context,requestId:read.proposalRef+':proposal',proposal:clone(fixture.perCell.reject[0].request.proposal)};
 const rejected=await r.ws.submitBuildProposal(request);assert.equal(rejected.error.code,'INTENT_UNCONFIRMED');assert.equal(rejected.error.reason,'INVALID_GEOMETRY');assert.equal(r.f.painterRequests.length,0);
 for(const inspection of ['view2','view1OtherFrame','otherWorld'])assert.throws(()=>C.requirePlacementSource(fixture.placements.A,fixture.inspections[inspection],local.worldRef));
 await r.bind('s2');await r.append('s2',user('foreign','another proposal'));
 const foreign=await r.tool({action:'prepare',...preparedFields,placementSourceRef:source.placementSourceRef,placementTarget:fixture.placements.A.target},'s2');assert.equal(foreign.isError,true);assert.match(foreign.text,/PLACEMENT_BINDING_CHANGED/);
 assert.equal((await r.tool({action:'prepare',...preparedFields,placementTarget:fixture.placements.A.target},'s2')).isError,true);
 assert.equal(r.f.applies.length,0);
}));

test('new B proposal requires a new human confirmation; old retained A requests become stale',async()=>setup(async r=>{
 await proposeA(r);await confirm(r);const a=await r.requireTool({action:'read'});
 await r.append('s1',user('change','改为新的B位置，请重新提议'));r.f.inspection=clone(fixture.inspections.view2);
 const source=await r.requireTool({action:'placement',...dimensions});const prepared=await r.requireTool({action:'prepare',...preparedFields,placementSourceRef:source.placementSourceRef,placementTarget:fixture.placements.newB.target});assert.deepEqual(prepared.placement,fixture.placements.newB);
 assert.equal((await r.tool({action:'read'})).isError,true);assert.equal((await r.tool({action:'confirm'})).isError,true);
 await confirm(r,'yes-B');const b=await r.requireTool({action:'read'});assert.deepEqual(b.context.intent.confirmedIntent.placement,fixture.placements.newB);assert.notEqual(b.context.intentDigest,a.context.intentDigest);
 r.f.responseCase=fixture.perCell.accept[2];const out=await r.ws.submitBuildProposal({...b.context,requestId:b.proposalRef+':proposal',proposal:clone(r.f.responseCase.request.proposal)});assert.equal(out.error,null,JSON.stringify(out));
 const old=await r.ws.submitBuildProposal({...a.context,requestId:a.proposalRef+':proposal',proposal:clone(sample.request.proposal)});assert.ok(old.error,'old confirmation/context cannot be reused');assert.equal(r.f.applies.length,0);
 const apply=await r.wire('AdvanceCurrentBuild',{requestId:'advance-B',worldRef:local.worldRef,expectedTurnRevision:b.context.turnRevision,localContext:local});assert.equal(apply.error,null,JSON.stringify(apply));assert.equal(r.f.applies.length,1);assert.deepEqual(r.f.applies[0].operations.effects.map(e=>e.position),fixture.placements.newB.target.cells);
}));

test('absent placement uses normal CURRENT_VIEW; stale confirmed revision stops before fixture apply',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('normal','正常当前视野建造'));await r.requireTool({action:'prepare',...preparedFields});await confirm(r);
 r.f.inspection=clone(fixture.inspections.view2);const normal=await r.requireTool({action:'read'});assert.equal(Object.hasOwn(normal.context.intent.confirmedIntent,'placement'),false);assert.equal(Object.hasOwn(normal.context.referenceBrief.controls,'placement'),false);assert.deepEqual(normal.context.regionInspection,fixture.inspections.view2);
 await r.append('s1',user('exact','另提议A'));r.f.inspection=clone(fixture.inspections.view1);const source=await r.requireTool({action:'placement',...dimensions});await r.requireTool({action:'prepare',...preparedFields,placementSourceRef:source.placementSourceRef,placementTarget:fixture.placements.A.target});await confirm(r,'yes-exact');const read=await r.requireTool({action:'read'});
 const out=await r.ws.submitBuildProposal({...read.context,requestId:read.proposalRef+':proposal',proposal:clone(sample.request.proposal)});assert.equal(out.error,null,JSON.stringify(out));r.f.worldRevision=fixture.inspections.view1Later.targetFacts.worldRevision;
 const refused=await r.wire('AdvanceCurrentBuild',{requestId:'stale-advance',worldRef:local.worldRef,expectedTurnRevision:read.context.turnRevision,localContext:local});assert.equal(refused.error.code,'TARGET_FACTS_STALE');assert.equal(r.f.applies.length,0);
}));

test('v1.1 explicit null placement on the public Append wire is refused before a turn or apply',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('null-ask','普通建造'));
 const snap=await r.wire('StartOrResumeSession',{requestId:'snapshot-null',expectedRevision:null});
 const rejected=await r.wire('AppendMultimodalTurn',{requestId:'null-ask',turnRef:'text:null-ask',text:'普通建造',media:[],controls:{...clone(sample.request.referenceBrief.controls),placement:null},localContext:local,expectedRevision:snap.result.context.sessionRevision});
 assert.equal(rejected.error?.code,'SCHEMA_INVALID');const after=await r.wire('StartOrResumeSession',{requestId:'after-null',expectedRevision:null});assert.equal(after.result.turns.length,0);assert.equal(r.f.applies.length,0);
}));

test.after(async()=>{if(process.env.HW_PLACEMENT_EVIDENCE_PATH)await writeFile(process.env.HW_PLACEMENT_EVIDENCE_PATH,JSON.stringify(observations,null,2)+'\n');});
