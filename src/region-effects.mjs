// What a validated region-voxels/v1 block will write, decoded in world coordinates per y layer.
// Facts only: no refusal, threshold or comparison verdict. K3 run 01a123a6 (E12/E14): a VERIFIED region
// write matched its block, but the block put a second layer at y9 and left part of y8 unspecified; nothing
// in the tool results showed that before advance, and the model reported its intention instead.
// Index order is the contract's X_FASTEST_THEN_Y_THEN_Z: index = (x-ox) + sx*((y-oy) + sy*(z-oz)).

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
    const spec = block.palette[paletteIndex], key = `${spec.nodeName}\u0000${spec.param2}`;
    if (!entry.nodes.has(key)) entry.nodes.set(key, {nodeName: spec.nodeName, param2: spec.param2, count: 0});
    target = entry.nodes.get(key);written += n;
   }
   target.count += n;target.x = widen(target.x, ox + x0, ox + x0 + n - 1);target.z = widen(target.z, z, z);
   index += n;left -= n;
  }
 }
 const sorted = [...layers.entries()].sort((a, b) => a[0] - b[0]).map(([y, entry]) => ({y,
  nodes: [...entry.nodes.values()].sort((a, b) => a.nodeName < b.nodeName ? -1 : a.nodeName > b.nodeName ? 1 : a.param2 - b.param2),
  unspecified: entry.unspecified}));
 return {profileVersion: 'workshop-region-effects/v1', origin: [ox, oy, oz], size: {x: sx, y: sy, z: sz},
  bounds: {min: [ox, oy, oz], max: [ox + sx - 1, oy + sy - 1, oz + sz - 1]},
  totals: {cells: sx * sy * sz, written, unspecified: sx * sy * sz - written},
  writtenLayers: sorted.filter(l => l.nodes.length).map(l => l.y),
  confirmedDimensions: confirmedIntent?.dimensions ?? null,
  layers: sorted};
}
