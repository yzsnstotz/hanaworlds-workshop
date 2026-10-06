import * as C from 'hanaworlds-contracts';
/** Two self-described write modes of the one building skill. Descriptions only:
 * Workshop never writes the world, never enforces a size threshold, never truncates
 * or rewrites a proposal and never switches mode on the skill's behalf. Every
 * proposal still goes Painter → Brush → Canvas through the existing public seams. */
export const WRITE_MODES = Object.freeze(['cells', 'region']);
const PEERS = Object.freeze([
 ['painter', 'painter/v4', 'Painter (proposal validation)'],
 ['brush', 'BUILD/V3', 'Brush (pure compilation)'],
 ['canvas', 'canvas/v5', 'Canvas (transaction, readback, Undo)'],
]);
/** FIXTURE until the actual Contracts region v1 bytes are delivered
 * (S1-CONTRACT-REGION-V1-01): the capability token name and the `capabilities`
 * handshake field are the narrowest public shape from the cards, not a guess at
 * any peer's private state. The `/vN` suffix is the protocol major. */
export const REGION_CAPABILITY = 'region-voxel-block/v1';
const major = token => { const m = /^(.+)\/v(\d+)$/u.exec(token ?? ''); return m ? { name: m[1], major: Number(m[2]) } : null; };
export function capabilityMatch(advertised, required) {
 const want = major(required), list = Array.isArray(advertised) ? advertised : [];
 if (list.includes(required)) return { ok: true };
 const other = list.map(major).find(c => c && c.name === want.name);
 return other ? { ok: false, code: 'CAPABILITY_MAJOR_MISMATCH', advertised: `${other.name}/v${other.major}` } : { ok: false, code: 'CAPABILITY_MISSING' };
}
const scaleNote = 'Typical scale is guidance for the skill, not a limit: Workshop enforces no size threshold and has no setting for one. The skill chooses the mode from the current goal and volume and may refine that choice across iterations; Workshop never truncates a proposal, changes its target or swaps modes.';
export const writeToolDescriptors = C.deepFreeze(C.snapshotJSON({
 cells: {
  mode: 'cells',
  title: '逐格微调 / per-node fine edits',
  purpose: 'Place exact nodes or a few small inclusive boxes: a building, a door, a window row, a decoration or a small correction next to existing work.',
  whenToUse: 'The change is small and every node matters individually, or the user asks for precise detail.',
  notFor: 'Large terrain fills or excavation. Under hanaworlds-contracts@0.4.2 a cell proposal only writes positions that are currently known empty; replacing or digging existing nodes needs the region mode.',
  input: 'BuildProposal {decision:"BUILD", materials:{alias:{nodeName,param2}}, boxes:[{min:[x,y,z],max:[x,y,z],materialRef}]} in the frame of the captured context. A 1×1×1 box is one node; later boxes win on overlap.',
  typicalScale: { unit: 'node', typical: 'one to a few hundred nodes, usually within one 16×16×16 mapblock', note: scaleNote },
  requires: ['A confirmed building intent in this Session (prepare, then a real user confirmation).', 'This Session bound to the current world connection.', ...PEERS.map(([, wire, label]) => `${label} advertising ${wire} on the installed contracts.`)],
  effects: 'No world write by this tool. Painter validates, Brush compiles, Canvas commits in one transaction with readback; Undo reverts that exact build.',
 },
 region: {
  mode: 'region',
  title: '区域批量 / region fill and dig',
  purpose: 'Fill or dig a large area in one transaction: flatten or raise terrain, fill a basin, carve a valley or clear a slab.',
  whenToUse: 'The change covers a large volume or spans several mapblocks, or it must replace/dig existing terrain.',
  notFor: 'Placing a few individual detail nodes; use the cell mode for fine edits after a region write.',
  input: 'Region voxel block + palette v1: an origin and size in nodes, a palette of catalogue materials plus explicit air for digging, and per-position palette indices. A position that is not specified stays unchanged; it never means air.',
  typicalScale: { unit: 'node', typical: 'thousands to millions of nodes across many 16×16×16 mapblocks', note: scaleNote },
  requires: ['A confirmed building intent in this Session (prepare, then a real user confirmation).', 'This Session bound to the current world connection.', ...PEERS.map(([, wire, label]) => `${label} advertising ${wire} on the installed contracts.`), `Installed contracts and Painter, Brush and Canvas each advertising ${REGION_CAPABILITY} (same protocol major).`],
  effects: 'No world write by this tool. Painter validates, Brush compiles per mapblock, Canvas commits all mapblocks as one logical transaction with a pre-write region snapshot; Undo reverts the whole region.',
 },
}));
export const writeToolSkillGuidance = `Two write modes reach the same Painter → Brush → Canvas path. Use cells for exact small edits (${writeToolDescriptors.cells.typicalScale.typical}); use region for large fill or dig (${writeToolDescriptors.region.typicalScale.typical}), where air digs and unspecified positions stay unchanged. Pick by the current goal and its volume, mix them when useful (region first, then cells to refine), and improve the choice from results. These scales are guidance, not limits. If a mode reports unmet needs, tell the user what is missing and offer the listed remedy; do not silently switch modes or shrink the target.`;
const need = (code, needText, remedy) => ({ code, need: needText, remedy });
/** Region-only requirement: installed contracts and every present peer advertise
 * REGION_CAPABILITY with the same protocol major. FIXTURE field until region v1. */
export function regionCapabilityUnmet(facts) {
 const unmet = [];
 for (const [field, label, handshake] of [['contracts', 'Installed hanaworlds-contracts', facts.ownHandshake], ...PEERS.map(([f, , l]) => [f, l, facts.peers?.[f]?.contractHandshake])]) {
  if (field !== 'contracts' && !facts.peers?.[field]) continue;
  const match = capabilityMatch(handshake?.capabilities, REGION_CAPABILITY);
  if (!match.ok) unmet.push(need(match.code, `${label} advertising ${REGION_CAPABILITY}${match.advertised ? ` (advertises ${match.advertised})` : ''}`, field === 'contracts' ? 'Install a Workshop built on Contracts region v1.' : `Install a ${label.split(' ')[0]} build with region v1.`));
 }
 return unmet;
}
/** Pure availability: the plugin states what it is missing and how to get it. */
export function evaluateWriteMode(mode, facts) {
 if (!WRITE_MODES.includes(mode)) return { mode, available: false, unmet: [need('UNKNOWN_WRITE_MODE', `one of ${WRITE_MODES.join(', ')}`, 'Choose a described write mode.')] };
 const unmet = [];
 for (const [field, wire, label] of PEERS) {
  const port = facts.peers?.[field];
  if (!port) { unmet.push(need('PEER_UNAVAILABLE', `${label} service`, `Install/enable the ${label.split(' ')[0]} plugin in this Host.`)); continue; }
  try { C.checkContractHandshake(port.contractHandshake, { wires: [wire], factProfiles: ['target-facts/v4'] }); }
  catch (error) { if (!(error instanceof C.ContractError)) throw error; unmet.push(need('PEER_INCOMPATIBLE', `${label} advertising ${wire} on ${C.contractHandshake.contracts}`, `Install a ${label.split(' ')[0]} build against the same contracts protocol.`)); }
 }
 if (mode === 'region') unmet.push(...regionCapabilityUnmet(facts));
 if (facts.session) {
  if (!facts.session.found) unmet.push(need('SESSION_NOT_FOUND', 'an existing Workshop Session', 'Start or resume the Session first.'));
  else {
   if (!facts.session.worldBound) unmet.push(need('WORLD_NOT_BOUND', 'this Session bound to the current world connection', 'Select the current world connection for this conversation first.'));
   if (!facts.session.intentConfirmed) unmet.push(need('INTENT_UNCONFIRMED', 'a confirmed building intent for the latest turn', 'Prepare the request and wait for the user to confirm it.'));
  }
 }
 return { mode, available: unmet.length === 0, unmet };
}
