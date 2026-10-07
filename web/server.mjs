import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import { WorkshopV3 } from '../src/index.mjs';
import { WorkshopProjectionStore } from '../src/projection-store.mjs';

// A real PNG fixture fetched over HTTP. Session business identity and the
// writer bridge below are examples, never the running App Host's conversation.
const samplePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const defaultRun=fileURLToPath(new URL('../../runtime/web/',import.meta.url));
const fixture={kind:'FIXTURE',label:'示例对话（FIXTURE）',writer:'示例 Session 持久化桥；非正式 App Host',modelCalls:0,worldWrites:0};

export async function startWorkshopWeb({port=47605,runRoot=defaultRun}={}) {
 await mkdir(runRoot,{recursive:true});const runtime=await mkdtemp(join(runRoot,'session-'));
 const ctx=new Context();let projectionStore,server;
 try {
  await ctx.plugin(Jsonl,{root:join(runtime,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(runtime,'projection')}).await();
  await ctx.plugin(StorageDomain,{backend:'json'}).await();
  await ctx.plugin(Attachments,{dshHome:join(runtime,'media')}).await();
  const sessionRef=`workshop-example-${randomUUID()}`;
  const header={version:SESSION_FORMAT_VERSION,id:sessionRef,createdAt:Date.now(),cwd:runtime,isSeeded:false};
  const initial=[{type:'turn/start',seq:0,time:header.createdAt,data:{turn:1}}];
  const created=await ctx.sessionPersistence.create(header);await created.append(initial);await created.close();
  const session=Session.create(sessionRef,initial,header);let offset=initial.length;
  // Explicit fixture lifecycle bridge, using the public Core append/JSONL APIs.
  const sessions={get:id=>id===sessionRef?session:undefined,async flush(current){
   if(current!==session)throw Error('SESSION_MISMATCH');
   const writer=await ctx.sessionPersistence.open(sessionRef,'write');
   try{await writer.append(session.snapshotEvents(offset));offset=session.seq;}finally{await writer.close();}
  }};
  projectionStore=new WorkshopProjectionStore(()=>ctx.storageDomain);
  const workshop=new WorkshopV3({sessions,sessionPersistence:ctx.sessionPersistence,projectionStore,attachments:ctx.attachments});
  const assets=new Map(await Promise.all(['index.html','app.mjs','style.css'].map(async name=>[`/${name}`,await readFile(new URL(name,import.meta.url))])));
  let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(value):value);};
  server=createServer(async(req,res)=>{
   try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    if(req.headers.host!==new URL(origin).host)return send(res,403,{error:'LOCALHOST_HOST_REQUIRED'});
    const path=new URL(req.url,origin).pathname;
    if(req.method==='GET'){
     if(path==='/api/session')return send(res,200,{sessionRef,...fixture});
     if(path==='/sample.png')return send(res,200,samplePNG,'image/png');
     const key=path==='/'?'/index.html':path;
     if(assets.has(key))return send(res,200,assets.get(key),key.endsWith('.html')?'text/html; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
     return send(res,404,{error:'NOT_FOUND'});
    }
    if(req.method!=='POST'||!['/api/download','/api/read'].includes(path))return send(res,404,{error:'NOT_FOUND'});
    if(req.headers.origin!==origin)return send(res,403,{error:'SAME_ORIGIN_REQUIRED'});
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON_REQUIRED'});
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>1048576)return send(res,413,{error:'REQUEST_TOO_LARGE'});}
    let args;try{args=JSON.parse(text);}catch{return send(res,400,{error:'INVALID_JSON'});}
    if(!args||args.sessionRef!==sessionRef)return send(res,400,{error:'EXAMPLE_SESSION_MISMATCH'});
    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    const result=await serial(()=>path==='/api/download'?workshop.downloadImageForPanel(session,args.url,controller.signal):workshop.readPanelImage(session,args.attachmentRef,controller.signal));
    if(!res.destroyed)send(res,200,{result,fixture});
   }catch(error){if(!res.destroyed)send(res,422,{error:error.message??String(error),fixture});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,sessionRef,runtime,url:`http://127.0.0.1:${server.address().port}/`,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await queue;await projectionStore.close();await ctx.fiber.dispose();}};
 }catch(error){server?.close();await projectionStore?.close();await ctx.fiber.dispose();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const service=await startWorkshopWeb();
 console.log(JSON.stringify({event:'WORKSHOP_WEB_READY',pid:process.pid,url:service.url,sessionRef:service.sessionRef,runtime:service.runtime,fixture}));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.close().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});});
}
