import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as C from 'hanaworlds-contracts';
import {Context} from '@deepseek-ai/cordis';
import * as W from 'hanaworlds-workshop';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as B from 'hanaworlds-brush';
import * as P from 'hanaworlds-building-exterior-painter';
import * as V from 'hanaworlds-canvas';
const input=JSON.parse(await readFile('../_evidence/peer-protocol-043/input-identity.json'));
const expected=['e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209','14a07d30f8cf93d6fa7dc5f2299184a68fa1fa9967480ff044cf14650660fda2','582441e75480c53b22980cddd8d645aa75347ad33985a152f6af00a4740e88c7','694ae85a3b0b5c14acd6dcb86cd953c98f1120c28ff970e8d16b686f29144210','ef07973dcf83a220cb2ecfb13baca0fc2dc26ee56c23b86405ceb15f58ccd680'];
for(const [i,row] of input.entries())assert.equal(createHash('sha256').update(await readFile(row.path)).digest('hex'),expected[i]);
const requirement=(wire,caps=[])=>C.protocolRequirement(wire,caps);
const check=(handshake,requirement)=>{try{return {admitted:true,result:C.checkProtocolCompatibility(handshake,[requirement])};}catch(e){assert.ok(e instanceof C.ContractError);return {admitted:false,code:e.code,message:e.message};}};
const brush=new B.BrushV3();
const ctx=new Context();
const profile=resolve('canvas-profile');await mkdir(profile,{recursive:true});
ctx.provide('dshHomePath',()=>profile);
await ctx.plugin(P.default).await();
await ctx.plugin(V.default).await();
const painter=ctx.get(P.SERVICE),canvas=ctx.get('hanaworldsCanvasV5');
assert.ok(painter&&canvas);
const painterHandshake=painter.protocolHandshake();
const canvasV5Handshake=W.peerProtocolHandshake(canvas)??null;
const canvasHandshake=V.canvasProtocolHandshake;
const brushNeed=requirement('BUILD/V3',['BUILD/V3:per-cell-compile']);
const painterNeed=requirement('painter/v4');
const canvasNeed=requirement('canvas/v5');
const result={evidence:'ACTUAL_PUBLIC_PACKAGE_PROTOCOL_ADMISSION',currentContracts:C.contractHandshake.contracts,input,
 brush:{source:'Actual BrushV3.protocolHandshake()',requirement:brushNeed,advertised:brush.protocolHandshake(),check:check(brush.protocolHandshake(),brushNeed)},
 painter:{source:'Actual Cordis-provided Painter service protocolHandshake()',requirement:painterNeed,advertised:painterHandshake,check:check(painterHandshake,painterNeed),note:'No painter/v4 per-cell capability id is defined in the supplied public Contracts/Painter package; no invented token is required.'},
 canvas:{source:'Actual Cordis-provided CanvasV5 service via Workshop public peerProtocolHandshake()',requirement:canvasNeed,advertised:canvasV5Handshake,check:check(canvasV5Handshake,canvasNeed),status:canvas.status(),regionRootHandshake:canvasHandshake,regionRootAsPerCell:check(canvasHandshake,canvasNeed),publicCanvasV5Methods:Object.getOwnPropertyNames(V.CanvasV5.prototype),publicCanvasRegionV1Methods:Object.getOwnPropertyNames(V.CanvasRegionV1.prototype)},
 region:{canvas:check(canvasHandshake,requirement('canvas-region/v1',V.CANVAS_REGION_CAPABILITIES))},
 scope:{canvasInstanceConstructed:true,privatePeerImplementationRead:false,peerSourceChanged:false,worldOrModelOrUIRun:false,proposalAdvanceUndoRun:false,workshopChanged:false}};
assert.equal(result.brush.check.admitted,true);
assert.equal(result.painter.check.admitted,true);
assert.equal(result.canvas.check.admitted,false);
assert.equal(result.canvas.check.code,'UNSUPPORTED_VERSION');
assert.equal(result.region.canvas.admitted,true);
console.log(JSON.stringify(result,null,2));
await ctx.fiber.dispose();
