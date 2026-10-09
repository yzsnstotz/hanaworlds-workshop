import {requireNoCashAccountCapability} from './model-supply.mjs';
import {readRouteLoginRecordState,assertBrowserCredentialMutationAllowed} from './sdk-auth-state.mjs';
import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join,isAbsolute,resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Sessions from '@deepseek-ai/dsh-session';
import Agents from '@deepseek-ai/dsh-agent';
import Projections from '@deepseek-ai/dsh-session-projection';
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local';
import Authorization, { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization';
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import Skills from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
import Workshop from '../src/index.mjs';
import BuildingSkill from '../src/building-skill.mjs';

// Standalone developer Host for Workshop's image-ask step. Real: Cordis, Session
// store/JSONL, AgentRegistry, the official AgentLoop, system-prompt assembly, tool
// registry, local attachments, HTTP download and Workshop. FIXTURE: the model.
const samplePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const defaultRun=fileURLToPath(new URL('../../runtime/ask-web/',import.meta.url));
export const PROVIDER='hanaworlds-fixture',MODEL='fixture-vision-1';
export const fixture={kind:'FIXTURE',model:`${PROVIDER}/${MODEL}`,label:'FIXTURE 模型（不是真实模型，不会真正看图）',
 conversations:'本页独立会话，不是 HanaWorlds App 的当前对话',realModel:'真实模型账户能力未供；请求前拒绝',worldWrites:0};
const sha=b=>createHash('sha256').update(b).digest('hex');
// Recommended real route (owner packet A): official dsh-llm-pi-ai openai-codex,
// signed in through the official dsh-authorization flow. The credential record
// lives only in this page's own store under its runtime directory — never
// ~/.dsh or the HanaWorlds App profile. Nothing here starts a sign-in or calls
// the real model by itself: both happen only when a person clicks.
export const REAL_PROVIDER='openai-codex',REAL_AUTH_KEY=credentialKey('llm-pi-ai',REAL_PROVIDER);
// Official pi-ai 0.87.1 openai-codex browser login: method id `browser` (its default), a local
// callback server on 127.0.0.1:1455 that receives the code by itself, and a parallel manual-code
// text prompt as fallback. This Host answers the method with the official default and never asks a
// person to paste a code: the fallback prompt stays internal and is withdrawn when the callback lands.
export const BROWSER_METHOD='browser',OFFICIAL_CALLBACK_PORT=1455;
const portFree=port=>new Promise(resolve=>{const probe=createProbe();probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));});
export const realRoute={provider:REAL_PROVIDER,label:'ChatGPT（OpenAI Codex 订阅登录）',
 cost:'账户适用额度与禁 paid-credit 能力未供，真实请求在发送前停止。',
 storage:'登录记录只存在本页运行目录，不读、不写 HanaWorlds App 或 ~/.dsh 的登录。可随时「退出登录」删除。'};

/** FIXTURE model. It cannot see: it reads the actual stored bytes of every
 * image in the request it was handed, reports their digests, and says so. */
export class FixtureVisionModel extends LlmAdapter {
 requests=[];
 constructor(attachments){super();this.attachments=attachments;}
 providerInfo(provider){return {id:provider,name:'FIXTURE vision (not a real model)'};}
 async resolveModel(provider,model){return {provider,id:model,name:'FIXTURE vision (not a real model)',inputModalities:['text','image'],context:{contextWindow:100000}};}
 async *stream(options){
  const images=[];
  for(const m of options.messages)for(const p of m.content)if(p.type==='image'){
   const ref=p.attachment??p;const stored=await this.attachments().readImage(ref);
   images.push({role:m.role,attachmentId:ref.attachmentId,mediaType:stored.ref.mediaType,width:stored.ref.width,height:stored.ref.height,bytes:stored.data.byteLength,sha256:sha(stored.data)});
  }
  const messages=options.messages.flatMap(m=>m.content).filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const tools=(options.tools??[]).map(t=>t.name);
  const record={images,skillCatalog:messages.includes('<available_skills>')&&messages.includes('hanaworlds-building'),tools};this.requests.push(record);
  const text=['【FIXTURE 模型 · 不是真实模型，不会看图】',
   images.length?`本回合模型请求里收到 ${images.length} 张图片的真实字节：`:'本回合模型请求里没有图片。',
   ...images.map(i=>`- ${i.mediaType} ${i.width}×${i.height} px，${i.bytes} B，sha256 ${i.sha256.slice(0,16)}…`),
   '真实模型未授权（UNKNOWN），这里不描述图中结构，也不判断比例/用途是否需要追问。'].join('\n');
  yield {type:'block-start',index:0,blockType:'text'};
  yield {type:'text-delta',index:0,text};
  yield {type:'block-end',index:0,block:{type:'text',text}};
  yield {type:'finish',reason:'stop'};
 }
}

const imageParts=content=>(content??[]).filter(p=>p.type==='image').map(p=>p.attachment);
const textOf=content=>(content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');

export async function startAskWeb({port=47608,runRoot=defaultRun,hosts=['127.0.0.1','::1'],authKey=REAL_AUTH_KEY,credentialHome,setup,preparationOnly=false,callbackPort=authKey===REAL_AUTH_KEY?OFFICIAL_CALLBACK_PORT:null}={}) {
 if(credentialHome!==undefined&&(typeof credentialHome!=='string'||!isAbsolute(credentialHome)||resolve(credentialHome)!==credentialHome))throw Error('EXPLICIT_CREDENTIAL_HOME_REQUIRED');
 await mkdir(runRoot,{recursive:true});const runtime=await mkdtemp(join(runRoot,'session-'));
 const ctx=new Context();const servers=[];
 try {
  await ctx.plugin(Jsonl,{root:join(runtime,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(runtime,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(runtime,'media')}).await();
  await ctx.plugin(Sessions).await();await ctx.plugin(Projections).await();await ctx.plugin(Agents).await();
  await ctx.plugin(Llm).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();await ctx.plugin(AgentLoop).await();
  const model=new FixtureVisionModel(()=>ctx.attachments);ctx.llm.registerAdapter([PROVIDER],model);
  if(!preparationOnly){
   await ctx.plugin(CredentialsLocal,{dshHome:credentialHome??join(runtime,'dsh-home')}).await();await ctx.plugin(Authorization).await();
   await ctx.plugin(LlmPiAi,{providers:{[REAL_PROVIDER]:{}}}).await();
  }
  await setup?.(ctx);
  await ctx.plugin(Workshop).await();
  // setup has awaited the peer plugins; registration captures this composition once.
  await ctx.plugin(Skills).await();
  await ctx.plugin(BuildingSkill).await();
  await ctx.plugin(ToolSkill).await();
  const ws=ctx.get('hanaworldsWorkshop');
  const conversations=new Map();
  const signedIn=async()=>preparationOnly?false:(await readRouteLoginRecordState(ctx,{signal:new AbortController().signal})).record.configured;
  async function models(){
   const listed=preparationOnly?[]:await ctx.llm.listModels(REAL_PROVIDER);const real=(listed.models??listed).filter(m=>(m.inputModalities??m.input??[]).includes('image'));
   return [{id:`${PROVIDER}/${MODEL}`,provider:PROVIDER,model:MODEL,kind:'FIXTURE',label:'FIXTURE 模型（不看图）'},
    ...real.map(m=>({id:`${REAL_PROVIDER}/${m.id}`,provider:REAL_PROVIDER,model:m.id,kind:'REAL',label:`${m.name??m.id}（真实模型 · 支持看图）`}))];
  }
  async function newConversation(choice=`${PROVIDER}/${MODEL}`){
   const picked=(await models()).find(m=>m.id===choice);if(!picked)throw Error('MODEL_NOT_AVAILABLE');
   if(picked.kind==='REAL')requireNoCashAccountCapability();
   const id=`ask-${randomUUID()}`;
   const handle=await ctx.agents.create({sessionId:id,agentOptions:{provider:picked.provider,model:picked.model}});
   const lift=ws.prepareImageAsk(handle.agent);
   conversations.set(id,{id,agent:handle.agent,session:ctx.sessions.get(id),lift,createdAt:Date.now(),model:picked});return id;
  }
  /** One sign-in attempt at a time, driven by the person on the page through the official flow. */
  const auth={status:'idle',notices:[],prompt:null,error:null,method:null,waitingFor:null};let pendingPrompt=null;
  const authView=async()=>preparationOnly?({key:authKey,flow:null,signedIn:false,status:'idle',notices:[],prompt:null,error:null,method:null,waitingFor:null,callbackPort:null,
   route:{provider:REAL_PROVIDER,label:'准备页：真实账户能力待供',cost:'仅运行 FIXTURE；真实模型请求关闭，不消耗真实模型额度。',storage:'本准备页未挂登录存储，不读取既有登录记录。'}}):({key:authKey,flow:ctx.authorization.describe(authKey)??null,signedIn:await signedIn(),
   status:auth.status,notices:auth.notices,prompt:auth.prompt,error:auth.error,method:auth.method,waitingFor:auth.waitingFor,callbackPort,route:realRoute});
  async function beginAuth(){
   assertBrowserCredentialMutationAllowed(credentialHome);
   const flow=ctx.authorization.describe(authKey);if(!flow)throw Error('SIGN_IN_FLOW_UNAVAILABLE');
   if(auth.status==='running')throw Error('SIGN_IN_ALREADY_RUNNING');
   // The official browser login silently degrades to a paste prompt when it cannot bind its callback port; refuse by name instead.
   if(callbackPort!==null&&!(await portFree(callbackPort))){const e=Error('SIGN_IN_CALLBACK_PORT_BUSY');e.details={port:callbackPort};throw e;}
   Object.assign(auth,{status:'running',notices:[],prompt:null,error:null,method:null,waitingFor:null});
   const interaction={notify:n=>{auth.notices.push({message:n.message,url:n.url??null,code:n.code??null});},
    prompt:q=>new Promise((resolve,reject)=>{
     if(q.kind==='select'&&q.options?.some(o=>o.id===BROWSER_METHOD)){auth.method=BROWSER_METHOD;return resolve(BROWSER_METHOD);}
     if(q.kind==='text'&&auth.method===BROWSER_METHOD){
      // Manual-code fallback of the browser login: not shown; the local callback completes the flow.
      auth.waitingFor='BROWSER_CALLBACK';
      q.signal?.addEventListener('abort',()=>{if(auth.waitingFor==='BROWSER_CALLBACK')auth.waitingFor=null;},{once:true});
      return;
     }
     const id=randomUUID();auth.prompt={id,kind:q.kind,message:q.message,placeholder:q.placeholder??null,options:q.options??null};
     pendingPrompt={id,resolve,reject};
     q.signal?.addEventListener('abort',()=>{if(pendingPrompt?.id===id){pendingPrompt=null;auth.prompt=null;}},{once:true});
    })};
   ctx.authorization.begin({key:authKey,method:flow.methods[0]?.id,interaction}).then(
    out=>{auth.status=out.status;auth.prompt=null;auth.waitingFor=null;pendingPrompt=null;},
    error=>{auth.status='failed';auth.error=error?.code??error?.message??String(error);auth.prompt=null;auth.waitingFor=null;pendingPrompt=null;});
  }
  function answerAuth(id,text){
   if(!pendingPrompt||pendingPrompt.id!==id||typeof text!=='string')throw Error('SIGN_IN_PROMPT_MISMATCH');
   const p=pendingPrompt;pendingPrompt=null;auth.prompt=null;p.resolve(text);
  }
  function cancelAuth(){
   if(pendingPrompt){const p=pendingPrompt;pendingPrompt=null;auth.prompt=null;p.reject(new AuthorizationDeclinedError('declined on the page'));}
   ctx.authorization.cancel(authKey);
  }
  const conv=id=>{const c=conversations.get(id);if(!c)throw Error('CONVERSATION_NOT_FOUND');if(ctx.sessions.get(id)!==c.session)throw Error('SESSION_MISMATCH');return c;};
  async function durable(id){const h=await ctx.sessionPersistence.open(id,'read');try{return (await h.read()).events;}finally{await h.close();}}
  /** Conversation as the page shows it: durable Core log plus what waits in the public inbox. */
  async function transcript(id,signal){
   const c=conv(id);const items=[];
   const image=async ref=>{try{const r=await ws.readPanelImage(c.session,ref.attachmentId,signal);return {...ref,status:r.status,data:r.data};}catch(e){return {...ref,status:e.message};}};
   for(const e of await durable(id)){
    if(e.surfaceOp!=='append')continue;
    if(e.type==='user/message'&&e.data?.source?.kind==='user')items.push({role:'user',id:e.data.id,text:textOf(e.data.content),images:await Promise.all(imageParts(e.data.content).map(image))});
    if(e.type==='assistant/message'){const m=e.data?.message;items.push({role:'assistant',id:m?.id,text:textOf(m?.content)});}
   }
   const inbox=c.agent.inbox;const queued=[];
   for(const m of [...inbox.nextStep,...inbox.nextTurn])if(m.role==='user')queued.push({role:'user',id:m.id,queued:true,text:textOf(m.content),images:await Promise.all(imageParts(m.content).map(image))});
   return {conversationId:id,model:c.model,started:c.session.surface.nodes.length>0,status:c.agent.status,items,queued};
  }
  async function turn(id,text,signal){
   const c=conv(id);if(typeof text!=='string'||!text.trim())throw Error('QUESTION_REQUIRED');
   if(c.agent.status!=='idle')throw Error('AGENT_BUSY');
   if(c.model.kind==='REAL'){requireNoCashAccountCapability();if(!(await signedIn()))throw Error('REAL_MODEL_SIGN_IN_REQUIRED');}
   const before=(await durable(id)).length,asked=model.requests.length;
   c.agent.followup({id:`ask-prompt-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'text',text:text.trim()}]});
   await c.agent.whenIdle();await ctx.sessions.flush(c.session);signal.throwIfAborted();
   const added=(await durable(id)).slice(before);
   if(!added.some(e=>e.type==='assistant/message'&&e.surfaceOp==='append')){
    const error=Error('MODEL_TURN_NO_REPLY');error.details={events:added.map(e=>e.type),modelRequests:model.requests.length-asked};throw error;
   }
   return {model:c.model,request:c.model.kind==='FIXTURE'?model.requests.at(-1)??null:null,transcript:await transcript(id,signal)};
  }
  const initial=await newConversation();
  const assets=new Map(await Promise.all([['/ask','ask.html'],['/ask.mjs','ask.mjs'],['/ask.css','ask.css']].map(async([k,f])=>[k,await readFile(new URL(f,import.meta.url))])));
  const limits=ctx.attachments.imageLimits,uploadCap=Math.min(limits.maxImageBytes,limits.maxMessageImageBytes);
  const bodyCap=Math.ceil(uploadCap*4/3)+65536;
  let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(value):value);};
  const allowedHosts=()=>new Set([`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]);
  const handler=async(req,res)=>{
   try{
    const host=req.headers.host;
    if(!allowedHosts().has(host))return send(res,403,{error:'LOCALHOST_HOST_REQUIRED'});
    const origin=`http://${host}`,path=new URL(req.url,origin).pathname.replace(/\/+$/u,'')||'/';
    if(req.method==='GET'){
     if(path==='/'){res.writeHead(302,{location:'/ask'});return res.end();}
     if(path==='/api/ask/auth')return send(res,200,await authView());
     if(path==='/api/ask/state')return send(res,200,{fixture,preparationOnly,initial,models:await models(),auth:await authView(),conversations:[...conversations.values()].map(c=>({id:c.id,started:c.session.surface.nodes.length>0,createdAt:c.createdAt,model:c.model})),limits:{maxImageBytes:uploadCap,mediaTypes:limits.mediaTypes.filter(t=>['image/png','image/jpeg','image/webp','image/gif'].includes(t))}});
     if(path==='/sample.png')return send(res,200,samplePNG,'image/png');
     if(path==='/sample-not-image')return send(res,200,'<html>not an image</html>','text/html; charset=utf-8');
     if(assets.has(path))return send(res,200,assets.get(path),path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
     return send(res,404,{error:'NOT_FOUND'});
    }
    const routes=['/api/ask/new','/api/ask/link','/api/ask/upload','/api/ask/read','/api/ask/turn','/api/ask/transcript','/api/ask/auth/begin','/api/ask/auth/answer','/api/ask/auth/cancel','/api/ask/auth/signout'];
    if(req.method!=='POST'||!routes.includes(path))return send(res,404,{error:'NOT_FOUND'});
    if(req.headers.origin!==origin)return send(res,403,{error:'SAME_ORIGIN_REQUIRED'});
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON_REQUIRED'});
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyCap)return send(res,413,{error:'IMAGE_TOO_LARGE',fixture});chunks.push(chunk);}
    let args;try{args=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'INVALID_JSON'});}
    if(!args||typeof args!=='object')return send(res,400,{error:'INVALID_JSON'});
    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});const signal=controller.signal;
    const result=await serial(async()=>{
     if(preparationOnly&&path.startsWith('/api/ask/auth/'))throw Error('REAL_MODEL_AUTH_PENDING');
     if(path==='/api/ask/auth/begin'){await beginAuth();return authView();}
     if(path==='/api/ask/auth/answer'){answerAuth(args.promptId,args.text);return authView();}
     if(path==='/api/ask/auth/cancel'){cancelAuth();return authView();}
     if(path==='/api/ask/auth/signout'){assertBrowserCredentialMutationAllowed(credentialHome);if(auth.status==='running')throw Error('SIGN_IN_ALREADY_RUNNING');await ctx.credentials.deleteRecord(authKey);Object.assign(auth,{status:'idle',notices:[],prompt:null,error:null});return authView();}
     if(path==='/api/ask/new'){const id=await newConversation(args.model);return transcript(id,signal);}
     const c=conv(args.conversationId);
     if(path==='/api/ask/link')return ws.downloadImageForPanel(c.session,args.url,signal);
     if(path==='/api/ask/upload'){
      if(typeof args.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/u.test(args.data))throw Error('IMAGE_BYTES_REQUIRED');
      return ws.attachImageForPanel(c.session,{data:Buffer.from(args.data,'base64'),mediaType:args.mediaType},signal);
     }
     if(path==='/api/ask/read')return ws.readPanelImage(c.session,args.attachmentId,signal);
     if(path==='/api/ask/transcript')return transcript(c.id,signal);
     return turn(c.id,args.text,signal);
    });
    if(!res.destroyed)send(res,200,{result,fixture});
   }catch(error){if(!res.destroyed)send(res,422,{error:error.message??String(error),details:error.details,fixture});}
  };
  for(const h of hosts){const server=createServer(handler);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,h,resolve);});servers.push(server);port=server.address().port;}
  return {servers,initial,runtime,model,url:`http://127.0.0.1:${port}/ask`,async close(){for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}await queue;for(const c of conversations.values())c.lift();await ctx.fiber.dispose();}};
 }catch(error){for(const s of servers)s.close();await ctx.fiber.dispose();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const service=await startAskWeb();
 console.log(JSON.stringify({event:'WORKSHOP_ASK_WEB_READY',pid:process.pid,url:service.url,initialConversation:service.initial,runtime:service.runtime,fixture}));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.close().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});});
}
