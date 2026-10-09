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
// S1-WS-WRITE-TOOLS-01 on the current formal contracts: two WriteMethodDescriptors, PER_CELL and REGION chains.
// Painter/Brush/Canvas (cells and region) and the world are FIXTURE; Workshop, Cordis, Core JSONL, domain storage, attachments, Tools and HTTP are real.
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
 f.capabilities={providerRef:'fixture-host',capabilityRevision:'cap-1',worldRef:f.local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile,sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null};
 f.painter={contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('hanaworlds-building-exterior-painter','painter',5),async call(op,q){f.calls.push(op);C.validateBuildProposalRequest(q);const facts=await f.readFacts(q);C.validateBuildProposalContext(q,facts);f.painterContexts.push(clone(facts.sourceContext));
   const result=clone(sample.response.result);result.invocationId=q.invocationId;return {contractVersion:'painter/v5',requestId:q.requestId,result,error:null};}};
 f.brush={contractHandshake:C.contractHandshake,protocolHandshake:BUILD_PROTOCOL(),async compile(q){f.calls.push('BuildDocument');C.validateBoundRequest('BUILD/V4','BuildDocument',q);
   const effects=[{position:clone(q.build.operations[0].min),...q.build.materials[q.build.operations[0].materialRef]}];
   const projection={contractVersion:'operations/v3',buildDigest:q.buildDigest,compilerRevision:q.compilerRevision,compilationConfigDigest:q.compilationConfigDigest,worldRef:q.worldRef,frameDigest:q.targetFacts.frameDigest,catalogueDigest:q.catalogueDigest,targetFactsDigest:q.targetFactsDigest,effects};
   return {contractVersion:'BUILD/V4',requestId:q.requestId,result:{projection,operationDigest:D('operations',projection),readBounds:q.targetFacts.sampledBounds,writeBounds:q.build.declaredBounds},error:null};}};
 const row=r=>({transactionId:r.transactionId,originTransactionId:null,affectedObjectRefs:['object-1'],operationDigest:r.operationDigest,beforeImageDigest:'d'.repeat(64),expectedAfterReadbackDigest:r.readbackDigest,receiptDigest:D('receipt',r),historyRevision:'history-1',status:'VERIFIED'});
 f.canvas={contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('hanaworlds-canvas','canvas',6),async call(op,q){f.calls.push(op);C.validateBoundRequest('canvas/v6',op,q);
   const ok=result=>({contractVersion:'canvas/v6',requestId:q.requestId,result,error:null,...(['ApplyRecoverableCommit','Undo','Redo','RecoverPendingUndo','ReadPendingUndoResult','InspectPlacementRegion'].includes(op)?{guardRefusal:null}:{})});
   if(op==='ReadWorldSelectionContext')return ok({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap-1',connections:[]},selection:{status:'BOUND',connectionRef:f.local.connectionRef,context:ctx()}});
   if(op==='InspectPlacementRegion')return {...ok({outcome:'REGION_INSPECTED',inspection:clone(sample.request.regionInspection)}),unavailableSettings:null};
   if(op==='ListObjects')return ok({worldRef:q.worldRef,registryRevision:'registry-1',objects:f.receipt?[{worldRef:q.worldRef,objectRef:'object-1',objectRevision:f.undone?'object-2':'object-1',displayName:'石块',nameRevision:'name-1',creationSequence:1,status:'READY'}]:[]});
   if(op==='AnalyzeAffectedObjects')return ok({contractVersion:'canvas/v6',worldRef:q.worldRef,worldRevision:q.expectedRevision,registryRevision:q.expectedRegistryRevision,selectionRevision:q.expectedSelectionRevision,operationDigest:q.operationDigest,orderedSelectedRefs:[],affectedObjectRefs:[]});
   if(op==='ApplyRecoverableCommit'){f.writes++;f.receipt={contractVersion:'canvas/v6',transactionId:q.transactionId,operationDigest:q.operationDigest,transactionPayloadDigest:'a'.repeat(64),status:'VERIFIED',previousWorldRevision:q.expectedWorldRevision,observedWorldRevision:'world-after',readbackDigest:'c'.repeat(64),restoreStatus:'NOT_REQUIRED',error:null,localContext:clone(f.local),guardRefusal:null,applyFailure:null};f.history=[row(f.receipt)];return ok(f.receipt);}
   if(op==='Readback')return ok(f.receipt);
   if(op==='HistoryQuery')return ok({worldRef:q.worldRef,objectRef:q.objectRef,historyRevision:f.undone?'history-2':'history-1',headTransactionId:f.undone?(f.badUndoHead?null:f.history.at(-1).transactionId):f.receipt.transactionId,entries:clone(f.history),undoAvailable:!f.undone,redoAvailable:!!f.undone});
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
  for(const [k,v] of Object.entries({hanaworldsCanvasV5:f.canvas,hanaworldsPainterV2PictureBlocks:f.painter,hanaworldsBrushV3:f.brush,hanaworldsCatalogue:{read:async()=>clone(sample.request.catalogue)},hanaworldsCompilerConfig:{read:async()=>({compilationConfig:config,compilerRevision:'fixture-compiler'})},hanaworldsCapabilities:f.capabilities,...(f.region?{hanaworldsPainterRegionV1:f.region.painter,hanaworldsBrushRegionV1:f.region.brush,hanaworldsCanvasRegionV1:f.region.canvas}:{}),llm:{async *stream(){f.modelCalls++;throw Error('second model forbidden');}}}))ctx.provide(k,v);
  await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');f.readFacts=q=>ws.readBuildProposalProviderFacts(q);
  const append=async(id,event)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append([{...event,seq:log.events.length}]);}finally{await w.close();}};
  try{await fn({ctx,ws,append,url:`http://127.0.0.1:${server.address().port}/picture`,requests:()=>requests});}finally{await ws.projectionStore.close();}
 }finally{await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
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

const W=await import(entry);
const pkg=JSON.parse(await readFile(join(entryDir,'..','package.json')));
const log=(evidence,value)=>console.log(JSON.stringify({evidence,workshop:pkg.version,contracts:C.contractHandshake.contracts,...value}));
const codes=a=>a.unmet.map(u=>u.code);
const sha=(k,v)=>C.digestValue(k,v).sha256;
const caps=wire=>C.regionCapabilities.map(c=>c.id).filter(id=>id.startsWith(`${wire}:`));
const handshake=(component,protocol,major,minor,capabilities,packageVersion='9.9.9-fixture')=>({profileVersion:'protocol-handshake/v1',component,protocols:[{protocol,major,minor}],capabilities:[...capabilities].sort(),provenance:{packageName:component,packageVersion,sourceRevision:null,artifactDigest:null}});
// Canvas5 is an explicit future public-protocol FIXTURE, not a declaration of actual Canvas0.5.1.
function CELL_PROTOCOL(component,protocol,major,minor=0){return {profileVersion:'protocol-handshake/v1',component,protocols:[{protocol,major,minor}],capabilities:[],provenance:{packageName:component,packageVersion:'0.0.99-fixture',sourceRevision:'a'.repeat(40),artifactDigest:'b'.repeat(64)}};}
// FIXTURE per-cell Brush advertises the public ProtocolHandshake shape the actual BrushV3 publishes.
function BUILD_PROTOCOL(major=4,capabilities=['BUILD/V4:per-cell-compile','region-build/v1:compile-mapblock-chunks'],packageVersion='0.5.0'){return {profileVersion:'protocol-handshake/v1',component:'hanaworlds-brush',protocols:[{protocol:'BUILD',major,minor:0},{protocol:'region-build',major:1,minor:0}],capabilities:[...capabilities].sort(),provenance:{packageName:'hanaworlds-brush',packageVersion,sourceRevision:packageVersion==='0.5.0'?null:'f'.repeat(40),artifactDigest:packageVersion==='0.5.0'?null:'e'.repeat(64)}};}
const STONE={nodeName:'fixture:stone',param2:0},AIR={nodeName:'air',param2:0};
const boxOf=b=>({min:[...b.origin],max:b.origin.map((o,a)=>o+b.size[a]-1)});
const cellsOf=box=>{const out=[];for(let z=box.min[2];z<=box.max[2];z++)for(let y=box.min[1];y<=box.max[1];y++)for(let x=box.min[0];x<=box.max[0];x++)out.push([x,y,z]);return out;};
// Flat fixture world: y<=0 stone, y>0 air. Region states are produced with the contract's own helpers.
const flatState=(worldRef,box)=>C.validateType('RegionState',{profileVersion:'region-state/v1',worldRef,block:C.encodeRegionBlock({origin:box.min,size:box.max.map((v,a)=>v-box.min[a]+1),palette:[AIR,STONE],indices:Int32Array.from(cellsOf(box),p=>p[1]<=0?1:0)}),extras:[],derivedLightMode:'recompute-with-readback'});
const nodeAt=(states,p)=>{for(const s of Object.values(states)){const e=C.expandRegionBlock(s.block),b=e.box;if(p.every((v,a)=>v>=b.min[a]&&v<=b.max[a])){const sx=b.max[0]-b.min[0]+1,sy=b.max[1]-b.min[1]+1;const i=(p[0]-b.min[0])+sx*((p[1]-b.min[1])+sy*(p[2]-b.min[2]));return e.palette[e.indices[i]].nodeName;}}return null;};
function regionPeers(f,{canvasMajor=2}={}){
 const r={calls:[],writes:0,undoWrites:0,painterMedia:[],world:{},rollback:false};
 r.painter={protocolHandshake:handshake('fixture-painter','painter-region',2,2,caps('painter-region/v2')),async call(op,q){r.calls.push(op);assert.equal(op,'ValidateRegionProposal');C.validateRegionProposalRequest(q);r.painterMedia.push(structuredClone(q.referenceBrief.media));
   const build={contractVersion:'region-build/v1',documentId:`region-doc-${q.invocationId}`,coordinateSpace:'WORLD_NODE',worldRef:q.worldRef,catalogueDigest:q.catalogueDigest,block:q.proposal.block,declaredBounds:C.regionBlockBox(q.proposal.block)};
   return {contractVersion:'painter-region/v2',requestId:q.requestId,result:{invocationId:q.invocationId,build,buildDigest:sha('region-build',build)},error:null};}};
 r.brush={protocolHandshake:handshake('fixture-brush','region-build',1,0,caps('region-build/v1')),async call(op,q){r.calls.push(op);assert.equal(op,'CompileRegionBuild');C.validateCompileRegionBuildRequest(q);
   const e=C.expandRegionBlock(q.build.block),b=e.box,sx=b.max[0]-b.min[0]+1,sy=b.max[1]-b.min[1]+1,chunks=[];
   for(const c of C.regionChunksOfBox(b)){const idx=Int32Array.from(cellsOf(c.box),p=>e.indices[(p[0]-b.min[0])+sx*((p[1]-b.min[1])+sy*(p[2]-b.min[2]))]);
    if(idx.every(v=>v===-1))continue;chunks.push({chunkPos:[...c.chunkPos],block:C.encodeRegionBlock({origin:c.box.min,size:c.box.max.map((v,a)=>v-c.box.min[a]+1),palette:e.palette,indices:idx})});}
   const projection={contractVersion:'region-operations/v1',buildDigest:q.buildDigest,compilerRevision:q.compilerRevision,worldRef:q.worldRef,catalogueDigest:q.catalogueDigest,chunkEdge:16,chunks};
   return {contractVersion:'region-build/v1',requestId:q.requestId,result:{projection,operationDigest:sha('region-operations',projection),writeBounds:q.build.declaredBounds},error:null};}};
 r.canvas={protocolHandshake:handshake('fixture-canvas','canvas-region',canvasMajor,0,caps('canvas-region/v2')),async call(op,q){r.calls.push(op);assert.deepEqual(structuredClone(q.localContext),f.local);
   const ok=result=>({contractVersion:'canvas-region/v2',requestId:q.requestId,result,error:null,guardRefusal:null,applyFailure:null});
   const lightBox=chunks=>({min:[0,1,2].map(a=>Math.min(...chunks.map(c=>C.regionBlockBox(c.block).min[a]))),max:[0,1,2].map(a=>Math.max(...chunks.map(c=>C.regionBlockBox(c.block).max[a])))});
   if(op==='ApplyRegionCommit'){
    const before=q.operations.chunks.map(c=>({chunkPos:c.chunkPos,state:r.world[c.chunkPos]??flatState(q.worldRef,C.regionBlockBox(c.block))}));
    const after=before.map((b,i)=>({chunkPos:b.chunkPos,state:C.expectedRegionState(b.state,q.operations.chunks[i].block)}));
    const beforeSummary=C.summarizeRegionStates(q.worldRef,before),expectedAfterSummary=C.summarizeRegionStates(q.worldRef,after);
    const content={profileVersion:'region-snapshot-content/v1',worldRef:q.worldRef,chunks:before.map(b=>({chunkPos:b.chunkPos,state:b.state,stateDigest:sha('region-state',b.state)}))};
    const gz=gzipSync(Buffer.from(C.canonicalJSON(content)));
    const snapshot={profileVersion:'region-snapshot/v1',contentDigest:sha('region-snapshot-content',content),beforeSummaryDigest:sha('region-summary',beforeSummary),compression:'gzip',compressedSha256:createHash('sha256').update(gz).digest('hex'),compressedByteLength:gz.length};
    C.validateRegionSnapshotContent(content,snapshot,beforeSummary);
    if(r.refusal)return {contractVersion:'canvas-region/v2',requestId:q.requestId,result:null,error:{...C.guardRefusalError(r.refusal),transactionRef:q.transactionId},guardRefusal:r.refusal,applyFailure:null};
    r.writes++;if(!r.rollback)for(const a of after)r.world[a.chunkPos]=a.state;else for(const b of before)r.world[b.chunkPos]=b.state;
    r.before=before;r.commit={transactionId:q.transactionId,worldRef:q.worldRef,status:r.rollback?'ROLLED_BACK':'VERIFIED',operationDigest:q.operationDigest,beforeSummary,expectedAfterSummary,actualSummary:r.rollback?beforeSummary:expectedAfterSummary,snapshot,historyRevision:'region-history-1',lighting:{status:'COMPLETE',box:lightBox(q.operations.chunks),method:'fixture:voxelmanip.calc_lighting+write_to_map'},affectedObjectRefs:[],localContext:structuredClone(q.localContext)};
    r.lightBox=r.commit.lighting.box;return ok(r.commit);}
   if(op==='UndoRegionCommit'){assert.equal(q.originTransactionId,r.commit.transactionId);assert.equal(q.expectedHistoryRevision,r.commit.historyRevision);
    if(r.undoRefusal){r.calls.push('UndoRefused');return {contractVersion:'canvas-region/v2',requestId:q.requestId,result:null,error:C.guardRefusalError(r.undoRefusal),guardRefusal:r.undoRefusal,applyFailure:null};}
    const pre=C.summarizeRegionStates(q.worldRef,r.before.map(b=>({chunkPos:b.chunkPos,state:r.world[b.chunkPos]})));
    r.undoWrites++;for(const b of r.before)r.world[b.chunkPos]=b.state;
    return ok({originTransactionId:q.originTransactionId,undoTransactionId:q.undoTransactionId,worldRef:q.worldRef,status:'VERIFIED',originBeforeSummaryDigest:sha('region-summary',r.commit.beforeSummary),originAfterSummaryDigest:sha('region-summary',r.commit.actualSummary),preUndoSummary:pre,actualSummary:r.commit.beforeSummary,historyRevision:'region-history-2',lighting:{status:'COMPLETE',box:r.lightBox,method:'fixture:voxelmanip.calc_lighting+write_to_map'},localContext:structuredClone(q.localContext)});}
   throw Error(`unexpected region fixture operation ${op}`);}};
 return r;
}
// Region spans mapblocks x 0/1 and y -1/0: y=-1 explicit air (dig), y=0 unspecified (kept), y=1 stone (fill).
const REGION_BOX={min:[0,-1,0],max:[19,1,2]};
const regionBlock=()=>C.encodeRegionBlock({origin:REGION_BOX.min,size:[20,3,3],palette:[AIR,STONE],indices:Int32Array.from(cellsOf(REGION_BOX),p=>p[1]===-1?0:p[1]===0?-1:1)});

test('two contract WriteMethodDescriptors: purpose, input type, typical scale in cells, required capabilities; no threshold field',()=>{
 const facts={ports:{}};
 const tools=W.WRITE_METHODS.map(m=>W.describeWriteMethod(m,facts));assert.deepEqual(tools.map(t=>t.descriptor.method),['PER_CELL','REGION']);
 for(const t of tools){const d=t.descriptor;assert.deepEqual(Object.keys(d).sort(),['inputType','method','purpose','requiredCapabilities','scaleUnit','toolName','typicalScale','unavailableReason']);
  C.validateType('WriteMethodDescriptor',d);assert.equal(d.scaleUnit,'cells');assert.match(d.typicalScale,/not a limit/);assert.match(d.typicalScale,/never truncates/);
  for(const k of ['whenToUse','notFor','input'])assert.ok(t.guidance[k].length>20);}
 assert.deepEqual(tools.map(t=>t.descriptor.inputType),['BuildProposal','RegionProposal']);
 assert.deepEqual(tools[0].descriptor.requiredCapabilities,['BUILD/V4:per-cell-compile']);
 assert.deepEqual(tools[1].descriptor.requiredCapabilities,[...caps('canvas-region/v2'),...caps('painter-region/v2'),...caps('region-build/v1')].sort());
 assert.match(tools[1].guidance.input,/null means unspecified and is never air/);
 assert.match(W.writeToolSkillGuidance,/not limits/);assert.match(W.writeToolSkillGuidance,/do not silently switch methods or shrink the target/);
 assert.ok(tools[1].descriptor.unavailableReason.includes('PEER_UNAVAILABLE'));
 log('WRITE_METHOD_DESCRIPTORS',{tools,skillGuidance:W.writeToolSkillGuidance});
});

test('protocol major + capability: same major other minor/provenance accepted; wrong major, missing capability, exact-only peer rejected',()=>{
 const ports=over=>({painterRegion:{protocolHandshake:handshake('p','painter-region',2,7,caps('painter-region/v2'),'0.0.1')},brushRegion:{protocolHandshake:handshake('b','region-build',1,0,caps('region-build/v1'),'3.1.4')},canvasRegion:{protocolHandshake:handshake('c','canvas-region',2,1,caps('canvas-region/v2'),'0.9.0-other-patch')},...over});
 const same=W.evaluateWriteMethod('REGION',{ports:ports({})});assert.equal(same.available,true,JSON.stringify(same));
 const major=W.evaluateWriteMethod('REGION',{ports:ports({canvasRegion:{protocolHandshake:handshake('c','canvas-region',3,0,caps('canvas-region/v2'))}})});assert.deepEqual(codes(major),['UNSUPPORTED_VERSION']);
 const cap=W.evaluateWriteMethod('REGION',{ports:ports({brushRegion:{protocolHandshake:handshake('b','region-build',1,0,[])}})});assert.deepEqual(codes(cap),['CAPABILITY_UNAVAILABLE']);
 const exact=W.evaluateWriteMethod('REGION',{ports:ports({painterRegion:{contractHandshake:C.contractHandshake}})});assert.deepEqual(codes(exact),['UNSUPPORTED_VERSION']);
 const absent=W.evaluateWriteMethod('REGION',{ports:{}});assert.deepEqual(codes(absent),['PEER_UNAVAILABLE','PEER_UNAVAILABLE','PEER_UNAVAILABLE']);
 const cellBrushMajor=W.evaluateWriteMethod('PER_CELL',{ports:{painter:{contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('p','painter',5)},canvas:{contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('c','canvas',6)},brush:{contractHandshake:C.contractHandshake,protocolHandshake:handshake('b','BUILD',5,0,['BUILD/V4:per-cell-compile'])}}});
 assert.deepEqual(codes(cellBrushMajor),['UNSUPPORTED_VERSION']);
 assert.deepEqual(codes(W.evaluateWriteMethod('BULK',{})),['UNKNOWN_WRITE_METHOD']);
 for(const u of [...major.unmet,...cap.unmet,...exact.unmet,...absent.unmet])assert.ok(u.need&&u.remedy);
 log('PROTOCOL_MAJOR_CAPABILITY',{sameMajorOtherMinorAndProvenance:same,wrongMajor:major,missingCapability:cap,exactOnlyPeer:exact,absent,perCellBrushWrongMajor:cellBrushMajor});
});

test('Region provider facts: retained callback is reentrant, readonly and bound to current Core/Canvas facts',async()=>{
 const f=fixture();f.region=regionPeers(f);const R=f.region;
 await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);
  const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'facts-context'});
  const request={...context,requestId:'facts-proposal',proposal:{decision:'REGION',block:regionBlock()}};
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'TRANSACTION_CONFLICT'});
  const original=R.painter.call;let callbackFacts;
  R.painter.call=async(op,q)=>{
   assert.ok(r.ws.locks.has('s1'),'submit retains the mutation lock throughout the callback');
   const identity=await r.ws.readSessionMetadata('s1');
   const before=await r.ws.projectionStore.get('s1',identity.header);
   callbackFacts=await r.ws.readRegionProposalProviderFacts(q);
   assert.deepEqual(C.validateCurrentRequest('painter-region/v2',op,q,callbackFacts).disposition,'EXECUTE');
   assert.deepEqual(callbackFacts,{currentContext:f.local,sessionRef:'s1',currentTurnRevision:context.turnRevision,currentBriefDigest:context.referenceBriefDigest,requestState:'ACTIVE',replay:'NEW',priorRequestDigest:null});
   assert.deepEqual(await r.ws.projectionStore.get('s1',identity.header),before,'fact reads do not save a projection');
   await assert.rejects(r.ws.readRegionProposalProviderFacts({...q,requestId:'wrong'}),{code:'TRANSACTION_CONFLICT'});
   await assert.rejects(r.ws.readRegionProposalProviderFacts({...q,invocationId:'wrong'}),{code:'TRANSACTION_CONFLICT'});
   const otherBrief={...q.referenceBrief,sessionRef:'missing'},otherIntent={...q.intent,referenceBriefDigest:D('reference-brief',otherBrief)};
   const other={...q,sessionRef:'missing',referenceBrief:otherBrief,referenceBriefDigest:D('reference-brief',otherBrief),intent:otherIntent,intentDigest:D('intent',otherIntent)};
   C.validateRegionProposalRequest(other);
   await assert.rejects(r.ws.readRegionProposalProviderFacts(other),{code:'SESSION_NOT_FOUND'});
   await assert.rejects(r.ws.readRegionProposalProviderFacts({...q,proposal:{decision:'REGION',block:{...q.proposal.block,origin:[30,0,0]}}}),{code:'TRANSACTION_CONFLICT'});
   callbackFacts.currentContext.connectionRef='caller-mutated';
   assert.equal((await r.ws.readRegionProposalProviderFacts(q)).currentContext.connectionRef,f.local.connectionRef);
   return original(op,q);
  };
  const submitted=await r.ws.submitWriteProposal('REGION',request);
  assert.equal(submitted.response.error,null,JSON.stringify(submitted.response));
  const completed=await r.ws.readRegionProposalProviderFacts(request);
  assert.equal(completed.replay,'EXACT_REPLAY');assert.equal(completed.requestState,'COMPLETED');
  assert.equal(completed.priorRequestDigest,C.requestDigest('painter-region/v2','ValidateRegionProposal',request));
  assert.equal(C.validateCurrentRequest('painter-region/v2','ValidateRegionProposal',request,completed).disposition,'RETURN_STORED');
  const local=clone(f.local);f.local={...local,connectionRef:'changed-connection'};
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'CURRENT_WORLD_MISMATCH'});f.local=local;
  const catalogue=r.ctx.get('hanaworldsCatalogue');const read=catalogue.read;
  catalogue.read=async world=>{const c=clone(await read(world));c.nodes['fixture:stone'].damagePerSecond=1;return c;};
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'TARGET_FACTS_STALE'});catalogue.read=read;
  await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'new-context'});
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'TARGET_FACTS_STALE'});
  assert.equal(R.writes,0);assert.equal(f.writes,0);assert.equal(f.modelCalls,0);
  log('REGION_PROVIDER_FACTS',{callbackUnderMutationLock:true,readonly:true,exactReplay:true,wrongRequestRejected:true,currentCanvasRejected:true,supersededRejected:true,peers:'FIXTURE',worldWrites:0,modelCalls:0});
 });
});

test('Region provider facts rejects a projection changed during a concurrent readonly fetch',async()=>{
 const f=fixture();f.region=regionPeers(f);
 await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);
  const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'facts-context'});
  const request={...context,requestId:'facts-proposal',proposal:{decision:'REGION',block:regionBlock()}};
  assert.equal((await r.ws.submitWriteProposal('REGION',request)).response.error,null);
  const catalogue=r.ctx.get('hanaworldsCatalogue'),read=catalogue.read;
  let reached,release;const suspended=new Promise(resolve=>reached=resolve),resume=new Promise(resolve=>release=resolve);
  let first=true;catalogue.read=async world=>{if(first){first=false;reached();await resume;}return read(world);};
  const reading=r.ws.readRegionProposalProviderFacts(request);
  const denied=assert.rejects(reading,{code:'TARGET_FACTS_STALE'});
  await suspended;
  await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'replacement-context'});
  release();await denied;catalogue.read=read;
  assert.equal(f.region.writes,0);assert.equal(f.modelCalls,0);
  log('REGION_FACTS_CONCURRENT_CHANGE',{supersededDuringAwaitRejected:true,peers:'FIXTURE',worldWrites:0,modelCalls:0});
 });
});

test('Region provider facts refuses an old retained request after a new Core turn and confirmed brief',async()=>{
 const f=fixture();f.region=regionPeers(f);
 await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);
  const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'facts-context'});
  const request={...context,requestId:'facts-proposal',proposal:{decision:'REGION',block:regionBlock()}};
  assert.equal((await r.ws.submitWriteProposal('REGION',request)).response.error,null);
  await r.append('s1',user('replacement','改成另一座小屋'));
  let current=await call(r,'StartOrResumeSession',{requestId:'current',expectedRevision:null});
  const next=await call(r,'AppendMultimodalTurn',{requestId:'replacement',expectedRevision:current.context.sessionRevision,turnRef:'replacement-turn',text:'另一座小屋',media:[],controls:clone(context.referenceBrief.controls),localContext:f.local});
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'INTENT_UNCONFIRMED'});
  await r.append('s1',user('replacement-confirm','确认'));
  current=await call(r,'StartOrResumeSession',{requestId:'current',expectedRevision:null});
  await call(r,'AnswerClarification',{requestId:'replacement-confirm',expectedRevision:current.context.sessionRevision,turnRef:'replacement-turn',clarificationId:next.clarification.clarificationId,answer:'确认',localContext:f.local});
  await assert.rejects(r.ws.readRegionProposalProviderFacts(request),{code:'TARGET_FACTS_STALE'});
  assert.equal(f.region.writes,0);assert.equal(f.modelCalls,0);
  log('REGION_FACTS_NEW_TURN',{pendingTurnRejected:true,newConfirmedBriefRejected:true,peers:'FIXTURE',worldWrites:0,modelCalls:0});
 });
});

test('REGION fill + explicit-air dig across mapblocks: image brief → Painter → Brush → Canvas one transaction → whole-region Undo',async()=>{
 const f=fixture();f.region=regionPeers(f);const R=f.region;await withRuntime(f,async r=>{
  const {media,advance}=await imageBrief(r,f);
  const described=await r.ws.describeWriteTools('s1');assert.equal(described.tools[1].availability.available,true,JSON.stringify(described.tools[1].availability));assert.equal(described.tools[1].descriptor.unavailableReason,null);
  const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  assert.equal(context.contractVersion,'painter-region/v2');assert.deepEqual(structuredClone(context.referenceBrief.media),[media]);
  const request={...context,requestId:'region-proposal',proposal:{decision:'REGION',block:regionBlock()}};
  const sent=await r.ws.submitWriteProposal('REGION',request);assert.equal(sent.response.error,null,JSON.stringify(sent.response));
  assert.deepEqual(R.painterMedia,[[media]],'verified image media reaches the region Painter');
  assert.deepEqual(await r.ws.submitWriteProposal('REGION',request),sent);assert.equal(R.calls.filter(c=>c==='ValidateRegionProposal').length,1);
  const cellsAdvance=await r.ws.call('AdvanceCurrentBuild',advance);assert.equal(cellsAdvance.error?.code,'UNSUPPORTED_OPERATION');
  const built=await r.ws.advanceRegionBuild({...advance,requestId:'region-advance'});assert.equal(built.error,null,JSON.stringify(built.error));assert.equal(built.outcome,'VERIFIED');
  assert.deepEqual(R.calls,['ValidateRegionProposal','CompileRegionBuild','ApplyRegionCommit']);assert.equal(R.writes,1);assert.equal(f.writes,0);
  const chunks=built.result.beforeSummary.chunks.map(c=>c.chunkPos);assert.ok(chunks.length>=4,'crosses mapblocks');
  const after={dug:nodeAt(R.world,[3,-1,1]),kept:nodeAt(R.world,[3,0,1]),filled:nodeAt(R.world,[18,1,2])};assert.deepEqual(after,{dug:'air',kept:'fixture:stone',filled:'fixture:stone'});
  assert.deepEqual(await r.ws.advanceRegionBuild({...advance,requestId:'region-advance-again'}),{...built});assert.equal(R.writes,1,'no second write');
  assert.deepEqual((await r.ws.describeWriteTools('s1')).currentBuild,{turnRef:'image-turn',method:'REGION',outcome:'VERIFIED',undo:null});
  const undoReq={contractVersion:'session/v4',sessionRef:'s1',requestId:'region-undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:built.result.historyRevision};
  const undone=await r.ws.undoRegionBuild(undoReq);assert.equal(undone.error,null,JSON.stringify(undone.error));assert.equal(undone.outcome,'VERIFIED');
  assert.equal(undone.result.originTransactionId,built.result.transactionId);assert.equal(R.undoWrites,1);
  const restored={dug:nodeAt(R.world,[3,-1,1]),kept:nodeAt(R.world,[3,0,1]),filled:nodeAt(R.world,[18,1,2])};assert.deepEqual(restored,{dug:'fixture:stone',kept:'fixture:stone',filled:'air'});
  assert.deepEqual(await r.ws.undoRegionBuild(undoReq),undone);assert.equal(R.undoWrites,1);
  assert.equal(f.modelCalls,0);
  log('REGION_FILL_DIG_UNDO',{media,painterSawMedia:true,chunks,transactionId:built.result.transactionId,status:built.result.status,snapshot:built.result.snapshot,after,undo:undone.result.status,restored,regionWrites:R.writes,undoWrites:R.undoWrites,cellsWrites:f.writes,modelCalls:f.modelCalls,peers:'FIXTURE'});
 });
});

test('REGION Canvas rollback is surfaced as ROLLED_BACK failure, world unchanged, no Undo',async()=>{
 const f=fixture();f.region=regionPeers(f);f.region.rollback=true;await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  assert.equal((await r.ws.submitWriteProposal('REGION',{...context,requestId:'p',proposal:{decision:'REGION',block:regionBlock()}})).response.error,null);
  const built=await r.ws.advanceRegionBuild({...advance,requestId:'a'});assert.equal(built.error?.code,'APPLY_FAILED');assert.equal(built.error?.mutationState,'ROLLED_BACK');
  assert.equal(nodeAt(f.region.world,[3,-1,1]),'fixture:stone');assert.equal(nodeAt(f.region.world,[18,1,2]),'air');
  const undo=await r.ws.undoRegionBuild({contractVersion:'session/v4',sessionRef:'s1',requestId:'u',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'region-history-1'});
  assert.equal(undo.error?.code,'UNDO_CONFLICT');assert.equal(f.region.undoWrites,0);assert.equal(f.region.writes,1);
  log('REGION_ROLLBACK',{error:built.error,undoError:undo.error,writes:f.region.writes,undoWrites:0});
 });
});

test('REGION engine guard refusal reaches the skill by name (guard, stage, finding), not only an error code; zero writes',async()=>{
 const f=fixture();f.region=regionPeers(f);f.region.refusal={guard:'CELL_PROTECTION',stage:'REGION_APPLY',finding:'PROTECTED_CELL'};await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  assert.equal((await r.ws.submitWriteProposal('REGION',{...context,requestId:'p',proposal:{decision:'REGION',block:regionBlock()}})).response.error,null);
  const built=await r.ws.advanceRegionBuild({...advance,requestId:'a'});
  assert.equal(built.error?.code,'SAFETY_INVARIANT_FAILED');assert.deepEqual(built.guardRefusal,f.region.refusal);assert.equal(built.applyFailure,null);assert.equal(f.region.writes,0);
  log('REGION_GUARD_REFUSAL',{error:built.error,guardRefusal:built.guardRefusal,writes:0});
 });
});

test('rc.3 REGION Undo refused by the engine guard (engine form: restore, no cause, nothing written) is accepted, named for the skill, not pending recovery',async()=>{
 const f=fixture();f.region=regionPeers(f);const R=f.region;await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  assert.equal((await r.ws.submitWriteProposal('REGION',{...context,requestId:'p',proposal:{decision:'REGION',block:regionBlock()}})).response.error,null);
  const built=await r.ws.advanceRegionBuild({...advance,requestId:'a'});assert.equal(built.outcome,'VERIFIED',JSON.stringify(built.error));
  const filled=nodeAt(R.world,[18,1,2]);R.undoRefusal={guard:'CELL_PROTECTION',stage:'REGION_RESTORE',finding:'PROTECTED_CELL'};
  const undoReq={contractVersion:'session/v4',sessionRef:'s1',requestId:'u1',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:built.result.historyRevision};
  const refused=await r.ws.undoRegionBuild(undoReq);
  assert.deepEqual(structuredClone(refused.error),{code:'SAFETY_INVARIANT_FAILED',phase:'restore',retryability:'AFTER_NEW_FACTS',mutationState:'NONE',transactionRef:null,causeCode:null,reason:'SCOPE_DENIED'});
  assert.deepEqual(refused.guardRefusal,R.undoRefusal);assert.equal(refused.applyFailure,null);assert.equal(R.undoWrites,0);assert.equal(nodeAt(R.world,[18,1,2]),filled,'nothing written');
  // Engine form is a zero-write refusal, not RESTORE_FAILED: no pending recovery, Undo can be asked again once facts change.
  delete R.undoRefusal;const undone=await r.ws.undoRegionBuild({...undoReq,requestId:'u2'});assert.equal(undone.outcome,'VERIFIED',JSON.stringify(undone.error));assert.equal(R.undoWrites,1);
  log('REGION_UNDO_ENGINE_FORM_REFUSAL',{error:refused.error,guardRefusal:refused.guardRefusal,undoWritesWhileRefused:0,retry:undone.outcome});
 });
});

test('REGION unavailable on wrong Canvas major: explains needs, zero Painter calls and writes, no fallback; skill may still choose PER_CELL',async()=>{
 const f=fixture();f.region=regionPeers(f,{canvasMajor:3});await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  const sent=await r.ws.submitWriteProposal('REGION',{...context,requestId:'region-proposal',proposal:{decision:'REGION',block:regionBlock()}});
  assert.equal(sent.response.error?.code,'CAPABILITY_UNAVAILABLE');assert.deepEqual(codes(sent.availability),['UNSUPPORTED_VERSION']);
  assert.deepEqual(f.region.calls,[]);assert.equal(f.region.writes,0);assert.equal((await r.ws.describeWriteTools('s1')).currentBuild,null);
  const unknown=await r.ws.submitWriteProposal('BULK',{...context,requestId:'x',proposal:{decision:'REGION',block:regionBlock()}});assert.deepEqual(codes(unknown.availability),['UNKNOWN_WRITE_METHOD']);
  const cellsContext=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'cells-context'});
  const cells=await r.ws.submitWriteProposal('PER_CELL',{...cellsContext,requestId:'cells-proposal',proposal:clone(sample.request.proposal)});assert.equal(cells.response.error,null,JSON.stringify(cells.response));
  log('REGION_WRONG_MAJOR_UNAVAILABLE',{response:sent.response,availability:sent.availability,regionCalls:0,regionWrites:0,unknown:unknown.availability,explicitPerCellAfterwards:'VALIDATED'});
 });
});

test('PER_CELL chain on formal 0.5.3: image brief → Painter → Brush → Canvas → same build Undo',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const before=await r.ws.describeWriteTools('s1');assert.deepEqual(codes(before.tools[0].availability),['SESSION_NOT_FOUND']);
  const {media,advance}=await imageBrief(r,f);const described=await r.ws.describeWriteTools('s1');
  assert.equal(described.tools[0].availability.available,true,JSON.stringify(described.tools[0].availability));assert.deepEqual(codes(described.tools[1].availability),['PEER_UNAVAILABLE','PEER_UNAVAILABLE','PEER_UNAVAILABLE']);
  const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  const sent=await r.ws.submitWriteProposal('PER_CELL',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)});assert.equal(sent.response.error,null,JSON.stringify(sent));
  assert.deepEqual(structuredClone(f.painterContexts[0].referenceBrief.media),[media]);
  const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);
  assert.deepEqual((await r.ws.describeWriteTools('s1')).currentBuild,{turnRef:'image-turn',method:'PER_CELL',outcome:'VERIFIED',undo:null});
  const regionAdvance=await r.ws.advanceRegionBuild({...advance,requestId:'not-region'});assert.equal(regionAdvance.error?.code,'TARGET_REQUIRED');
  const undo=await call(r,'UndoCurrentBuild',{requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(undo.status,'VERIFIED');assert.equal(undo.afterHead.headTransactionId,f.history.at(-1).transactionId);assert.equal(f.undoWrites,1);assert.equal(f.modelCalls,0);
  log('PER_CELL_CHAIN',{before:before.tools.map(t=>t.availability),after:described.tools.map(t=>t.availability),media,outcome:built.outcome,undo:undo.status,canvasWrites:f.writes,undoWrites:f.undoWrites,peers:'FIXTURE'});
 });
});

test('wrong current world connection rejects a REGION proposal before Painter',async()=>{
 const f=fixture();f.region=regionPeers(f);await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('REGION',{...advance,requestId:'region-context'});
  f.local.connectionIncarnationRef='reopened-socket';
  const sent=await r.ws.submitWriteProposal('REGION',{...context,requestId:'p',proposal:{decision:'REGION',block:regionBlock()}});
  assert.ok(['CURRENT_WORLD_MISMATCH','TARGET_FACTS_STALE'].includes(sent.response.error?.code),JSON.stringify(sent.response));
  assert.deepEqual(f.region.calls,[]);assert.equal(f.region.writes,0);
  log('REGION_WRONG_CONNECTION',{error:sent.response.error,regionCalls:0,regionWrites:0});
 });
});

// G2: BrushV3 publishes its handshakes only as methods (handshake(), protocolHandshake(),
// status().contractHandshake|protocolHandshake). Workshop must read those values, never
// require a Host alias property. FIXTURE = method-shaped object matching the public BrushV3
// types; ACTUAL = the real Brush 0.5.0 package BrushV3 when HW_BRUSH_PACKAGE_ENTRY is set.
const methodBrush=(f,protocol=handshake('hanaworlds-brush','BUILD',4,0,['BUILD/V4:per-cell-compile','region-build/v1:compile-mapblock-chunks']),contract=C.contractHandshake)=>{
 const compile=f.brush.compile;const brush={handshake:()=>structuredClone(contract),protocolHandshake:()=>structuredClone(protocol),status:()=>({component:'hanaworlds-brush',contractHandshake:structuredClone(contract),protocolHandshake:structuredClone(protocol)}),compile:q=>compile(q)};
 return brush;
};
async function perCellFlow(f,label){
 await withRuntime(f,async r=>{
  const {media,advance}=await imageBrief(r,f);
  const described=await r.ws.describeWriteTools('s1');const [cells,region]=described.tools;
  assert.equal(cells.availability.available,true,JSON.stringify(cells.availability));assert.equal(cells.descriptor.unavailableReason,null);
  assert.equal(region.descriptor.method,'REGION');assert.deepEqual(codes(region.availability),['PEER_UNAVAILABLE','PEER_UNAVAILABLE','PEER_UNAVAILABLE'],'REGION description and its public check are kept');
  const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  const sent=await r.ws.submitWriteProposal('PER_CELL',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)});assert.equal(sent.response.error,null,JSON.stringify(sent.response));
  assert.deepEqual(structuredClone(f.painterContexts[0].referenceBrief.media),[media]);
  const built=await call(r,'AdvanceCurrentBuild',advance);assert.equal(built.outcome,'VERIFIED');assert.equal(f.writes,1);
  const undo=await call(r,'UndoCurrentBuild',{requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(undo.status,'VERIFIED');assert.equal(undo.afterHead.headTransactionId,f.history.at(-1).transactionId);assert.equal(f.undoWrites,1);assert.equal(f.modelCalls,0);
  log('G2_PER_CELL_METHOD_SHAPED_BRUSH',{brush:label,brushHasProperty:{contractHandshake:'contractHandshake' in f.brush,protocolHandshake:typeof f.brush.protocolHandshake},perCell:cells.availability,regionDescriptor:region.descriptor,outcome:built.outcome,undo:undo.status,canvasWrites:f.writes,undoWrites:f.undoWrites,media});
 });
}
test('G2: method-shaped BrushV3 (handshake()/protocolHandshake()/status()) makes PER_CELL available; proposal → AdvanceCurrentBuild → Undo',async()=>{
 const f=fixture();f.brush=methodBrush(f);assert.equal(f.brush.contractHandshake,undefined);await perCellFlow(f,'FIXTURE method-shaped');
});
test('G2: actual Brush 0.5.0 package BrushV3 drives the PER_CELL path (real compile)',{skip:!process.env.HW_BRUSH_PACKAGE_ENTRY&&'HW_BRUSH_PACKAGE_ENTRY not set'},async()=>{
 const B=await import(process.env.HW_BRUSH_PACKAGE_ENTRY);const f=fixture();f.brush=new B.BrushV3();
 assert.equal(B.version,'0.5.0');assert.equal(Object.hasOwn(f.brush,'contractHandshake'),false);
 await perCellFlow(f,`ACTUAL hanaworlds-brush@${B.version}`);
 assert.deepEqual(W.peerContractHandshake(f.brush),B.contractHandshake);
 assert.equal(W.peerContractHandshake(f.brush).contracts,'hanaworlds-contracts@0.5.3');
 assert.equal(C.contractHandshake.contracts,'hanaworlds-contracts@0.5.3');
 const advertised=W.peerProtocolHandshake(f.brush);assert.equal(advertised.profileVersion,'protocol-handshake/v1');
 const compatible=C.checkProtocolCompatibility(advertised,[C.protocolRequirement('BUILD/V4',['BUILD/V4:per-cell-compile'])]);
 log('K3_ACTUAL_BRUSH_CROSS_PATCH',{brushContract:W.peerContractHandshake(f.brush),workshopContract:C.contractHandshake,advertised,compatible});
});
test('K3 per-cell Brush check = protocol major + capability: cross patch/hash accepted, wrong major / missing capability / no ProtocolHandshake named',async()=>{
 const f=fixture();
 const otherPatch=methodBrush(f,BUILD_PROTOCOL(4,undefined,'0.5.9-other-patch'),{...C.contractHandshake,contracts:'hanaworlds-contracts@0.5.99-fixture'});
 const wrongMajor=methodBrush(f,BUILD_PROTOCOL(5));
 const noCapability=methodBrush(f,BUILD_PROTOCOL(4,['region-build/v1:compile-mapblock-chunks']));
 const fn=()=>({});const functionOnly={contractHandshake:fn,protocolHandshake:fn};
 const ports=brush=>({painter:{contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('p','painter',5)},canvas:{contractHandshake:C.contractHandshake,protocolHandshake:CELL_PROTOCOL('c','canvas',6)},brush});
 const ok=W.evaluateWriteMethod('PER_CELL',{ports:ports(otherPatch)}),a=W.evaluateWriteMethod('PER_CELL',{ports:ports(wrongMajor)}),b=W.evaluateWriteMethod('PER_CELL',{ports:ports(noCapability)}),c=W.evaluateWriteMethod('PER_CELL',{ports:ports(functionOnly)});
 assert.equal(ok.available,true,JSON.stringify(ok));
 assert.deepEqual(codes(a),['UNSUPPORTED_VERSION']);assert.deepEqual(codes(b),['CAPABILITY_UNAVAILABLE']);assert.deepEqual(codes(c),['UNSUPPORTED_VERSION']);
 for(const u of [...a.unmet,...b.unmet,...c.unmet])assert.match(u.need,/Brush ProtocolHandshake with BUILD\/V4/);
 log('K3_BRUSH_PROTOCOL_CHECK',{crossPatchHash:ok,wrongMajor:a,missingCapability:b,invalidHandshakeValue:c});
});
test('K3 per-cell: Brush on another contracts patch/hash (same BUILD major + capability) builds and undoes',async()=>{
 const f=fixture();f.brush=methodBrush(f,BUILD_PROTOCOL(4,undefined,'0.5.9-other-patch'),{...C.contractHandshake,contracts:'hanaworlds-contracts@0.5.99-fixture'});
 await perCellFlow(f,'FIXTURE other contracts patch, same BUILD major');
});
test('K3 per-cell: Brush losing the capability after validation is rejected at Advance with zero writes',async()=>{
 const f=fixture();let protocol=BUILD_PROTOCOL();f.brush=methodBrush(f);f.brush.protocolHandshake=()=>structuredClone(protocol);
 await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  assert.equal((await r.ws.submitWriteProposal('PER_CELL',{...context,requestId:'proposal',proposal:clone(sample.request.proposal)})).response.error,null);
  protocol=BUILD_PROTOCOL(4,[]);
  const res=await r.ws.call('AdvanceCurrentBuild',advance);assert.equal(res.error?.code,'CAPABILITY_UNAVAILABLE');assert.equal(f.writes,0);assert.equal(f.calls.includes('BuildDocument'),false);
  log('K3_ADVANCE_BRUSH_CAPABILITY_REJECT',{error:res.error,brushCompiles:0,canvasWrites:f.writes});
 });
});

// Painter/Canvas are explicit fixtures. No claim that the old Canvas0.5.1 package advertises canvas5.
test('K3 Painter/Canvas: cross patch/hash and methods accept normal image proposal → advance → same-build Undo (FIXTURE)',async()=>{
 const f=fixture();
 for(const [field,protocol,major] of [['painter','painter',5],['canvas','canvas',6]]){
  const hs=CELL_PROTOCOL(`fixture-${field}`,protocol,major,7);
  const contract={...C.contractHandshake,contracts:'hanaworlds-contracts@0.5.99-fixture'};
  delete f[field].contractHandshake;f[field].handshake=()=>clone(contract);f[field].protocolHandshake=()=>clone(hs);
 }
 await perCellFlow(f,'FIXTURE Painter4/Canvas5 other patch/hash; Brush fixture');
});
test('K3 Painter/Canvas: wrong major, no protocol, region-only and exact-only are named and unavailable',()=>{
 const f=fixture(),ports={painter:f.painter,canvas:f.canvas,brush:f.brush};
 const normal=W.evaluateWriteMethod('PER_CELL',{ports});assert.equal(normal.available,true,JSON.stringify(normal));
 for(const [field,protocol,major] of [['painter','painter',5],['canvas','canvas',6]]){
  for(const port of [
   {protocolHandshake:CELL_PROTOCOL(field,protocol,major+1)},
   {contractHandshake:C.contractHandshake},
   {protocolHandshake:null},
   {protocolHandshake:CELL_PROTOCOL(field,`${protocol}-region`,1)},
  ]){
   const a=W.evaluateWriteMethod('PER_CELL',{ports:{...ports,[field]:port}});
   assert.deepEqual(codes(a),['UNSUPPORTED_VERSION']);assert.match(a.unmet[0].need,new RegExp(`${field==='painter'?'Painter':'Canvas'} ProtocolHandshake`));
  }
 }
 const missing=W.evaluateWriteMethod('PER_CELL',{ports:{brush:f.brush}});assert.deepEqual(codes(missing),['PEER_UNAVAILABLE','PEER_UNAVAILABLE']);
 log('K3_PAINTER_CANVAS_AVAILABILITY',{normal,canvas5Declaration:'FIXTURE only',perCellCapabilityIds:'none published for Painter/Canvas; only Brush per-cell compile is required'});
});
test('K3 Painter: protocol change before submission rejects without Painter/Canvas calls',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  f.painter.protocolHandshake=CELL_PROTOCOL('p','painter',6);
  const out=await r.ws.submitBuildProposal({...context,requestId:'proposal',proposal:clone(sample.request.proposal)});
  assert.equal(out.error?.code,'UNSUPPORTED_VERSION');assert.equal(f.calls.includes('ValidateBuildProposal'),false);assert.equal(f.writes,0);
  log('K3_PAINTER_CALL_REJECT',{error:out.error,painterCalls:0,canvasWrites:0});
 });
});
test('K3 Canvas: protocol change before advance rejects with zero writes',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  assert.equal((await r.ws.submitBuildProposal({...context,requestId:'proposal',proposal:clone(sample.request.proposal)})).error,null);
  f.canvas.protocolHandshake=CELL_PROTOCOL('c','canvas',7);
  const out=await r.ws.call('AdvanceCurrentBuild',advance);assert.equal(out.error?.code,'UNSUPPORTED_VERSION');assert.equal(f.writes,0);assert.equal(f.calls.includes('BuildDocument'),false);
  log('K3_CANVAS_ADVANCE_REJECT',{error:out.error,canvasWrites:0,brushCompiles:0});
 });
});
test('K3 Canvas: missing declaration before Undo rejects with zero undo writes',async()=>{
 const f=fixture();await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  assert.equal((await r.ws.submitBuildProposal({...context,requestId:'proposal',proposal:clone(sample.request.proposal)})).error,null);
  assert.equal((await call(r,'AdvanceCurrentBuild',advance)).outcome,'VERIFIED');
  f.canvas.protocolHandshake=null;
  const out=await r.ws.call('UndoCurrentBuild',{...base,requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(out.error?.code,'UNSUPPORTED_VERSION');assert.equal(f.undoWrites,0);
  log('K3_CANVAS_UNDO_REJECT',{error:out.error,undoWrites:0});
 });
});

// Deliberately inconsistent public HistoryView: schema-valid, but not the verified Undo head.
test('Undo history: rejects a head unrelated to its verified Undo receipt',async()=>{
 const f=fixture();f.badUndoHead=true;await withRuntime(f,async r=>{
  const {advance}=await imageBrief(r,f);const context=await r.ws.readWriteProposalContext('PER_CELL',{...advance,requestId:'read-context'});
  assert.equal((await r.ws.submitBuildProposal({...context,requestId:'proposal',proposal:clone(sample.request.proposal)})).error,null);
  assert.equal((await call(r,'AdvanceCurrentBuild',advance)).outcome,'VERIFIED');
  const out=await r.ws.call('UndoCurrentBuild',{...base,requestId:'undo',worldRef:f.local.worldRef,localContext:f.local,expectedTurnRevision:advance.expectedTurnRevision,expectedHistoryRevision:'history-1'});
  assert.equal(out.error?.code,'READBACK_FAILED');assert.equal(out.error?.mutationState,'UNKNOWN');assert.equal(f.undoWrites,1);
  log('UNDO_HEAD_REJECT',{error:out.error,head:null,verifiedUndoTransaction:f.history.at(-1).transactionId,undoWrites:1,peers:'FIXTURE'});
 });
});
