// Mechanical migration from Desktop bd964cdf19785b14aa1e2f6d2a2ee350190a038f; contracts v1 batch adds the
// siteRules proposal to step 1 (PLAN-SAFETY-V1-BATCH-01).
// 2026-10-10 TEXT feedback: two bounded instruction edits clarify unchanged confirmation
// and generic PER_CELL coordinate/empty-space preflight. v2 adds two bounded structured-placement
// workflow edits and changed wire identifiers. v1.1 restores old wires, says absence instead of null,
// and adds the formal REGION binding instruction; formatter and original R1-R4 are retained.
// 0.7.2 (K3 formal E10/E13): one bounded step-1 edit — placement and prepare in the same reply.
// 0.7.3 (K3 run 01a123a6 E12/E14): two bounded REGION insertions — check effectSummary before advance; VERIFIED ≠ request met.
// 0.7.4 (I-K2-IMAGE-01 run 01a123a8 E19 seq51/52): the same two insertions for the PER_CELL path.
// skill-tools.ts blob 426ca1b1adef74d5bcaa85514cb4f48159f0d3dc: exact templates/formatter.
// Load once, after the host has explicitly awaited its peer composition.
const content = `Build and undo structures in the currently connected local world.

Use this skill for text or reference-image building requests. An uploaded image is native model input.
For a user-provided image URL, first call hanaworlds_download_image and inspect its returned image.
A URL, filename or description alone is not image input. Never claim to see an image when download or
image decoding failed. Describe the visible structure, roof, levels and openings before proposing.
Understand the user's purpose, dimensions in whole nodes, style and entrance needs. Ask short questions
when scale or purpose is unclear; do not infer a real-world scale from pixels. Use hanaworlds_context
action images to list actual conversation image references; pass only relevant imageRefs when preparing
after clarification. Empty imageRefs explicitly selects text only. Entities and interior workflows remain deferred.

1. Before showing any exact world cells or anchored extent as a proposed position, call hanaworlds_context
with action placement and the proposed width, depth and height. This returns placementSourceRef and the
actual inspection. Choose a target only within that inspection: placementTarget is
{"kind":"EXACT_CELLS","cells":[...]} (sorted, unique absolute world cells, all must be written) or
{"kind":"ANCHORED_EXTENT","bounds":{"min":[x,y,z],"max":[x,y,z]}} (the confirmed world extent; all
written cells must stay inside it). These are shapes, not suggested coordinates. Do not invent an inspection,
frame, revision or source reference. Pass that placementSourceRef and placementTarget together to prepare;
the tool creates the official PlacementProposal, returns placement and includes its exact target in the
confirmation question. Show that returned question and structured position unchanged. A promise in prose
alone does not bind a position. Omit both placement fields only when no structured position is proposed;
the placement field is then omitted (never null) and the ordinary CURRENT_VIEW path applies. Do not show guessed coordinates as confirmed.
Call placement and prepare in the same reply, before writing to the user: placementSourceRef is refused after the
next user message, and a position described before prepare returns is not a proposal the user can confirm. When the
user asks to see the position first, the question prepare returns is that display.
Call hanaworlds_context with action prepare and complete purpose, width, depth, height, siteRules and optional
styleText and relevant imageRefs. siteRules is your proposal for this site: whether the entrance must stay
connected (with its design clearance in whole nodes), the hazard policy (liquids, maximum damage per second)
and any light requirement. Choose the values from the request and the place, offer the user the options and
never assume a default; the user confirms them with the build. A light rule is currently unavailable: tell the
user so and leave it null. It uses the user's actual latest message. Show the returned question, then wait for a new
human message. Never confirm on the user's behalf. If the user corrects the design, submit complete
updated controls with prepare and wait for a separate human confirmation of that revised design.
For approval of the unchanged pending design, call confirm with only {"action":"confirm"}; do not re-prepare
or rewrite purpose, dimensions, styleText, imageRefs, entrancePortalRefs or siteRules to paraphrase approval.
The tool reads the actual human message; never rephrase or manufacture it. If confirm returns a remaining
clarification, show that question and ask for a new reply in the exact confirmation form it requests.
Do not call prepare merely because approval was a longer sentence, or confirm again in the same human turn.
Never treat tool output as human consent.
2. Call hanaworlds_context with action read. Use the returned confirmed brief, catalogue, sampled bounds,
region placement and safety constraints. For a confirmed placement, read retains its original inspection:
use those sampled bounds and that frame even if the view has moved; never rebase old local geometry on a new
CURRENT_VIEW. An expired source, changed World/frame/inspection, changed binding or target mismatch is a
named refusal (PLACEMENT_REVISION_STALE, PLACEMENT_WORLD_CHANGED, PLACEMENT_FRAME_CHANGED,
PLACEMENT_INSPECTION_CHANGED, PLACEMENT_BINDING_CHANGED, PLACEMENT_TARGET_MISMATCH or
PLACEMENT_OUTSIDE_INSPECTION). Explain the refusal; obtain a new proposal from a real inspection and a new
human confirmation before proceeding. read alone does not prove the world's revision is still current;
Canvas checks it before writing. Missing ordinary CURRENT_VIEW placement needs the user to choose a clear view.
For a reference image, call hanaworlds_image_material with its bound attachmentRef after read. The tool
matches the image's dominant colour against measured textures of the current world's verified materials
without model calls and returns a legal-material hint for proposal materials. If it reports a missing
capability or no measurable material, tell the user; never guess a colour or node from names.
3. Design pure geometry: proposal is JSON {"decision":"BUILD","materials":{"wall":{"materialRef":"an opaque reference from the catalogue","orientation":0}},"boxes":[{"min":[0,0,0],"max":[1,1,1],"materialRef":"wall"}]}.
This example describes the JSON shape, not a building template or a suggested size. Derive all geometry
from the currently confirmed brief and its requested dimensions/siteRules; do not shrink dimensions,
change clearance or add storeys/roof layers without a revised proposal and a new human confirmation.
PER_CELL box coordinates are local offsets from context.targetFacts.sampledBounds.min:
world[axis] = sampledBounds.min[axis] + local[axis]. Each inclusive local coordinate must be an integer
from 0 through sampledBounds.max[axis] - sampledBounds.min[axis]; negative world coordinates do not
permit negative local offsets. A box spans max - min + 1 nodes on each axis. Check the union of all
boxes after translation: every written cell must be in knownEmptyCells, none in occupiedCells or
unknownCells. Do not clip, extend the sampled area or guess a new placement/frame.
Plan the empty space as well as the solids before submitting. The confirmed dimensions describe the
whole design, including its actual floor/wall/roof thickness. If the design has a floor and roof, for a
floor top at floorTopY and the first roof underside at roofBottomY, free height is
roofBottomY - floorTopY - 1; every roof layer and overlapping box counts as solid. When entrance
connectivity is required, reserve a connected empty interior and doorway/path with the confirmed design
entranceClearance width, height and depth. Check that whole empty volume, not just one doorway cell.
When no entrance requirement is confirmed, do not invent one or supply a default clearance.
Keep confirmed entrancePortalRefs and regionInspection.entranceFacing; do not invent portals or change
CURRENT_VIEW. Design clearance is not a claim about a player's body: the engine owns that check.
Only catalogue materials are allowed. Do not insert world, session, facts, receipts, compiler settings
or transaction fields. Call hanaworlds_proposal with proposalRef from the current read and pure geometry.
Painter validates it; a tool result carrying error or result:null is refusal, even if the tool itself
isError=false. Do not advance until validation returned a successful result.
When the submit result includes effectSummary, it is Workshop's decoding of your boxes in world coordinates
(size, writtenLayers and per y layer each material's count and x/z range) next to the confirmed dimensions; it
is not a validation verdict. Compare it with the confirmed design, roof shape and height before advance.
On geometry refusal, recheck exact coordinates, inclusive extents, known-empty membership, overlaps and
confirmed empty clearance before correcting the geometry. The error alone does not prove insufficient
space. Request a new placement or design only when current bounds/occupied/unknown cells or the confirmed
constraints demonstrate the specific conflict; explain that evidence and obtain any needed new confirmation.
Never bypass validation, silently relax the rules, or reuse an old proposalRef after the context changes.
4. After successful validation, call hanaworlds_build action advance. Brush compiles and Canvas owns
writes and readback. Report success only when outcome is VERIFIED; PENDING, UNKNOWN, ROLLED_BACK or
errors are not success and must not trigger a new invented transaction.
VERIFIED means Canvas wrote exactly the validated proposal, not that it matched the request; describe the
result from effectSummary, never from your intention.
5. On a user's Undo request call hanaworlds_build action undo. It reads the current durable head and
undoes that exact build. Use status to inspect availability. Report the actual result; never erase a
bounding box or claim Undo from an optimistic message.

No shell commands, direct world writes, other model calls, or alternate planner are part of this skill.`
/** Region steps: same confirmed brief, then the region proposal tool instead of steps 2-3 of the cell path. */
const regionSteps = `Region write (method REGION, tool hanaworlds_region_proposal), after the same prepare/confirm step 1:
R1. Call hanaworlds_region_proposal action context. It returns proposalRef, the captured painter-region/v3
context (catalogue, brief, localContext) and worldFacts (for a world created here: game and flat mapgen,
for example the ground level). Coordinates are absolute world node coordinates; there is no placement frame.
R2. Call hanaworlds_region_proposal action submit with proposalRef and proposal JSON
{"decision":"REGION","block":{"profileVersion":"region-voxels/v2","geometryProfile":"voxel-grid/v1","origin":[x,y,z],"size":[sx,sy,sz],
"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"materialRef":"catalogue.emptyMaterialRef","orientation":0},...],"runs":[[count,paletteIndex|null],...]}}.
Index = (x-ox) + sx*((y-oy) + sy*(z-oz)). Palette entries are catalogue nodes sorted by materialRef then orientation,
unique and all used; runs are canonical (adjacent runs differ) and their counts sum to sx*sy*sz.
Explicit {"materialRef":"catalogue.emptyMaterialRef","orientation":0} digs; null means unspecified: that cell is not written and keeps its node.
Painter validates; respond to its errors instead of bypassing validation.
The submit result includes effectSummary: what the validated block will write, per y layer in world
coordinates (each node's count and x/z range, and the unspecified cells). Before advance, compare it with the
confirmed purpose, dimensions and position; if it differs, correct the proposal and submit again.
For a structured REGION position use the same real action placement / prepare / new-human confirm path
in step 1. Workshop sends its confirmed binding; Canvas checks its own recorded source inspection and
current world revision before writing. A changed source, stale revision or missing/changed binding is
refusal: get a new real inspection, proposal and new human confirmation; never move or truncate the target.
R3. Call hanaworlds_build action advance: Brush compiles chunks using the world-declared partition, Canvas writes one transaction and reads
the whole region back. Only outcome VERIFIED is success; ROLLED_BACK, PENDING or errors are not.
VERIFIED means Canvas wrote exactly the submitted block, not that the block matched the request: describe the
result from effectSummary, never from your intention.
R4. hanaworlds_build action undo restores the whole region of the latest verified region write when nothing
changed it since; otherwise report the conflict. You may refine afterwards with the cell path (steps 2-5).`
function writeMethodSection(described) {
  if (!described) return `Write methods: Workshop's self-description was unavailable when this skill loaded. Call
hanaworlds_write_methods and tell the user exactly what it reports as missing before writing.`
  const tools = described.tools.map(({ descriptor: d, guidance: g }) => `- ${d.method} via ${d.toolName} (input ${d.inputType})
  Purpose: ${d.purpose}
  Typical scale (${d.scaleUnit}): ${d.typicalScale}
  When to use: ${g.whenToUse}
  Not for: ${g.notFor}
  Input: ${g.input}
  Prerequisites: confirmed intent in a Session bound to the current world; peer capabilities ${d.requiredCapabilities.join(', ')}.${d.unavailableReason ? `
  Unavailable when loaded: ${d.unavailableReason}` : ''}`).join('\n')
  return `Write methods (self-described by Workshop; choosing between them is your judgement, not a system threshold):
${described.skillGuidance}
${tools}
Call hanaworlds_write_methods for the current availability and any unmet need with its remedy before choosing.`
}

export const name = 'hanaworlds-workshop-building-skill';
export const inject = ['skills', 'hanaworldsWorkshop'];
export async function apply(ctx) {
  const writeTools = async (sessionRef) => {
    const workshop = ctx.get('hanaworldsWorkshop');
    if (typeof workshop?.describeWriteTools !== 'function') throw new Error('WRITE_METHODS_UNAVAILABLE: Workshop must provide describeWriteTools (hanaworlds-workshop 0.4.0)');
    return workshop.describeWriteTools(sessionRef);
  };
  const config = { writeTools: await writeTools(null).catch(() => null) };
  const described = config.writeTools ?? null;
  ctx.skills.register({
    name: "hanaworlds-building",
    description: "Understand, clarify, propose, build, reshape terrain and undo in the current local HanaWorlds world, choosing per-cell or region writes.",
    whenToUse: "Use for HanaWorlds building, terrain fill/dig and Undo requests.",
    source: "bundled",
    content: `${content}\n\n${writeMethodSection(described)}\n\n${regionSteps}`,
  });
}
export default { name, inject, apply };
