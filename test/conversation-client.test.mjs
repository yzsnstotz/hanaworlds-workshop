import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source=await readFile(new URL('../client.cjs',import.meta.url),'utf8');
function client(){
 let exports;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:value=>[value,()=>{}],useEffect:()=>{}};
 runInNewContext(source,{AbortController,window:{__ModuleLoader__:{load({factory}){exports=factory(()=>React);}}}});
 return exports;
}
const view=(id,model='host-choice')=>({sessionRef:id,model:{provider:'fixture',model},status:'idle',items:[{id:'answer',role:'assistant',text:'FIXTURE answer',model}]});
test('conversation form displays the host selection and sends only user text to its native Session',async()=>{
 const c=client(),calls=[];
 const flow=c.createConversationFlow({currentSessionRef:()=> 's1',rpc:async(endpoint,args)=>{calls.push({endpoint,args});return view(args.sessionRef);}});
 await flow.refreshSession();
 const panel=c.WorkshopConversationPanel({flow});assert.match(JSON.stringify(panel),/当前模型：host-choice/);
 assert.equal(await flow.submit('你好'),true);
 assert.equal(calls.at(-1).endpoint,'hanaworldsWorkshopConversation/send');
 assert.deepEqual(Object.keys(calls.at(-1).args).sort(),['sessionRef','text']);
 assert.equal(flow.snapshot().items.at(-1).text,'FIXTURE answer');
 assert.ok(!calls.some(call=>JSON.stringify(call).includes('AppendMultimodalTurn')));
 flow.dispose();
});
test('an in-flight reply from a switched Session is discarded, and disposal aborts the request',async()=>{
 const c=client();let current='s1',resolve,requestSignal;
 const flow=c.createConversationFlow({currentSessionRef:()=>current,rpc:async(endpoint,args,signal)=>{
  if(endpoint.endsWith('/read'))return view(args.sessionRef);
  requestSignal=signal;return new Promise(ok=>{resolve=ok;});
 }});
 await flow.refreshSession();const sent=flow.submit('hello');
 current='s2';await flow.refreshSession();assert.equal(requestSignal.aborted,true);
 resolve(view('s1'));assert.equal(await sent,false);
 assert.equal(flow.snapshot().sessionRef,'s2');assert.equal(flow.snapshot().model.model,'host-choice');
 const sending=flow.submit('bye');flow.dispose();assert.equal(requestSignal.aborted,true);
 resolve(view('s2'));assert.equal(await sending,false);
});
test('missing selection and failed admission remain visible without claiming a reply',async()=>{
 const c=client();let fail=false;
 const flow=c.createConversationFlow({currentSessionRef:()=> 's1',rpc:async()=>{if(fail)throw Error('MODEL_SELECTION_UNAVAILABLE');return view('s1');}});
 fail=true;await flow.refreshSession();assert.equal(flow.snapshot().ready,false);assert.match(flow.snapshot().error,/MODEL_SELECTION_UNAVAILABLE/);
 fail=false;await flow.refreshSession();fail=true;assert.equal(await flow.submit('hello'),false);
 assert.match(flow.snapshot().error,/MODEL_SELECTION_UNAVAILABLE/);
 flow.dispose();
});
