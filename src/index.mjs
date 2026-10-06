import { randomUUID } from 'node:crypto';
import { WorkshopProjectionStore, coreIdentity } from './projection-store.mjs';
import * as C from 'hanaworlds-contracts';
import { registerImageTool, imageURL, userProvidedURL, downloadImageBytes, mediaBinding, imageRef, imageDigest } from './image-attachment.mjs';
import { WRITE_MODES, writeToolDescriptors, writeToolSkillGuidance, evaluateWriteMode } from './write-tools.mjs';
export { WRITE_MODES, REGION_CAPABILITY, writeToolDescriptors, writeToolSkillGuidance, evaluateWriteMode, regionCapabilityUnmet, capabilityMatch } from './write-tools.mjs';
const VERSION = 'session/v3', CANVAS = 'canvas/v5';
const copy = structuredClone, revision = () => `rev-${randomUUID()}`;
const same = (a,b) => C.canonicalJSON(a) === C.canonicalJSON(b);
const digest = (kind,value) => C.digestValue(kind,value).sha256;
const fail = (code,details) => { throw new C.ContractError(code,'validate','REQUIRED_FACT_UNKNOWN',details); };
const packet = (wire,id,result,error=null) => ({contractVersion:wire,requestId:id,result,error});
const initial = id => ({context:{currentSession:id,activeWorldRef:null,orderedSelectedObjectRefs:[],sessionRevision:revision(),selectionRevision:'0',localContext:null},turns:[],details:{},confirmed:{},pending:null,requests:{},contexts:{},builds:{},undos:{}});

/** Current fresh-install runtime. Peer ports are Host-owned in-process services;
 * no model JSON can select a peer or call Canvas/Adapter mutators directly. */
export class WorkshopV3 {
 constructor(ports={}) { Object.assign(this,ports);this.contractHandshake=C.contractHandshake;this.locks=new Map(); }
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
  if(!state&&create){state=initial(id);await this.projectionStore.create(id,core.identity,state);}
  if(!state)fail('SESSION_NOT_FOUND');return {core,state};
 }
 async #save(id,core,state,nextRevision=revision()) {
  const live=await this.#core(id);if(!same(live.identity,core.identity))fail('SESSION_NOT_FOUND');
  const prior=state.context.sessionRevision;state.context.sessionRevision=nextRevision;
  await this.projectionStore.replace(id,core.identity,prior,state);
 }
 #peer(port,wire) {if(!port)fail('CAPABILITY_UNAVAILABLE');C.checkContractHandshake(port.contractHandshake,{wires:[wire],factProfiles:['target-facts/v4']});return port;}
 async #canvas(op,request) {
  const port=this.#peer(this.canvas,CANVAS);C.validateBoundRequest(CANVAS,op,request);
  const response=C.validateBoundResponse(CANVAS,op,request,await port.call(op,copy(request)));
  if(port!==this.canvas)fail('CURRENT_WORLD_MISMATCH');
  if(response.error){const error=new Error(response.error.code);error.publicError=response.error;throw error;}
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
   return await this.#lock(body.sessionRef,async()=>{
    const {core,state}=await this.#load(body.sessionRef,operation==='StartOrResumeSession');
    if(operation==='StartOrResumeSession')return packet(VERSION,body.requestId,C.validateType('SessionSnapshot',{context:state.context,turns:state.turns,capabilities:this.capabilities,sessionDeleteSupported:false}));
    const key=`${operation}:${body.requestId}`,record=state.requests[key];
    const facts=await this.#facts(body,state,record,{switching:operation==='SwitchWorldContext'});
    const admitted=C.validateCurrentRequest(VERSION,operation,body,facts);
    if(admitted.disposition==='RETURN_STORED')return copy(record.response);
    if(record)fail('REQUEST_NOT_ACTIVE');
    if(body.expectedRevision!==undefined&&body.expectedRevision!==state.context.sessionRevision)fail('STALE_REVISION');
    const readOnly=['ReadCurrentUndoStatus','ReadSessionTurnDetails'].includes(operation);
    if(!readOnly){state.requests[key]={digest:admitted.requestDigest,response:null};await this.#save(body.sessionRef,core,state);}
    let response;
    try {const result=await this.#dispatch(operation,body,core,state);response=C.validateResponse(VERSION,operation,packet(VERSION,body.requestId,result));}
    catch(error){response=packet(VERSION,body.requestId,null,C.publicError(error));}
    if(!readOnly){const next=revision();response=copy(response);if(response.result?.context)response.result.context.sessionRevision=next;state.requests[key].response=copy(response);await this.#save(body.sessionRef,core,state,next);}
    return copy(response);
   });
  }catch(error){return packet(VERSION,body?.requestId??raw?.requestId??null,null,C.publicError(error));}
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
   const attachments=this.attachments;
   if(!attachments?.saveImage||!attachments?.readImage)throw Error('MEDIA_UNAVAILABLE');
   const input=await downloadImageBytes(url,attachments,signal);signal.throwIfAborted();
   // saveImage fully decodes and checks the MIME. Store and decoder are the existing Host capability.
   const ref=await attachments.saveImage(input);signal.throwIfAborted();
   const stored=await attachments.readImage(ref,signal);signal.throwIfAborted();
   if(!same(stored.ref,ref))throw Error('MEDIA_DIGEST_MISMATCH');
   const media=mediaBinding(ref,stored.data),live=await this.#core(id);signal.throwIfAborted();
   const currentMedia=await this.attachments?.readImage(ref,signal);signal.throwIfAborted();
   if(!currentMedia||!same(mediaBinding(currentMedia.ref,currentMedia.data),media)||!same(live.identity,core.identity)||!live.events.some(e=>e.type==='user/message'&&e.data?.id===source.data.id&&userProvidedURL(e.data,url)))throw Error('SESSION_MISMATCH');
   state.images??={};state.images[ref.attachmentId]={media,sourceMessageId:source.data.id};
   await this.#save(id,core,state);signal.throwIfAborted();
   return {sessionRef:id,sourceMessageId:source.data.id,downloadSha256:imageDigest(input.data),downloadBytes:input.data.byteLength,media,image:imageRef(media)};
  });
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
  if(operation==='SwitchWorldContext'){
   if(Object.values(state.builds).some(b=>b.dispatched&&!b.outcome&&!b.terminal))fail('RECOVERY_PENDING');
   const context=await this.#selection(body);if(body.selectionRevision!==context.selectionRevision)fail('CURRENT_WORLD_MISMATCH');
   state.context={...copy(context),sessionRevision:state.context.sessionRevision};state.pending=null;
   return {context:copy(state.context),turns:state.turns,capabilities:this.capabilities,sessionDeleteSupported:false};
  }
  if(operation==='AppendMultimodalTurn'){
   const media=await this.#media(body.media,core,state);
   if(state.turns.some(t=>t.turnRef===body.turnRef))fail('REPLAY_MISMATCH');
   const dims=body.controls.dimensions;
   const complete=body.text.trim()&&body.controls.purpose?.trim()&&dims?.unit==='node'&&['width','height','depth'].every(k=>Number.isSafeInteger(dims[k])&&dims[k]>0);
   const turn={turnRef:body.turnRef,turnRevision:revision(),text:body.text,media,referenceBriefDigest:null,intentDigest:null,actionReceiptDigest:null};state.turns.push(turn);
   const question=complete?`请确认建造${body.text}，尺寸${dims.width}×${dims.depth}×${dims.height}个节点。回复“确认”或修改。`:'请由当前skill补齐用途和节点尺寸后重新提交。';
   state.pending={sessionRef:body.sessionRef,turnRef:turn.turnRef,turnRevision:turn.turnRevision,invocationId:body.requestId,clarificationId:revision(),question,complete:!!complete,controls:body.controls,afterSeq:core.events.length-1};
   state.details[turn.turnRef]={resultText:question,confirmedBrief:null};
   return this.#turnReceipt(body,state,turn,question,this.#clarification(state.pending));
  }
  if(operation==='AnswerClarification'){
   const pending=state.pending,turn=state.turns.at(-1);
   if(!pending||pending.turnRef!==body.turnRef||pending.clarificationId!==body.clarificationId||turn.turnRef!==body.turnRef)fail('TURN_REVISION_MISMATCH');
   const inputs=core.events.slice(pending.afterSeq+1).filter(e=>e.type==='user/message');
   const e=inputs[0],message=e?.data;
   if(inputs.length!==1||e.surfaceOp!=='append'||message?.role!=='user'||message?.source?.kind!=='user'||message.id!==body.requestId||message.content?.length!==1||message.content[0].type!=='text'||message.content[0].text!==body.answer)fail('INTENT_UNCONFIRMED');
   if(!pending.complete||!['确认','yes','YES'].includes(body.answer.trim())){
    pending.complete=false;pending.afterSeq=core.events.length-1;pending.clarificationId=revision();pending.question='请更新建造参数并重新提交，之后再确认。';
    return this.#turnReceipt(body,state,turn,pending.question,this.#clarification(pending));
   }
   const brief=C.validateType('BriefProjection',{contractVersion:'ReferenceBrief/v3',sessionRef:body.sessionRef,turnRevision:turn.turnRevision,briefRevision:revision(),media:await this.#media(turn.media,core,state),text:turn.text,controls:pending.controls});
   const briefDigest=digest('reference-brief',brief);
   const intent=C.validateType('IntentProjection',{contractVersion:VERSION,referenceBriefDigest:briefDigest,confirmedIntent:{kind:'BUILD_STRUCTURE',text:turn.text,purpose:pending.controls.purpose,dimensions:pending.controls.dimensions,entrancePortalRefs:pending.controls.entrancePortalRefs,confirmedTurnRevision:turn.turnRevision},intendedWorldRef:body.localContext.worldRef,orderedTargetRefs:[]});
   turn.referenceBriefDigest=briefDigest;turn.intentDigest=digest('intent',intent);
   state.confirmed[turn.turnRef]={brief,intent,confirmationInputId:message.id,localContext:copy(body.localContext)};state.pending=null;
   state.details[turn.turnRef]={resultText:'已确认建造意图。',confirmedBrief:brief};return this.#turnReceipt(body,state,turn,'已确认建造意图。',null);
  }
  if(operation==='ReadSessionTurnDetails')return {sessionRef:body.sessionRef,sessionRevision:state.context.sessionRevision,turns:state.turns.map(t=>({turnRef:t.turnRef,turnRevision:t.turnRevision,userText:t.text,...state.details[t.turnRef]}))};
  if(operation==='AdvanceCurrentBuild')return this.#advance(body,core,state);
  if(operation==='ReadCurrentUndoStatus')return (await this.#undoStatus(body,state)).status;
  if(operation==='UndoCurrentBuild')return this.#undo(body,core,state);
  if(operation==='DeleteSession')fail('SESSION_DELETE_UNSUPPORTED');
  fail('CAPABILITY_UNAVAILABLE');
 }
 #clarification(p){return {sessionRef:p.sessionRef,turnRevision:p.turnRevision,invocationId:p.invocationId,clarificationId:p.clarificationId,code:'AMBIGUOUS_INTENT',question:p.question};}
 #turnReceipt(body,state,turn,text,clarification){return {sessionRef:body.sessionRef,turnRef:turn.turnRef,turnRevision:turn.turnRevision,briefDigest:turn.referenceBriefDigest,model:'gpt-5.6-luna',resultText:text,clarification};}
 async #context(body,state,stored) {
  const {turn,saved}=this.#turn(state);await this.#current(body,state);
  if(body.expectedTurnRevision&&body.expectedTurnRevision!==turn.turnRevision)fail('TURN_REVISION_MISMATCH');
  const catalogue=C.validateType('Catalogue',await this.catalogue.read(body.localContext.worldRef));
  const safetyProfile=C.validateType('SafetyProfile',await this.safety.read(body.localContext.worldRef));
  const region=C.validateRegionInspection(stored.inspection);
  return copy(C.validateType('BuildProposalContext',{contractVersion:'painter/v4',sessionRef:body.sessionRef,worldRef:body.localContext.worldRef,turnRevision:turn.turnRevision,painterId:'picture-blocks',invocationId:stored.invocationId,intent:saved.intent,intentDigest:turn.intentDigest,referenceBrief:saved.brief,referenceBriefDigest:turn.referenceBriefDigest,catalogue,targetFacts:region.targetFacts,targetFactsDigest:region.targetFactsDigest,safetyProfile,safetyProfileDigest:digest('safety-profile',safetyProfile),regionInspection:region,localContext:body.localContext}));
 }
 async readBuildProposalContext(raw) {
  const body=copy(C.validateBoundRequest(VERSION,'AdvanceCurrentBuild',raw));
  return this.#lock(body.sessionRef,async()=>{
   const {core,state}=await this.#load(body.sessionRef);C.validateCurrentRequest(VERSION,'AdvanceCurrentBuild',body,await this.#facts(body,state));
   const {turn,saved}=this.#turn(state);let stored=state.contexts[body.requestId];
   if(!stored){
    if(state.builds[turn.turnRef]?.dispatched)fail('TRANSACTION_CONFLICT');
    const dims=saved.intent.confirmedIntent.dimensions;
    const placement=await this.#canvas('InspectPlacementRegion',this.#child(body,'placement',{anchor:{kind:'CURRENT_VIEW',invocationId:saved.confirmationInputId},footprint:{widthCells:dims.width,depthCells:dims.depth,heightCells:dims.height}}));
    if(placement.outcome!=='REGION_INSPECTED')fail('TARGET_REQUIRED');
    stored={invocationId:`proposal-${randomUUID()}`,inspection:placement.inspection,context:null,request:null,response:null};
    stored.context=await this.#context(body,state,stored);state.contexts[body.requestId]=stored;state.currentContextId=body.requestId;await this.#save(body.sessionRef,core,state);
   }
   const current=await this.#context(body,state,stored);if(!same(current,stored.context))fail('TARGET_FACTS_STALE');return copy(stored.context);
  });
 }
 async #proposalFacts(request,state,stored) {
  if(!stored||state.contexts[state.currentContextId]!==stored)fail('TARGET_FACTS_STALE');
  const currentContext=await this.#context(request,state,stored);
  const record=stored.response?{response:stored.response,digest:C.requestDigest('painter/v4','ValidateBuildProposal',stored.request)}:null;
  const requestFacts=await this.#facts(request,state,record);
  return C.validateType('BuildProposalProviderFacts',{sourceContext:stored.context,currentContext,requestFacts});
 }
 /** Host-only read port for Painter local facts. It deliberately does not take
  * the mutation lock: Painter calls back while submitBuildProposal holds it.
  * Only already-reserved exact public requests can read these own facts. */
 async readBuildProposalProviderFacts(raw) {
  const request=copy(C.validateBuildProposalRequest(raw));
  const {state}=await this.#load(request.sessionRef);
  const stored=Object.values(state.contexts).find(x=>x.invocationId===request.invocationId);
  if(!stored?.request||!same(stored.request,request))fail('TRANSACTION_CONFLICT');
  const facts=await this.#proposalFacts(request,state,stored);
  C.validateBuildProposalContext(request,facts);
  return copy(facts);
 }
 /** Existing proposal entry: the per-node (cells) write mode. */
 async submitBuildProposal(raw) {return (await this.#submit(raw,'cells')).response;}
 /** Same skill, either self-described write mode. Returns a Workshop business
  * envelope around the exact painter/v4 response; unmet needs are explained and
  * nothing is sent to Painter. No mode switch, truncation or target rewrite. */
 async submitWriteProposal(mode,raw) {const {availability,response}=await this.#submit(raw,mode);return {mode,availability,response};}
 #writeFacts() {return {ownHandshake:C.contractHandshake,peers:{painter:this.painter,brush:this.brush,canvas:this.canvas}};}
 /** Self-description of both write tools plus current availability; read-only. */
 async describeWriteTools(sessionRef=null) {
  const facts=this.#writeFacts();let current=null;
  if(sessionRef!==null){
   let state=null;try{state=(await this.#load(sessionRef)).state;}catch(error){if(error?.code!=='SESSION_NOT_FOUND'&&error?.name!=='SessionPersistenceNotFoundError')throw error;}
   facts.session={found:!!state};
   if(state){let confirmed=true;try{this.#turn(state);}catch(error){if(error?.code!=='INTENT_UNCONFIRMED')throw error;confirmed=false;}
    facts.session.worldBound=!!state.context.localContext&&state.context.activeWorldRef===state.context.localContext.worldRef;facts.session.intentConfirmed=confirmed;
    const turn=state.turns.at(-1),build=turn&&state.builds[turn.turnRef];
    current=build?{turnRef:turn.turnRef,writeMode:build.writeMode,outcome:build.outcome?.outcome??(build.terminal??(build.dispatched?'PENDING':'VALIDATED'))}:null;}
  }
  return copy({skillGuidance:writeToolSkillGuidance,tools:WRITE_MODES.map(mode=>({...writeToolDescriptors[mode],availability:evaluateWriteMode(mode,facts)})),currentBuild:current});
 }
 async #submit(raw,mode) {
  let request,availability=null;
  try {request=copy(C.validateBuildProposalRequest(raw));return await this.#lock(request.sessionRef,async()=>{
   availability=evaluateWriteMode(mode,this.#writeFacts());
   if(!availability.available)fail('CAPABILITY_UNAVAILABLE');
   const {core,state}=await this.#load(request.sessionRef);const stored=Object.values(state.contexts).find(x=>x.invocationId===request.invocationId);
   const facts=await this.#proposalFacts(request,state,stored);C.validateBuildProposalContext(request,facts);
   if((stored.writeMode??'cells')!==mode&&stored.request)fail('REPLAY_MISMATCH');
   if(stored.response)return {availability,response:copy(stored.response)};
   if(stored.request&&!same(stored.request,request))fail('REPLAY_MISMATCH');
   const {turn}=this.#turn(state);if(state.builds[turn.turnRef]?.dispatched)fail('TRANSACTION_CONFLICT');
   const painter=this.#peer(this.painter,'painter/v4');stored.request=copy(request);stored.writeMode=mode;await this.#save(request.sessionRef,core,state);
   const response=C.validateBuildProposalResponse(request,await painter.call('ValidateBuildProposal',copy(request)));
   C.validateBuildProposalContext(request,await this.#proposalFacts(request,state,stored));
   if(painter!==this.painter)fail('CURRENT_WORLD_MISMATCH');
   if(!response.error){stored.response=copy(response);state.builds[turn.turnRef]={contextId:state.currentContextId,writeMode:mode,plan:response.result,compiled:null,submission:null,dispatched:false,outcome:null};await this.#save(request.sessionRef,core,state);}
   return {availability,response:copy(response)};
  });}catch(error){return {availability,response:packet('painter/v4',request?.requestId??raw?.requestId??null,null,C.publicError(error))};}
 }
 async #advance(body,core,state) {
  const {turn,saved}=this.#turn(state),build=state.builds[turn.turnRef];if(!build)fail('TARGET_REQUIRED');
  if(state.undos[turn.turnRef]?.result)fail('UNDO_CONFLICT');
  if(build.outcome)return copy(build.outcome);
  const pending=()=>({sessionRef:body.sessionRef,worldRef:body.worldRef,turnRevision:turn.turnRevision,stage:'APPLY',outcome:'PENDING'});
  if(build.dispatched)return pending();
  const stored=state.contexts[build.contextId];C.validateBuildProposalContext(stored.request,await this.#proposalFacts(stored.request,state,stored));
  const ctx=stored.context,settings=await this.compilerConfig.read(body.worldRef);
  const compile={contractVersion:'BUILD/V3',sessionRef:body.sessionRef,requestId:`${body.requestId}:compile`,worldRef:body.worldRef,localContext:body.localContext,build:build.plan.build,buildDigest:build.plan.buildDigest,catalogue:ctx.catalogue,catalogueDigest:digest('catalogue',ctx.catalogue),targetFacts:ctx.targetFacts,targetFactsDigest:ctx.targetFactsDigest,safetyProfile:ctx.safetyProfile,safetyProfileDigest:ctx.safetyProfileDigest,compilationConfig:settings.compilationConfig,compilationConfigDigest:digest('compilation-config',settings.compilationConfig),compilerRevision:settings.compilerRevision};
  const brush=this.#peer(this.brush,'BUILD/V3');C.validateBoundRequest('BUILD/V3','BuildDocument',compile);
  const compiled=C.validateBoundResponse('BUILD/V3','BuildDocument',compile,await brush.compile(copy(compile)));
  if(compiled.error){const e=new Error(compiled.error.code);e.publicError=compiled.error;throw e;}
  await this.#current(body,state);build.compiled=compiled.result;
  const objects=await this.#canvas('ListObjects',this.#child(body,'objects',{expectedRevision:null}));
  const tx=`build-${randomUUID()}`;
  const analysis=await this.#canvas('AnalyzeAffectedObjects',this.#child(body,'analysis',{transactionId:tx,operations:compiled.result.projection,operationDigest:compiled.result.operationDigest,expectedRevision:ctx.targetFacts.worldRevision,expectedRegistryRevision:objects.registryRevision,expectedSelectionRevision:body.localContext.selectionRevision}));
  const apply=this.#child(body,'apply',{transactionId:tx,operations:compiled.result.projection,operationDigest:compiled.result.operationDigest,analysisDigest:digest('affected-analysis',analysis),decisionRevision:null,expectedWorldRevision:analysis.worldRevision,expectedObjectRevisions:{},guarantee:'RECOVERABLE_VERIFIED',regionInspectionBinding:{inspectionId:ctx.regionInspection.inspectionId,build:build.plan.build}});
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
  const originalIndex=matches[0].history.entries.findIndex(e=>e.transactionId===build.receipt.transactionId);
  const expectedAfterHead=matches[0].history.entries[originalIndex-1]?.transactionId??null;
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
 for(const [field,port] of Object.entries({attachments:'attachments',sessionPersistence:'sessionPersistence',canvas:'hanaworldsCanvasV5',painter:'hanaworldsPainterV2PictureBlocks',brush:'hanaworldsBrushV3',catalogue:'hanaworldsCatalogue',safety:'hanaworldsSafetyProfile',compilerConfig:'hanaworldsCompilerConfig',capabilities:'hanaworldsCapabilities'}))Object.defineProperty(service,field,{get:()=>ctx.get(port)});
 registerImageTool(ctx,service);
 ctx.provide('hanaworldsWorkshop',service);ctx.provide('hanaworldsWorkshopV3',service);
}
export default {name,inject,apply};
