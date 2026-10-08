import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import Workshop, { IMAGE_ASK_SECTION } from '../src/index.mjs';

// Standalone developer Host for Workshop's image-ask step. Real: Cordis, Session
// store/JSONL, AgentRegistry, the official AgentLoop, system-prompt assembly, tool
// registry, local attachments, HTTP download and Workshop. FIXTURE: the model.
const samplePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const defaultRun=fileURLToPath(new URL('../../runtime/ask-web/',import.meta.url));
export const PROVIDER='hanaworlds-fixture',MODEL='fixture-vision-1';
export const fixture={kind:'FIXTURE',model:`${PROVIDER}/${MODEL}`,label:'FIXTURE 模型（不是真实模型，不会真正看图）',
 conversations:'本页独立会话，不是 HanaWorlds App 的当前对话',realModel:'UNKNOWN：未授权真实模型/鉴权/费用',worldWrites:0};
const sha=b=>createHash('sha256').update(b).digest('hex');

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
  const system=options.messages.filter(m=>m.role==='system').flatMap(m=>m.content).filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const tools=(options.tools??[]).map(t=>t.name);
  const record={images,skillSection:system.includes('HanaWorlds building skill — image step.'),tools};this.requests.push(record);
  const text=['【FIXTURE 模型 · 不是真实模型，不会看图】',
   images.length?`本回合模型请求里收到 ${images.length} 张图片的真实字节：`:'本回合模型请求里没有图片。',
   ...images.map(i=>`- ${i.mediaType} ${i.width}×${i.height} px，${i.bytes} B，sha256 ${i.sha256.slice(0,16)}…`),
   `系统提示含 ${IMAGE_ASK_SECTION} 图片步骤：${record.skillSection?'是':'否'}；模型可见工具：${tools.join('、')||'无'}。`,
   '真实模型未授权（UNKNOWN），这里不描述图中结构，也不判断比例/用途是否需要追问。'].join('\n');
  yield {type:'block-start',index:0,blockType:'text'};
  yield {type:'text-delta',index:0,text};
  yield {type:'block-end',index:0,block:{type:'text',text}};
  yield {type:'finish',reason:'stop'};
 }
}

const imageParts=content=>(content??[]).filter(p=>p.type==='image').map(p=>p.attachment);
const textOf=content=>(content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');

export async function startAskWeb({port=47608,runRoot=defaultRun,hosts=['127.0.0.1','::1']}={}) {
 await mkdir(runRoot,{recursive:true});const runtime=await mkdtemp(join(runRoot,'session-'));
 const ctx=new Context();const servers=[];
 try {
  await ctx.plugin(Jsonl,{root:join(runtime,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(runtime,'projection')}).await();await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(runtime,'media')}).await();
  await ctx.plugin(Sessions).await();await ctx.plugin(Projections).await();await ctx.plugin(Agents).await();
  await ctx.plugin(Llm).await();await ctx.plugin(SystemPrompt).await();await ctx.plugin(Tools).await();await ctx.plugin(AgentLoop).await();
  const model=new FixtureVisionModel(()=>ctx.attachments);ctx.llm.registerAdapter([PROVIDER],model);
  await ctx.plugin(Workshop).await();
  const ws=ctx.get('hanaworldsWorkshop');
  const conversations=new Map();
  async function newConversation(){
   const id=`ask-${randomUUID()}`;
   const handle=await ctx.agents.create({sessionId:id,agentOptions:{provider:PROVIDER,model:MODEL}});
   const lift=ws.prepareImageAsk(handle.agent);
   conversations.set(id,{id,agent:handle.agent,session:ctx.sessions.get(id),lift,createdAt:Date.now()});return id;
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
   return {conversationId:id,started:c.session.surface.nodes.length>0,status:c.agent.status,items,queued};
  }
  async function turn(id,text,signal){
   const c=conv(id);if(typeof text!=='string'||!text.trim())throw Error('QUESTION_REQUIRED');
   if(c.agent.status!=='idle')throw Error('AGENT_BUSY');
   const before=(await durable(id)).length,asked=model.requests.length;
   c.agent.followup({id:`ask-prompt-${randomUUID()}`,role:'user',source:{kind:'user'},content:[{type:'text',text:text.trim()}]});
   await c.agent.whenIdle();await ctx.sessions.flush(c.session);signal.throwIfAborted();
   const added=(await durable(id)).slice(before);
   if(!added.some(e=>e.type==='assistant/message'&&e.surfaceOp==='append')){
    const error=Error('MODEL_TURN_NO_REPLY');error.details={events:added.map(e=>e.type),modelRequests:model.requests.length-asked};throw error;
   }
   return {request:model.requests.at(-1)??null,transcript:await transcript(id,signal)};
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
     if(path==='/api/ask/state')return send(res,200,{fixture,initial,conversations:[...conversations.values()].map(c=>({id:c.id,started:c.session.surface.nodes.length>0,createdAt:c.createdAt})),limits:{maxImageBytes:uploadCap,mediaTypes:limits.mediaTypes.filter(t=>['image/png','image/jpeg','image/webp','image/gif'].includes(t))}});
     if(path==='/sample.png')return send(res,200,samplePNG,'image/png');
     if(path==='/sample-not-image')return send(res,200,'<html>not an image</html>','text/html; charset=utf-8');
     if(assets.has(path))return send(res,200,assets.get(path),path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
     return send(res,404,{error:'NOT_FOUND'});
    }
    const routes=['/api/ask/new','/api/ask/link','/api/ask/upload','/api/ask/read','/api/ask/turn','/api/ask/transcript'];
    if(req.method!=='POST'||!routes.includes(path))return send(res,404,{error:'NOT_FOUND'});
    if(req.headers.origin!==origin)return send(res,403,{error:'SAME_ORIGIN_REQUIRED'});
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON_REQUIRED'});
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyCap)return send(res,413,{error:'IMAGE_TOO_LARGE',fixture});chunks.push(chunk);}
    let args;try{args=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'INVALID_JSON'});}
    if(!args||typeof args!=='object')return send(res,400,{error:'INVALID_JSON'});
    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});const signal=controller.signal;
    const result=await serial(async()=>{
     if(path==='/api/ask/new'){const id=await newConversation();return transcript(id,signal);}
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
