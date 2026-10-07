import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
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
