# Workshop 0.4.0 — local-world skill business component

Fresh profile only. Contracts 0.5.0 / source c006a839a6e6c2c63d57a14b72e4e6b26fa717f1 (tar 7fb42f1e…); root import `hanaworlds-contracts`. No old wire or profile adapter and no construction permission/grant provider.

## Host assembly

Cordis services: `hanaworldsWorkshop` and `hanaworldsWorkshopV3` refer to the same service. Inject real `sessionPersistence`, `storageDomain`, `hanaworldsCanvasV5`, `hanaworldsPainterV2PictureBlocks`, `hanaworldsBrushV3`, `hanaworldsCatalogue.read(worldRef)`, `hanaworldsSafetyProfile.read(worldRef)`, `hanaworldsCompilerConfig.read(worldRef)` and `hanaworldsCapabilities`. Compiler settings return `{compilationConfig,compilerRevision}`. Peer services advertise exact `contractHandshake`. No other plugin import, model loop, MCP or world mutator is included.

Host must keep these ports in its internal runtime. Keep the three existing business categories as agent tools and derive the real Core Session and selected local context in Host. A model does not choose a service or call Canvas/Adapter mutators. `LocalRequestFacts` is generated from Workshop's own durable journal/current brief and fresh Canvas `ReadWorldSelectionContext`; it is never a tool input or a permission assertion.

The Host first selects the actual connection through Canvas `SelectWorldConnection` using the real transport incarnation and expectedContext. Then `call('SwitchWorldContext', session/v3 request)` reads that selection back and binds Workshop to it. It does not create an incarnation or assume selection from JSON. Session, world, connection and incarnation must agree. Unbound/current mismatch is an explicit rejection.

The delivered Painter0.3.0 retains service name `hanaworldsPainterV2PictureBlocks` while accepting only new painter/v4. Desktop supplies `hanaworldsPainterLocalFacts.read(request, operation, {signal})`; for ValidateBuildProposal it can call Workshop's **read-only internal** `readBuildProposalProviderFacts(request)`. This returns public BuildProposalProviderFacts from the exact reserved request, durable source/current brief and fresh Canvas connection readback. No private state access or model-supplied facts. The read method is reentrant during Painter validation and never acquires the mutation lock. Host remains responsible for its real Session/connection dispatch and cancellation; this accessor is not a fourth agent tool. CreateBuildPlan's Host LocalRequestFacts port belongs to the deferred fixed/image route, not this text-only getter.

## Three business actions

1. `readBuildProposalContext(AdvanceCurrentBuildRequest): Promise<BuildProposalContext>` — current confirmed text brief and CURRENT_VIEW placement through Canvas; captures immutable context. Missing/ambiguous placement returns TARGET_REQUIRED (point-pick UI remains deferred). No world write.
2. `submitBuildProposal(ValidateBuildProposalRequest): Promise<ValidateBuildProposalResponse>` — Host joins captured context with the model's pure `BuildProposal`; exact Painter validation, same current context/brief/turn and durable result. No direct plan injection.
3. `call('AdvanceCurrentBuild', AdvanceCurrentBuildRequest)` — reuses validated plan through Brush BuildDocument, Canvas analysis and CurrentBuildSubmission, durable apply, public Readback and linked object/history. No bypass of Painter/Brush/Canvas.

Request types are from root contracts. Current wires: session/v3, painter/v4, BUILD/V3 and canvas/v5. Session controls use original `AppendMultimodalTurn` with complete text controls and `AnswerClarification`; user intent confirmation is backed by a real subsequent Core `user/message`. It is not a world/range permission confirmation. The skill owns understanding, clarification and proposal; Workshop has zero model calls. Incomplete controls return a question for the skill; corrections resubmit complete parameters. Image media may now be included using the same-session binding described below.

`call('StartOrResumeSession')` returns current snapshot; `ReadSessionTurnDetails` provides durable text/briefs. `ReadCurrentUndoStatus` and `UndoCurrentBuild` reuse the original verified build, current object inspection and linked history. Undo stores its actual invocation/action descriptor, original transaction and new Undo request before dispatch; only a VERIFIED receipt plus changed, correctly linked history becomes user-visible success.

## Durable results and evidence boundary

Normal requests reserve a digest in the Workshop domain before execution and store the response. Completed exact duplicates use contracts RETURN_STORED, including after restart, without a second mutation. A later request ID cannot reapply the same completed turn. Unknown/dispatched work stays pending and is not retried as a new transaction. Full RPC recovery and concurrency matrices remain deferred; no guessed recovery is performed.

Canvas owns actual writes, footprint conflicts, complete readback and whole rollback. Workshop compares its receipt with Canvas Readback and exact durable history linkage; it does not claim to independently read Luanti nodes. A Canvas ROLLED_BACK result is surfaced as failure with ROLLED_BACK; an inconsistent readback remains UNKNOWN and never exposes Undo as available.

`npm test` runs only the current normal-flow/core-invariant suite on real Cordis/DSH JSONL and Workshop domain persistence. Painter/Brush/Canvas/world are explicit public fixtures. `scripts/gate-local-world.sh <evidence-dir> <contracts-tar>` repeats it against actual packed Workshop and contracts tar bytes. No real model, App/GUI, world or product Undo claim follows from these component tests.

## Retained work

Earlier source and tests remain in `deferred/pre-local-world`, existing test files and Git 323bd5fe. They are not shipped as old-profile compatibility. Base plugin repositories are unchanged. The image attachment transport is restored by S1-WS-IMAGE-ATTACHMENT-01; actual model/image/world/Undo composition is NOT_RUN. Resource lifecycle, interior/entity completion and extended recovery remain deferred. The real skill closed loop has not yet happened, so fixed orchestration is not declared frozen.

## One native image-link tool (S1-WS-IMAGE-ATTACHMENT-01)

Workshop registers `hanaworlds_download_image` when the existing public `tools`
service is present. Its only model parameter is `{url: string}`. The native Core
ToolExecution supplies `exec.agent.session.header` and `exec.signal`; session IDs,
local paths, media facts and bytes are never accepted as tool arguments. The
Workshop service also exposes `downloadImage(url, exec)` for the same native Host
adapter, not a new wire operation. No contracts changes or custom media port.

The tool reads the real Core header and user messages, requires the exact HTTP(S)
URL to occur in a user-authored text block in this Session, and downloads bytes
with cancellation. It accepts PNG/JPEG/WebP/GIF Content-Type, rejects redirects
rather than downloading a different URL, sends no credentials, and uses the
mounted `attachments.imageLimits` encoded byte bounds. `attachments.saveImage`
fully decodes/verifies MIME and stores the image; `attachments.readImage` reads
back its normalized bytes. A filename/URL is never treated as image content.
Malformed bytes, unavailable storage, absent user URL, wrong Core lifecycle and
cancellation produce errors without a successful image result. Cancellation after
a content-addressed save may leave an unreferenced immutable store object; the
existing store's retention owns it, and Workshop does not remove shared media.

Output value:

```
{sessionRef, sourceMessageId, downloadSha256, downloadBytes,
 media: {attachmentRef, storedBytesDigest, projectionVariantId: null,
         projectionBytesDigest: null, mediaType, bytes, width, height},
 image: {attachmentId, mediaType, bytes, width, height}}
```

Native output rendering returns a text block containing the binding plus
`{type: 'image', attachment: image}`. The normal agent loop must persist this
actual tool result in the same Core conversation and project it through the
existing model image route. It must not stringify/drop the image block. Workshop
never opens a Core writer and never calls a model. Host owns imagePolicy, model
image capability, tool visibility, upload admission and the actual agent loop.
The model's next step inspects the image and clarifies/proposes using the existing
skill; image interpretation, pixel material selection and world changes are not
performed by this tool.

The same `media` enters `AppendMultimodalTurn.media`, persists in its turn, and
is re-read and digest-checked before confirmation into `ReferenceBrief/v3.media`.
For an uploaded image, Host uses the existing `attachments.saveImage` /
`admitPromptContent` path and persists a user image block in the same Core Session.
Host derives MediaBinding from `readImage` bytes (SHA256, not URL/name). Workshop
admits media only if the Session owns its download record or a matching Core user
image block, and `hanaworldsCapabilities.imageMediaTypes` allows it. It rejects
cross-Session or unreferenced storage objects. These are provenance/correlation
checks; no actor, grant, construction permission or online protection is restored.
Projection variant fields are null for the provider-independent stored reference;
the real model route owns request-image projection via existing attachments APIs.

Reuse: original INPUT `87ad47db` Core provenance/projection design and retained
pre-local-world media digest code; current base `f5e2f0da` Session/brief flow;
existing DSH attachments/tools APIs. No second image store/decoder/model loop.
`npm run test:image` uses real HTTP, Cordis, JSONL, domain storage, Tools and
AttachmentLocal (0.2.0-rc.2), with a declared agent/Host publication/Canvas fixture.
`scripts/gate-image-attachment.sh <evidence-dir> <contracts-tar>` runs a clean
archive and independent installed package, plus the affected text normal flow.
Actual Desktop/skill/model/image building/UI/world/Undo remains NOT_RUN.

## Two write methods (S1-WS-WRITE-TOOLS-01, contracts 0.5.0)

The one building skill has two write methods, each published as a contracts
`WriteMethodDescriptor` (`method`, `toolName`, `purpose`, `inputType`,
free-text `typicalScale`, `scaleUnit:"cells"`, `requiredCapabilities`,
`unavailableReason`; no threshold field). Root exports: `WRITE_METHODS`,
`WRITE_METHOD_PORTS`, `writeToolSkillGuidance`, `evaluateWriteMethod`,
`describeWriteMethod`.

| method | toolName (suggested to Host) | input | typical scale (guidance, not a limit) |
| --- | --- | --- | --- |
| `PER_CELL` 逐格微调 | `hanaworlds_proposal` | `BuildProposal` | a single cell up to a few hundred cells |
| `REGION` 区域批量 | `hanaworlds_region_proposal` | `RegionProposal` (region-voxels/v1; explicit air digs, null = unspecified, never air) | hundreds to millions of cells across mapblocks |

There is no size threshold, setting or admin switch. The skill picks the method
from its goal and volume and may refine the choice; Workshop never truncates a
proposal, changes its target or switches method.

Compatibility: REGION requires each region port to advertise a contracts
`ProtocolHandshake` and pass `checkProtocolCompatibility` for its wire and the
`regionCapabilities` it owns (same major, minor ≥ required, all capabilities;
provenance only recorded). PER_CELL keeps the existing exact
`ContractHandshake` check (contracts: K1/K2 unchanged); if Brush also advertises
a `ProtocolHandshake` it must carry `BUILD/V3:per-cell-compile`.

Ports consumed (Host assembles; names are Workshop's consumption choice):
`hanaworldsPainterRegionV1`, `hanaworldsBrushRegionV1`, `hanaworldsCanvasRegionV1`,
each `{protocolHandshake, call(operation, request)}` with the contract operation
names `ValidateRegionProposal`, `CompileRegionBuild`, `ApplyRegionCommit`,
`UndoRegionCommit`. Workshop imports no peer.

Service methods:

- `describeWriteTools(sessionRef?)` → `{skillGuidance, tools:[{descriptor, guidance, availability}], currentBuild}`;
  `availability.unmet = [{code, need, remedy}]`. Read-only.
- `readWriteProposalContext(method, AdvanceCurrentBuildRequest)` — PER_CELL is
  `readBuildProposalContext`; REGION captures the confirmed brief (verified media
  kept), intent and catalogue as the painter-region/v1 request minus
  `requestId`/`proposal`. Regions use world node coordinates; no placement inspection.
- `submitWriteProposal(method, request)` → `{method, availability, response}`.
  Unavailable methods return `CAPABILITY_UNAVAILABLE` plus the unmet list and send
  nothing to Painter. The method is stored durably; another method for the same
  invocation is `REPLAY_MISMATCH`. `submitBuildProposal` is PER_CELL.
- `advanceRegionBuild(AdvanceCurrentBuildRequest)` — Brush `CompileRegionBuild`
  (`validateCompiledRegionSet`), then Canvas `ApplyRegionCommit`
  (`validateRegionCommit`). The commit request is persisted before dispatch; a
  dispatched commit without result stays PENDING and is never re-sent. VERIFIED
  also requires `actualSummary == expectedAfterSummary`; ROLLED_BACK is a failure.
  `AdvanceCurrentBuild` rejects a REGION build with `UNSUPPORTED_OPERATION`.
- `undoRegionBuild(UndoCurrentBuildRequest)` — `UndoRegionCommit` of the latest
  VERIFIED region transaction with its `historyRevision` (`validateRegionUndo`).

`npm run test:write-tools`: real Workshop, Cordis, Core JSONL, domain storage,
attachments, Tools and HTTP; Painter/Brush/Canvas (cell and region) and the world
are FIXTURE built with the contract's own region helpers.
`scripts/gate-write-tools.sh <evidence-dir> <contracts-0.5.0-tar>` repeats it and
the affected text/image regression on a clean archive and on the packed tarball.
Real peers, Luanti world, model choice and UI are NOT_RUN here.
