import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
let exports;
const window={__ModuleLoader__:{load({factory}){exports=factory(id=>{if(id==='react')return {createElement(){}};throw Error('unavailable fixture module');});}}};
vm.runInNewContext(await readFile(new URL('../client.cjs',import.meta.url),'utf8'),{window,AbortController,console});
const image={attachmentId:'sha256:fixture-image',mediaType:'image/png',bytes:96,width:2,height:2};
const result={sessionRef:'s1',status:'ATTACHED',image,data:'fixture-base64'};

test('image link panel publishes success only after a separate same-Session readback',async()=>{
 assert.equal(typeof exports.createImageLinkFlow,'function','image panel controller is exported');
 const calls=[];
 const flow=exports.createImageLinkFlow({currentSessionRef:()=> 's1',rpc:async(endpoint,args)=>{
  calls.push({endpoint,args});assert.equal(flow.snapshot().result,null,'no success before readback');return result;
 }});
 assert.equal(await flow.download('https://example.invalid/image.png'),true);
 assert.equal(calls.length,2);assert.equal(calls[0].endpoint,'hanaworldsWorkshopImageLinks/downloadLink');
 assert.equal(calls[0].args.sessionRef,'s1');assert.equal(calls[1].endpoint,'hanaworldsWorkshopImageLinks/readLink');
 assert.equal(calls[1].args.attachmentRef,image.attachmentId);assert.equal(flow.snapshot().result.sessionRef,'s1');
 assert.equal(flow.snapshot().busy,false);
});
test('image link panel refuses missing Session and discards an old Session reply after selection changes',async()=>{
 assert.equal(typeof exports.createImageLinkFlow,'function','image panel controller is exported');
 let current=null,release,calls=0;
 const flow=exports.createImageLinkFlow({currentSessionRef:()=>current,rpc:async()=>{calls++;return new Promise(r=>release=r);}});
 assert.equal(await flow.download('https://example.invalid/image.png'),false);assert.equal(calls,0);
 current='s1';const pending=flow.download('https://example.invalid/image.png');current='s2';release(result);
 assert.equal(await pending,false);assert.equal(flow.snapshot().result,null);assert.match(flow.snapshot().error,/对话/);
});
test('image link panel keeps a decode/association failure visible and does not publish an image',async()=>{
 assert.equal(typeof exports.createImageLinkFlow,'function','image panel controller is exported');
 const flow=exports.createImageLinkFlow({currentSessionRef:()=> 's1',rpc:async()=>{throw Error('MEDIA_DECODE_FAILED');}});
 assert.equal(await flow.download('https://example.invalid/image.png'),false);
 assert.match(flow.snapshot().error,/MEDIA_DECODE_FAILED/);assert.equal(flow.snapshot().result,null);
});
