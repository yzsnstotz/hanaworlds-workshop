// New isolated developer page. Boot explicitly, only for the PM-reviewed root
// and port. No auth/credentials/model adapter, driver input or peer fixture.
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import Sessions from '@deepseek-ai/dsh-session';
import Agents from '@deepseek-ai/dsh-agent';
import Projections from '@deepseek-ai/dsh-session-projection';
import Llm from '@deepseek-ai/dsh-llm';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as C from 'hanaworlds-contracts';
import Workshop from '../src/index.mjs';
import {createPainterLocalFactsPort,appendStartedUserInput} from './c4-supply.mjs';

const failure = code => Object.assign(new Error(code),{code});
const succeeded = (op,request,response) => {
 C.validateBoundResponse('session/v4',op,request,response);
 if(response.error)throw failure(response.error.code);
 return response.result;
};

export async function startSupplyPage({root,port}) {
 if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||!Number.isSafeInteger(port)||port<1024||port>65535)throw failure('EXPLICIT_ROOT_AND_PORT_REQUIRED');
 await mkdir(root,{mode:0o700}); // Exclusive: never resumes/opens an old root.
 const ctx=new Context(),owners=new Map(),active=new Set(),nonce=randomUUID();let server,closed=false,modelSteps=0,inputCommits=0,creationAttempted=false,createdSessionRef=null;
 async function close(){
  if(closed)return;closed=true;
  if(server?.listening){server.closeAllConnections();await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));}
  await Promise.allSettled([...active]);
  try{for(const owner of owners.values())await owner.dispose();}
  finally{await ctx.fiber.dispose();}
 }
 try {
  for(const [plugin,config] of [[Jsonl,{root:join(root,'core'),compression:'none'}],[Sessions],[Projections],[Agents],[Llm],[SystemPrompt],[Tools],[AgentLoop],[Storage],[StorageJson,{root:join(root,'projection')}],[StorageDomain,{backend:'json'}],[Workshop]])await ctx.plugin(plugin,config).await();
  // A defensive tripwire before every actual driver step. Never use it to
  // claim an entered driver turn or rejected step as a completed user turn.
  ctx.on('agent/pre-step',()=>{modelSteps++;throw failure('MODEL_STEP_DISABLED');});
  await ctx.plugin({name:'workshop-c4-local-facts-host',apply(ownerCtx){ownerCtx.provide('hanaworldsPainterLocalFacts',createPainterLocalFactsPort(()=>ownerCtx.get('hanaworldsWorkshopV3')));}}).await();
  const ws=ctx.get('hanaworldsWorkshopV3');
  const status=async()=>{
   const request={contractVersion:'session/v4',requestId:`supply-list-${randomUUID()}`};
   const directory=succeeded('ListSessions',request,await ws.call('ListSessions',request));
   return {kind:'REAL_OFFICIAL_GS_ONLY',modelAdapters:0,modelSteps,inputCommits,worldWrites:0,creationAttempted,createdSessionRef,
    sessions:directory.sessions.map((identity,i)=>{const session=ctx.sessions.get(identity.sessionRef),head=session?.surface.nodes[0];return {identity,label:`供给对话 ${i+1}`,started:session?head!==undefined&&session.eventAt(head)?.type==='system/message':null};}),
    capabilities:'NOT_BOUND',canvasSelection:'NOT_BOUND',confirmedBrief:'NOT_RUN',retainedRequest:'NOT_RUN',
    firstTurn:'CONVERSATION_NOT_STARTED_MODEL_PATH_UNPROVEN'};
  };
  const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  async function body(request){
   if(request.headers['content-type']!=='application/json'||request.headers['x-supply-nonce']!==nonce||request.headers.origin!==`http://${request.headers.host}`)throw failure('USER_INPUT_ORIGIN_REJECTED');
   let bytes=0;const chunks=[];
   for await(const chunk of request){bytes+=chunk.length;if(bytes>16384)throw failure('INPUT_TOO_LARGE');chunks.push(chunk);}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function receive(request,response){
   let creating=false;
   const abort=new AbortController();response.on('close',()=>{if(!response.writableEnded)abort.abort();});
   const json=(code,value)=>{if(response.destroyed)return;response.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(value));};
   try{
    if(closed)throw failure('SUPPLY_CLOSING');
    if(!hosts.has(request.headers.host))throw failure('HOST_REJECTED');
    const path=new URL(request.url,`http://${request.headers.host}`).pathname;
    if(request.method==='GET'&&(path==='/'||path==='/supply')){
     const page=await readFile(new URL('./c4-supply.html',import.meta.url),'utf8');
     response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});response.end(page.replace('SUPPLY_NONCE',nonce));return;
    }
    if(request.method==='GET'&&['/c4-supply-page.mjs','/style.css'].includes(path)){
     const file=new URL(path.slice(1),import.meta.url);response.writeHead(200,{'content-type':path.endsWith('.css')?'text/css':'text/javascript'});response.end(await readFile(file));return;
    }
    if(request.method==='GET'&&path==='/api/supply/status'){json(200,await status());return;}
    if(request.method==='POST'&&path==='/api/supply/sessions'){
     creating=true;
     const input=await body(request);if(Object.keys(input).length)throw failure('CREATE_INPUT_NOT_ALLOWED');
     abort.signal.throwIfAborted();
     if(creationAttempted)throw failure('SINGLE_SESSION_SLOT_USED');
     // Consume before the first await. Failed factory/flush can leave durable
     // data, so failure never authorizes a second fresh Session in this root.
     creationAttempted=true;const owner=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:root}});
     createdSessionRef=owner.agent.session.header.id;owners.set(createdSessionRef,owner);await ctx.sessions.flush(owner.agent.session);
     // No followup/send/inject/steer, no user/system message is appended.
     json(201,await status());return;
    }
    if(request.method==='POST'&&path==='/api/supply/input'){
     const input=await body(request);
     if(Object.keys(input).sort().join(',')!=='sessionRef,text'||!owners.has(input.sessionRef))throw failure('OWNED_SESSION_REQUIRED');
     const result=await appendStartedUserInput(ctx,input.sessionRef,input.text,abort.signal);inputCommits++;
     json(200,result);return;
    }
    json(404,{error:{code:'NOT_FOUND'}});
   }catch(error){if(error.committedInputId)inputCommits++;json(409,{error:{code:error.code??'SUPPLY_FAILED',committedInputId:error.committedInputId??null,createdSessionRef:creating?createdSessionRef:null}});}
  }
  server=createServer((request,response)=>{const work=receive(request,response);active.add(work);work.finally(()=>active.delete(work));});
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  return {ctx,root,port,url:`http://127.0.0.1:${port}/supply`,status,close};
 }catch(error){await close();throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const runtime=await startSupplyPage({root:process.env.HW_C4_SUPPLY_ROOT,port:Number(process.env.HW_C4_SUPPLY_PORT)});
 console.log(JSON.stringify({event:'SUPPLY_PAGE_READY',url:runtime.url,root:runtime.root,kind:'REAL_OFFICIAL_GS_ONLY',modelAdapters:0}));
 let exiting=false;const stop=async()=>{if(exiting)return;exiting=true;await runtime.close();console.log(JSON.stringify({event:'SUPPLY_PAGE_CLOSED',storedSessionsRetained:true}));};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
