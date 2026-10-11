import test from 'node:test';
import assert from 'node:assert/strict';
const {regionEffectSummary}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');

// Exact validated block from I-K3-REGION-01 run 01a123a6 E12 (public Core tool result, seq 54): the request was
// 40×4×1 on the y=8 surface; the block puts stone on y8 and y9 for z2..3 and leaves y8 z4..5 unspecified.
const k3={profileVersion:'region-voxels/v2',origin:[-19,8,2],size:[40,2,4],indexOrder:'X_FASTEST_THEN_Y_THEN_Z',
 palette:[{materialRef:'air',orientation:0},{materialRef:'mcl_core:stone',orientation:0}],
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
   {materialRef:'air',orientation:0,count:80,x:[1,20],z:[2,5]},
   {materialRef:'mcl_core:stone',orientation:0,count:40,x:[-19,0],z:[2,3]}]);
  assert.deepEqual(layer(y).unspecified,{count:40,x:[-19,0],z:[4,5]});
 }
});

test('region effect summary: every cell counted once; an all-unspecified layer is listed but not written',()=>{
 const block={profileVersion:'region-voxels/v2',origin:[0,0,0],size:[3,2,2],indexOrder:'X_FASTEST_THEN_Y_THEN_Z',palette:[{materialRef:'air',orientation:0}],runs:[[1,0],[5,null],[1,0],[5,null]]};
 const s=regionEffectSummary(block,null);
 assert.deepEqual(s.totals,{cells:12,written:2,unspecified:10});assert.deepEqual(s.writtenLayers,[0]);
 assert.deepEqual(s.layers.map(l=>[l.y,l.nodes.reduce((a,n)=>a+n.count,0)+l.unspecified.count]),[[0,6],[1,6]]);
 assert.equal(s.confirmedDimensions,null);
});

const {cellEffectSummary}=await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY??'../src/index.mjs');
// Exact model proposal from I-K2-IMAGE-01 run 01a123a8 E19 seq51 and the public seq47 facts: sampled
// [-4,8,2]..[2,13,7], y8 all occupied grass, y9..13 known-empty; confirmed 7×6×5 with a gable roof.
const sampledBounds={min:[-4,8,2],max:[2,13,7]};
const occupiedCells=[],knownEmptyCells=[];
for(let x=-4;x<=2;x++)for(let z=2;z<=7;z++){occupiedCells.push({position:[x,8,z],materialRef:'mcl_core:dirt_with_grass',orientation:0});for(let y=9;y<=13;y++)knownEmptyCells.push([x,y,z]);}
const k2={targetFacts:{sampledBounds,occupiedCells,knownEmptyCells},intent:{confirmedIntent:{dimensions:{width:7,depth:6,height:5,unit:'node'}}},
 proposal:{decision:'BUILD',materials:{wall:{materialRef:'mcl_core:stonebrick',orientation:0},roof:{materialRef:'mcl_core:brick_block',orientation:0},glass:{materialRef:'mcl_core:glass',orientation:0}},
  boxes:[{min:[0,1,0],max:[6,1,5],materialRef:'wall'},{min:[0,2,0],max:[0,3,5],materialRef:'wall'},{min:[6,2,0],max:[6,3,5],materialRef:'wall'},{min:[1,2,0],max:[1,3,0],materialRef:'wall'},{min:[5,2,0],max:[5,3,0],materialRef:'wall'},{min:[2,2,0],max:[2,2,0],materialRef:'glass'},{min:[4,2,0],max:[4,2,0],materialRef:'glass'},{min:[1,2,5],max:[5,3,5],materialRef:'wall'},{min:[0,4,0],max:[6,4,0],materialRef:'roof'},{min:[0,4,1],max:[6,4,1],materialRef:'roof'},{min:[0,4,2],max:[6,4,2],materialRef:'roof'},{min:[0,4,3],max:[6,4,3],materialRef:'roof'},{min:[0,4,4],max:[6,4,4],materialRef:'roof'},{min:[0,4,5],max:[6,4,5],materialRef:'roof'}]}};

test('cell effect summary decodes the exact IMAGE proposal: 4 layers tall, one flat roof layer, against confirmed 7×6×5',()=>{
 const s=cellEffectSummary(k2);
 assert.deepEqual(s.bounds,{min:[-4,9,2],max:[2,12,7]});assert.deepEqual(s.size,{x:7,y:4,z:6});
 assert.deepEqual(s.writtenLayers,[9,10,11,12]);assert.deepEqual(s.confirmedDimensions,{width:7,depth:6,height:5,unit:'node'});
 assert.deepEqual(s.totals,{written:124,writesOccupied:0,writesUnknown:0,boxesOutsideSampledBounds:0});
 const layer=y=>s.layers.find(l=>l.y===y).nodes;
 assert.deepEqual(layer(12),[{materialRef:'mcl_core:brick_block',orientation:0,count:42,x:[-4,2],z:[2,7]}]);
 assert.deepEqual(layer(10).find(n=>n.materialRef==='mcl_core:glass'),{materialRef:'mcl_core:glass',orientation:0,count:2,x:[-2,0],z:[2,2]});
 assert.equal(s.layers.some(l=>l.y===13),false,'nothing at the confirmed top layer y13');
});

test('cell effect summary reports writes on occupied/unknown cells and boxes outside the sample as facts, not refusals',()=>{
 const bad=structuredClone(k2);bad.proposal.boxes=[{min:[0,0,0],max:[0,1,0],materialRef:'wall'},{min:[0,0,0],max:[9,0,0],materialRef:'wall'}];
 bad.targetFacts.knownEmptyCells=bad.targetFacts.knownEmptyCells.filter(c=>!(c[0]===-4&&c[1]===9&&c[2]===2));
 const s=cellEffectSummary(bad);
 assert.equal(s.totals.writesOccupied,7);assert.equal(s.totals.writesUnknown,1);assert.equal(s.totals.boxesOutsideSampledBounds,1);
});
