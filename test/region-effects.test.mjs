import test from 'node:test';
import assert from 'node:assert/strict';
const {regionEffectSummary}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');

// Exact validated block from I-K3-REGION-01 run 01a123a6 E12 (public Core tool result, seq 54): the request was
// 40×4×1 on the y=8 surface; the block puts stone on y8 and y9 for z2..3 and leaves y8 z4..5 unspecified.
const k3={profileVersion:'region-voxels/v1',origin:[-19,8,2],size:[40,2,4],indexOrder:'X_FASTEST_THEN_Y_THEN_Z',
 palette:[{nodeName:'air',param2:0},{nodeName:'mcl_core:stone',param2:0}],
 runs:[[20,1],[20,0],[20,1],[20,0],[20,1],[20,0],[20,1],[20,0],[20,null],[20,0],[20,null],[20,0],[20,null],[20,0],[20,null],[20,0]]};
const confirmed={dimensions:{width:40,depth:4,height:1,unit:'node'}};

test('region effect summary decodes the exact K3 block per y layer in world coordinates',()=>{
 const s=regionEffectSummary(k3,confirmed);
 assert.deepEqual(s.bounds,{min:[-19,8,2],max:[20,9,5]});assert.deepEqual(s.size,{x:40,y:2,z:4});
 assert.deepEqual(s.totals,{cells:320,written:240,unspecified:80});
 assert.deepEqual(s.writtenLayers,[8,9]);assert.deepEqual(s.confirmedDimensions,confirmed.dimensions);
 const layer=y=>s.layers.find(l=>l.y===y);
 for(const y of [8,9]){
  assert.deepEqual(layer(y).nodes,[
   {nodeName:'air',param2:0,count:80,x:[1,20],z:[2,5]},
   {nodeName:'mcl_core:stone',param2:0,count:40,x:[-19,0],z:[2,3]}]);
  assert.deepEqual(layer(y).unspecified,{count:40,x:[-19,0],z:[4,5]});
 }
});

test('region effect summary: every cell counted once; an all-unspecified layer is listed but not written',()=>{
 const block={profileVersion:'region-voxels/v1',origin:[0,0,0],size:[3,2,2],indexOrder:'X_FASTEST_THEN_Y_THEN_Z',palette:[{nodeName:'air',param2:0}],runs:[[1,0],[5,null],[1,0],[5,null]]};
 const s=regionEffectSummary(block,null);
 assert.deepEqual(s.totals,{cells:12,written:2,unspecified:10});assert.deepEqual(s.writtenLayers,[0]);
 assert.deepEqual(s.layers.map(l=>[l.y,l.nodes.reduce((a,n)=>a+n.count,0)+l.unspecified.count]),[[0,6],[1,6]]);
 assert.equal(s.confirmedDimensions,null);
});
