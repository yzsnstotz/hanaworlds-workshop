import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopV3 } from '../src/index.mjs';
test('fixed official provider refuses capture synchronously and never accepts a fabricated guard', () => {
  const ws = new WorkshopV3();
  assert.equal(typeof ws.captureSessionReadGuard, 'function');
  const out = ws.captureSessionReadGuard({ sessionRef: 's1' });
  assert.equal(out?.then, undefined);
  assert.equal(out.guard, null);
  assert.equal(out.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.ok(out.missing.includes('OFFICIAL_PERSISTENCE_SYNCHRONOUS_CURRENTNESS'));
  assert.equal(ws.isSessionReadGuardCurrent({}, {sessionRef:'s1'}), false);
  assert.equal(ws.isSessionReadGuardCurrent(null, {sessionRef:'s1'}), false);
});

import {readFile, readdir, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import Sessions, {SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import plugin from '../src/index.mjs';
import {coreIdentity} from '../src/projection-store.mjs';

async function tree(root, prefix='') {
 const out={};for(const ent of await readdir(join(root,prefix),{withFileTypes:true})) {
  const path=join(prefix,ent.name);
  if(ent.isDirectory())Object.assign(out,await tree(root,path));
  else out[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');
 }return out;
}
async function runtime(fn) {
 const base=process.env.HW_RUNTIME_ROOT??new URL('../../runtime/',import.meta.url).pathname;
 await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'session-guard-'));
 const ctx=new Context();
 try {
  await ctx.plugin(Jsonl,{root:join(root,'core'),compression:'none'}).await();
  await ctx.plugin(Storage).await();await ctx.plugin(StorageJson,{root:join(root,'projection')}).await();
  await ctx.plugin(StorageDomain,{backend:'json'}).await();await ctx.plugin(Sessions).await();
  await ctx.plugin(plugin).await();
  const ws=ctx.get('hanaworldsWorkshop'), persistence=ctx.sessionPersistence;
  const live=ctx.sessions.create('s1');live.append('turn/start',{turn:1});await ctx.sessions.flush(live);
  const other=ctx.sessions.create('s2');other.append('turn/start',{turn:1});await ctx.sessions.flush(other);
  for(const session of [live,other]) {
   const writer=await persistence.create(session.header);
   try {await writer.append(session.snapshotEvents());await writer.flush();}finally {await writer.close();}
  }
  await ws.projectionStore.create('s1',coreIdentity((await persistence.stat('s1')).header,'s1'),{context:{currentSession:'s1',activeWorldRef:null,orderedSelectedObjectRefs:[],sessionRevision:'committed-s1',selectionRevision:'0'},turns:[]});
  let creates=0,worldWrites=0,projectionWrites=0;
  const originalCreate=persistence.create.bind(persistence);
  persistence.create=(...args)=>{creates++;return originalCreate(...args);};
  const originalReplace=ws.projectionStore.replace.bind(ws.projectionStore);
  const originalProjectionCreate=ws.projectionStore.create.bind(ws.projectionStore);
  ws.projectionStore.replace=(...args)=>{projectionWrites++;return originalReplace(...args);};
  ws.projectionStore.create=(...args)=>{projectionWrites++;return originalProjectionCreate(...args);};
  ctx.provide('hanaworldsCanvasV5',{call(){worldWrites++;assert.fail('guard invoked Canvas');}});
  await fn({ctx,ws,live,persistence,root,counts:()=>({creates,worldWrites,projectionWrites})});
 }finally {await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
}
const req={contractVersion:'session/v5',requestId:'read',sessionRef:'s1'};
test('real official Session and committed storage: unsupported capture has zero persistence/projection/world effects',async()=>runtime(async r=>{
 const before=await tree(r.root);
 const old=await r.ws.call('ReadSessionIdentity',req);assert.equal(old.error,null);
 const out=r.ws.captureSessionReadGuard({sessionRef:'s1',sessionRevision:old.result.sessionRevision,worldRef:null});
 assert.equal(out.guard,null);assert.equal(out.error.code,'CAPABILITY_UNAVAILABLE');
 assert.deepEqual(await tree(r.root),before);assert.deepEqual(r.counts(),{creates:0,worldWrites:0,projectionWrites:0});
 // Even an official live Session is insufficient to observe direct stored changes.
 assert.equal(r.ctx.sessions.get('s1'),r.live);
}));
test('last asynchronous identity stage permits official live change: old snapshot semantics stay unchanged, guard refuses',async()=>runtime(async r=>{
 const old=await r.ws.call('ReadSessionIdentity',req);
 const original=r.ws.projectionStore.get.bind(r.ws.projectionStore);
 r.ws.projectionStore.get=async(...args)=>{
  const snapshot=await original(...args);
  r.live.append('turn/start',{turn:2}); // controlled final-async-stage official append
  return snapshot;
 };
 const after=await r.ws.call('ReadSessionIdentity',req);
 assert.deepEqual(after.result,old.result,'Workshop revision is not the live Core event revision');
 assert.equal(r.live.snapshotEvents().at(-1).data.turn,2);
 const out=r.ws.captureSessionReadGuard({sessionRef:'s1'});
 assert.equal(out.error.code,'CAPABILITY_UNAVAILABLE');assert.equal(out.guard,null);
 assert.equal(r.ws.isSessionReadGuardCurrent(old.result,{sessionRef:'s1'}),false);
 assert.deepEqual(r.counts(),{creates:0,worldWrites:0,projectionWrites:0});
 console.log(JSON.stringify({evidence:'OFFICIAL_LIVE_FINAL_ASYNC_STAGE',legacySnapshotUnchanged:true,guardIssued:false,readEffects:r.counts()}));
}));
test('official persistence direct append is outside live Session events; no guard is minted from its file revision',async()=>runtime(async r=>{
 const old=await r.persistence.stat('s1'), liveLength=r.live.snapshotEvents().length;
 const writer=await r.persistence.open('s1','write');
 try {const log=await writer.read();await writer.append([{type:'turn/start',seq:log.events.length,time:Date.now(),data:{turn:2}}]);}
 finally {await writer.close();}
 const next=await r.persistence.stat('s1');assert.notEqual(next.revision,old.revision);
 assert.equal(r.live.snapshotEvents().length,liveLength,'official direct storage does not publish live Session append');
 const before=await tree(r.root),out=r.ws.captureSessionReadGuard({sessionRef:'s1'});
 assert.equal(out.error.code,'CAPABILITY_UNAVAILABLE');assert.equal(out.guard,null);
 assert.deepEqual(await tree(r.root),before);assert.deepEqual(r.counts(),{creates:0,worldWrites:0,projectionWrites:0});
 console.log(JSON.stringify({evidence:'OFFICIAL_DIRECT_STORAGE_INVALIDATION_GAP',liveUnchanged:true,storedRevisionChanged:true,guardIssued:false,readEffects:r.counts()}));
}));
test('cross Session/world, ABA and provider replacements never make foreign or failed guard valid',async()=>runtime(async r=>{
 const out=r.ws.captureSessionReadGuard({sessionRef:'s1',worldRef:'world-a'});
 const bogus={sessionRef:'s1',worldRef:'world-a',valid:true};
 const before=await tree(r.root);
 for(const scope of [{sessionRef:'s2',worldRef:'world-a'},{sessionRef:'s1',worldRef:'world-b'},{sessionRef:'s1',worldRef:'world-a'}])
  assert.equal(r.ws.isSessionReadGuardCurrent(bogus,scope),false);
 // Trusted test composition replaces the persistence provider and restores it (ABA).
 const host=new WorkshopV3({sessions:r.ctx.sessions,sessionPersistence:r.persistence,projectionStore:r.ws.projectionStore});
 const original=host.sessionPersistence;host.sessionPersistence={};
 assert.equal(host.isSessionReadGuardCurrent(out.guard,{sessionRef:'s1'}),false);
 host.sessionPersistence=original;
 assert.equal(host.isSessionReadGuardCurrent(out.guard,{sessionRef:'s1'}),false);
 assert.equal(new WorkshopV3().isSessionReadGuardCurrent(bogus,{sessionRef:'s1'}),false);
 assert.deepEqual(await tree(r.root),before);assert.deepEqual(r.counts(),{creates:0,worldWrites:0,projectionWrites:0});
}));

import * as C from 'hanaworlds-contracts';
test('Workshop consumes the actual published guard fixture and capability remains unavailable',async()=>{
 const fixture=JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/fixtures/session-read-guard'))));
 const ws=new WorkshopV3();
 assert.deepEqual(ws.captureSessionReadGuard({sessionRef:'s1'}),fixture.capture);
 assert.equal(C.sessionReadGuard.protocol,fixture.protocol);
 assert.equal(C.createUnavailableSessionReadGuardFixture(fixture.capture.missing).isSessionReadGuardCurrent({}, {sessionRef:'s1'}),false);
});
