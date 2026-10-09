import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { request } from 'node:http';
import { startWorkshopWeb } from '../web/server.mjs';
test('new localhost entry exposes its fixture identity and refuses foreign origins or borrowed Sessions',async()=>{
 const service=await startWorkshopWeb({port:0,runRoot:new URL('../../runtime/web-check/',import.meta.url).pathname});
 try{
  const origin=service.url.slice(0,-1);
  const session=await (await fetch(new URL('/api/session',origin))).json();
  assert.equal(session.kind,'FIXTURE');assert.equal(session.sessionRef,service.sessionRef);
  const entry=await (await fetch(origin)).text();assert.match(entry,/示例对话 · FIXTURE/);
  const normal=await fetch(new URL('/api/download',origin),{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({sessionRef:service.sessionRef,url:new URL('/sample.png',origin).href})});
  const downloaded=await normal.json();assert.equal(normal.status,200,JSON.stringify(downloaded));
  const readback=await (await fetch(new URL('/api/read',origin),{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({sessionRef:service.sessionRef,attachmentRef:downloaded.result.image.attachmentId})})).json();
  assert.equal(readback.result.status,'ATTACHED');assert.equal(readback.result.sessionRef,service.sessionRef);assert.equal(readback.result.image.width,2);assert.equal(readback.result.image.height,2);assert.equal(readback.result.image.bytes,96);
  const post=(headers,args)=>fetch(new URL('/api/download',origin),{method:'POST',headers,body:JSON.stringify(args)});
  let response=await post({'content-type':'application/json',origin:'https://foreign.invalid'},{sessionRef:service.sessionRef});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'SAME_ORIGIN_REQUIRED');
  response=await post({'content-type':'application/json',origin},{sessionRef:'borrowed',url:'https://example.invalid/no-fetch'});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'EXAMPLE_SESSION_MISMATCH');
  response=await post({'content-type':'text/plain',origin},{sessionRef:service.sessionRef});assert.equal(response.status,415);
  response=await fetch(new URL('/api/download',origin),{method:'POST',headers:{'content-type':'application/json',origin},body:'{'});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'INVALID_JSON');
 }finally{await service.close();await rm(service.runtime,{recursive:true,force:true});}
});
test('copied links open the page from localhost, with a query or trailing text; other hosts stay refused',async()=>{
 const service=await startWorkshopWeb({port:0,runRoot:new URL('../../runtime/web-check/',import.meta.url).pathname});
 try{
  const port=new URL(service.url).port;
  const get=(path,host)=>new Promise((resolve,reject)=>request({host:'127.0.0.1',port,path,headers:{host}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text}));}).on('error',reject).end());
  for(const [path,host] of [['/',`localhost:${port}`],['/?from=chat',`127.0.0.1:${port}`],['/%E3%80%82%E8%AF%B7%E6%89%93%E5%BC%80',`localhost:${port}`]]){
   const r=await get(path,host);assert.equal(r.status,200,`${host}${path}`);assert.match(r.text,/示例对话 · FIXTURE/);
  }
  const foreign=await get('/',`evil.invalid:${port}`);assert.equal(foreign.status,403);assert.match(foreign.text,/LOCALHOST_HOST_REQUIRED/);
  assert.equal((await get('/api/unknown',`localhost:${port}`)).status,404);
  const local=`http://localhost:${port}`;
  const posted=await new Promise((resolve,reject)=>{const body=JSON.stringify({sessionRef:service.sessionRef,url:new URL('/sample.png',service.url).href});
   request({host:'127.0.0.1',port,path:'/api/download',method:'POST',headers:{host:`localhost:${port}`,origin:local,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let t='';res.on('data',c=>t+=c);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(t)}));}).on('error',reject).end(body);});
  assert.equal(posted.status,200,JSON.stringify(posted.json));assert.equal(posted.json.result.status,'ATTACHED');
 }finally{await service.close();await rm(service.runtime,{recursive:true,force:true});}
});
