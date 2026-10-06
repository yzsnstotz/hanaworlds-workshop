import * as C from 'hanaworlds-contracts';
/** Two self-described write methods of the one building skill, as contracts
 * WriteMethodDescriptor. Descriptions only: Workshop never writes the world,
 * enforces no size threshold, never truncates or rewrites a proposal and never
 * switches method for the skill. Every proposal still goes Painter → Brush →
 * Canvas through public seams. Compatibility is protocol major + capability
 * (checkProtocolCompatibility); package version/hash is provenance only. */
export const WRITE_METHODS = Object.freeze(['PER_CELL', 'REGION']);
const capsOf = wire => C.regionCapabilities.map(c => c.id).filter(id => id.startsWith(`${wire}:`)).sort();
/** Host-injected ports Workshop checks per method; `field` is the Workshop port. */
/** Brush per-cell requirement, shared by the descriptor, availability and Advance. */
export const PER_CELL_BRUSH = Object.freeze({ wire: 'BUILD/V3', capabilities: Object.freeze(['BUILD/V3:per-cell-compile']) });
export const WRITE_METHOD_PORTS = C.deepFreeze({
 PER_CELL: [{ field: 'brush', service: 'hanaworldsBrushV3', label: 'Brush', wire: PER_CELL_BRUSH.wire, capabilities: [...PER_CELL_BRUSH.capabilities] }],
 REGION: [
  { field: 'painterRegion', service: 'hanaworldsPainterRegionV1', label: 'Painter', wire: 'painter-region/v1', capabilities: capsOf('painter-region/v1') },
  { field: 'brushRegion', service: 'hanaworldsBrushRegionV1', label: 'Brush', wire: 'region-build/v1', capabilities: capsOf('region-build/v1') },
  { field: 'canvasRegion', service: 'hanaworldsCanvasRegionV1', label: 'Canvas', wire: 'canvas-region/v1', capabilities: capsOf('canvas-region/v1') },
 ],
});
// Painter/Canvas per-cell peers keep the exact ContractHandshake (unchanged in this repair).
// Brush is checked by its public ProtocolHandshake: BUILD major 3 + BUILD/V3:per-cell-compile
// (contracts 0.5.2: K3 cross-patch/hash interop only via protocol major + capabilities).
const LEGACY_EXACT = [['painter', 'painter/v4', 'Painter'], ['canvas', 'canvas/v5', 'Canvas']];
const scaleNote = 'Typical scale is guidance for the skill, not a limit: Workshop has no size threshold or setting, never truncates a proposal, changes its target or switches method.';
const BASE = C.deepFreeze({
 PER_CELL: {
  toolName: 'hanaworlds_proposal', inputType: 'BuildProposal',
  purpose: 'Fine edits of individual cells: a building, a door, a window row or a small correction, through the existing per-cell BUILD path.',
  typicalScale: `A single cell up to a few hundred cells, usually inside one 16×16×16 mapblock. ${scaleNote}`,
  whenToUse: 'The change is small and each cell matters, or the user asks for precise detail; also to refine after a region write.',
  notFor: 'Large terrain fills or digging; a per-cell proposal only writes currently known-empty cells, so replacing or digging existing nodes needs REGION.',
  input: 'BuildProposal {decision:"BUILD", materials:{alias:{nodeName,param2}}, boxes:[{min:[x,y,z],max:[x,y,z],materialRef}]} in the captured frame; a 1×1×1 box is one cell.',
 },
 REGION: {
  toolName: 'hanaworlds_region_proposal', inputType: 'RegionProposal',
  purpose: 'Large fill or dig in one Canvas transaction: flatten or raise terrain, fill a basin, carve a valley or clear a slab.',
  typicalScale: `Hundreds to millions of cells across many 16×16×16 mapblocks, written per mapblock as one logical transaction with whole-region Undo. ${scaleNote}`,
  whenToUse: 'The change covers a large volume, spans mapblocks, or must replace/dig existing terrain.',
  notFor: 'A few detail cells; use PER_CELL to refine afterwards.',
  input: 'RegionProposal {decision:"REGION", block: region-voxels/v1 {origin (world node min corner), size, indexOrder X_FASTEST_THEN_Y_THEN_Z, palette of catalogue NodeSpecs, runs [count, paletteIndex|null]}}. Explicit {nodeName:"air",param2:0} digs; null means unspecified and is never air.',
 },
});
export const writeToolSkillGuidance = `Two write methods reach the same Painter → Brush → Canvas path. PER_CELL (${BASE.PER_CELL.toolName}) is for exact small edits; REGION (${BASE.REGION.toolName}) is for large fill or dig, where explicit air digs and unspecified cells stay unchanged. Choose by the current goal and its volume, combine them when useful (REGION first, then PER_CELL to refine) and improve the choice from results. The typical scales are guidance, not limits. If a method reports unmet needs, tell the user what is missing and offer the listed remedy; do not silently switch methods or shrink the target.`;
/** A peer's advertised handshakes, read from its public shape: a plain value
 * property, or the public methods `handshake()` / `protocolHandshake()` /
 * `status().contractHandshake|protocolHandshake` (e.g. BrushV3). The returned
 * value is what the compatibility checks see; a function is never a handshake. */
const value = v => (v !== null && typeof v === 'object' ? v : undefined);
const statusOf = port => (typeof port?.status === 'function' ? value(port.status()) : undefined);
export function peerContractHandshake(port) {
 if (!port) return undefined;
 return value(port.contractHandshake) ?? (typeof port.handshake === 'function' ? value(port.handshake()) : undefined) ?? value(statusOf(port)?.contractHandshake);
}
export function peerProtocolHandshake(port) {
 if (!port) return undefined;
 if (typeof port.protocolHandshake === 'function') return value(port.protocolHandshake());
 return value(port.protocolHandshake) ?? value(statusOf(port)?.protocolHandshake);
}
const need = (code, needText, remedy) => ({ code, need: needText, remedy });
function protocolUnmet(port, spec) {
 if (!port) return [need('PEER_UNAVAILABLE', `${spec.label} service ${spec.service} (${spec.wire})`, `Install/enable a ${spec.label} plugin providing ${spec.wire} in this Host.`)];
 try { C.checkProtocolCompatibility(peerProtocolHandshake(port) ?? null, [C.protocolRequirement(spec.wire, spec.capabilities)]); return []; }
 catch (error) {
  if (!(error instanceof C.ContractError)) throw error;
  return [need(error.code, `${spec.label} ProtocolHandshake with ${spec.wire} (same major) and ${spec.capabilities.join(', ')}`, `Install a ${spec.label} build advertising that protocol major and capabilities.`)];
 }
}
/** Pure availability from ports and optional Session facts: states what is missing and how to get it. */
export function evaluateWriteMethod(method, facts) {
 if (!WRITE_METHODS.includes(method)) return { method, available: false, unmet: [need('UNKNOWN_WRITE_METHOD', `one of ${WRITE_METHODS.join(', ')}`, 'Choose a described write method.')] };
 const ports = facts.ports ?? {}, unmet = [];
 if (method === 'PER_CELL') for (const [field, wire, label] of LEGACY_EXACT) {
  const port = ports[field];
  if (!port) { unmet.push(need('PEER_UNAVAILABLE', `${label} service (${wire})`, `Install/enable the ${label} plugin in this Host.`)); continue; }
  try { C.checkContractHandshake(peerContractHandshake(port), { wires: [wire], factProfiles: ['target-facts/v4'] }); }
  catch (error) { if (!(error instanceof C.ContractError)) throw error; unmet.push(need('UNSUPPORTED_VERSION', `${label} advertising ${wire} on ${C.contractHandshake.contracts}`, `Install a ${label} build on the same contracts package.`)); }
 }
 for (const spec of WRITE_METHOD_PORTS[method]) unmet.push(...protocolUnmet(ports[spec.field], spec));
 if (facts.session) {
  if (!facts.session.found) unmet.push(need('SESSION_NOT_FOUND', 'an existing Workshop Session', 'Start or resume the Session first.'));
  else {
   if (!facts.session.worldBound) unmet.push(need('WORLD_NOT_BOUND', 'this Session bound to the current world connection', 'Select the current world connection for this conversation first.'));
   if (!facts.session.intentConfirmed) unmet.push(need('INTENT_UNCONFIRMED', 'a confirmed building intent for the latest turn', 'Prepare the request and wait for the user to confirm it.'));
  }
 }
 return { method, available: unmet.length === 0, unmet };
}
/** Contract WriteMethodDescriptor plus Workshop guidance and the unmet list. */
export function describeWriteMethod(method, facts) {
 const availability = evaluateWriteMethod(method, facts), base = BASE[method];
 const required = WRITE_METHOD_PORTS[method].flatMap(s => s.capabilities).sort();
 const descriptor = C.validateType('WriteMethodDescriptor', { method, toolName: base.toolName, purpose: base.purpose, inputType: base.inputType,
  typicalScale: base.typicalScale, scaleUnit: 'cells', requiredCapabilities: required,
  unavailableReason: availability.available ? null : availability.unmet.map(u => `${u.code}: needs ${u.need}`).join('; ') });
 return { descriptor, guidance: { whenToUse: base.whenToUse, notFor: base.notFor, input: base.input }, availability };
}
