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
import Workshop from '../src/index.mjs';

// Diagnostic regression, NOT a position-fidelity fix or a product PASS.
// Inputs are mechanically extracted from the completed real 0.5.1 model calls.
// Official Core/Tools/Workshop/storage are actual; Canvas/catalogue/Painter are
// labelled fixtures. No repaired geometry, model, Brush, advance or World write.
const recorded=JSON.parse(await readFile(new URL('./fixtures/confirmed-placement-recorded.json',import.meta.url)));
const schema=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/schema'))));
// The Root model display is not the Catalogue wire. Use the exact full
// context retained in the old Workshop domain, extracted read-only, unchanged.
const context=structuredClone(recorded.retainedFormalContext);
const local=structuredClone(context.localContext);
const results=[];
const rejection=fn=>{try{fn();assert.fail('must reject unsupported/unbound input');}catch(e){assert.ok(e instanceof C.ContractError);return {code:e.code,phase:e.phase,reason:e.reason};}};

test('formal shapes accept the recorded controls and intent, but have no confirmed-position binding',()=>{
  C.validateType('Controls',context.referenceBrief.controls);
  C.validateType('ConfirmedIntent',context.intent.confirmedIntent);
  const positions=recorded.validatedBuild.operations.map(op=>op.min);
  const controlsError=rejection(()=>C.validateType('Controls',{...context.referenceBrief.controls,confirmedPositions:positions}));
  const intentError=rejection(()=>C.validateType('ConfirmedIntent',{...context.intent.confirmedIntent,confirmedPositions:positions}));
  assert.equal(controlsError.code,'UNKNOWN_REQUIRED_FIELD');assert.equal(intentError.code,'UNKNOWN_REQUIRED_FIELD');
  assert.deepEqual(Object.keys(schema.definitions.Controls.properties),['purpose','dimensions','entrancePortalRefs','styleText','siteRules']);
  results.push({test:'formal binding gap',controlsError,intentError,positionsFieldAbsent:true});
});

test('recorded relocated geometry passes payload coherence; changing its bound world is rejected',()=>{
  const request={...context,requestId:recorded.proposalCall.proposalRef+':proposal',proposal:JSON.parse(recorded.proposalCall.proposal)};
  C.validateBuildProposalRequest(request);
  const wrongWorld=rejection(()=>C.validateBuildProposalRequest({...request,worldRef:'different-world'}));
  assert.ok(['INTENT_UNCONFIRMED','TARGET_FACTS_STALE','CURRENT_WORLD_MISMATCH'].includes(wrongWorld.code),JSON.stringify(wrongWorld));
  const anchorError=rejection(()=>C.validateType('PlacementAnchor',{kind:'CURRENT_VIEW',invocationId:'human',confirmedPositions:recorded.validatedBuild.operations.map(op=>op.min)}));
  assert.equal(anchorError.code,'UNKNOWN_REQUIRED_FIELD');
  results.push({test:'actual historical proposal payload',payloadAccepted:true,wrongWorld,anchorError,existingAnchorKinds:schema.definitions.PlacementAnchorKind.enum});
});

test('actual Core/tool chain retains controls, not displayed positions; action-only confirm still samples after confirmation',async()=>{
  const base=process.env.HW_RUNTIME_ROOT;if(!base)throw Error('diagnostic requires own isolated HW_RUNTIME_ROOT');
  await mkdir(base,{recursive:true});const root=await mkdtemp(base+'/confirmed-placement-');
  const ctx=new Context(),calls=[];let painterRequest,facts;
  const id='confirmed-placement-fixture',header={version:SESSION_FORMAT_VERSION,id,createdAt:100,cwd:'/confirmed-placement-diagnostic',isSeeded:false};
  const handshake=(component,protocol,major,capabilities=[])=>({profileVersion:'protocol-handshake/v1',component,protocols:[{protocol,major,minor:0}],capabilities,provenance:{packageName:component,packageVersion:'0.0.0-FIXTURE',sourceRevision:null,artifactDigest:null}});
  const user=(id,text)=>({type:'user/message',time:100,surfaceOp:'append',data:{id,role:'user',source:{kind:'user'},content:[{type:'text',text}]}});
  let ws;
  try {
    await ctx.plugin(Jsonl,{root:root+'/core',compression:'none'}).await();
    await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:root+'/projection'}).await();
    await ctx.plugin(StorageDomain,{backend:'json'}).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();
    ctx.provide('hanaworldsCapabilities',{providerRef:'fixture-host',capabilityRevision:'fixture',worldRef:local.worldRef,engineBounds:context.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile:{profileVersion:'state-profile/v2',nodeFields:['nodeName','param1','param2'],metadataMode:'exact',inventoryMode:'exact',timerMode:'exact',derivedLightMode:'recompute-with-readback'},sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null});
    ctx.provide('hanaworldsCanvasV5',{contractHandshake:C.contractHandshake,protocolHandshake:handshake('fixture-canvas','canvas',6),async call(op,q){
      C.validateBoundRequest('canvas/v6',op,q);calls.push({op,request:structuredClone(q)});
      if(op==='ReadWorldSelectionContext')return {contractVersion:'canvas/v6',requestId:q.requestId,error:null,result:{sessionRef:id,worldRef:local.worldRef,inventory:{capabilityRevision:'fixture',connections:[]},selection:{status:'BOUND',connectionRef:local.connectionRef,context:{currentSession:id,activeWorldRef:local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'fixture',selectionRevision:local.selectionRevision,localContext:structuredClone(local)}}}};
      if(op==='InspectPlacementRegion')return {contractVersion:'canvas/v6',requestId:q.requestId,error:null,guardRefusal:null,unavailableSettings:null,result:{outcome:'REGION_INSPECTED',inspection:structuredClone(context.regionInspection)}};
      throw Error('NO_WORLD_OPERATION_ALLOWED:'+op);
    }});
    ctx.provide('hanaworldsCatalogue',{read:async()=>structuredClone(context.catalogue)});
    ctx.provide('hanaworldsBrushV3',{protocolHandshake:handshake('fixture-brush','BUILD',4,['BUILD/V4:per-cell-compile'])});
    ctx.provide('hanaworldsPainterV2PictureBlocks',{protocolHandshake:handshake('fixture-painter','painter',5),async call(op,q){
      assert.equal(op,'ValidateBuildProposal');C.validateBuildProposalRequest(q);
      painterRequest=structuredClone(q);facts=await ws.readBuildProposalProviderFacts(q);C.validateBuildProposalContext(q,facts);
      throw Error('DIAGNOSTIC_STOP_BEFORE_PAINTER_RESULT');
    }});
    await ctx.plugin(Workshop).await();ws=ctx.get('hanaworldsWorkshop');
    const w=await ctx.sessionPersistence.create(header);await w.append([{type:'turn/start',seq:0,time:99,data:{turn:1}}]);await w.close();
    const append=async event=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
    const call=async(op,fields)=>{const out=await ws.call(op,{contractVersion:'session/v4',sessionRef:id,...fields});assert.equal(out.error,null,JSON.stringify(out));return out.result;};
    const start=await call('StartOrResumeSession',{requestId:'start',expectedRevision:null});
    await call('SwitchWorldContext',{requestId:'bind',expectedRevision:start.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});
    const tool=async args=>{const out=await ctx.tools.execute({name:'hanaworlds_context',callId:'diagnostic-'+args.action,arguments:args,signal:new AbortController().signal,agent:{ctx,session:{header}}});assert.equal(out.isError,false,JSON.stringify(out));return JSON.parse(out.value.result);};
    await append(user('ask',context.referenceBrief.text));
    const prepare=await tool(recorded.prepare);assert.equal(calls.filter(c=>c.op==='InspectPlacementRegion').length,0,'no facts capture before displayed position approval');
    await append({type:'step/start',time:101,data:{turn:1,step:1}});
    await append({type:'assistant/message',time:101,surfaceOp:'append',data:{turn:1,step:1,stream:[],message:structuredClone(recorded.displayedAssistant)}});
    await append(user('actual-human-confirm','确认'));
    await tool({action:'confirm'}); // exact 0.5.2 action-only guidance, no argument change
    const read=await tool({action:'read'});
    assert.deepEqual(read.context.referenceBrief.controls,context.referenceBrief.controls);
    assert.equal(read.context.referenceBrief.text,context.referenceBrief.text);
    assert.equal(read.context.referenceBrief.text.includes('(20, 9, -2)'),false);
    assert.deepEqual(read.context.targetFacts.knownEmptyCells,context.targetFacts.knownEmptyCells);
    const inspection=calls.find(c=>c.op==='InspectPlacementRegion');
    assert.deepEqual(inspection.request.anchor,{kind:'CURRENT_VIEW',invocationId:'actual-human-confirm'});
    const request={...read.context,requestId:read.proposalRef+':proposal',proposal:JSON.parse(recorded.proposalCall.proposal)};
    const stopped=await ws.submitBuildProposal(request);
    assert.ok(painterRequest,'relocated request must reach the fixture Painter after Workshop admission: '+JSON.stringify(stopped));
    assert.deepEqual(painterRequest,request);assert.deepEqual(facts.sourceContext,read.context);
    assert.equal(facts.requestFacts.replay,'NEW');assert.equal(stopped.result,null);
    const unretained=await ws.readBuildProposalProviderFacts({...request,requestId:request.requestId+'-foreign'}).catch(e=>e);
    assert.equal(unretained.code,'TRANSACTION_CONFLICT');
    const record={test:'current 0.5.2 actual public tool flow',scope:'SOURCE/FIXTURE observation of missing binding, NOT fixed/REAL',runtimeRoot:root,prepared:prepare,readContext:read,inspectionRequest:inspection.request,painterRequest,retainedFacts:facts,stoppedBeforePainterResult:stopped,unretainedError:unretained.code,modelCalls:0,worldWrites:0,advanceCalls:0,geometrySource:recorded.sourceEvidence+' seq148 unchanged'};
    results.push(record);
    await writeFile(root+'/observation.json',JSON.stringify(record,null,2)+'\n');
  } finally {await ws?.projectionStore.close();await ctx.fiber.dispose();}
});

test.after(async()=>{if(process.env.HW_PLACEMENT_EVIDENCE_PATH)await writeFile(process.env.HW_PLACEMENT_EVIDENCE_PATH,JSON.stringify(results,null,2)+'\n');});
