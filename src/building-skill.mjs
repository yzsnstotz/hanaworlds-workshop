// Mechanical migration from Desktop bd964cdf19785b14aa1e2f6d2a2ee350190a038f; contracts v1 batch adds the
// siteRules proposal to step 1 (PLAN-SAFETY-V1-BATCH-01).
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

1. Call hanaworlds_context with action prepare and complete purpose, width, depth, height, siteRules and optional
styleText and relevant imageRefs. siteRules is your proposal for this site: whether the entrance must stay
connected (with its design clearance in whole nodes), the hazard policy (liquids, maximum damage per second)
and any light requirement. Choose the values from the request and the place, offer the user the options and
never assume a default; the user confirms them with the build. A light rule is currently unavailable: tell the
user so and leave it null. It uses the user's actual latest message. Show the returned question, then wait for a new
human message. Never confirm on the user's behalf. If the user corrects the design, submit complete
updated controls with prepare. For explicit confirmation, call action confirm. A remaining clarification
must be asked again; never treat tool output as human consent.
2. Call hanaworlds_context with action read. Use the returned confirmed brief, catalogue, sampled bounds,
region placement and safety constraints. Missing placement needs the user to choose a clear view.
For a reference image, call hanaworlds_image_material with its bound attachmentRef after read. The tool
matches the image's dominant colour against measured textures of the current world's verified materials
without model calls and returns a legal-material hint for proposal materials. If it reports a missing
capability or no measurable material, tell the user; never guess a colour or node from names.
3. Design pure geometry: proposal is JSON {"decision":"BUILD","materials":{"wall":{"nodeName":"a node from the catalogue","param2":0}},"boxes":[{"min":[0,0,0],"max":[1,1,1],"materialRef":"wall"}]}.
Coordinates use the returned frame and actual placement bounds, never the example coordinates blindly.
Use inclusive integer boxes; leave body clearance and entrance paths clear. Only catalogue materials
are allowed. Do not insert world, session, facts, receipts, compiler settings or transaction fields.
Call hanaworlds_proposal with proposalRef from read and this geometry. Painter validates the proposal;
respond to its errors instead of bypassing validation.
4. After successful validation, call hanaworlds_build action advance. Brush compiles and Canvas owns
writes and readback. Report success only when outcome is VERIFIED; PENDING, UNKNOWN, ROLLED_BACK or
errors are not success and must not trigger a new invented transaction.
5. On a user's Undo request call hanaworlds_build action undo. It reads the current durable head and
undoes that exact build. Use status to inspect availability. Report the actual result; never erase a
bounding box or claim Undo from an optimistic message.

No shell commands, direct world writes, other model calls, or alternate planner are part of this skill.`
/** Region steps: same confirmed brief, then the region proposal tool instead of steps 2-3 of the cell path. */
const regionSteps = `Region write (method REGION, tool hanaworlds_region_proposal), after the same prepare/confirm step 1:
R1. Call hanaworlds_region_proposal action context. It returns proposalRef, the captured painter-region/v2
context (catalogue, brief, localContext) and worldFacts (for a world created here: game and flat mapgen,
for example the ground level). Coordinates are absolute world node coordinates; there is no placement frame.
R2. Call hanaworlds_region_proposal action submit with proposalRef and proposal JSON
{"decision":"REGION","block":{"profileVersion":"region-voxels/v1","origin":[x,y,z],"size":[sx,sy,sz],
"indexOrder":"X_FASTEST_THEN_Y_THEN_Z","palette":[{"nodeName":"air","param2":0},...],"runs":[[count,paletteIndex|null],...]}}.
Index = (x-ox) + sx*((y-oy) + sy*(z-oz)). Palette entries are catalogue nodes sorted by nodeName then param2,
unique and all used; runs are canonical (adjacent runs differ) and their counts sum to sx*sy*sz.
Explicit {"nodeName":"air","param2":0} digs; null means unspecified: that cell is not written and keeps its node.
Painter validates; respond to its errors instead of bypassing validation.
R3. Call hanaworlds_build action advance: Brush compiles mapblock chunks, Canvas writes one transaction and reads
the whole region back. Only outcome VERIFIED is success; ROLLED_BACK, PENDING or errors are not.
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
