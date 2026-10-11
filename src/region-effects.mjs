// What a validated region-voxels/v2 block will write, decoded in world coordinates per y layer.
// Facts only: no refusal, threshold or comparison verdict. K3 run 01a123a6 (E12/E14): a VERIFIED region
// write matched its block, but the block put a second layer at y9 and left part of y8 unspecified; nothing
// in the tool results showed that before advance, and the model reported its intention instead.
// Index order is the contract's X_FASTEST_THEN_Y_THEN_Z: index = (x-ox) + sx*((y-oy) + sy*(z-oz)).

// Materials stay the world source's opaque materialRef + neutral orientation index.
const byMaterial = (a, b) => a.materialRef < b.materialRef ? -1 : a.materialRef > b.materialRef ? 1 : a.orientation - b.orientation;
const widen = (range, lo, hi) => range ? [Math.min(range[0], lo), Math.max(range[1], hi)] : [lo, hi];

export function regionEffectSummary(block, confirmedIntent = null) {
 const [ox, oy, oz] = block.origin, [sx, sy, sz] = block.size;
 const layers = new Map();
 const layer = y => {
  if (!layers.has(y)) layers.set(y, {nodes: new Map(), unspecified: {count: 0}});
  return layers.get(y);
 };
 for (let y = oy; y < oy + sy; y++) layer(y);
 let index = 0, written = 0;
 for (const [count, paletteIndex] of block.runs) {
  let left = count;
  while (left > 0) {
   // One run segment inside a single x row.
   const x0 = index % sx, row = Math.floor(index / sx), n = Math.min(left, sx - x0);
   const y = oy + row % sy, z = oz + Math.floor(row / sy), entry = layer(y);
   let target = entry.unspecified;
   if (paletteIndex !== null) {
    const spec = block.palette[paletteIndex], key = `${spec.materialRef}\u0000${spec.orientation}`;
    if (!entry.nodes.has(key)) entry.nodes.set(key, {materialRef: spec.materialRef, orientation: spec.orientation, count: 0});
    target = entry.nodes.get(key);written += n;
   }
   target.count += n;target.x = widen(target.x, ox + x0, ox + x0 + n - 1);target.z = widen(target.z, z, z);
   index += n;left -= n;
  }
 }
 const sorted = [...layers.entries()].sort((a, b) => a[0] - b[0]).map(([y, entry]) => ({y,
  nodes: [...entry.nodes.values()].sort(byMaterial),
  unspecified: entry.unspecified}));
 return {profileVersion: 'workshop-region-effects/v2', origin: [ox, oy, oz], size: {x: sx, y: sy, z: sz},
  bounds: {min: [ox, oy, oz], max: [ox + sx - 1, oy + sy - 1, oz + sz - 1]},
  totals: {cells: sx * sy * sz, written, unspecified: sx * sy * sz - written},
  writtenLayers: sorted.filter(l => l.nodes.length).map(l => l.y),
  confirmedDimensions: confirmedIntent?.dimensions ?? null,
  layers: sorted};
}

// The same facts for a PER_CELL proposal, before or regardless of Painter's verdict. I-K2-IMAGE-01 run
// 01a123a8 (E19 seq51/52): a confirmed 7×6×5 gable house came back as a 4-layer flat roof and Painter
// refused with INVALID_GEOMETRY and no cause; nothing told the model what its boxes actually covered.
// Translation and overlap follow contracts build-proposal: world = sampledBounds.min + local, last box wins.
// Only cells of the finite sampled inspection are enumerated; boxes reaching outside it are counted.
export function cellEffectSummary(request) {
 const {proposal, targetFacts: facts} = request, {min, max} = facts.sampledBounds;
 const boxes = proposal.boxes.map(box => ({min: box.min.map((v, i) => v + min[i]), max: box.max.map((v, i) => v + min[i]), spec: proposal.materials[box.materialRef]}));
 const key = p => p.join(','), occupied = new Set(facts.occupiedCells.map(c => key(c.position))), empty = new Set(facts.knownEmptyCells.map(key));
 const layers = new Map();let written = 0, writesOccupied = 0, writesUnknown = 0, lo = null, hi = null;
 for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) for (let x = min[0]; x <= max[0]; x++) {
  const box = boxes.findLast(b => x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2]);
  if (!box) continue;
  const p = [x, y, z];written++;if (occupied.has(key(p))) writesOccupied++;else if (!empty.has(key(p))) writesUnknown++;
  lo = lo ? lo.map((v, i) => Math.min(v, p[i])) : p;hi = hi ? hi.map((v, i) => Math.max(v, p[i])) : p;
  if (!layers.has(y)) layers.set(y, new Map());
  const nodes = layers.get(y), k = `${box.spec?.materialRef}\u0000${box.spec?.orientation}`;
  if (!nodes.has(k)) nodes.set(k, {materialRef: box.spec?.materialRef ?? null, orientation: box.spec?.orientation ?? null, count: 0});
  const n = nodes.get(k);n.count++;n.x = widen(n.x, x, x);n.z = widen(n.z, z, z);
 }
 const outside = boxes.filter(b => b.min.some((v, i) => v < min[i]) || b.max.some((v, i) => v > max[i])).length;
 const sorted = [...layers.entries()].sort((a, b) => a[0] - b[0]).map(([y, nodes]) => ({y,
  nodes: [...nodes.values()].sort(byMaterial)}));
 return {profileVersion: 'workshop-cell-effects/v2', frameOrigin: [...min],
  bounds: lo ? {min: lo, max: hi} : null, size: lo ? {x: hi[0] - lo[0] + 1, y: hi[1] - lo[1] + 1, z: hi[2] - lo[2] + 1} : null,
  totals: {written, writesOccupied, writesUnknown, boxesOutsideSampledBounds: outside},
  writtenLayers: sorted.map(l => l.y), confirmedDimensions: request.intent?.confirmedIntent?.dimensions ?? null, layers: sorted};
}
