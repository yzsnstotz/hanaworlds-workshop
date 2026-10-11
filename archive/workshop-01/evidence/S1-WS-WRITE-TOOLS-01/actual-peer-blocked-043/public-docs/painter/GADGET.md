# HanaWorlds Building Exterior Painter 0.4.0 · painter-region/v1 region proposals

The plugin implements `painter/v4.ValidateBuildProposal` and retains image
`CreateBuildPlan`. Both emit `BUILD/V3` plans (image planning can clarify).
Painter never compiles, decides a transaction, reads or writes the world.
Canvas decides transactions, Brush compiles purely, Adapter transports.

## Public entry and host facts

`hanaworldsPainterV2PictureBlocks.call('ValidateBuildProposal', request, {signal})`
accepts the root API's strict `ValidateBuildProposalRequest`. Only `proposal`
contains model geometry. Workshop supplies the confirmed brief and bounded
context; understanding/clarification belong to the skill. This entry calls no
LLM or attachment service and reuses the existing pure geometry and BUILD code.

Host binds the internal `hanaworldsPainterLocalFacts.read(request, operation,
{signal})` port. For ValidateBuildProposal return public
`BuildProposalProviderFacts` `{sourceContext,currentContext,requestFacts}`.
For CreateBuildPlan return public `LocalRequestFacts`. Workshop's source context
must be captured before generation; the host reads current turn, brief, actual
transport incarnation and Canvas world selection from their owning services.
No permissions, actors, grants or INSPECT facts are read. Never manufacture a
current connection incarnation or copy request fields as alleged live facts.
No provider facts are accepted from model requests or call options.

Painter runs the public current-context/proposal checks before planning and
re-reads them after awaits before release, including its existing plan receipt
cache. Cancellation, changed world/incarnation/selection/brief and provider
replacement reject stale output. Missing host facts are CAPABILITY_UNAVAILABLE;
no default grant or context exists. Request-shape, geometry, bounds, material,
body and hazard errors are typed no-mutation outcomes. Coverage,
BODY_CLEARANCE, HAZARD and required entrance witnesses use the new digest domain.
PROTECTION and protected clearance are absent.

Receipts are ephemeral plan receipts, never durable transaction history. A public
RETURN_STORED instruction requires an existing stored receipt and never triggers
replanning. Workshop/Canvas own durable confirmed state and transaction storage.
Host must bind this business port when assembling the new peer set; a component
fixture gate does not prove that full Host integration.

## Pinned bytes and settings

The whole published 24-file contracts0.5.0 package (c006a839, tar 7fb42f1e) is vendored unmodified:
source `aad7c0ea2a4a9a93dfb13555c46cd98b9b5da777`, npm tar SHA256
`c3528a4fc3f0cdf94245c4d2d8b1cfa5d28db96d1cd00ae74737bdbdfcd26ec6`.
Root API only; no `/v4` binding or prior wire compatibility. Regenerate/check:
`node tools/vendor-contracts.mjs [--check] --package <hanaworlds-contracts-0.5.0.tgz>`.
VENDOR.json records per-file SHA256. Never edit generated vendor bytes.

Config/describe retain modelProvider `openai-codex`, modelId `gpt-5.6-luna` and
read-only geometry invariants. Only the image path uses that route; image+text
and a capable resolved model remain required. Image planning and optional fixed
orchestration remain available; this component gate does not freeze them.
The service/class names remain stable; their requests now accept only new wires.

## Evidence

`npm test` / `npm run test:local-world` run the normal proposal and core new
boundaries. `tools/gate-local-world.sh` archives a committed source, checks vendor,
builds, tests, packs, installs in an independent consumer and loads the installed
plugin in actual fixed Cordis. External business facts are public fixtures.
Real model, full DSH Host, GUI/world/Undo are NOT_RUN. This never grants product
PASS, TO_TEST or owner ACCEPTED. Prior route/admission and unchanged geometry
gates are reused. Old test files/tools remain unchanged in source/Git, runnable
at 8e96b57441a697f79a2cda17e8acb6538814630e with their protected old artifact;
old permission, replay/concurrency and expanded negative matrices are deferred,
not current npm-test requirements. Historical report/evidence remain protected.

## Current-world image material consumer (0.3.2)

The service `hanaworldsPainterV2PictureBlocks` and root export expose:

```js
const hint = await painter.matchCurrentImageMaterials({
  imageBytes,       // actual Uint8Array for the Host-verified brief attachment
  materialSources,  // contracts MaterialSources (unchanged in 0.5.0) {snapshot, textures}
  catalogue,        // fresh public Catalogue matching that source
  currentConnection: {worldRef, connectionRef, connectionIncarnationRef},
})
// hint.material = {nodeName, param2}; use in the existing proposal materials.
```

`describe().tools` advertises exactly one current tool,
`CURRENT_IMAGE_MATERIAL_TOOL` (`MatchCurrentImageMaterials`). This is an own pure
method, not an added painter/v4 wire operation. Host reads public NativeFacts,
checks current selection/provider/Catalogue, and calls this method with actual
media bytes. The consumer itself rereads no peer, file, path, URL, model or world.
It synchronously validates Catalogue and calls `validateMaterialSources` before
any await, acquiring validated copies of the texture bytes. Connection has the
three contract fields above; selectionRevision belongs to Host and is not passed
as an extra MaterialSourceConnection field. Host must recheck its live selection,
brief, provider identities and Catalogue after this await before releasing the
hint. Matching cannot prove that supplied facts are still live or that an
attachment belongs to a Session; those remain public supplier/Host duties.

Only KNOWN source rows which pass `validateStaticMaterials` are candidates.
KNOWN does not fill missing callbacks/state/param2 facts. UNKNOWN rows and
static-ineligible variants are counted in `hint.sources` and never get a colour.
No static index, base:* alias or default colour is consulted. Missing legal
candidates throws `ImageMaterialError` with code `MATERIAL_SOURCES_UNAVAILABLE`.
Corrupt/transparent/over-limit or mediaType-mismatched eligible texture bytes
throw `MATERIAL_TEXTURE_UNAVAILABLE`; no partial colour or fallback hint is
returned. Input image errors retain IMAGE_REQUIRED/IMAGE_DECODE_FAILED/
IMAGE_LIMIT_EXCEEDED/NO_VISIBLE_PIXELS. Contract errors retain their precise
world/Catalogue/sourceRevision/byte integrity code.

Image decoding, dominant bins, Oklab transform and limits reuse the existing
pixel functions below. Each simple uniform texture uses the existing alpha
weighted linear-light mean. Distance is Euclidean Oklab, exact ties use contract
UTF16 node order then numeric param2 order. Per-call duplicate texture digests
are measured once within the validated sourceRevision; there is no cross-call
cache. Changing source bytes/revision cannot reuse a historical colour.

Frozen results include actual image hash/dimensions/format, dominant colour,
material, measured match RGB/Oklab/distance and its public texture provenance,
sourceRevision, catalogueDigest, connection, gameId/gameRevision, sourceBasis,
source counts and zero modelCalls/worldWrites. `SERVER_ASSET_ONLY` is the source
baseline; it does not promise client texture-pack appearance. No BUILD, geometry,
transaction, planner, model, renderer or write happens here. Original proposal
geometry source remains unchanged and downstream validation remains mandatory.

`npm run test:material-sources` runs only seven new affected tests.
`tools/gate-current-image-material.sh <full-source-sha> <fresh-E-dir> <fixed-App> <actual-texture>`
archives source, verifies the exact 0.4.2 vendor, builds, runs these tests,
packs/independently installs 0.3.2, repeats them and loads the actual installed
plugin in real Cordis. Public Catalogue/MaterialSources/Host media association
are explicit fixtures, including the binding of preserved real texture bytes.
Actual current product game, Host/App/model/world/Undo and REAL_UI are NOT_RUN.
Protected 0.3.0 text and 0.3.1 image artifacts/E are not overwritten or retested.

## Historical measured-index method (protected 0.3.1)

The registered Painter service exposes `matchImageMaterials({imageBytes, catalogue})`
and root exports `matchImageMaterials`, `IMAGE_MATERIAL_TOOL`, `ImageMaterialError`.
This is an own-plugin computation method, not a new frozen painter/v4 operation.
This retained historical method is not advertised by describe().tools in 0.3.2.
It must not be used as the current-world material consumer. Its old descriptor says:
resolve the actual attachment bytes for the current brief and obtain the current
public Catalogue, then call the method. Do not accept model-provided RGB/palette
facts, URLs or local file paths. Host must correlate the result to that brief
before using it. Workshop download/attachment and full Host binding are external.

The tool accepts only non-empty Uint8Array PNG/JPEG/WebP raster bytes, at most
32MiB and 16,777,216 pixels, one frame. sharp0.35.3 decodes oriented sRGB RGBA,
without resize. Dominant colour uses 16 bins per channel, alpha-byte weight,
largest-weight bin and lowest packed bin on a tie. Its representative RGB is the
winning-bin alpha-weighted linear-light mean. Oklab distance uses the original
picture-blocks palette transform; exact distance ties use UTF16 node name then
smallest legal param2. Results are immutable and contain actual image dimensions,
format/SHA, dominant colour, Catalogue digest, palette digest/provenance, selected
material RGB/texture SHA/distance and count of legal materials with unknown colour.
The returned `{nodeName,param2}` is a material hint for existing proposal.materials;
ValidateBuildProposal/Brush/Canvas remain mandatory. No BUILD/world transaction
is produced here, and neither old CreateBuildPlan nor any model is called.

The original picture-blocks palette-data.ts at db87d6f8 has **63** actual rows,
despite an old comment saying64. `tools/build-material-palette.mjs` remeasured all
63 actual VoxeLibre0.92.3 textures in linear light, preserving existing node/texture
associations and per-texture hashes. It does not guess RGB from names. This index
is explicitly measured from that source; public Catalogue has no texture/RGB
fields and cannot prove that today's world uses those same textures. Colours for
other games/nodes remain UNKNOWN. There is no default invented colour/palette,
no new special-block whitelist, and static legality uses existing offeredMaterials
and validateStaticMaterials. Subsequent geometry/safety checks still apply.

Missing bytes -> IMAGE_REQUIRED; unsupported/corrupt decode -> IMAGE_DECODE_FAILED;
all-transparent -> NO_VISIBLE_PIXELS; no indexed static legal material ->
NO_LEGAL_MATERIAL. No fallback model, forced material or world write occurs.
`npm run test:image-material` requires PAINTER_IMAGE_TEXTURE pointing at actual
protected default_stone.png bytes. `tools/gate-image-material.sh` archives the
exact commit, executes only these5 affected tests, packs/installs independently,
and runs the new method in actual fixed Cordis with external public Catalogue
fixtures. Historical text/geometry/route/admission gates are not rerun.

## Region proposal: painter-region/v1 ValidateRegionProposal (0.4.0)

Same service and same Host business port as text/image proposals:
`hanaworldsPainterV2PictureBlocks.call('ValidateRegionProposal', request, {signal})`
with the contract's strict `ValidateRegionProposalRequest` (raw bytes or
decoded JSON). The text/image path (`proposal.mjs`, `planner.mjs`,
`local-context.mjs`, image modules) is unchanged.

- Admission is the contract's `validateRegionProposalRequest`: region-voxels/v1
  block in world node coordinates, `X_FASTEST_THEN_Y_THEN_Z`, canonical runs,
  `null` = UNSPECIFIED (never written, never carve), carve only explicit
  `{nodeName:"air",param2:0}`, `ignore` and all-null refused, overflow-safe
  extent, and every palette entry (air included) a known static Catalogue node
  with an allowed param2. Intent/brief/Catalogue digests are bound.
- Painter adds: confirmed BUILD_STRUCTURE intent for this turn and world, brief
  of the same Session/turn, `localContext.worldRef === worldRef`.
- Host `hanaworldsPainterLocalFacts.read(request, 'ValidateRegionProposal',
  {signal})` returns public `LocalRequestFacts`; Painter applies
  `validateCurrentRequest('painter-region/v1', ...)` before planning and again
  before release, so a changed world, connection incarnation, selection, turn,
  brief (including verified image media) or cancellation refuses the result.
- Result: `RegionBuildPlan` whose `build` is `region-build/v1` with the proposal
  block unchanged, `declaredBounds = regionBlockBox(block)`, document
  `region-<invocationId>`, digest domain `region-build`; checked by
  `validateRegionProposalResponse`. Same requestId + same payload replays after
  fresh facts; a changed payload is REPLAY_MISMATCH.
- Not Painter's: whether cells are loaded/known (Adapter `ReadRegion` +
  `requireKnownRegion`), snapshot/extras restore, transaction and whole-region
  Undo (Canvas). No model, attachment, compiler or world call.

`protocolHandshake()` returns the contract `ProtocolHandshake`:
painter 4.0 and painter-region 1.0, capability
`painter-region/v1:validate-region-proposal`, package version as provenance
only. Consumers decide with `checkProtocolCompatibility` (same major, minor,
capabilities); a different patch or artifact digest is still compatible, a
wrong major or missing capability is refused. The exact-package
`handshake()`/ContractHandshake now advertises contracts@0.5.0; fixed K1/K2
candidates keep their own pinned 0.3.x/0.4.2 packages.

`describe().tools` self-describes `ValidateRegionProposal` (purpose, typical
scale in cells, preconditions). Choosing region vs per-box proposals is the
skill's decision; Painter sets no size threshold.
