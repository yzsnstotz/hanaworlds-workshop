import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { startAskWeb } from '../archive/workshop-01/web/ask-server.mjs';

test('preparation page mounts no credential/auth/real model service; only fixture can receive image bytes', async () => {
 const runRoot=process.env.HW_RUNTIME_ROOT;assert.ok(runRoot,'own isolated HW_RUNTIME_ROOT required');
 await mkdir(runRoot,{recursive:true});let setupSeen=false;
 const web=await startAskWeb({port:0,runRoot,hosts:['127.0.0.1'],preparationOnly:true,setup:ctx=>{
  setupSeen=true;assert.equal(ctx.get('credentials')===undefined,true,'preparation mounts no credentials service');assert.equal(ctx.get('authorization')===undefined,true,'preparation mounts no authorization service');
 }});
 try {
  assert.equal(setupSeen,true);
  const origin=web.url.replace('/ask','');
  const post=async(path,args)=>(await fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(args)})).json();
  const state=await (await fetch(origin+'/api/ask/state')).json();
  assert.equal(state.preparationOnly,true);assert.equal(state.auth.signedIn,false);assert.equal(state.auth.flow,null);
  assert.deepEqual(state.models.map(m=>m.kind),['FIXTURE']);
  for(const op of ['begin','answer','cancel','signout'])assert.equal((await post('/api/ask/auth/'+op,{})).error,'REAL_MODEL_AUTH_PENDING');
  assert.equal((await post('/api/ask/new',{model:'openai-codex/gpt-5.6-luna'})).error,'MODEL_NOT_AVAILABLE');
  const up=await post('/api/ask/link',{conversationId:state.initial,url:origin+'/sample.png'});
  assert.equal(up.result.status,'QUEUED_FOR_NEXT_TURN');
  const turn=await post('/api/ask/turn',{conversationId:state.initial,text:'描述图片（仅FIXTURE准备验证）'});
  assert.equal(turn.result.model.kind,'FIXTURE');assert.equal(turn.result.request.images.length,1);
  assert.equal(turn.result.request.skillCatalog,true);
  assert.match(turn.result.transcript.items.at(-1).text,/FIXTURE/);
  assert.equal(web.model.requests.length,1);
  assert.ok(!(await readdir(web.runtime)).includes('dsh-home'));
 } finally {await web.close();await rm(web.runtime,{recursive:true,force:true});}
});
