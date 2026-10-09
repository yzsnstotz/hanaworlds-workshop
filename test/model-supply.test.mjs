import test from 'node:test';
import assert from 'node:assert/strict';
import * as supply from '../web/model-supply.mjs';

test('metadata supplier exists without constructing a model driver', () => {
 assert.equal(typeof supply.createModelMetadataSupply, 'function');
});
test('missing registered route refuses rather than returning null model and empty MIME', async () => {
 const listeners=new Map();
 const ctx={get:key=>key==='llm'?{listProviders:()=>[]}:undefined,on:(name,fn)=>{listeners.set(name,fn);return ()=>listeners.delete(name);}};
 const owner=supply.createModelMetadataSupply(ctx);
 await assert.rejects(owner.read({signal:new AbortController().signal}), {code:'MODEL_ROUTE_NOT_REGISTERED'});
 owner.close();
});
test('real route cannot dispatch through the page without official account capability', () => {
 assert.throws(()=>supply.requireNoCashAccountCapability(), {code:'ACCOUNT_PROVIDER_PUBLIC_CAPABILITY_MISSING'});
});

// FIXTURE metadata inputs exercise refusal/currentness only; never account/model proof.
function fixture(){
 const listeners=new Map();let image=true;
 const llm={listProviders:()=>[{id:'openai-codex',name:'fixture declaration'}],listModels:async()=>[{provider:'openai-codex',id:'gpt-5.6-luna',name:'fixture',inputModalities:['text','image']}],resolveModelInfo:async()=>({provider:'openai-codex',id:'gpt-5.6-luna',name:'fixture',inputModalities:image?['text','image']:['text']})};
 const attachments={imageLimits:{mediaTypes:['image/png']}};
 const values={llm,attachments};
 return {values,listeners,llm,attachments,change:()=>{image=false;},ctx:{get:key=>values[key],on:(name,fn)=>{listeners.set(name,fn);return ()=>listeners.delete(name);}}};
}
test('route snapshot is declared-only; content change invalidates old snapshot',async()=>{
 const f=fixture(),owner=supply.createModelMetadataSupply(f.ctx);
 const a=await owner.read({signal:new AbortController().signal});
 assert.equal(a.modelRef,'openai-codex/gpt-5.6-luna');
 assert.deepEqual(a.imageMediaTypes,['image/png']);
 assert.equal(a.availability.account,'UNKNOWN');
 assert.equal(a.availability.noAdditionalCash,'UNPROVEN');
 f.change();await assert.rejects(owner.assertCurrent(a,{signal:new AbortController().signal}),{code:'MODEL_METADATA_CHANGED'});
 owner.close();await assert.rejects(owner.read({signal:new AbortController().signal}),{code:'METADATA_OWNER_CLOSED'});
});
test('adapter replacement event rejects an in-flight read and notifies consumer',async()=>{
 const f=fixture();let release,entered,invalidations=0;const ready=new Promise(resolve=>{entered=resolve;});
 f.llm.listModels=()=>new Promise(resolve=>{release=resolve;entered();});
 const owner=supply.createModelMetadataSupply(f.ctx,{onInvalidate:()=>{invalidations++;}});
 const pending=owner.read({signal:new AbortController().signal});
 await ready;
 await f.listeners.get('llm/adapters-updated')();
 release([]);
 await assert.rejects(pending,{code:'METADATA_SOURCE_CHANGED'});
 assert.equal(invalidations,1);owner.close();assert.equal(f.listeners.size,0);
});
test('cancellation stops delivery and absent Core provider cannot assert delete=false',async()=>{
 const f=fixture(),owner=supply.createModelMetadataSupply(f.ctx);const control=new AbortController();control.abort();
 await assert.rejects(owner.read({signal:control.signal}),{name:'AbortError'});
 owner.close();
 await assert.rejects(supply.readSessionDeleteMetadata(f.ctx,{signal:new AbortController().signal}),{code:'OFFICIAL_SESSION_PERSISTENCE_REQUIRED'});
});
