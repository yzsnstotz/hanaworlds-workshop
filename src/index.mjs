import { WorkshopImageLinkPanelService, WorkshopConversationPanelService } from '../lib/panel-host.mjs';
import { sessionModel, conversationView, sendConversation } from './conversation.mjs';
import packageManifest from '../package.json' with { type: 'json' };
import { createHash, randomUUID } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { WorkshopProjectionStore, coreIdentity } from './projection-store.mjs';
import * as C from 'hanaworlds-contracts';
import { registerImageTool, imageURL, userProvidedURL, downloadImageBytes, uploadedImageBytes, mediaBinding, imageRef, imageDigest } from './image-attachment.mjs';
import { prepareImageAsk } from './image-ask.mjs';
import { registerContextTool } from './context-tool.mjs';
export { prepareImageAsk, IMAGE_ASK_ALLOWED_TOOLS } from './image-ask.mjs';
import { regionEffectSummary, cellEffectSummary } from './region-effects.mjs';
export { regionEffectSummary, cellEffectSummary } from './region-effects.mjs';
import { WRITE_METHODS, WRITE_METHOD_PORTS, writeToolSkillGuidance, evaluateWriteMethod, describeWriteMethod, peerContractHandshake, peerProtocolHandshake, PER_CELL_BRUSH, PER_CELL_PAINTER, PER_CELL_CANVAS } from './write-tools.mjs';
export { WRITE_METHODS, WRITE_METHOD_PORTS, writeToolSkillGuidance, evaluateWriteMethod, describeWriteMethod, peerContractHandshake, peerProtocolHandshake, PER_CELL_BRUSH, PER_CELL_PAINTER, PER_CELL_CANVAS } from './write-tools.mjs';
const VERSION = 'session/v5', CANVAS = 'canvas/v7';
const copy = structuredClone, revision = () => `rev-${randomUUID()}`;
const same = (a,b) => C.canonicalJSON(a) === C.canonicalJSON(b);
// Cordis supplies a new caller-context proxy per get; compare its public origin.
const sameProvider = (a,b) => (a?.[symbols.original]??a)===(b?.[symbols.original]??b);
const digest = (kind,value) => C.digestValue(kind,value).sha256;
const fail = (code,details) => { throw new C.ContractError(code,'validate','REQUIRED_FACT_UNKNOWN',details); };
const placementFailure = error => C.confirmedPlacement.namedFailures.find(f=>f.code===(error?.publicError??error)?.code&&f.reason===(error?.publicError??error)?.reason);
const placementFail = name => {const f=C.confirmedPlacement.namedFailures.find(f=>f.failure===name);const error=new C.ContractError(f.code,f.phase,f.reason);error.placementFailure=name;throw error;};
const explainPlacement = error => {const f=placementFailure(error);if(f)error.message=`${f.failure}: ${f.code}/${f.reason}. ${C.confirmedPlacement.remedy}`;return error;};
// A placement source belongs to the user message it was inspected for. Say the one legal next step, so a position
// shown only in prose is not left for the user to "confirm" in the next message (K3 formal run E10/E13).
const placementNext = ref => ({action:'prepare',placementSourceRef:ref,validUntil:'NEXT_USER_MESSAGE',
 instruction:'Choose placementTarget inside this inspection and call hanaworlds_context action prepare with this placementSourceRef now, in this same reply, before writing to the user. A position described only in prose is not a proposal and cannot be confirmed; this reference is refused once the next user message arrives.'});
// The player confirms the extent as ranges per world axis (y is up), so a layer count different from the
// requested height is visible in the question itself (K3 run 01a123a6 E10: 40×4×1 with a y8..9 extent).
const span = (lo,hi,unit) => `${lo}..${hi}（${hi-lo+1}${unit}）`;
const placementText = target => {
 if(target.kind==='ANCHORED_EXTENT'){const {min,max}=target.bounds;return `范围 x=${span(min[0],max[0],'格')}、y=${span(min[1],max[1],'层')}、z=${span(min[2],max[2],'格')}`;}
 const ys=[...new Set(target.cells.map(c=>c[1]))].sort((a,b)=>a-b);return `${target.cells.length}个格子，y=${ys.join('、')}（${ys.length}层）`;
};
const EARLIER_SOURCE = ' This placementSourceRef was inspected for an earlier user message, so no proposal was made then and this reply cannot confirm it. In this reply call action placement again, then prepare with the new placementSourceRef, show the returned question and wait for the next user message.';
const packet = (wire,id,result,error=null) => ({contractVersion:wire,requestId:id,result,error});
const pub = error => error?.publicError ?? C.publicError(error);
// session/v5 build responses carry the engine guard refusal (contracts v1 rc.4): null normally; a refusal
// relayed by Canvas travels up unchanged with the error it explains, for the Host and the skill.
const GUARDED = new Set(['AdvanceCurrentBuild','UndoCurrentBuild','RecoverPendingUndo']);
// A peer's public error is relayed as is (pub); C.publicError alone would turn it into SCHEMA_INVALID.
const sessionPacket = (operation,id,result,error=null) => GUARDED.has(operation)
 ? {...packet(VERSION,id,result,error===null?null:pub(error)),guardRefusal:error===null?null:copy(error.detail?.guardRefusal??null)}
 : packet(VERSION,id,result,error===null?null:pub(error));
// Region commit/undo responses carry the engine's named guard refusal and the original apply failure
// next to the error (contracts v1 rc.2); keep them for the skill instead of collapsing to the code.
const peerFail = response => {const error=new Error(response.error.code);error.publicError=response.error;
 if('guardRefusal' in response)error.detail={guardRefusal:response.guardRefusal,applyFailure:response.applyFailure};throw error;};
const regionFailure = (body,raw,error) => ({method:'REGION',sessionRef:body?.sessionRef??raw?.sessionRef??null,outcome:null,result:null,error:pub(error),
 guardRefusal:copy(error?.detail?.guardRefusal??null),applyFailure:copy(error?.detail?.applyFailure??null)});
const withoutRequest = ({requestId:_r,proposal:_p,...rest}) => rest;
// Workshop owns this initial revision, including before a projection is created.
// It is derived from the trusted lifecycle identity, never Core's storage revision.
/** Player-facing text of the skill-proposed site rules, values verbatim. */
const siteRulesText = r => `入口${r.requireEntranceConnectivity?`需要连通（净空${r.entranceClearance.width}×${r.entranceClearance.depth}×${r.entranceClearance.height}个节点）`:'不要求连通'}；危险物：${r.hazardPolicy.forbidLiquid?'禁止液体':'允许液体'}，伤害上限每秒${r.hazardPolicy.maximumDamagePerSecond}；光照：${r.optionalLightRule===null?'不要求':`至少${r.optionalLightRule.minimumLight}`}`;
const initialRevision = identity => `rev-core-${createHash('sha256').update(C.canonicalJSON(identity)).digest('hex')}`;
const initial = (id,identity) => ({context:{currentSession:id,activeWorldRef:null,orderedSelectedObjectRefs:[],sessionRevision:initialRevision(identity),selectionRevision:'0',localContext:null},turns:[],details:{},confirmed:{},pending:null,placementSources:{},requests:{},contexts:{},builds:{},undos:{}});

/** Current fresh-install runtime. Peer ports are Host-owned in-process services;
 * no model JSON can select a peer or call Canvas/Adapter mutators directly. */
export class WorkshopV3 {
 constructor(ports={}) { Object.assign(this,ports);this.contractHandshake=C.contractHandshake;
  this.protocolHandshake=C.validateType('ProtocolHandshake',{profileVersion:'protocol-handshake/v1',component:'hanaworlds-workshop',
   protocols:[{protocol:'session',major:5,minor:0}],capabilities:[],
   provenance:{packageName:packageManifest.name,packageVersion:packageManifest.version,sourceRevision:null,artifactDigest:null}});
  this.locks=new Map();this.conversationSends=new Set(); }
 /** Only a live Host-owned Agent can drive this exact Core Session. */
 conversationAgent(session) {
  const id=session?.header?.id;
  if(!id||this.sessions?.get(id)!==session)throw Error('SESSION_MISMATCH');
  const agent=this.agents?.get(id);
  if(!agent||agent.session!==session)throw Error('CONVERSATION_AGENT_REQUIRED');
  return agent;
 }
 async readConversationForPanel(session,signal) {
  signal.throwIfAborted();const agent=this.conversationAgent(session);
  return conversationView(session,agent,()=>this.defaultModel?.currentSelection?.()??agent.options);
 }
 async sendConversationForPanel(session,text,signal) {return sendConversation(this,session,text,signal);}
 status() {
  return {component:packageManifest.name,version:packageManifest.version,
   contractHandshake:copy(this.contractHandshake),protocolHandshake:copy(this.protocolHandshake)};
 }
 /** Trusted composition-only metadata preparation for G-S. Returns the official
  * SessionPersistence snapshot verbatim; this is not a session/v5 wire operation.
  * No World selection, Workshop projection, full log read or Session creation. */
 async readSessionMetadata(sessionRef) {
  const port=this.sessionPersistence;
  if(typeof port?.stat!=='function')fail('CAPABILITY_UNAVAILABLE');
  const snapshot=await port.stat(sessionRef);
  if(!snapshot)fail('SESSION_NOT_FOUND');
  coreIdentity(snapshot.header,sessionRef);
  if(!sameProvider(port,this.sessionPersistence))fail('SESSION_NOT_FOUND');
  return copy(snapshot);
 }
 /** Enumerate authoritative official stored metadata without manufacturing
  * Session existence from a reference, local projection or world binding. */
 async listSessionMetadata() {
  const port=this.sessionPersistence;
  if(typeof port?.list!=='function')fail('CAPABILITY_UNAVAILABLE');
  const snapshots=await port.list();
  for(const snapshot of snapshots)coreIdentity(snapshot.header,snapshot.header?.id);
  if(!sameProvider(port,this.sessionPersistence))fail('SESSION_NOT_FOUND');
  return copy(snapshots);
 }
 async #sessionIdentity(snapshot) {
  const identity=coreIdentity(snapshot.header,snapshot.header.id);
  const state=await this.projectionStore.get(identity.id,identity);
  return C.validateType('SessionIdentity',{sessionRef:identity.id,
   sessionRevision:state?.context.sessionRevision??initialRevision(identity)});
 }
 #publicCapabilities() {
  return this.capabilities==null?null:{...copy(this.capabilities),sessionDeleteSupported:false};
 }
 async #lock(id,run) {
  const previous=this.locks.get(id)??Promise.resolve();let release;
  const next=new Promise(r=>{release=r;});this.locks.set(id,next);
  await previous;try{return await run();}finally{release();if(this.locks.get(id)===next)this.locks.delete(id);}
 }
 async #core(id) {
  if(!this.sessionPersistence?.open)fail('SESSION_NOT_FOUND');
  const handle=await this.sessionPersistence.open(id,'read');
  try {const log=await handle.read();return {identity:coreIdentity(handle.header,id),events:log.events};}finally{await handle.close();}
 }
 async #load(id,create=false) {
  const core=await this.#core(id);let state=await this.projectionStore.get(id,core.identity);
  if(!state&&create){state=initial(id,core.identity);await this.projectionStore.create(id,core.identity,state);}
  if(!state)fail('SESSION_NOT_FOUND');return {core,state};
 }
 async #save(id,core,state,nextRevision=revision()) {
  const live=await this.#core(id);if(!same(live.identity,core.identity))fail('SESSION_NOT_FOUND');
  const prior=state.context.sessionRevision;state.context.sessionRevision=nextRevision;
  await this.projectionStore.replace(id,core.identity,prior,state);
 }
 /** K3 peers: actual public ProtocolHandshake, required wire major/minor and capabilities. */
 #protocolPeer(port,{wire,capabilities,minMinor=0}) {if(!port)fail('CAPABILITY_UNAVAILABLE');C.checkProtocolCompatibility(peerProtocolHandshake(port)??null,[C.protocolRequirement(wire,capabilities,minMinor)]);return port;}
 async #canvas(op,request) {
  const port=this.#protocolPeer(this.canvas,PER_CELL_CANVAS);C.validateBoundRequest(CANVAS,op,request);
  const response=C.validateBoundResponse(CANVAS,op,request,await port.call(op,copy(request)));
  if(port!==this.canvas)fail('CURRENT_WORLD_MISMATCH');
  if(response.error)peerFail(response);
  return copy(response.result);
 }
 #child(body,step,fields={}) {return {contractVersion:CANVAS,sessionRef:body.sessionRef,requestId:`${body.requestId}:${step}`,worldRef:body.localContext.worldRef,localContext:copy(body.localContext),...fields};}
 async #selection(body) {
  const result=await this.#canvas('ReadWorldSelectionContext',{contractVersion:CANVAS,sessionRef:body.sessionRef,requestId:`${body.requestId}:current:${randomUUID()}`,worldRef:body.localContext.worldRef});
  const selected=result.selection;
  if(selected.status!=='BOUND'||selected.context.currentSession!==body.sessionRef||
    selected.connectionRef!==body.localContext.connectionRef||!same(selected.context.localContext,body.localContext)||
    selected.context.activeWorldRef!==body.localContext.worldRef)fail('CURRENT_WORLD_MISMATCH');
  return selected.context;
 }
 async #facts(body,state,record=null,{switching=false}={}) {
  let currentContext=null;
  if(body.localContext){const selected=await this.#selection(body);currentContext=selected.localContext;
   if(!switching&&!same(state.context.localContext,currentContext))fail('CURRENT_WORLD_MISMATCH');}
  const current=state.turns.at(-1);
  return C.validateType('LocalRequestFacts',{currentContext,sessionRef:state.context.currentSession,currentTurnRevision:current?.turnRevision??null,currentBriefDigest:current?.referenceBriefDigest??null,
   requestState:record?.response?'COMPLETED':'ACTIVE',replay:record?.response?'EXACT_REPLAY':'NEW',priorRequestDigest:record?.response?record.digest:null});
 }
 async #current(body,state) {await this.#facts(body,state);await this.#core(body.sessionRef);}
 #turn(state) {
  const turn=state.turns.at(-1), saved=turn&&state.confirmed[turn.turnRef];
  if(!saved||state.pending||!same(saved.localContext,state.context.localContext))fail('INTENT_UNCONFIRMED');
  return {turn,saved};
 }
 async call(operation,raw) {
  let body;
  try {
   body=copy(typeof raw==='string'||raw instanceof Uint8Array?C.admitRequest(VERSION,operation,raw):C.validateBoundRequest(VERSION,operation,raw));
   // Canvas may query this port while a Workshop mutation holds the Session lock.
   // Domain reads return a committed snapshot and must not enter that mutation lock.
   if(operation==='ReadSessionIdentity'){
    const port=this.sessionPersistence,result=await this.#sessionIdentity(await this.readSessionMetadata(body.sessionRef));
    if(!sameProvider(port,this.sessionPersistence))fail('SESSION_NOT_FOUND');
    return packet(VERSION,body.requestId,result);
   }
   if(operation==='ListSessions'){
    const port=this.sessionPersistence;
    const sessions=await Promise.all((await this.listSessionMetadata()).map(s=>this.#sessionIdentity(s)));
    if(!sameProvider(port,this.sessionPersistence))fail('SESSION_NOT_FOUND');
    sessions.sort((a,b)=>a.sessionRef<b.sessionRef?-1:a.sessionRef>b.sessionRef?1:0);
    const directoryRevision=`dir-${createHash('sha256').update(C.canonicalJSON(sessions)).digest('hex')}`;
    return packet(VERSION,body.requestId,C.validateType('SessionDirectory',{directoryRevision,sessions}));
   }
   // Fixed DSH 0.2.0-rc.2 cannot delete persisted Sessions. No request journal,
   // projection initialization or Canvas retirement may happen on this branch.
   if(operation==='DeleteSession'){
    await this.readSessionMetadata(body.sessionRef);
    const capabilities=this.#publicCapabilities();
    if(capabilities)C.requireSessionDeleteSupported(capabilities);
    throw new C.ContractError('SESSION_DELETE_UNSUPPORTED','validate','DELETE_SEAM_ABSENT');
   }
   return await this.#lock(body.sessionRef,async()=>{
    const {core,state}=await this.#load(body.sessionRef,operation==='StartOrResumeSession');
    if(operation==='StartOrResumeSession')return packet(VERSION,body.requestId,C.validateType('SessionSnapshot',{context:state.context,turns:state.turns,capabilities:this.#publicCapabilities(),sessionDeleteSupported:false}));
    const key=`${operation}:${body.requestId}`,record=state.requests[key];
    const facts=await this.#facts(body,state,record,{switching:operation==='SwitchWorldContext'});
    const admitted=C.validateCurrentRequest(VERSION,operation,body,facts);
    if(admitted.disposition==='RETURN_STORED')return copy(record.response);
    if(record)fail('REQUEST_NOT_ACTIVE');
    if(body.expectedRevision!==undefined&&body.expectedRevision!==state.context.sessionRevision)fail('STALE_REVISION');
    const readOnly=['ReadCurrentUndoStatus','ReadSessionTurnDetails'].includes(operation);
    if(!readOnly){state.requests[key]={digest:admitted.requestDigest,response:null};await this.#save(body.sessionRef,core,state);}
    let response;
    try {const result=await this.#dispatch(operation,body,core,state);response=C.validateResponse(VERSION,operation,sessionPacket(operation,body.requestId,result));}
    catch(error){response=sessionPacket(operation,body.requestId,null,error);}
    if(!readOnly){const next=revision();response=copy(response);if(response.result?.context)response.result.context.sessionRevision=next;state.requests[key].response=copy(response);await this.#save(body.sessionRef,core,state,next);}
    return copy(response);
   });
  }catch(error){return sessionPacket(operation,body?.requestId??raw?.requestId??null,null,error);}
 }
 /** Native tool execution supplies the live Core Session; model args contain only the URL. */
 async downloadImage(rawURL,exec) {
  const signal=exec?.signal; if(!signal?.throwIfAborted)throw Error('CANCELLATION_REQUIRED');signal.throwIfAborted();
  const id=exec?.agent?.session?.header?.id;if(!id)throw Error('SESSION_NOT_FOUND');
  const url=imageURL(rawURL);
  return this.#lock(id,async()=>{
   const {core,state}=await this.#load(id,true);
   if(!same(core.identity,coreIdentity(exec.agent.session.header,id)))throw Error('SESSION_MISMATCH');
   const source=core.events.findLast(e=>e.type==='user/message'&&e.surfaceOp==='append'&&userProvidedURL(e.data,url));
   if(!source?.data?.id)throw Error('USER_IMAGE_URL_REQUIRED');
   return this.#bindImage(id,core,state,await downloadImageBytes(url,this.#media$(),signal),source.data.id,signal,live=>live.events.some(e=>e.type==='user/message'&&e.data?.id===source.data.id&&userProvidedURL(e.data,url)));
  });
 }
 #media$() {const attachments=this.attachments;if(!attachments?.saveImage||!attachments?.readImage)throw Error('MEDIA_UNAVAILABLE');return attachments;}
 /** Store and bind one image (downloaded or uploaded bytes) to the Session journal. `sourced(live)` re-checks the user provenance against the fresh Core log. */
 async #bindImage(id,core,state,input,sourceMessageId,signal,sourced) {
  const attachments=this.#media$();signal.throwIfAborted();
  // saveImage fully decodes and checks the MIME. Store and decoder are the existing Host capability.
  const ref=await attachments.saveImage(input);signal.throwIfAborted();
  const stored=await attachments.readImage(ref,signal);signal.throwIfAborted();
  if(!same(stored.ref,ref))throw Error('MEDIA_DIGEST_MISMATCH');
  const media=mediaBinding(ref,stored.data),live=await this.#core(id);signal.throwIfAborted();
  const currentMedia=await this.attachments?.readImage(ref,signal);signal.throwIfAborted();
  if(!currentMedia||!same(mediaBinding(currentMedia.ref,currentMedia.data),media)||!same(live.identity,core.identity)||!sourced(live))throw Error('SESSION_MISMATCH');
  state.images??={};state.images[ref.attachmentId]={media,sourceMessageId};
  await this.#save(id,core,state);signal.throwIfAborted();
  return {sessionRef:id,sourceMessageId,downloadSha256:imageDigest(input.data),downloadBytes:input.data.byteLength,media,image:imageRef(media)};
 }
 /** Core reserves surface node 0 for the native Loop's system prompt; until it exists the conversation has not started. */
 #started(session) {const head=session.surface.nodes[0];return head!==undefined&&session.snapshotEvents(head,head+1)[0]?.type==='system/message';}
 /** Public operator panel path. Session is resolved by the Host's registered
  * Session lookup; the UI supplies user text, never ToolExecution or headers. */
 async downloadImageForPanel(session,rawURL,signal) {
  signal.throwIfAborted();
  const id=session?.header?.id;
  if(!id||this.sessions?.get(id)!==session)throw Error('SESSION_MISMATCH');
  const url=imageURL(rawURL);
  if(!this.#started(session))return this.#queuePanelImage(session,id,signal,()=>downloadImageBytes(url,this.#media$(),signal),[{type:'text',text:url}]);
  session.append('user/message',{id:`workshop-link-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'text',text:url}]},{surfaceOp:'append'});
  await this.sessions.flush(session);signal.throwIfAborted();
  const result=await this.downloadImage(url,{agent:{session},signal});
  if(this.sessions.get(id)!==session)throw Error('SESSION_MISMATCH');
  signal.throwIfAborted();
  session.append('user/message',{id:`workshop-image-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'image',attachment:result.image}]},{surfaceOp:'append'});
  await this.sessions.flush(session);signal.throwIfAborted();
  return this.readPanelImage(session,result.image.attachmentId,signal);
 }
 /** New conversation: user input before the first turn must enter through the
  * public Agent inbox, so the Loop commits its system head before it. Nothing
  * wakes the driver; the next turn (the user's own prompt) carries the image. */
 async #queuePanelImage(session,id,signal,obtain,leading) {
  const agent=this.agents?.get(id);
  if(!agent||agent.session!==session)throw Error('CONVERSATION_AGENT_REQUIRED');
  const sourceMessageId=`workshop-link-${randomUUID()}`;
  const result=await this.#lock(id,async()=>{
   const {core,state}=await this.#load(id,true);
   if(!same(core.identity,coreIdentity(session.header,id)))throw Error('SESSION_MISMATCH');
   return this.#bindImage(id,core,state,await obtain(),sourceMessageId,signal,()=>true);
  });
  if(this.sessions.get(id)!==session||this.agents.get(id)!==agent)throw Error('SESSION_MISMATCH');
  signal.throwIfAborted();
  agent.inject({id:sourceMessageId,role:'user',source:{kind:'user'},content:[...leading,{type:'image',attachment:result.image}]});
  await this.sessions.flush(session);signal.throwIfAborted();
  return this.readPanelImage(session,result.image.attachmentId,signal);
 }
 /** Public operator panel path for a local image the user picked. Same Session
  * check, store, bind and new/started conversation semantics as a link; the
  * bytes come from the user instead of HTTP. */
 async attachImageForPanel(session,upload,signal) {
  signal.throwIfAborted();
  const id=session?.header?.id;
  if(!id||this.sessions?.get(id)!==session)throw Error('SESSION_MISMATCH');
  const input=uploadedImageBytes(upload,this.#media$());
  if(!this.#started(session))return this.#queuePanelImage(session,id,signal,()=>input,[]);
  const sourceMessageId=`workshop-image-${randomUUID()}`;
  const result=await this.#lock(id,async()=>{
   const {core,state}=await this.#load(id,true);
   if(!same(core.identity,coreIdentity(session.header,id)))throw Error('SESSION_MISMATCH');
   return this.#bindImage(id,core,state,input,sourceMessageId,signal,()=>true);
  });
  if(this.sessions.get(id)!==session)throw Error('SESSION_MISMATCH');
  signal.throwIfAborted();
  session.append('user/message',{id:sourceMessageId,role:'user',source:{kind:'user'},content:[{type:'image',attachment:result.image}]},{surfaceOp:'append'});
  await this.sessions.flush(session);signal.throwIfAborted();
  return this.readPanelImage(session,result.image.attachmentId,signal);
 }
 /** Skill public port `hanaworlds_context`, registered by this plugin through the
  * official ctx.tools.register (context-tool.mjs). The Session is the native tool
  * execution's live Core Session; text, images and consent come only from Core user
  * messages, never from model arguments. World binding is Workshop's own projection,
  * set by the trusted Host through SwitchWorldContext. */
 async skillContext(action,args,exec) {
  const signal=exec?.signal;if(!signal?.throwIfAborted)throw Error('CANCELLATION_REQUIRED');signal.throwIfAborted();
  const session=exec?.agent?.session,id=session?.header?.id;if(!id)throw Error('AGENT_SESSION_REQUIRED');
  const live=this.sessions?.get?.(id);if(live&&live!==session)throw Error('SESSION_MISMATCH');
  if(live)await this.sessions.flush(live);signal.throwIfAborted();
  const {core,state}=await this.#load(id,true);
  if(!same(core.identity,coreIdentity(session.header,id)))throw Error('SESSION_MISMATCH');
  if(action==='images')return {sessionRef:id,images:await this.#conversationImages(core,state,null,signal)};
  const localContext=state.context.localContext;
  if(!localContext)throw Error('LOCAL_CONTEXT_REQUIRED: this conversation is not bound to a current world yet; the Host must bind it (session/v5 SwitchWorldContext) before building.');
  const base={contractVersion:VERSION,sessionRef:id,localContext:copy(localContext)};
  const run=async(operation,fields)=>{signal.throwIfAborted();const out=await this.call(operation,{...base,...fields});signal.throwIfAborted();if(out.error){const f=placementFailure(out.error);throw Error(f?`${f.failure}: ${out.error.code}/${out.error.reason}. ${C.confirmedPlacement.remedy}`:`${out.error.code}: ${operation} refused`);}return out.result;};
  if(action==='placement')return this.#lock(id,async()=>{
   const {core,state}=await this.#load(id,true),input=this.#human(core);
   if(state.requests[`AppendMultimodalTurn:${input.id}`]?.response)throw Error('HUMAN_CONFIRMATION_REQUIRED: this request was already proposed; show that proposal and wait for a new human message before changing it.');
   if(!same(state.context.localContext,localContext))placementFail('PLACEMENT_WORLD_CHANGED');
   await this.#current(base,state);
   const footprint={widthCells:args.width,depthCells:args.depth,heightCells:args.height};
   const inspected=await this.#canvas('InspectPlacementRegion',this.#child({...base,requestId:`placement-source-${randomUUID()}`},'inspection',{anchor:{kind:'CURRENT_VIEW',invocationId:input.id},footprint}));
   signal.throwIfAborted();if(inspected.outcome!=='REGION_INSPECTED')fail('TARGET_REQUIRED');
   const inspection=C.validateRegionInspection(inspected.inspection);
   if(inspection.targetFacts.worldRef!==localContext.worldRef)placementFail('PLACEMENT_WORLD_CHANGED');
   const live=await this.#core(id);if(this.#human(live).id!==input.id)placementFail('PLACEMENT_BINDING_CHANGED');
   await this.#current(base,state);
   const ref=`placement-source-${randomUUID()}`;state.placementSources[ref]={inputId:input.id,localContext:copy(localContext),inspection:copy(inspection)};
   await this.#save(id,core,state);return {placementSourceRef:ref,inspection:copy(inspection),next:placementNext(ref)};
  }).catch(error=>{throw explainPlacement(error);});
  if(action==='prepare'){
   const input=this.#human(core),done=state.requests[`AppendMultimodalTurn:${input.id}`]?.response;
   if(done){if(done.error)throw Error(`${done.error.code}: the latest user message was already prepared and refused; ask the user for a new message.`);const retained=state.pending?.controls.placement??state.confirmed[done.result.turnRef]?.intent.confirmedIntent.placement;return {...copy(done.result),...(retained===undefined?{}:{placement:copy(retained)})};}
   let placement;
   if(args.placementTarget!==undefined||args.placementSourceRef!==undefined){
    const source=state.placementSources[args.placementSourceRef];
    if(!source||!args.placementTarget||source.inputId!==input.id||!same(source.localContext,localContext)){
     try{placementFail('PLACEMENT_BINDING_CHANGED');}catch(error){explainPlacement(error);if(source&&source.inputId!==input.id)error.message+=EARLIER_SOURCE;throw error;}
    }
    try{placement=C.createPlacementProposal(source.inspection,args.placementTarget);}catch(error){throw explainPlacement(error);}
   }
   const controls={purpose:args.purpose??null,dimensions:[args.width,args.depth,args.height].some(v=>v===undefined)?null:{width:args.width,depth:args.depth,height:args.height,unit:'node'},
    entrancePortalRefs:args.entrancePortalRefs??[],styleText:args.styleText??null,siteRules:args.siteRules??null,...(placement===undefined?{}:{placement})};
   if(controls.siteRules?.optionalLightRule!=null)throw Error('CAPABILITY_UNAVAILABLE: painter/v6:light-rule — no peer can check a light rule yet. Tell the player the light requirement is currently unavailable; it can be kept for later or left out (optionalLightRule null).');
   if(controls.siteRules)C.requireSiteRuleChecks(controls.siteRules,{entrance:true});
   const media=await this.#conversationImages(core,state,args.imageRefs??input.images,signal);
   const result=await run('AppendMultimodalTurn',{requestId:input.id,expectedRevision:state.context.sessionRevision,turnRef:`${media.length?'image':'text'}:${input.id}`,text:input.text,media,controls});
   return {...result,...(placement===undefined?{}:{placement:copy(placement)})};
  }
  if(action==='confirm'){
   const pending=state.pending,input=this.#human(core);
   if(!pending||input.id===pending.invocationId)throw Error('HUMAN_CONFIRMATION_REQUIRED: show the pending question and wait for a new user message; tool output is never consent.');
   return run('AnswerClarification',{requestId:input.id,expectedRevision:state.context.sessionRevision,turnRef:pending.turnRef,clarificationId:pending.clarificationId,answer:input.text});
  }
  if(action==='read'){
   const {turn}=this.#turn(state),requestId=`context:${turn.turnRevision}`;
   const context=await this.readBuildProposalContext({...base,requestId,worldRef:localContext.worldRef,expectedTurnRevision:turn.turnRevision}).catch(error=>{
    const g=error?.detail?.guardRefusal;if(!g)throw explainPlacement(error);
    throw Error(`${pub(error).code}: engine guard ${g.guard} refused at ${g.stage} (${g.finding}); tell the user why this place cannot be built on now.`);});
   signal.throwIfAborted();return {proposalRef:requestId,context};
  }
  throw Error('CONTEXT_ACTION_UNKNOWN');
 }
 /** Latest human Core message: its text and its own images plus images returned by tools after it. */
 #human(core) {
  const at=core.events.findLastIndex(e=>e.type==='user/message'&&e.data?.role==='user'&&e.data?.source?.kind==='user');
  const message=core.events[at]?.data;
  if(at<0||core.events[at].surfaceOp!=='append'||!message?.id||message.content?.some(p=>p.type!=='text'&&p.type!=='image'))throw Error('HUMAN_TEXT_REQUIRED: no user message in this conversation to act on.');
  const images=message.content.filter(p=>p.type==='image').map(p=>p.attachment.attachmentId);
  for(const e of core.events.slice(at+1))if(e.type==='tool/result'&&e.surfaceOp==='append'&&!e.data?.message?.isError)for(const p of e.data.message.content??[])if(p.type==='image')images.push(p.attachment.attachmentId);
  return {id:message.id,text:message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n'),images};
 }
 /** Media bindings of images actually in this conversation: user uploads or tool-downloaded links. `refs` null lists all. */
 async #conversationImages(core,state,refs,signal) {
  const found=new Map();
  for(const e of core.events){const m=e.type==='user/message'?e.data:e.type==='tool/result'&&!e.data?.message?.isError?e.data?.message:null;
   if(e.surfaceOp!=='append'||!m||(e.type==='user/message'&&(m.role!=='user'||m.source?.kind!=='user')))continue;
   for(const p of m.content??[])if(p.type==='image')found.set(p.attachment.attachmentId,p.attachment);}
  const wanted=refs??[...found.keys()],out=[];
  for(const ref of new Set(wanted)){
   const attachment=found.get(ref);if(!attachment)throw Error(`ATTACHMENT_NOT_IN_SESSION: ${ref} is not an image of this conversation; use action images for actual references.`);
   const bound=state.images?.[ref]?.media;if(bound){out.push(copy(bound));continue;}
   const stored=await this.#media$().readImage(attachment,signal);signal.throwIfAborted();out.push(mediaBinding(stored.ref,stored.data));
  }
  return out;
 }
 /** Building skill image step for one conversation's agent (prompt section +
  * read-only tool set). Returns the disposer; see image-ask.mjs. */
 prepareImageAsk(agent) {return prepareImageAsk(agent);}
 async readPanelImage(session,attachmentId,signal) {
  signal.throwIfAborted();
  const id=session?.header?.id;
  if(!id||this.sessions?.get(id)!==session)throw Error('SESSION_MISMATCH');
  const {core,state}=await this.#load(id);
  if(!same(core.identity,coreIdentity(session.header,id)))throw Error('SESSION_MISMATCH');
  const record=state.images?.[attachmentId];
  if(!record)throw Error('ATTACHMENT_REJECTED');
  const ref=imageRef(record.media);
  const linked=core.events.some(e=>e.type==='user/message'&&e.surfaceOp==='append'&&e.data?.role==='user'&&e.data?.source?.kind==='user'&&e.data.content?.some(p=>p.type==='image'&&same(p.attachment,ref)));
  const inbox=!linked&&this.agents?.get(id)?.inbox;
  const queued=!!inbox&&[...inbox.nextStep,...inbox.nextTurn].some(m=>m.id===record.sourceMessageId&&m.role==='user'&&m.source?.kind==='user'&&m.content?.some(p=>p.type==='image'&&same(p.attachment,ref)));
  if(!linked&&!queued)throw Error('ATTACHMENT_NOT_IN_SESSION');
  const stored=await this.attachments.readImage(ref,signal);signal.throwIfAborted();
  if(!same(mediaBinding(stored.ref,stored.data),record.media))throw Error('MEDIA_DIGEST_MISMATCH');
  if(this.sessions.get(id)!==session)throw Error('SESSION_MISMATCH');
  return {sessionRef:id,status:linked?'ATTACHED':'QUEUED_FOR_NEXT_TURN',sourceMessageId:record.sourceMessageId,media:copy(record.media),image:ref,data:Buffer.from(stored.data).toString('base64')};
 }
 async #media(items,core,state) {
  if(!items.length)return [];
  if(!this.attachments?.readImage)fail('CAPABILITY_UNAVAILABLE');
  const accepted=[];
  for(const item of items){
   const ref=imageRef(item);
   const fromDownload=state.images?.[item.attachmentRef];
   const fromUser=core.events.some(e=>e.type==='user/message'&&e.surfaceOp==='append'&&e.data?.role==='user'&&e.data?.source?.kind==='user'&&e.data.content?.some(p=>p.type==='image'&&p.attachment?.attachmentId===ref.attachmentId&&p.attachment.mediaType===ref.mediaType&&p.attachment.bytes===ref.bytes&&p.attachment.width===ref.width&&p.attachment.height===ref.height));
   if(!fromDownload&&!fromUser)fail('ATTACHMENT_REJECTED');
   if(fromDownload&&!same(fromDownload.media,item))fail('MEDIA_DIGEST_MISMATCH');
   if(!this.capabilities?.imageMediaTypes?.includes(item.mediaType))fail('CAPABILITY_UNAVAILABLE');
   const stored=await this.attachments.readImage(ref);
   const actual=mediaBinding(stored.ref,stored.data);
   if(!same(actual,item))fail('MEDIA_DIGEST_MISMATCH');
   accepted.push(copy(actual));
  }
  return accepted;
 }
 async #dispatch(operation,body,core,state) {
  // Tool receipts describe the native request already in Core, never a model
  // claimed by a tool caller. A pre-request fixture/Host uses its selected default.
  let model=null;
  if(['AppendMultimodalTurn','AnswerClarification'].includes(operation)){
   const live=this.sessions?.get(body.sessionRef);
   if(live&&!same(core.identity,coreIdentity(live.header,body.sessionRef)))fail('SESSION_NOT_FOUND');
   // Native tools may run before the asynchronous JSONL writer has flushed the
   // current header; the same live Core Session is authoritative at that point.
   try{model=sessionModel(live?.snapshotEvents?.()??core.events,{initial:()=>this.defaultModel?.currentSelection?.()??this.agents?.get(body.sessionRef)?.options}).model;}
   catch(error){if(error.message==='MODEL_SELECTION_UNAVAILABLE')fail('CAPABILITY_UNAVAILABLE');throw error;}
  }
  if(operation==='SwitchWorldContext'){
   if(Object.values(state.builds).some(b=>b.dispatched&&!b.outcome&&!b.terminal))fail('RECOVERY_PENDING');
   const context=await this.#selection(body);if(body.selectionRevision!==context.selectionRevision)fail('CURRENT_WORLD_MISMATCH');
   state.context={...copy(context),sessionRevision:state.context.sessionRevision};state.pending=null;
   return {context:copy(state.context),turns:state.turns,capabilities:this.#publicCapabilities(),sessionDeleteSupported:false};
  }
  if(operation==='AppendMultimodalTurn'){
   const media=await this.#media(body.media,core,state);
   if(state.turns.some(t=>t.turnRef===body.turnRef))fail('REPLAY_MISMATCH');
   const dims=body.controls.dimensions,rules=body.controls.siteRules;
   // Rule values are the skill's proposal; a rule no peer of this major can check is refused by name, never ignored.
   if(rules)C.requireSiteRuleChecks(rules,{entrance:true});
   const complete=body.text.trim()&&body.controls.purpose?.trim()&&dims?.unit==='node'&&['width','height','depth'].every(k=>Number.isSafeInteger(dims[k])&&dims[k]>0)&&rules!==null&&(!rules.requireEntranceConnectivity||rules.entranceClearance!==null);
   let placementInspection=null;
   if(body.controls.placement!==undefined){
    const source=Object.values(state.placementSources).find(s=>s.inputId===body.requestId&&same(s.localContext,body.localContext)&&s.inspection.inspectionId===body.controls.placement.source.inspectionId);
    if(!source||source.inputId!==this.#human(core).id||body.text!==this.#human(core).text)placementFail('PLACEMENT_BINDING_CHANGED');
    C.requirePlacementSource(body.controls.placement,source.inspection,body.localContext.worldRef);
    if(!same(body.controls.placement,C.createPlacementProposal(source.inspection,body.controls.placement.target)))placementFail('PLACEMENT_BINDING_CHANGED');
    placementInspection=copy(source.inspection);
   }
   const turn={turnRef:body.turnRef,turnRevision:revision(),text:body.text,media,referenceBriefDigest:null,intentDigest:null,actionReceiptDigest:null};state.turns.push(turn);
   const positionText=body.controls.placement===undefined?'':`；已提议位置（世界${body.controls.placement.worldRef}）：${placementText(body.controls.placement.target)} ${JSON.stringify(body.controls.placement.target)}`;
   const proposalText=`；提议内容：${body.controls.purpose}${body.controls.styleText?`；样式：${body.controls.styleText}`:''}`;
   const question=complete?`请确认建造${body.text}，尺寸${dims.width}×${dims.depth}×${dims.height}个节点${proposalText}；场地规则：${siteRulesText(rules)}${positionText}。回复“确认”或修改。`:
    rules===null?'请由当前skill提出入口、危险物、光照规则选项并补齐用途和节点尺寸后重新提交。':'请由当前skill补齐用途、节点尺寸和所需入口净空后重新提交。';
   state.pending={sessionRef:body.sessionRef,turnRef:turn.turnRef,turnRevision:turn.turnRevision,invocationId:body.requestId,clarificationId:revision(),question,complete:!!complete,controls:body.controls,placementInspection,afterSeq:core.events.length-1};
   state.details[turn.turnRef]={resultText:question,confirmedBrief:null};
   return this.#turnReceipt(body,state,turn,question,this.#clarification(state.pending),model);
  }
  if(operation==='AnswerClarification'){
   const pending=state.pending,turn=state.turns.at(-1);
   if(!pending||pending.turnRef!==body.turnRef||pending.clarificationId!==body.clarificationId||turn.turnRef!==body.turnRef)fail('TURN_REVISION_MISMATCH');
   const inputs=core.events.slice(pending.afterSeq+1).filter(e=>e.type==='user/message');
   const e=inputs[0],message=e?.data;
   if(inputs.length!==1||e.surfaceOp!=='append'||message?.role!=='user'||message?.source?.kind!=='user'||message.id!==body.requestId||message.content?.length!==1||message.content[0].type!=='text'||message.content[0].text!==body.answer)fail('INTENT_UNCONFIRMED');
   if(!pending.complete||!['确认','yes','YES'].includes(body.answer.trim())){
    pending.complete=false;pending.afterSeq=core.events.length-1;pending.clarificationId=revision();pending.question='请更新建造参数并重新提交，之后再确认。';
    return this.#turnReceipt(body,state,turn,pending.question,this.#clarification(pending),model);
   }
   const brief=C.validateType('BriefProjection',{contractVersion:'ReferenceBrief/v5',sessionRef:body.sessionRef,turnRevision:turn.turnRevision,briefRevision:revision(),media:await this.#media(turn.media,core,state),text:turn.text,controls:pending.controls});
   const briefDigest=digest('reference-brief',brief);
   const intent=C.validateType('IntentProjection',{contractVersion:VERSION,referenceBriefDigest:briefDigest,confirmedIntent:{kind:'BUILD_STRUCTURE',text:turn.text,purpose:pending.controls.purpose,dimensions:pending.controls.dimensions,entrancePortalRefs:pending.controls.entrancePortalRefs,confirmedTurnRevision:turn.turnRevision,siteRules:pending.controls.siteRules,...(pending.controls.placement===undefined?{}:{placement:pending.controls.placement})},intendedWorldRef:body.localContext.worldRef,orderedTargetRefs:[]});
   C.confirmedPlacementOf(intent,brief);
   turn.referenceBriefDigest=briefDigest;turn.intentDigest=digest('intent',intent);
   state.confirmed[turn.turnRef]={brief,intent,confirmationInputId:message.id,localContext:copy(body.localContext),placementInspection:copy(pending.placementInspection)};state.pending=null;
   state.details[turn.turnRef]={resultText:'已确认建造意图。',confirmedBrief:brief};return this.#turnReceipt(body,state,turn,'已确认建造意图。',null,model);
  }
  if(operation==='ReadSessionTurnDetails')return {sessionRef:body.sessionRef,sessionRevision:state.context.sessionRevision,turns:state.turns.map(t=>({turnRef:t.turnRef,turnRevision:t.turnRevision,userText:t.text,...state.details[t.turnRef]}))};
  if(operation==='AdvanceCurrentBuild')return this.#advance(body,core,state);
  if(operation==='ReadCurrentUndoStatus')return (await this.#undoStatus(body,state)).status;
  if(operation==='UndoCurrentBuild')return this.#undo(body,core,state);
  fail('CAPABILITY_UNAVAILABLE');
 }
 #clarification(p){return {sessionRef:p.sessionRef,turnRevision:p.turnRevision,invocationId:p.invocationId,clarificationId:p.clarificationId,code:'AMBIGUOUS_INTENT',question:p.question};}
 #turnReceipt(body,state,turn,text,clarification,model){return {sessionRef:body.sessionRef,turnRef:turn.turnRef,turnRevision:turn.turnRevision,briefDigest:turn.referenceBriefDigest,model,resultText:text,clarification};}
 async #context(body,state,stored) {
  const {turn,saved}=this.#turn(state);await this.#current(body,state);
  if(body.expectedTurnRevision&&body.expectedTurnRevision!==turn.turnRevision)fail('TURN_REVISION_MISMATCH');
  const catalogue=C.validateType('Catalogue',await this.catalogue.read(body.localContext.worldRef));
  // Sole SafetyProfile source: invariants plus the player-confirmed site rules bound by intentDigest.
  const safetyProfile=C.safetyProfileFromConfirmedIntent(saved.intent);
  const region=C.validateRegionInspection(stored.inspection);
  return copy(C.validateType('BuildProposalContext',{contractVersion:'painter/v6',sessionRef:body.sessionRef,worldRef:body.localContext.worldRef,turnRevision:turn.turnRevision,painterId:'building-exterior',invocationId:stored.invocationId,intent:saved.intent,intentDigest:turn.intentDigest,referenceBrief:saved.brief,referenceBriefDigest:turn.referenceBriefDigest,catalogue,targetFacts:region.targetFacts,targetFactsDigest:region.targetFactsDigest,safetyProfile,safetyProfileDigest:digest('safety-profile',safetyProfile),regionInspection:region,localContext:body.localContext}));
 }
 async readBuildProposalContext(raw) {
  const body=copy(C.validateBoundRequest(VERSION,'AdvanceCurrentBuild',raw));
  return this.#lock(body.sessionRef,async()=>{
   const {core,state}=await this.#load(body.sessionRef);C.validateCurrentRequest(VERSION,'AdvanceCurrentBuild',body,await this.#facts(body,state));
   const {turn,saved}=this.#turn(state);let stored=state.contexts[body.requestId];
   if(!stored){
    if(state.builds[turn.turnRef]?.dispatched)fail('TRANSACTION_CONFLICT');
    const dims=saved.intent.confirmedIntent.dimensions,confirmed=C.confirmedPlacementOf(saved.intent,saved.brief);
    let inspection;
    if(confirmed!==null){
     if(!saved.placementInspection)placementFail('PLACEMENT_BINDING_CHANGED');
     C.requirePlacementSource(confirmed,saved.placementInspection,body.localContext.worldRef);inspection=copy(saved.placementInspection);
    }else{
     const placement=await this.#canvas('InspectPlacementRegion',this.#child(body,'placement',{anchor:{kind:'CURRENT_VIEW',invocationId:saved.confirmationInputId},footprint:{widthCells:dims.width,depthCells:dims.depth,heightCells:dims.height}}));
     if(placement.outcome!=='REGION_INSPECTED')fail('TARGET_REQUIRED');inspection=placement.inspection;
    }
    stored={invocationId:`proposal-${randomUUID()}`,inspection,context:null,request:null,response:null};
    stored.context=await this.#context(body,state,stored);state.contexts[body.requestId]=stored;state.currentContextId=body.requestId;await this.#save(body.sessionRef,core,state);
   }
   const current=await this.#context(body,state,stored);if(!same(current,stored.context))fail('TARGET_FACTS_STALE');return copy(stored.context);
  });
 }
 async #proposalFacts(request,state,stored) {
  if(!stored||state.contexts[state.currentContextId]!==stored)fail('TARGET_FACTS_STALE');
  const currentContext=await this.#context(request,state,stored);
  const record=stored.response?{response:stored.response,digest:C.requestDigest('painter/v6','ValidateBuildProposal',stored.request)}:null;
  const requestFacts=await this.#facts(request,state,record);
  return C.validateType('BuildProposalProviderFacts',{sourceContext:stored.context,currentContext,requestFacts});
 }
 /** Host-only read port for Painter local facts. It deliberately does not take
  * the mutation lock: Painter calls back while submitBuildProposal holds it.
  * Only already-reserved exact public requests can read these own facts. */
 async readBuildProposalProviderFacts(raw) {
  const request=copy(C.validateBuildProposalRequest(raw));
  return this.#readProposalProviderFacts('PER_CELL',request,async(state,stored)=>{
   const facts=await this.#proposalFacts(request,state,stored);
   C.validateBuildProposalContext(request,facts);return facts;
  });
 }
 /** Host-only Region counterpart: exact retained ValidateRegionProposalRequest
  * in, public LocalRequestFacts out. Reentrant during the locked Painter call;
  * facts come from the committed Workshop projection and fresh Canvas selection. */
 async readRegionProposalProviderFacts(raw) {
  const request=copy(C.validateRegionProposalRequest(raw));
  return this.#readProposalProviderFacts('REGION',request,async(state,stored)=>{
   if(state.contexts[state.currentContextId]!==stored)fail('TARGET_FACTS_STALE');
   if(!same(await this.#regionContext(request,state,stored),stored.context))fail('TARGET_FACTS_STALE');
   const record=stored.response?{response:stored.response,digest:C.requestDigest('painter-region/v3','ValidateRegionProposal',stored.request)}:null;
   const facts=await this.#facts(request,state,record);
   C.validateCurrentRequest('painter-region/v3','ValidateRegionProposal',request,facts);return facts;
  });
 }
 // Shared exact-retention and read stability boundary. No reservation, write or
 // mutation lock here. Reject a snapshot superseded while external reads await.
 async #readProposalProviderFacts(method,request,readFacts) {
  const persistence=this.sessionPersistence,projection=this.projectionStore,canvas=this.canvas,catalogue=this.catalogue;
  await this.readSessionMetadata(request.sessionRef);
  const {core,state}=await this.#load(request.sessionRef);
  const stored=Object.values(state.contexts).find(x=>x.invocationId===request.invocationId);
  if(!stored?.request||(stored.method??'PER_CELL')!==method||!same(stored.request,request))fail('TRANSACTION_CONFLICT');
  const facts=await readFacts(state,stored);
  if(!sameProvider(persistence,this.sessionPersistence)||projection!==this.projectionStore)fail('SESSION_NOT_FOUND');
  if(!sameProvider(canvas,this.canvas)||!sameProvider(catalogue,this.catalogue))fail('CURRENT_WORLD_MISMATCH');
  const live=await this.#load(request.sessionRef);
  if(!same(live.core.identity,core.identity))fail('SESSION_NOT_FOUND');
  if(live.state.context.sessionRevision!==state.context.sessionRevision)fail('TARGET_FACTS_STALE');
  return copy(facts);
 }
 /** Existing proposal entry: the PER_CELL write method. */
 async submitBuildProposal(raw) {return (await this.#submit(raw,'PER_CELL')).response;}
 /** Same skill, either self-described write method. Returns a Workshop business
  * envelope around the exact painter/v6 or painter-region/v3 response; unmet needs
  * are explained and nothing is sent to Painter. No method switch, truncation or
  * target rewrite. */
 async submitWriteProposal(method,raw) {const {availability,response,effectSummary}=await this.#submit(raw,method);return {method,availability,response,...(effectSummary?{effectSummary}:{})};}
 #writeFacts() {return {ports:{painter:this.painter,brush:this.brush,canvas:this.canvas,painterRegion:this.painterRegion,brushRegion:this.brushRegion,canvasRegion:this.canvasRegion}};}
 #gate(method) {const availability=evaluateWriteMethod(method,this.#writeFacts());if(!availability.available)fail('CAPABILITY_UNAVAILABLE');return availability;}
 /** Contract WriteMethodDescriptors plus current availability; read-only. */
 async describeWriteTools(sessionRef=null) {
  const facts=this.#writeFacts();let current=null,worldSource=null;
  if(sessionRef!==null){
   let state=null;try{state=(await this.#load(sessionRef)).state;}catch(error){if(error?.code!=='SESSION_NOT_FOUND'&&error?.name!=='SessionPersistenceNotFoundError')throw error;}
   facts.session={found:!!state};
   if(state){let confirmed=true;try{this.#turn(state);}catch(error){if(error?.code!=='INTENT_UNCONFIRMED')throw error;confirmed=false;}
    facts.session.worldBound=!!state.context.localContext&&state.context.activeWorldRef===state.context.localContext.worldRef;facts.session.intentConfirmed=confirmed;
    if(facts.session.worldBound){const catalogue=C.validateType('Catalogue',await this.catalogue.read(state.context.activeWorldRef));worldSource={worldRef:state.context.activeWorldRef,geometry:this.capabilities?.worldGeometry??null,catalogue};}
    const turn=state.turns.at(-1),build=turn&&state.builds[turn.turnRef];
    if(build){const r=build.region;
     current={turnRef:turn.turnRef,method:build.method??'PER_CELL',outcome:r?(r.result?.status??(r.dispatched?'PENDING':'VALIDATED')):(build.outcome?.outcome??(build.terminal??(build.dispatched?'PENDING':'VALIDATED'))),undo:r?.undo?.result?.status??null};}}
  }
  return copy({skillGuidance:writeToolSkillGuidance,tools:WRITE_METHODS.map(method=>describeWriteMethod(method,facts)),currentBuild:current,worldSource});
 }
 /** PER_CELL delegates to readBuildProposalContext. REGION captures the current
  * confirmed brief (with verified media), intent and catalogue for painter-region/v3;
  * the region itself is in world node coordinates. Structured placement uses the retained
  * native placement inspection; Canvas checks its own record before writing. */
 async readWriteProposalContext(method,raw) {
  if(method==='PER_CELL')return this.readBuildProposalContext(raw);
  if(method!=='REGION')fail('CAPABILITY_UNAVAILABLE');
  const body=copy(C.validateBoundRequest(VERSION,'AdvanceCurrentBuild',raw));
  return this.#lock(body.sessionRef,async()=>{
   const {core,state}=await this.#load(body.sessionRef);C.validateCurrentRequest(VERSION,'AdvanceCurrentBuild',body,await this.#facts(body,state));
   const {turn}=this.#turn(state);if(body.expectedTurnRevision!==turn.turnRevision)fail('TURN_REVISION_MISMATCH');
   let stored=state.contexts[body.requestId];
   if(!stored){
    if(state.builds[turn.turnRef]?.dispatched||state.builds[turn.turnRef]?.region?.dispatched)fail('TRANSACTION_CONFLICT');
    stored={method:'REGION',invocationId:`region-proposal-${randomUUID()}`,context:null,request:null,response:null};
    stored.context=await this.#regionContext(body,state,stored);state.contexts[body.requestId]=stored;state.currentContextId=body.requestId;await this.#save(body.sessionRef,core,state);
   }
   if(stored.method!=='REGION')fail('REPLAY_MISMATCH');
   if(!same(await this.#regionContext(body,state,stored),stored.context))fail('TARGET_FACTS_STALE');return copy(stored.context);
  });
 }
 async #regionContext(body,state,stored) {
  const {turn,saved}=this.#turn(state);await this.#current(body,state);
  // The region path has no entrance check in this major: a confirmed entrance requirement is refused by name.
  C.requireSiteRuleChecks(saved.intent.confirmedIntent.siteRules,{entrance:false});
  const catalogue=C.validateType('Catalogue',await this.catalogue.read(body.localContext.worldRef));
  return copy({contractVersion:'painter-region/v3',sessionRef:body.sessionRef,worldRef:body.localContext.worldRef,turnRevision:turn.turnRevision,invocationId:stored.invocationId,intent:saved.intent,intentDigest:turn.intentDigest,referenceBrief:saved.brief,referenceBriefDigest:turn.referenceBriefDigest,catalogue,catalogueDigest:digest('catalogue',catalogue),localContext:copy(body.localContext)});
 }
 async #submit(raw,method) {
  let request,availability=null;const region=method==='REGION';
  try {
   if(!WRITE_METHODS.includes(method)){availability=evaluateWriteMethod(method,this.#writeFacts());fail('CAPABILITY_UNAVAILABLE');}
   request=copy(region?C.validateRegionProposalRequest(raw):C.validateBuildProposalRequest(raw));return await this.#lock(request.sessionRef,async()=>{
   availability=evaluateWriteMethod(method,this.#writeFacts());if(!availability.available)fail(!region&&availability.unmet.some(u=>u.code==='UNSUPPORTED_VERSION')?'UNSUPPORTED_VERSION':'CAPABILITY_UNAVAILABLE');
   const {core,state}=await this.#load(request.sessionRef);const stored=Object.values(state.contexts).find(x=>x.invocationId===request.invocationId);
   if(!stored||(stored.method??'PER_CELL')!==method||state.contexts[state.currentContextId]!==stored)fail(stored&&(stored.method??'PER_CELL')!==method?'REPLAY_MISMATCH':'TARGET_FACTS_STALE');
   if(region){
    if(!same(withoutRequest(request),stored.context))fail('TRANSACTION_CONFLICT');
    if(!same(await this.#regionContext(request,state,stored),stored.context))fail('TARGET_FACTS_STALE');
   }else{const facts=await this.#proposalFacts(request,state,stored);C.validateBuildProposalContext(request,facts);}
   const effects=response=>region?(response.error?{}:{effectSummary:regionEffectSummary(response.result.build.block,stored.context.intent.confirmedIntent)}):{effectSummary:cellEffectSummary(request)};
   if(stored.response)return {availability,response:copy(stored.response),...effects(stored.response)};
   if(stored.request&&!same(stored.request,request))fail('REPLAY_MISMATCH');
   const {turn}=this.#turn(state);if(state.builds[turn.turnRef]?.dispatched||state.builds[turn.turnRef]?.region?.dispatched)fail('TRANSACTION_CONFLICT');
   const painter=region?this.painterRegion:this.#protocolPeer(this.painter,PER_CELL_PAINTER);stored.request=copy(request);await this.#save(request.sessionRef,core,state);
   const response=region?C.validateRegionProposalResponse(request,await painter.call('ValidateRegionProposal',copy(request))):C.validateBuildProposalResponse(request,await painter.call('ValidateBuildProposal',copy(request)));
   if(region){if(!same(await this.#regionContext(request,state,stored),stored.context))fail('TARGET_FACTS_STALE');}
   else C.validateBuildProposalContext(request,await this.#proposalFacts(request,state,stored));
   if(painter!==(region?this.painterRegion:this.painter))fail('CURRENT_WORLD_MISMATCH');
   if(!response.error){stored.response=copy(response);state.builds[turn.turnRef]={contextId:state.currentContextId,method,plan:response.result,compiled:null,submission:null,dispatched:false,outcome:null,...(region?{region:{compiled:null,commitRequest:null,dispatched:false,result:null,undo:null}}:{})};await this.#save(request.sessionRef,core,state);}
   return {availability,response:copy(response),...effects(response)};
  });}catch(error){return {availability,response:packet(region?'painter-region/v3':'painter/v6',request?.requestId??raw?.requestId??null,null,pub(error))};}
 }
 /** REGION Advance: validated plan → Brush CompileRegionBuild → Canvas
  * ApplyRegionCommit (one logical transaction). Request is persisted before
  * dispatch; a dispatched commit without result stays PENDING, never re-sent. */
 async advanceRegionBuild(raw) {
  let body;
  try {body=copy(C.validateBoundRequest(VERSION,'AdvanceCurrentBuild',raw));return await this.#lock(body.sessionRef,async()=>{
   const {core,state}=await this.#load(body.sessionRef);C.validateCurrentRequest(VERSION,'AdvanceCurrentBuild',body,await this.#facts(body,state));
   const {turn,saved}=this.#turn(state),build=state.builds[turn.turnRef];
   if(body.expectedTurnRevision!==turn.turnRevision)fail('TURN_REVISION_MISMATCH');
   if(build?.method!=='REGION')fail('TARGET_REQUIRED');const r=build.region;
   const out=(result,outcome)=>({method:'REGION',sessionRef:body.sessionRef,worldRef:body.worldRef,turnRevision:turn.turnRevision,outcome,result,error:null});
   if(r.result)return out(copy(r.result),r.result.status);
   if(r.dispatched)return out(null,'PENDING');
   this.#gate('REGION');
   const ctx=state.contexts[build.contextId].context,settings=await this.compilerConfig.read(body.worldRef);
   // Chunk partition comes from the world source's declaration, for the block's own geometry profile;
   // nothing declared (or another profile) is a named CAPABILITY_GAP, never an assumed edge.
   const geometry=C.requireGeometryProfile(this.capabilities?.worldGeometry??null,build.plan.build.block.geometryProfile);
   const compile={contractVersion:'region-build/v2',sessionRef:body.sessionRef,requestId:`${body.requestId}:region-compile`,worldRef:body.worldRef,build:build.plan.build,buildDigest:build.plan.buildDigest,catalogue:ctx.catalogue,catalogueDigest:ctx.catalogueDigest,partition:copy(geometry.partition),compilerRevision:settings.compilerRevision,localContext:body.localContext};
   const brush=this.brushRegion,compiled=C.validateCompiledRegionSet(compile,await brush.call('CompileRegionBuild',copy(compile)));
   if(compiled.error)peerFail(compiled);if(brush!==this.brushRegion)fail('CURRENT_WORLD_MISMATCH');
   await this.#current(body,state);r.compiled=compiled.result;
   const binding=C.confirmedPlacementBinding(saved.intent);
   const apply={contractVersion:'canvas-region/v3',sessionRef:body.sessionRef,requestId:`${body.requestId}:region-apply`,worldRef:body.worldRef,transactionId:`region-${randomUUID()}`,operations:compiled.result.projection,operationDigest:compiled.result.operationDigest,guarantee:'RECOVERABLE_VERIFIED',localContext:body.localContext,...(binding===null?{}:{confirmedPlacement:binding})};
   C.validateRegionCommitSubmission(saved.intent,saved.brief,apply);
   r.commitRequest=apply;r.dispatched=true;await this.#save(body.sessionRef,core,state);
   let response;try{response=await this.canvasRegion.call('ApplyRegionCommit',copy(apply));}catch{return out(null,'PENDING');}
   response=C.validateRegionCommit(apply,response);
   if(response.error){if(response.error.mutationState==='NONE'){r.dispatched=false;await this.#save(body.sessionRef,core,state);}peerFail(response);}
   const result=response.result;
   if(result.status==='VERIFIED'&&!same(result.actualSummary,result.expectedAfterSummary))fail('READBACK_MISMATCH',{mutationState:'UNKNOWN',transactionRef:apply.transactionId});
   r.result=copy(result);if(result.status==='VERIFIED')turn.actionReceiptDigest=digest('region-summary',result.actualSummary);
   state.details[turn.turnRef].resultText=result.status==='VERIFIED'?'区域写入已验证，整片读回一致。':'区域写入失败，已整体回滚。';await this.#save(body.sessionRef,core,state);
   if(result.status==='ROLLED_BACK')fail('APPLY_FAILED',{mutationState:'ROLLED_BACK',transactionRef:apply.transactionId});
   return out(copy(result),'VERIFIED');
  });}catch(error){return regionFailure(body,raw,error);}
 }
 /** Whole-region Undo of the latest VERIFIED region build: same transaction, Canvas decides. */
 async undoRegionBuild(raw) {
  let body;
  try {body=copy(C.validateBoundRequest(VERSION,'UndoCurrentBuild',raw));return await this.#lock(body.sessionRef,async()=>{
   const {core,state}=await this.#load(body.sessionRef);await this.#current(body,state);
   const turn=state.turns.findLast(t=>state.builds[t.turnRef]?.region?.result?.status==='VERIFIED'),r=turn&&state.builds[turn.turnRef].region;
   if(!r||body.expectedTurnRevision!==turn.turnRevision||body.expectedHistoryRevision!==r.result.historyRevision)fail('UNDO_CONFLICT');
   const out=(result,outcome)=>({method:'REGION',sessionRef:body.sessionRef,worldRef:body.worldRef,turnRevision:turn.turnRevision,outcome,result,error:null});
   if(r.undo?.result)return out(copy(r.undo.result),r.undo.result.status);
   if(r.undo)return out(null,'PENDING');
   this.#gate('REGION');
   const request={contractVersion:'canvas-region/v3',sessionRef:body.sessionRef,requestId:`${body.requestId}:region-undo`,worldRef:body.worldRef,originTransactionId:r.result.transactionId,undoTransactionId:`region-undo-${randomUUID()}`,expectedHistoryRevision:r.result.historyRevision,localContext:body.localContext};
   r.undo={request,result:null};await this.#save(body.sessionRef,core,state);
   let response;try{response=await this.canvasRegion.call('UndoRegionCommit',copy(request));}catch{return out(null,'PENDING');}
   response=C.validateRegionUndo(request,response,r.result);
   if(response.error){if(response.error.mutationState==='NONE'){r.undo=null;await this.#save(body.sessionRef,core,state);}peerFail(response);}
   r.undo.result=copy(response.result);await this.#save(body.sessionRef,core,state);
   if(response.result.status!=='VERIFIED')fail('APPLY_FAILED',{mutationState:'ROLLED_BACK',transactionRef:request.undoTransactionId});
   return out(copy(response.result),'VERIFIED');
  });}catch(error){return regionFailure(body,raw,error);}
 }
 async #advance(body,core,state) {
  const {turn,saved}=this.#turn(state),build=state.builds[turn.turnRef];if(!build)fail('TARGET_REQUIRED');
  if(build.method==='REGION')fail('UNSUPPORTED_OPERATION');
  if(state.undos[turn.turnRef]?.result)fail('UNDO_CONFLICT');
  if(build.outcome)return copy(build.outcome);
  const pending=()=>({sessionRef:body.sessionRef,worldRef:body.worldRef,turnRevision:turn.turnRevision,stage:'APPLY',outcome:'PENDING'});
  if(build.dispatched)return pending();
  const stored=state.contexts[build.contextId];C.validateBuildProposalContext(stored.request,await this.#proposalFacts(stored.request,state,stored));
  const ctx=stored.context,settings=await this.compilerConfig.read(body.worldRef);
  // The BUILD document's geometry profile must be one the current world source declares.
  C.requireGeometryProfile(this.capabilities?.worldGeometry??null,build.plan.build.geometryProfile);
  const compile={contractVersion:'BUILD/V5',sessionRef:body.sessionRef,requestId:`${body.requestId}:compile`,worldRef:body.worldRef,localContext:body.localContext,build:build.plan.build,buildDigest:build.plan.buildDigest,catalogue:ctx.catalogue,catalogueDigest:digest('catalogue',ctx.catalogue),targetFacts:ctx.targetFacts,targetFactsDigest:ctx.targetFactsDigest,safetyProfile:ctx.safetyProfile,safetyProfileDigest:ctx.safetyProfileDigest,compilationConfig:settings.compilationConfig,compilationConfigDigest:digest('compilation-config',settings.compilationConfig),compilerRevision:settings.compilerRevision};
  const brush=this.#protocolPeer(this.brush,PER_CELL_BRUSH);C.validateBoundRequest('BUILD/V5','BuildDocument',compile);
  const compiled=C.validateBoundResponse('BUILD/V5','BuildDocument',compile,await brush.compile(copy(compile)));
  if(compiled.error){const e=new Error(compiled.error.code);e.publicError=compiled.error;throw e;}
  await this.#current(body,state);build.compiled=compiled.result;
  const objects=await this.#canvas('ListObjects',this.#child(body,'objects',{expectedRevision:null}));
  const tx=`build-${randomUUID()}`;
  const analysis=await this.#canvas('AnalyzeAffectedObjects',this.#child(body,'analysis',{transactionId:tx,operations:compiled.result.projection,operationDigest:compiled.result.operationDigest,expectedRevision:ctx.targetFacts.worldRevision,expectedRegistryRevision:objects.registryRevision,expectedSelectionRevision:body.localContext.selectionRevision}));
  const binding=C.confirmedPlacementBinding(saved.intent);
  const apply=this.#child(body,'apply',{transactionId:tx,operations:compiled.result.projection,operationDigest:compiled.result.operationDigest,analysisDigest:digest('affected-analysis',analysis),decisionRevision:null,expectedWorldRevision:analysis.worldRevision,expectedObjectRevisions:{},guarantee:'RECOVERABLE_VERIFIED',regionInspectionBinding:{inspectionId:ctx.regionInspection.inspectionId,build:build.plan.build,...(binding===null?{}:{confirmedPlacement:binding})}});
  C.checkConfirmedPlacementApply(apply,ctx.regionInspection,analysis.worldRevision);
  const submission={parentRequest:body,turnRef:turn.turnRef,confirmationInputId:saved.confirmationInputId,intent:saved.intent,analysis,apply};
  C.validateCurrentBuildSubmission(submission,await this.#facts(body,state));build.submission=submission;await this.#save(body.sessionRef,core,state);
  C.validateCurrentBuildSubmission(submission,await this.#facts(body,state));
  build.dispatched=true;await this.#save(body.sessionRef,core,state);
  let receipt;
  try {receipt=await this.#canvas('ApplyRecoverableCommit',apply);}catch(error){
   if(['NONE','ROLLED_BACK'].includes(error.publicError?.mutationState))throw error;
   return pending();
  }
  build.receipt=receipt;await this.#save(body.sessionRef,core,state);
  if(receipt.status==='ROLLED_BACK'){build.terminal='ROLLED_BACK';await this.#save(body.sessionRef,core,state);fail('APPLY_FAILED',{mutationState:'ROLLED_BACK',transactionRef:tx});}
  if(receipt.status!=='VERIFIED')return pending();
  try {
   const readback=await this.#canvas('Readback',this.#child(body,'readback',{transactionId:tx,commitRevision:receipt.observedWorldRevision,expectedOperations:compiled.result.projection,transactionPayloadDigest:receipt.transactionPayloadDigest}));
   if(!same(readback,receipt))fail('READBACK_MISMATCH');
   const matches=await this.#linkedHistory(body,receipt);
   await this.#current(body,state);build.matches=matches;
  }catch(error){fail(error.publicError?.code??'READBACK_FAILED',{mutationState:'UNKNOWN',transactionRef:tx});}
  const outcome={sessionRef:body.sessionRef,worldRef:body.worldRef,turnRevision:turn.turnRevision,stage:'COMPLETE',outcome:'VERIFIED',receipt};
  build.outcome=outcome;turn.actionReceiptDigest=digest('receipt',receipt);state.details[turn.turnRef].resultText='建造已验证，且已读回当前世界与历史。';await this.#save(body.sessionRef,core,state);return outcome;
 }
 async #linkedHistory(body,receipt) {
  const inventory=await this.#canvas('ListObjects',this.#child(body,'linked-objects',{expectedRevision:null})),matches=[];
  for(const object of inventory.objects){const history=await this.#canvas('HistoryQuery',this.#child(body,`history:${object.objectRef}`,{objectRef:object.objectRef,expectedHistoryRevision:null}));
   const entry=history.entries.find(e=>e.transactionId===receipt.transactionId&&e.status==='VERIFIED'&&e.operationDigest===receipt.operationDigest&&e.expectedAfterReadbackDigest===receipt.readbackDigest&&e.receiptDigest===digest('receipt',receipt)&&e.affectedObjectRefs.includes(object.objectRef));
   if(entry)matches.push({object,history,entry});}
  if(!matches.length||matches.length!==matches[0].entry.affectedObjectRefs.length||!matches[0].entry.affectedObjectRefs.every(ref=>matches.some(m=>m.object.objectRef===ref&&same(m.entry,matches[0].entry)&&m.history.historyRevision===matches[0].history.historyRevision&&m.history.headTransactionId===receipt.transactionId)))fail('READBACK_FAILED');
  return matches;
 }
 async #undoStatus(body,state) {
  const turn=state.turns.findLast(t=>state.builds[t.turnRef]?.outcome?.outcome==='VERIFIED'),build=turn&&state.builds[turn.turnRef];
  const status={sessionRef:body.sessionRef,worldRef:body.worldRef,turnRef:turn?.turnRef??null,turnRevision:turn?.turnRevision??null,availability:'NO_VERIFIED_BUILD',head:null};
  if(!build||!same(build.receipt.localContext,body.localContext))return {status};
  const matches=[];
  for(const original of build.matches){const history=await this.#canvas('HistoryQuery',this.#child(body,`undo-head:${original.object.objectRef}`,{objectRef:original.object.objectRef,expectedHistoryRevision:null}));if(!history.entries.some(e=>same(e,original.entry)))fail('READBACK_FAILED');matches.push({...original,history});}
  const history=matches[0].history;
  if(!matches.every(m=>m.history.historyRevision===history.historyRevision&&m.history.headTransactionId===history.headTransactionId))fail('UNDO_CONFLICT');
  status.head={historyRevision:history.historyRevision,headTransactionId:history.headTransactionId};
  status.availability=history.undoAvailable&&history.headTransactionId===build.receipt.transactionId?'AVAILABLE':'NO_UNDO_AT_HEAD';return {status,turn,build,matches};
 }
 async #undo(body,core,state) {
  const current=await this.#undoStatus(body,state),{turn,build,matches,status}=current;
  if(status.availability!=='AVAILABLE'||body.expectedTurnRevision!==turn.turnRevision||body.expectedHistoryRevision!==status.head.historyRevision)fail('UNDO_CONFLICT');
  if(state.undos[turn.turnRef])fail('RECOVERY_PENDING');
  const objectRevisions={},worldRevisions=[];
  for(const m of matches){const inspected=await this.#canvas('InspectObject',this.#child(body,`undo-inspect:${m.object.objectRef}`,{objectRef:m.object.objectRef,expectedRevision:m.object.objectRevision,sampledBounds:state.contexts[build.contextId].inspection.targetFacts.sampledBounds}));
   if(inspected.objectRef!==m.object.objectRef||inspected.objectRevision!==m.object.objectRevision)fail('UNDO_CONFLICT');objectRevisions[m.object.objectRef]=inspected.objectRevision;worldRevisions.push(inspected.worldRevision);}
  if(worldRevisions.some(v=>v!==worldRevisions[0]))fail('UNDO_CONFLICT');
  const intentDigest=turn.intentDigest;
  // Durable descriptor of this actual Undo invocation; no permission or grant.
  const action=C.validateType('ActionProjection',{contractVersion:'interaction-surface/v2',sessionRef:body.sessionRef,turnRevision:turn.turnRevision,frameRef:`undo:${body.requestId}`,frameRevision:status.head.historyRevision,actionId:body.requestId,orderedTargetRefs:matches.map(m=>m.object.objectRef),intentDigest,operationDigest:build.receipt.operationDigest,analysisDigest:build.submission.apply.analysisDigest,decisionRevision:null});
  const request=this.#child(body,'undo',{objectRef:matches[0].object.objectRef,transactionId:`undo-${randomUUID()}`,historyTransactionId:build.receipt.transactionId,expectedHistoryRevision:body.expectedHistoryRevision,expectedWorldRevision:worldRevisions[0],expectedObjectRevisions:objectRevisions,intentDigest,surfaceActionDigest:digest('surface-action',action)});
  state.undos[turn.turnRef]={request,action,result:null};await this.#save(body.sessionRef,core,state);await this.#current(body,state);
  const receipt=await this.#canvas('Undo',request);if(receipt.status!=='VERIFIED')fail('RECOVERY_PENDING',{mutationState:'UNKNOWN',transactionRef:request.transactionId});
  // Canvas appends the verified Undo transaction to durable history.
  const expectedAfterHead=receipt.transactionId;
  const after=[];
  for(const m of matches){const history=await this.#canvas('HistoryQuery',this.#child(body,`undo-after:${m.object.objectRef}`,{objectRef:m.object.objectRef,expectedHistoryRevision:null}));
   const row=history.entries.find(e=>e.transactionId===receipt.transactionId&&e.originTransactionId===build.receipt.transactionId&&e.status==='VERIFIED'&&e.receiptDigest===digest('receipt',receipt)&&e.expectedAfterReadbackDigest===receipt.readbackDigest&&e.operationDigest===receipt.operationDigest&&e.historyRevision===history.historyRevision&&same(e.affectedObjectRefs,m.entry.affectedObjectRefs));
   if(!row||history.historyRevision===status.head.historyRevision||history.headTransactionId!==expectedAfterHead)fail('READBACK_FAILED',{mutationState:'UNKNOWN',transactionRef:request.transactionId});after.push(history);}
  if(!after.every(h=>h.historyRevision===after[0].historyRevision&&h.headTransactionId===after[0].headTransactionId))fail('READBACK_FAILED');
  await this.#current(body,state);
  const result={sessionRef:body.sessionRef,worldRef:body.worldRef,turnRef:turn.turnRef,turnRevision:turn.turnRevision,status:'VERIFIED',beforeHead:status.head,afterHead:{historyRevision:after[0].historyRevision,headTransactionId:after[0].headTransactionId}};
  state.undos[turn.turnRef].result=result;await this.#save(body.sessionRef,core,state);return result;
 }
}
export const name='hanaworlds-workshop';
export const inject=[];
export function apply(ctx) {
 const projectionStore=new WorkshopProjectionStore(()=>ctx.get('storageDomain'));
 ctx.effect?.(()=>()=>projectionStore.close(),'hanaworlds-workshop.projection-close');
 const service=new WorkshopV3({projectionStore});
 for(const [field,port] of Object.entries({sessions:'sessions',agents:'agents',defaultModel:'agentDefaultModel',attachments:'attachments',sessionPersistence:'sessionPersistence',canvas:'hanaworldsCanvasV5',painter:'hanaworldsPainterV2PictureBlocks',brush:'hanaworldsBrushV3',catalogue:'hanaworldsCatalogue',compilerConfig:'hanaworldsCompilerConfig',capabilities:'hanaworldsCapabilities',painterRegion:'hanaworldsPainterRegionV1',brushRegion:'hanaworldsBrushRegionV1',canvasRegion:'hanaworldsCanvasRegionV1'}))Object.defineProperty(service,field,{get:()=>ctx.get(port)});
 registerImageTool(ctx,service);registerContextTool(ctx,service);
 ctx.provide('hanaworldsWorkshop',service);ctx.provide('hanaworldsWorkshopV3',service);
 new WorkshopImageLinkPanelService(ctx);
 new WorkshopConversationPanelService(ctx);
}
export default {name,inject,apply};
