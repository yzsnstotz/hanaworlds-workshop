// 47608 /ask developer page routes and trust boundary, with the page's own
// composition (official AgentLoop + FIXTURE model). Not a UI test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { startAskWeb, REAL_AUTH_KEY } from '../web/ask-server.mjs';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
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

// Route A preparation. Never begins the real openai-codex sign-in and never calls a real model:
// the real flow is only described; the sign-in cycle runs against a FIXTURE flow on its own key.
test('real route prepared offline: official openai-codex flow and vision models listed, signed-out real turn refused before any model call',async()=>{
 const runRoot=new URL('../../runtime/ask-web-test/',import.meta.url).pathname;await mkdir(runRoot,{recursive:true});
 const web=await startAskWeb({port:0,runRoot,hosts:['127.0.0.1']});
 try{
  const origin=`http://127.0.0.1:${web.servers[0].address().port}`;
  const post=async(path,body)=>(await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})).json();
  const state=await (await fetch(`${origin}/api/ask/state`)).json();
  assert.equal(state.auth.key,REAL_AUTH_KEY);assert.equal(state.auth.flow.label,'OpenAI Codex');assert.equal(state.auth.flow.methods[0].label,'OpenAI (ChatGPT Plus/Pro)');
  assert.equal(state.auth.signedIn,false);assert.equal(state.auth.status,'idle');assert.match(state.auth.route.cost,/订阅/);
  const luna=state.models.find(m=>m.id==='openai-codex/gpt-5.6-luna');assert.equal(luna?.kind,'REAL');
  assert.equal(state.models[0].kind,'FIXTURE');assert.ok(state.models.filter(m=>m.kind==='REAL').every(m=>m.provider==='openai-codex'));
  const real=(await post('/api/ask/new',{model:'openai-codex/gpt-5.6-luna'})).result;assert.equal(real.model.kind,'REAL');
  assert.equal((await post('/api/ask/turn',{conversationId:real.conversationId,text:'描述这张图'})).error,'REAL_MODEL_SIGN_IN_REQUIRED');
  const t=(await post('/api/ask/transcript',{conversationId:real.conversationId})).result;assert.equal(t.items.length,0);assert.equal(t.started,false);
  assert.equal((await post('/api/ask/new',{model:'nope/none'})).error,'MODEL_NOT_AVAILABLE');
  assert.equal((await post('/api/ask/auth/signout',{})).result.signedIn,false);
  assert.equal(web.model.requests.length,0);
 }finally{await web.close();await rm(web.runtime,{recursive:true,force:true});}
});

test('sign-in surface drives an official dsh-authorization flow end to end (FIXTURE flow): notice, prompt, answer, signed in, sign out, cancel',async()=>{
 const runRoot=new URL('../../runtime/ask-web-test/',import.meta.url).pathname;await mkdir(runRoot,{recursive:true});
 const key=credentialKey('hanaworlds-ask-test','fixture');
 const setup=ctx=>{ctx.authorization.registerFlow({key,label:'FIXTURE sign-in',methods:[{id:'oauth',label:'FIXTURE oauth'}],async run(session){
  session.notify({message:'Continue in your browser (FIXTURE)',url:'http://127.0.0.1/fixture-login'});
  const code=await session.prompt({kind:'text',message:'Paste the code (FIXTURE)'});
  await ctx.credentials.modifyRecord(key,()=>Promise.resolve({kind:'grant',payload:{token:`fixture-${code}`}}));}});};
 const web=await startAskWeb({port:0,runRoot,hosts:['127.0.0.1'],authKey:key,setup});
 try{
  const origin=`http://127.0.0.1:${web.servers[0].address().port}`;
  const post=async(path,body={})=>(await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})).json();
  const view=async()=>(await fetch(`${origin}/api/ask/auth`)).json();
  const until=async f=>{for(let i=0;i<100;i++){const v=await view();if(f(v))return v;await new Promise(r=>setTimeout(r,20));}throw Error('AUTH_STATE_TIMEOUT');};
  assert.equal((await view()).signedIn,false);
  assert.equal((await post('/api/ask/auth/begin')).result.status,'running');
  assert.equal((await post('/api/ask/auth/begin')).error,'SIGN_IN_ALREADY_RUNNING');
  const asked=await until(v=>v.prompt);assert.equal(asked.notices[0].url,'http://127.0.0.1/fixture-login');
  assert.equal((await post('/api/ask/auth/answer',{promptId:'wrong',text:'x'})).error,'SIGN_IN_PROMPT_MISMATCH');
  await post('/api/ask/auth/answer',{promptId:asked.prompt.id,text:'1234'});
  const done=await until(v=>v.status!=='running');assert.equal(done.status,'authorized');assert.equal(done.signedIn,true);
  assert.equal((await post('/api/ask/auth/signout')).result.signedIn,false);
  await post('/api/ask/auth/begin');await until(v=>v.prompt);
  await post('/api/ask/auth/cancel');const cancelled=await until(v=>v.status!=='running');
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.signedIn,false);
 }finally{await web.close();await rm(web.runtime,{recursive:true,force:true});}
});
