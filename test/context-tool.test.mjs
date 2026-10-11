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
import { readdir, readFile as read } from 'node:fs/promises';
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
 ctx.provide('hanaworldsCapabilities',{providerRef:'fixture-host',capabilityRevision:'cap1',worldRef:local.worldRef,engineBounds:sample.request.targetFacts.sampledBounds,worldGeometry:{profileVersion:'world-geometry/v1',geometryProfiles:['voxel-grid/v1'],partition:{edge:[16,16,16]},postWriteLighting:'REQUIRED'},limits:[],recoveryGuarantee:'RECOVERABLE_VERIFIED',stateProfile:{profileVersion:'state-profile/v3',derivedFields:['light'],preservedFields:[],clearedFields:[]},sessionDeleteSupported:false,imageMediaTypes:['image/png'],model:null,engineGuards:null});
 ctx.provide('hanaworldsCanvasV5',{contractHandshake:C.contractHandshake,protocolHandshake:{profileVersion:'protocol-handshake/v1',component:'hanaworlds-canvas',protocols:[{protocol:'canvas',major:7,minor:0}],capabilities:[],provenance:{packageName:'hanaworlds-canvas',packageVersion:'FIXTURE',sourceRevision:null,artifactDigest:null}},async call(op,q){f.calls.push(op);C.validateBoundRequest('canvas/v7',op,q);
  const response=result=>({contractVersion:'canvas/v7',requestId:q.requestId,result,error:null,...(['ApplyRecoverableCommit','Undo','Redo','RecoverPendingUndo','ReadPendingUndoResult','InspectPlacementRegion'].includes(op)?{guardRefusal:null}:{})});
  if(op==='ReadWorldSelectionContext')return response({sessionRef:q.sessionRef,worldRef:q.worldRef,inventory:{capabilityRevision:'cap1',connections:[]},selection:{status:'BOUND',connectionRef:local.connectionRef,context:{currentSession:q.sessionRef,activeWorldRef:local.worldRef,orderedSelectedObjectRefs:[],sessionRevision:'c1',selectionRevision:local.selectionRevision,localContext:clone(local)}}});
  if(op==='InspectPlacementRegion'&&f.refuse)return {contractVersion:'canvas/v7',requestId:q.requestId,result:null,error:C.guardRefusalError(f.refuse),guardRefusal:clone(f.refuse),unavailableSettings:null};
  if(op==='InspectPlacementRegion')return {...response({outcome:'REGION_INSPECTED',inspection:f.inspection??clone(sample.request.regionInspection)}),unavailableSettings:null};
  f.writes++;throw Error(`context tool must not reach ${op}`);}});
 ctx.provide('hanaworldsCatalogue',{read:async()=>clone(sample.request.catalogue)});
 await ctx.plugin(plugin).await();const ws=ctx.get('hanaworldsWorkshop');
 const append=async(id,...events)=>{const w=await ctx.sessionPersistence.open(id,'write');try{const log=await w.read();await w.append(events.map((e,i)=>({...e,seq:log.events.length+i})));}finally{await w.close();}};
 const tool=async(args,id='s1')=>{const out=await ctx.tools.execute({name:'hanaworlds_context',callId:`ctx-${Math.random()}`,arguments:args,signal:new AbortController().signal,agent:{ctx,session:{header:header(id)}}});return {...out,json:out.isError?null:JSON.parse(out.value.result),text:out.content.map(p=>p.text).join('')};};
 const bind=async(id='s1')=>{const s=await ws.call('StartOrResumeSession',{contractVersion:'session/v5',sessionRef:id,requestId:`start-${Math.random()}`,expectedRevision:null});
  const b=await ws.call('SwitchWorldContext',{contractVersion:'session/v5',sessionRef:id,requestId:`switch-${Math.random()}`,expectedRevision:s.result.context.sessionRevision,worldRef:local.worldRef,selectionRevision:local.selectionRevision,localContext:local});assert.equal(b.error,null,JSON.stringify(b));};
 try{for(const id of ['s1','s2']){const w=await ctx.sessionPersistence.create(header(id));await w.append([{type:'turn/start',seq:0,time:99,data:{turn:1}}]);await w.close();}
  const persisted=async()=>{let text='';const walk=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const q=join(d,e.name);if(e.isDirectory())await walk(q);else text+=await read(q,'utf8');}};await walk(join(root,'projection'));return text;};
  await fn({ctx,ws,f,append,tool,bind,persisted});}
 finally{await ws.projectionStore.close();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
}
// Rule values are the (fixture) skill's proposal; Workshop and contracts supply none.
const rules={requireEntranceConnectivity:true,entranceClearance:{width:1,height:2,depth:1,unit:'node'},hazardPolicy:{forbidLiquid:true,maximumDamagePerSecond:0},optionalLightRule:null};
const prepare={action:'prepare',purpose:'小屋',width:3,depth:4,height:3,siteRules:rules};
const snapshot=async r=>(await r.ws.call('StartOrResumeSession',{contractVersion:'session/v5',sessionRef:'s1',requestId:`s-${Math.random()}`,expectedRevision:null})).result;

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
 assert.equal(prepared.json.turnRef,'text:ask');
 assert.equal(prepared.json.clarification.question,'请确认建造照这个建一个小屋，尺寸3×4×3个节点；提议内容：小屋；场地规则：入口需要连通（净空1×1×2个节点）；危险物：禁止液体，伤害上限每秒0；光照：不要求。回复“确认”或修改。');
 const again=await r.tool({...prepare,entrancePortalRefs:['portal-a']});assert.deepEqual(again.json,prepared.json,'same human message prepares once');
 const selfConfirm=await r.tool({action:'confirm'});assert.equal(selfConfirm.isError,true);assert.match(selfConfirm.text,/HUMAN_CONFIRMATION_REQUIRED/);
 const early=await r.tool({action:'read'});assert.equal(early.isError,true);assert.match(early.text,/INTENT_UNCONFIRMED/);
 await r.append('s1',user('yes','确认'));
 const confirmed=await r.tool({action:'confirm'});assert.equal(confirmed.isError,false,confirmed.text);assert.equal(confirmed.json.clarification,null);
 const read=await r.tool({action:'read'});assert.equal(read.isError,false,read.text);
 assert.deepEqual(read.json.context.intent.confirmedIntent.entrancePortalRefs,['portal-a']);assert.deepEqual(read.json.context.intent.confirmedIntent.siteRules,rules);
 // SafetyProfile comes only from the confirmed intent: no Host/Canvas/World safety service exists in this composition.
 assert.equal(r.ctx.get('hanaworldsSafetyProfile'),undefined);
 assert.deepEqual(read.json.context.safetyProfile,{profileVersion:'safety-profile/v5',connectivity:6,requireBodyClearance:true,requireEntranceConnectivity:true,hazardPolicy:rules.hazardPolicy,optionalLightRule:null});
 assert.deepEqual(read.json.context.safetyProfile,structuredClone(C.safetyProfileFromConfirmedIntent(read.json.context.intent)));
 assert.equal(read.json.context.intentDigest,C.digestValue('intent',read.json.context.intent).sha256);
 assert.equal(read.json.context.safetyProfileDigest,C.digestValue('safety-profile',read.json.context.safetyProfile).sha256);
 // A profile not derived from the confirmed rules is refused by the contract, so it cannot ride along.
 const forged={...read.json.context,requestId:'forged',proposal:clone(sample.request.proposal),safetyProfile:{...read.json.context.safetyProfile,requireEntranceConnectivity:false}};
 assert.throws(()=>C.validateBuildProposalRequest(forged),e=>e.code==='INTENT_UNCONFIRMED'||e.code==='NON_CANONICAL_AMBIGUITY');assert.equal(read.json.context.intent.confirmedIntent.text,'照这个建一个小屋');
 assert.equal((await r.tool({action:'read'})).json.proposalRef,read.json.proposalRef,'stable context request per confirmed turn');
 // A corrected request after confirmation is a new turn; the old captured context is no longer current.
 // Changing the confirmed rules is a new turn with a new digest; the old context is stale.
 await r.append('s1',user('change','入口不用连通'));const changed=await r.tool({...prepare,siteRules:{...rules,requireEntranceConnectivity:false,entranceClearance:null}});assert.equal(changed.isError,false,changed.text);
 assert.notEqual(changed.json.turnRevision,read.json.context.turnRevision);
 const stale=await r.ws.readBuildProposalContext({contractVersion:'session/v5',sessionRef:'s1',requestId:read.json.proposalRef,worldRef:local.worldRef,expectedTurnRevision:read.json.context.turnRevision,localContext:local}).catch(e=>e);
 assert.equal(stale.code,'TURN_REVISION_MISMATCH');assert.equal(r.f.writes,0);
}));
test('images action lists only this conversation\'s images; prepare binds the selected one; foreign refs refused by name',async()=>setup(async r=>{
 await r.bind();const ref=await r.ctx.attachments.saveImage({data:png,mediaType:'image/png'});
 await r.append('s1',user('ask','照这张图建',[{type:'image',attachment:ref}]));
 const listed=await r.tool({action:'images'});assert.equal(listed.isError,false,listed.text);assert.deepEqual(listed.json.images.map(m=>m.attachmentRef),[ref.attachmentId]);
 assert.deepEqual((await r.tool({action:'images'},'s2')).json.images,[]);
 const foreign=await r.tool({...prepare,imageRefs:['not-here']});assert.equal(foreign.isError,true);assert.match(foreign.text,/ATTACHMENT_NOT_IN_SESSION/);
 const prepared=await r.tool(prepare);assert.equal(prepared.isError,false,prepared.text);assert.equal(prepared.json.turnRef,'image:ask');
 const snapshot=await r.ws.call('StartOrResumeSession',{contractVersion:'session/v5',sessionRef:'s1',requestId:'s',expectedRevision:null});
 assert.deepEqual(snapshot.result.turns[0].media.map(m=>m.attachmentRef),[ref.attachmentId]);
}));

test('no proposed site rules: the question asks the skill for rule options, "确认" cannot confirm, no context',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','建一个小屋'));
 const {siteRules:_,...noRules}=prepare;const prepared=await r.tool(noRules);assert.equal(prepared.isError,false,prepared.text);
 assert.equal(prepared.json.clarification.question,'请由当前skill提出入口、危险物、光照规则选项并补齐用途和节点尺寸后重新提交。');
 await r.append('s1',user('yes','确认'));const answered=await r.tool({action:'confirm'});assert.equal(answered.isError,false,answered.text);assert.ok(answered.json.clarification,'still unconfirmed');
 const read=await r.tool({action:'read'});assert.equal(read.isError,true);assert.match(read.text,/INTENT_UNCONFIRMED/);
 // A required entrance without its design clearance is not complete either.
 await r.append('s1',user('again','入口要连通'));const noClearance=await r.tool({...prepare,siteRules:{...rules,entranceClearance:null}});
 assert.equal(noClearance.json.clarification.question,'请由当前skill补齐用途、节点尺寸和所需入口净空后重新提交。');
}));
test('light rule: told to the player as currently unavailable and refused by capability name, on the tool and on the wire; nothing prepared',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','要亮一点'));
 const lit={...rules,optionalLightRule:{minimumLight:0.5,sourceRevision:'skill-proposal-1'}};
 const out=await r.tool({...prepare,siteRules:lit});assert.equal(out.isError,true);assert.match(out.text,/CAPABILITY_UNAVAILABLE: painter\/v6:light-rule .*currently unavailable/);
 assert.deepEqual((await snapshot(r)).turns,[]);
 const s=await snapshot(r);const wire=await r.ws.call('AppendMultimodalTurn',{contractVersion:'session/v5',sessionRef:'s1',requestId:'wire-light',expectedRevision:s.context.sessionRevision,turnRef:'light',text:'要亮一点',media:[],controls:{purpose:'小屋',dimensions:{width:3,depth:4,height:3,unit:'node'},entrancePortalRefs:[],styleText:null,siteRules:lit},localContext:local});
 assert.equal(wire.error.code,'CAPABILITY_UNAVAILABLE');assert.deepEqual((await snapshot(r)).turns,[]);
 // Same message, rule left out by the skill: prepares normally (the refusal did not consume the user's message).
 const retry=await r.tool(prepare);assert.equal(retry.isError,false,retry.text);
}));
test('no player geometry crosses or persists: projection holds none; an inspection carrying body cells is refused and not stored',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','建一个小屋'));await r.tool(prepare);await r.append('s1',user('yes','确认'));await r.tool({action:'confirm'});
 const read=await r.tool({action:'read'});assert.equal(read.isError,false,read.text);
 const text=await r.persisted();assert.ok(text.includes(read.json.context.intentDigest),'projection actually persisted the context');
 for(const key of ['bodyOccupiedPositions','avatarDimensions'])assert.equal(text.includes(key),false,key);
 await r.append('s1',user('next','再建一个'));await r.tool(prepare);await r.append('s1',user('yes2','确认'));await r.tool({action:'confirm'});
 r.f.inspection={...clone(sample.request.regionInspection),bodyOccupiedPositions:[[0,1,0]]};
 const refused=await r.tool({action:'read'});assert.equal(refused.isError,true);
 assert.equal((await r.persisted()).includes('bodyOccupiedPositions'),false);
}));
test('region path: a confirmed entrance requirement is refused by name (painter-region has no entrance check), never ignored',async()=>setup(async r=>{
 await r.bind();await r.append('s1',user('ask','平整地面'));await r.tool(prepare);await r.append('s1',user('yes','确认'));await r.tool({action:'confirm'});
 const turn=(await snapshot(r)).turns.at(-1);
 const out=await r.ws.readWriteProposalContext('REGION',{contractVersion:'session/v5',sessionRef:'s1',requestId:'region-context',worldRef:local.worldRef,expectedTurnRevision:turn.turnRevision,localContext:local}).catch(e=>e);
 assert.equal(out.code,'CAPABILITY_UNAVAILABLE');assert.equal((await r.persisted()).includes('region-context'),false);
}));
test('rc.4 read: a Canvas inspection guard refusal (public relay fixture) is named for the skill; no context stored',async()=>setup(async r=>{
 const c=JSON.parse(await read(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/skill-site-rules')),'utf8')).engineGuards.relay.cases.find(c=>c.refusal.stage==='INSPECT_REGION');
 await r.bind();await r.append('s1',user('ask','建一个小屋'));await r.tool(prepare);await r.append('s1',user('yes','确认'));await r.tool({action:'confirm'});
 r.f.refuse=c.refusal;const out=await r.tool({action:'read'});assert.equal(out.isError,true);
 assert.match(out.text,/CAPABILITY_UNAVAILABLE: engine guard CELL_PROTECTION refused at INSPECT_REGION \(GUARD_UNAVAILABLE\)/);
 assert.equal((await r.persisted()).includes('"proposal-'),false,'no captured context');
}));
