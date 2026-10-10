# Workshop 0.7.0 — local-world skill business component

Fresh profile only. Contracts from the contracts source by Git range `#semver:^1.1.0-rc.1` (candidate contracts 1.1.0-rc.1, lock a1e6790f; formal 1.1.0 pending) (same major via the package's `checkContractsVersion`; the lock records the resolved commit); root import `hanaworlds-contracts`. No old wire or profile adapter and no construction permission/grant provider.

## Session identity and deletion

Workshop advertises session 4.0. Host-bound `call('ReadSessionIdentity', request)`
and `call('ListSessions', request)` use official SessionPersistence stat/list,
including unbound Sessions; they never create a Session/projection or select a
World. The identity revision is the Workshop CurrentContext revision, including
a stable initial revision before StartOrResumeSession. Canvas may reenter these
readonly routes while Workshop holds a mutation lock.

Fixed official DSH 0.2.0-rc.2 has no persistent deletion API. Snapshots always
advertise sessionDeleteSupported:false. DeleteSession rejects with
SESSION_DELETE_UNSUPPORTED / DELETE_SEAM_ABSENT before Canvas retirement or any
Core/projection mutation. A live handle dispose/close is not persistent deletion.
The successful G-L deletion route remains unavailable pending official supply.

## Host assembly

Cordis services: `hanaworldsWorkshop` and `hanaworldsWorkshopV3` refer to the same service. Inject real `sessionPersistence`, `storageDomain`, `hanaworldsCanvasV5`, `hanaworldsPainterV2PictureBlocks`, `hanaworldsBrushV3`, `hanaworldsCatalogue.read(worldRef)`, `hanaworldsCompilerConfig.read(worldRef)` and `hanaworldsCapabilities`. Compiler settings return `{compilationConfig,compilerRevision}`. Per-cell services advertise public `ProtocolHandshake`: Painter requires painter major 5, Canvas requires canvas major 6, and Brush requires BUILD major 4 plus `BUILD/V4:per-cell-compile`. Package patch/hash is provenance only. No other plugin import, model loop, MCP or world mutator is included.

Host must keep these ports in its internal runtime. Keep the three existing business categories as agent tools and derive the real Core Session and selected local context in Host. A model does not choose a service or call Canvas/Adapter mutators. `LocalRequestFacts` is generated from Workshop's own durable journal/current brief and fresh Canvas `ReadWorldSelectionContext`; it is never a tool input or a permission assertion.

The Host first selects the actual connection through Canvas `SelectWorldConnection` using the real transport incarnation and expectedContext. Then `call('SwitchWorldContext', session/v4 request)` reads that selection back and binds Workshop to it. It does not create an incarnation or assume selection from JSON. Session, world, connection and incarnation must agree. Unbound/current mismatch is an explicit rejection.

The compatible Painter port retains service name `hanaworldsPainterV2PictureBlocks` while accepting only new painter/v5. Desktop supplies `hanaworldsPainterLocalFacts.read(request, operation, {signal})`; for ValidateBuildProposal it can call Workshop's **read-only internal** `readBuildProposalProviderFacts(request)`. This returns public BuildProposalProviderFacts from the exact reserved request, durable source/current brief and fresh Canvas connection readback. No private state access or model-supplied facts. The read method is reentrant during Painter validation and never acquires the mutation lock. Host remains responsible for its real Session/connection dispatch and cancellation; this accessor is not a fourth agent tool. CreateBuildPlan's Host LocalRequestFacts port belongs to the deferred fixed/image route, not this text-only getter.

For `ValidateRegionProposal`, use the same registered service's `readRegionProposalProviderFacts(exactRetainedRequest) → Promise<LocalRequestFacts>` after `submitWriteProposal('REGION', request)` has durably reserved that request and entered Painter. Contracts 1.1.0-rc.1 defines `painter-region/v2 / ValidateRegionProposal`, `ValidateRegionProposalRequest`, `LocalRequestFacts` and `validateCurrentRequest`; this is a composition-only method, not a new wire operation or agent tool. The Host forwards the exact request, checks its operation/provider identity/cancellation, and lets the service derive facts. It must not call lock-taking `StartOrResumeSession` or `ReadCurrentContext` in the Painter callback, or derive current facts from model input or an earlier context.

Both provider-fact reads share the exact-retention and readonly stability boundary. Region checks the current confirmed intent/brief/catalogue against the retained context and reads fresh Canvas selection. It returns ACTIVE/NEW before the response, or COMPLETED/EXACT_REPLAY with the contracts request digest afterwards. Missing Sessions reject `SESSION_NOT_FOUND`; unmatched/unreserved requests reject `TRANSACTION_CONFLICT`; superseded contexts, changed confirmed turn/brief/catalogue or a projection replaced during an awaited read reject `TARGET_FACTS_STALE`; changed Canvas binding rejects `CURRENT_WORLD_MISMATCH`; an unconfirmed current turn rejects `INTENT_UNCONFIRMED`. Schema/domain failures keep the contracts error. Neither read saves state, takes the mutation lock, creates Sessions, unlocks dispatch, or supplies facts for unretained requests.


## Three business actions

1. `readBuildProposalContext(AdvanceCurrentBuildRequest): Promise<BuildProposalContext>` — current confirmed brief and its retained structured-placement inspection, or ordinary CURRENT_VIEW when placement is absent; captures immutable context. Missing/ambiguous placement returns TARGET_REQUIRED (point-pick UI remains deferred). No world write.
2. `submitBuildProposal(ValidateBuildProposalRequest): Promise<ValidateBuildProposalResponse>` — Host joins captured context with the model's pure `BuildProposal`; exact Painter validation, same current context/brief/turn and durable result. No direct plan injection.
3. `call('AdvanceCurrentBuild', AdvanceCurrentBuildRequest)` — reuses validated plan through Brush BuildDocument, Canvas analysis and CurrentBuildSubmission, durable apply, public Readback and linked object/history. No bypass of Painter/Brush/Canvas.

Request types are from root contracts. Current wires: session/v4, painter/v5, BUILD/V4 and canvas/v6. Session controls use original `AppendMultimodalTurn` with complete text controls and `AnswerClarification`; user intent confirmation is backed by a real subsequent Core `user/message`. It is not a world/range permission confirmation. The skill owns understanding, clarification and proposal; Workshop has zero model calls. Incomplete controls return a question for the skill; corrections resubmit complete parameters. Image media may now be included using the same-session binding described below.

`call('StartOrResumeSession')` returns current snapshot; `ReadSessionTurnDetails` provides durable text/briefs. `ReadCurrentUndoStatus` and `UndoCurrentBuild` reuse the original verified build, current object inspection and linked history. Undo stores its actual invocation/action descriptor, original transaction and new Undo request before dispatch; only a VERIFIED receipt plus changed, correctly linked history becomes user-visible success. Canvas appends the Undo row: the new head must equal that verified Undo transactionId, its originTransactionId must equal the original BUILD, and receipt/readback/operation digests, affected objects and history revision must all match.

## Structured position proposal (contracts 1.1.0-rc.1)

Before displaying world positions to confirm, the native `hanaworlds_context` tool calls
`action:placement` with proposed `width`, `depth`, `height`. Workshop invokes the normal
Canvas `InspectPlacementRegion` CURRENT_VIEW port and retains its actual inspection in its
own fresh domain, bound to this Core Session/latest human request/current localContext.
It returns `{placementSourceRef, inspection}`. No confirmation or write occurs.

Choose `PlacementTarget` from that inspection: sorted unique `EXACT_CELLS.cells` in absolute
world coordinates, or `ANCHORED_EXTENT.bounds`. Call `action:prepare` with complete ordinary
controls and both `placementSourceRef` and `placementTarget`. Workshop uses the installed
contracts `createPlacementProposal`, returns `placement`, and shows its exact target/world
in the authoritative question. A direct Append wire must use an own retained source too;
raw field substitution cannot bypass the constructor's sampled-bounds check. Omit both
fields only when no structured position is displayed; Controls.placement is then omitted (explicit null is refused).

A separate Core human message confirms the same proposal into ConfirmedIntent.placement;
brief/intent digests cover it. Read uses the retained source inspection even after the view
moves. It reads current Canvas selection, not a new CURRENT_VIEW inspection. Source revision
freshness is checked against Canvas analysis and again by Canvas before actual apply; read
alone cannot prove that the world still has the source revision. Changed binding, source,
revision, World, frame or actual target is a named refusal with a new-proposal/new-human-confirmation
remedy; no coordinate remapping or prose parsing occurs.

The actual durable Painter callback receives the exact retained request. Per-cell advance
sets `regionInspectionBinding.confirmedPlacement = confirmedPlacementBinding(intent)`;
`validateCurrentBuildSubmission` requires that binding, and `checkConfirmedPlacementApply`
compares it to the retained inspection and current analysis revision before dispatch.
REGION uses painter-region/v2 to compare specified world cells against the confirmed target.
Advance derives the same confirmedPlacementBinding and includes ApplyRegionCommit.confirmedPlacement
only when it exists. C.validateRegionCommitSubmission checks exact intent/brief/binding equality before
saving/dispatch. Canvas uses its own recorded source inspection and current revision through
C.checkConfirmedRegionPlacementCommit before any snapshot/write. The wire stays canvas-region/v2.
All four new fields are optional objects: omit them when no structured position is confirmed; null is
SCHEMA_INVALID. The old no-position wire values/digests remain unchanged under the additive minor.

This component delivery is SOURCE/FIXTURE/PACK only. Real model/World/UI/owner acceptance for
this new structured-position path is NOT_RUN and belongs to the original combination/VERIFY cards.

## Durable results and evidence boundary

Normal requests reserve a digest in the Workshop domain before execution and store the response. Completed exact duplicates use contracts RETURN_STORED, including after restart, without a second mutation. A later request ID cannot reapply the same completed turn. Unknown/dispatched work stays pending and is not retried as a new transaction. Full RPC recovery and concurrency matrices remain deferred; no guessed recovery is performed.

Canvas owns actual writes, footprint conflicts, complete readback and whole rollback. Workshop compares its receipt with Canvas Readback and exact durable history linkage; it does not claim to independently read Luanti nodes. A Canvas ROLLED_BACK result is surfaced as failure with ROLLED_BACK; an inconsistent readback remains UNKNOWN and never exposes Undo as available.

`npm test` runs only the current normal-flow/core-invariant suite on real Cordis/DSH JSONL and Workshop domain persistence. Painter/Brush/Canvas/world are explicit public fixtures. `scripts/gate-local-world.sh <evidence-dir> <contracts-tar>` repeats it against actual packed Workshop and contracts tar bytes. No real model, App/GUI, world or product Undo claim follows from these component tests.

## Retained work

Earlier source and tests remain in `deferred/pre-local-world`, existing test files and Git 323bd5fe. They are not shipped as old-profile compatibility. Base plugin repositories are unchanged. The image attachment transport is restored by S1-WS-IMAGE-ATTACHMENT-01; actual model/image/world/Undo composition is NOT_RUN. Resource lifecycle, interior/entity completion and extended recovery remain deferred. The real skill closed loop has not yet happened, so fixed orchestration is not declared frozen.

## Skill context tool `hanaworlds_context` (F-WS-IMAGE-ASK-01, contracts v1.1 candidate)

Workshop registers `hanaworlds_context` through the official `ctx.tools.register`
(src/context-tool.mjs), replacing the Host-inline copy in Desktop
bd964cdf skill-tools.ts (blob 426ca1b1, L163-177, `entrancePortalRefs: []`).
Actions `placement` / `prepare` / `confirm` / `read` / `images`; model arguments are only
controls (purpose, width/depth/height, styleText, entrancePortalRefs, imageRefs).
The Session is the native ToolExecution's Core Session; request text, images and
consent come only from Core user messages. `confirm` needs a new human message
after the question; tool output is never consent. `read` returns
`{proposalRef, context}` with a stable context request per confirmed turn.
The world binding is Workshop's own projection set by the Host through
`SwitchWorldContext`; when absent the tool refuses with `LOCAL_CONTEXT_REQUIRED`
and says so.

Site rules (contracts v1): the skill proposes `siteRules` (entrance connectivity with
its design clearance, hazard policy, optional light rule) as a `prepare` argument;
values are the skill's, Workshop and contracts supply no default or enum.
`AppendMultimodalTurn` shows them to the player verbatim in the question; without
a proposal (or a required entrance without clearance) the turn stays incomplete and
"确认" cannot confirm. The human confirmation copies them into
`ConfirmedIntent.siteRules`, bound by the brief/intent digests; a later change is a
new turn and the old context is stale. `#context` derives the SafetyProfile only
through the contract's `safetyProfileFromConfirmedIntent`; Workshop no longer reads
a `hanaworldsSafetyProfile` (Host/Canvas/World) service. A non-null light rule is
refused by capability name (`painter/v5:light-rule`, CAPABILITY_UNAVAILABLE) on the
tool (with a "currently unavailable" explanation for the player, without consuming
the user's message) and on the wire; a confirmed entrance requirement is refused on
the REGION path (`painter-region/v2:entrance-rule`). Projections use the new
domain root `hanaworlds_workshop_v11`; old projections are not migrated. Contracts
v1 carry no player body geometry, so stored contexts hold none.

Engine guards (contracts v1 rc.2): `SessionSnapshot.capabilities` passes the Host's
`PublicCapabilities` through, including `engineGuards` (the Host/engine declares
it; Workshop never fills a value). Region commit/undo failures keep the engine's
public `guardRefusal {guard, stage, finding}` and `applyFailure` next to the error
in Workshop's REGION envelope, so the skill can name the cause (for example a
protected cell) instead of only an error code. Per-cell receipts reach the skill
unchanged inside `BuildEntryOutcome` with the same two fields.

Guard relay (contracts v1 rc.4): session/v4 `AdvanceCurrentBuild`, `UndoCurrentBuild`
and `RecoverPendingUndo` responses carry `guardRefusal` (null normally). When a
Canvas envelope (ApplyRecoverableCommit, Undo, InspectPlacementRegion …) refuses
with a guard refusal, Workshop relays that refusal and the exact public error it
explains to the Host and skill, unchanged and durable on replay. `hanaworlds_context`
read names an inspection refusal (guard, stage, finding) for the skill. Peer public
errors are relayed as is in session responses (previously a plain relayed peer
error was reported as SCHEMA_INVALID/decode).

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
is re-read and digest-checked before confirmation into `ReferenceBrief/v4.media`.
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

Panel link in a not-yet-started conversation (0.4.6): Core v4 reserves surface
node 0 for the native Loop's system prompt. When the live Session has no such
head, `downloadImageForPanel` stores and binds the image as before but delivers
one user message (link text + image block) through the public Agent inbox
(`ctx.agents.get(id).inject`, no wake) and returns `QUEUED_FOR_NEXT_TURN`; the
first turn then commits the system head before it. No live Agent →
`CONVERSATION_AGENT_REQUIRED` before download. Started conversations keep the
direct `ATTACHED` path. Additional Host port: `agents`. `npm run test:new-session`
uses the real AgentLoop/JSONL with a FIXTURE model adapter.

## 附图提问（0.4.7，F-WS-IMAGE-ASK-01）

Workshop 为一个对话的 Agent 提供建造 skill 的「看图」步骤：

- `workshop.prepareImageAsk(agent)`：用官方 `ctx.tools.restrict({allow:['hanaworlds_download_image','skill']})` 限制当前 Agent 的工具，返回解除限制的 disposer。完整 building skill 由本包 `hanaworlds-workshop/building-skill` 插件供给；宿主先逐个 await 实际 peer 装配，再 await 此插件注册一次，最后 await 官方 `dsh-tool-skill` 消费插件。注册时使用本 Workshop 的 `describeWriteTools(null)`，保留原 await/catch→null 与 config??null 分支；不刷新、不冻结其他 Host 的正文。缺 `tools` 时具名拒绝。
- `workshop.attachImageForPanel(session,{data,mediaType},signal)`：本机图片（用户选的字节），与链接同一套 Session 核对、存储、绑定和新/已开始对话语义（新对话 `QUEUED_FOR_NEXT_TURN` 经公开 Agent inbox，已开始对话 `ATTACHED`）。类型、空图、大小上限具名拒绝；附件存储仍完整解码校验。

开发入口：`web/ask-server.mjs` 起 **http://127.0.0.1:47608/ask**（也接受 `localhost`，带参数可开）。它扮演 Host：真实 Cordis / Session / JSONL / AgentRegistry / 官方 AgentLoop / system-prompt / tools / 本地附件 / HTTP 下载 + Workshop；**模型是醒目标注的 FIXTURE**——它读取请求里每张图片的实际存储字节并报告 sha256，不会看图、不描述结构。真实模型、鉴权、费用未授权（UNKNOWN）。会话是本页独立会话，不是 App 当前对话；不写世界。

`npm run test:ask`：`test/image-ask.test.mjs`（真实 Loop + FIXTURE 模型）与 `test/ask-web.test.mjs`（47608 路由与信任边界）。

## Two write methods (S1-WS-WRITE-TOOLS-01; contracts `^1.0.0`)

The one building skill has two write methods, each published as a contracts
`WriteMethodDescriptor` (`method`, `toolName`, `purpose`, `inputType`,
free-text `typicalScale`, `scaleUnit:"cells"`, `requiredCapabilities`,
`unavailableReason`; no threshold field). Root exports: `WRITE_METHODS`,
`WRITE_METHOD_PORTS`, `writeToolSkillGuidance`, `evaluateWriteMethod`,
`describeWriteMethod`, `PER_CELL_PAINTER`, `PER_CELL_CANVAS`, `PER_CELL_BRUSH`.

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
provenance only recorded). PER_CELL requires Brush's public `ProtocolHandshake`
to pass `protocolRequirement('BUILD/V4',['BUILD/V4:per-cell-compile'])`: BUILD
major 3, the required minor and capability. Descriptor availability and
`AdvanceCurrentBuild` share `PER_CELL_BRUSH`; package patch/source/hash never
decide Brush compatibility. Wrong major or absent protocol is
`UNSUPPORTED_VERSION`; missing capability is `CAPABILITY_UNAVAILABLE`.
Painter and Canvas also require their public `ProtocolHandshake`: painter major 4
and canvas major 5, minor >= 0. The current public contract defines no distinct
per-cell capability token for these two wires; none is invented or borrowed
from region. `PER_CELL_PAINTER` and `PER_CELL_CANVAS` are shared by descriptor
availability and real calls (proposal validation and all Canvas reads, advance,
readback and Undo). An exact package handshake, status wire text or region-only
ProtocolHandshake does not substitute for these declarations.

Peer handshakes are read from each peer's public shape (0.4.1, G2): a plain
value property, or the public methods `handshake()` / `protocolHandshake()` /
`status().contractHandshake|protocolHandshake` — BrushV3 publishes only these
methods. All per-cell peers use `checkProtocolCompatibility`; a function is never treated as a handshake and
the Host needs no alias property. Exported helpers: `peerContractHandshake`,
`peerProtocolHandshake`.

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
  kept), intent and catalogue as the painter-region/v2 request minus
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
The historical 0.4.2 Brush-only gate `scripts/gate-write-tools.sh <evidence-dir> <contracts-0.5.2-tar> <brush-0.5.0-tar> <workshop-0.4.1-tar>`
repeated it and the affected per-cell regression on a clean archive and the packed
tarball, uses the actual Brush 0.5.0 `BrushV3` as the external public seam, and
requires the previous 0.4.1 package to reject the same cross-patch Brush fixture
flow with UNSUPPORTED_VERSION. The baseline uses its own contracts 0.5.0 for
Painter/Canvas to isolate the Brush exact-package defect. Actual Brush compile
is exercised in both historical source and packed runtimes (contracts 0.5.2); Painter/Canvas/world,
model choice and product UI are FIXTURE or NOT_RUN here.


## Historical peer-protocol fixture delivery (0.4.3)

`scripts/gate-peer-protocol-fixture.sh <new-E> <contracts-0.5.2-tar> <workshop-0.4.2-tar>`
checks both descriptions, affected per-cell business and named protocol rejection
on committed source and an independently installed package. All Painter,
Canvas, Brush, Host and world ports in this gate are explicit FIXTURE.
Canvas5 is the required future public declaration, not a claim about Canvas0.5.1
(694ae85a), which has already been shown to lack it. The 0.4.2 package must reject
the identical cross-patch Painter/Canvas fixture flow with UNSUPPORTED_VERSION.
The final real three-peer public-package gate awaits PM delivery of the new
Canvas package identity. Fixture success does not grant final public-consumption
PASS, product readiness or acceptance. No actual package declaration is forged.

`npm run test:skill`：官方 Cordis/skills/tool-skill 的隔离 SOURCE/FIXTURE，核对原 Desktop bd964cdf 完整正文、五种输入分支及装配后单次注册。不代表真实模型、Desktop 或产品 UI 验收。

Retained formal v0.5.3 check: actual Brush compilation is SKIP because HW_BRUSH_PACKAGE_ENTRY is not supplied; the current passing peer paths are FIXTURE, and historical actual-peer evidence is not a current formal result.

## 0.5.2 building skill guidance feedback

The original complete Desktop bd964cdf/426ca1b1 template and its late-registration formatter are preserved, with the v1 site rules and two 2026-10-10 instruction edits: unchanged human approval uses action-only confirm (no controls rephrasing/reprepare), and PER_CELL geometry explicitly checks local offsets, inclusive dimensions, known-empty coverage and the confirmed empty entrance/interior volume before submission. Floor/roof thickness is design-dependent; no template, fixed building size, default clearance or alternate planner is introduced. Validation failures require evidence before asking for another placement or relaxing the design. The original Region R1–R4 and formatter are retained, with the v1.1 instruction addition requiring the confirmed binding and Canvas source/revision checks. Wire IDs are restored to v1, absence is omitted rather than null; await/catch/null formatter branches and public tool APIs are unchanged.

This is a reviewable instruction improvement prompted by recorded TEXT refusals, not proof of their sole cause or a fix for the separate REGION transport failure. Official dsh-tool-skill consumption is verified for every full-content branch. Code is not added, mounted or required; the observed TEXT root had no Code tool, and the complete original skill did not require one. New-model geometry/real-world results remain NOT_RUN until the integration card consumes this package in its own run.
