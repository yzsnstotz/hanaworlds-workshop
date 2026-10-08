// 47608 /ask developer page routes and trust boundary, with the page's own
// composition (official AgentLoop + FIXTURE model). Not a UI test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { startAskWeb } from '../web/ask-server.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOo2HKnYssdBggFADdeCCGxfcWRAAAAAElFTkSuQmCC','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');

test('ask page: fixture labelled, localhost only, new and started conversations, upload and link reach the model turn, failures named and recoverable',async()=>{
 const runRoot=new URL('../../runtime/ask-web-test/',import.meta.url).pathname;await mkdir(runRoot,{recursive:true});
 const web=await startAskWeb({port:0,runRoot,hosts:['127.0.0.1']});
 try{
  const port=web.servers[0].address().port,origin=`http://127.0.0.1:${port}`;
  const post=async(path,body,headers={})=>{const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const page=await fetch(`${origin}/ask?from=test`);assert.equal(page.status,200);assert.match(await page.text(),/FIXTURE 模型/);
  const state=await (await fetch(`${origin}/api/ask/state`)).json();
  assert.equal(state.fixture.kind,'FIXTURE');assert.equal(state.fixture.worldWrites,0);assert.ok(state.conversations.some(c=>c.id===state.initial&&!c.started));
  assert.equal((await post('/api/ask/transcript',{conversationId:state.initial},{origin:'http://evil.test'})).status,403);
  const hostStatus=host=>new Promise((ok,no)=>request({host:'127.0.0.1',port,path:'/api/ask/state',headers:{host}},r=>{r.resume();ok(r.statusCode);}).on('error',no).end());
  assert.equal(await hostStatus('evil.test'),403);assert.equal(await hostStatus(`localhost:${port}`),200);
  const conversationId=state.initial;
  // New conversation: upload queues; failures are named and leave nothing queued.
  assert.equal((await post('/api/ask/link',{conversationId,url:`${origin}/sample-not-image`})).body.error,'IMAGE_TYPE_UNSUPPORTED');
  assert.equal((await post('/api/ask/upload',{conversationId,mediaType:'text/plain',data:Buffer.from('x').toString('base64')})).body.error,'IMAGE_TYPE_UNSUPPORTED');
  const up=await post('/api/ask/upload',{conversationId,mediaType:'image/png',data:png.toString('base64')});
  assert.equal(up.status,200);assert.equal(up.body.result.status,'QUEUED_FOR_NEXT_TURN');assert.equal(up.body.fixture.kind,'FIXTURE');
  let t=(await post('/api/ask/transcript',{conversationId})).body.result;assert.equal(t.queued.length,1);assert.equal(t.queued[0].images[0].data,png.toString('base64'));
  const turn=(await post('/api/ask/turn',{conversationId,text:'描述这张图片里的建筑结构'})).body.result;
  assert.equal(turn.request.images.length,1);assert.equal(turn.request.images[0].sha256,sha(png));assert.equal(turn.request.skillSection,true);
  assert.equal(turn.transcript.started,true);assert.equal(turn.transcript.queued.length,0);
  const reply=turn.transcript.items.at(-1);assert.equal(reply.role,'assistant');assert.match(reply.text,/FIXTURE/);
  // Same conversation, now started: a link attaches directly and the next turn carries it.
  const link=await post('/api/ask/link',{conversationId,url:`${origin}/sample.png`});assert.equal(link.body.result.status,'ATTACHED');
  assert.equal((await post('/api/ask/read',{conversationId,attachmentId:link.body.result.image.attachmentId})).body.result.sessionRef,conversationId);
  const second=(await post('/api/ask/turn',{conversationId,text:'再看这张'})).body.result;assert.equal(second.request.images.length,2);
  assert.equal((await post('/api/ask/turn',{conversationId,text:'  '})).body.error,'QUESTION_REQUIRED');
  // A second conversation is independent.
  const other=(await post('/api/ask/new',{})).body.result;assert.equal(other.started,false);assert.equal(other.items.length,0);
  assert.match((await post('/api/ask/read',{conversationId:other.conversationId,attachmentId:link.body.result.image.attachmentId})).body.error,/SESSION_NOT_FOUND/);
  // Attachments are content-addressed; use different bytes so the other conversation holds a different image.
  const onePixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal((await post('/api/ask/upload',{conversationId:other.conversationId,mediaType:'image/png',data:onePixel})).body.result.status,'QUEUED_FOR_NEXT_TURN');
  assert.equal((await post('/api/ask/read',{conversationId:other.conversationId,attachmentId:link.body.result.image.attachmentId})).body.error,'ATTACHMENT_REJECTED');
  assert.equal(web.model.requests.length,2);
 }finally{await web.close();await rm(web.runtime,{recursive:true,force:true});}
});
