# Workshop 0.4.12 — local-world skill business component

Fresh profile only. Contracts candidate v0.5.4-rc.1 / tag source 0beeff5774db476c0128683ca6107a28bdcdcbee (candidate pack SHA256 51902797a167a222d812c344871bb1c0774ae775fb0026d70381edd4c08f17ed); root import `hanaworlds-contracts`. No old wire or profile adapter and no construction permission/grant provider.

## Session identity and deletion

Workshop advertises session 3.1. Host-bound `call('ReadSessionIdentity', request)`
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

Cordis services: `hanaworldsWorkshop` and `hanaworldsWorkshopV3` refer to the same service. Inject real `sessionPersistence`, `storageDomain`, `hanaworldsCanvasV5`, `hanaworldsPainterV2PictureBlocks`, `hanaworldsBrushV3`, `hanaworldsCatalogue.read(worldRef)`, `hanaworldsSafetyProfile.read(worldRef)`, `hanaworldsCompilerConfig.read(worldRef)` and `hanaworldsCapabilities`. Compiler settings return `{compilationConfig,compilerRevision}`. Per-cell services advertise public `ProtocolHandshake`: Painter requires painter major 4, Canvas requires canvas major 5, and Brush requires BUILD major 3 plus `BUILD/V3:per-cell-compile`. Package patch/hash is provenance only. No other plugin import, model loop, MCP or world mutator is included.

Host must keep these ports in its internal runtime. Keep the three existing business categories as agent tools and derive the real Core Session and selected local context in Host. A model does not choose a service or call Canvas/Adapter mutators. `LocalRequestFacts` is generated from Workshop's own durable journal/current brief and fresh Canvas `ReadWorldSelectionContext`; it is never a tool input or a permission assertion.

The Host first selects the actual connection through Canvas `SelectWorldConnection` using the real transport incarnation and expectedContext. Then `call('SwitchWorldContext', session/v3 request)` reads that selection back and binds Workshop to it. It does not create an incarnation or assume selection from JSON. Session, world, connection and incarnation must agree. Unbound/current mismatch is an explicit rejection.

The delivered Painter0.3.0 retains service name `hanaworldsPainterV2PictureBlocks` while accepting only new painter/v4. Desktop supplies `hanaworldsPainterLocalFacts.read(request, operation, {signal})`; for ValidateBuildProposal it can call Workshop's **read-only internal** `readBuildProposalProviderFacts(request)`. This returns public BuildProposalProviderFacts from the exact reserved request, durable source/current brief and fresh Canvas connection readback. No private state access or model-supplied facts. The read method is reentrant during Painter validation and never acquires the mutation lock. Host remains responsible for its real Session/connection dispatch and cancellation; this accessor is not a fourth agent tool. CreateBuildPlan's Host LocalRequestFacts port belongs to the deferred fixed/image route, not this text-only getter.

## Three business actions

1. `readBuildProposalContext(AdvanceCurrentBuildRequest): Promise<BuildProposalContext>` — current confirmed text brief and CURRENT_VIEW placement through Canvas; captures immutable context. Missing/ambiguous placement returns TARGET_REQUIRED (point-pick UI remains deferred). No world write.
2. `submitBuildProposal(ValidateBuildProposalRequest): Promise<ValidateBuildProposalResponse>` — Host joins captured context with the model's pure `BuildProposal`; exact Painter validation, same current context/brief/turn and durable result. No direct plan injection.
3. `call('AdvanceCurrentBuild', AdvanceCurrentBuildRequest)` — reuses validated plan through Brush BuildDocument, Canvas analysis and CurrentBuildSubmission, durable apply, public Readback and linked object/history. No bypass of Painter/Brush/Canvas.

Request types are from root contracts. Current wires: session/v3, painter/v4, BUILD/V3 and canvas/v5. Session controls use original `AppendMultimodalTurn` with complete text controls and `AnswerClarification`; user intent confirmation is backed by a real subsequent Core `user/message`. It is not a world/range permission confirmation. The skill owns understanding, clarification and proposal; Workshop has zero model calls. Incomplete controls return a question for the skill; corrections resubmit complete parameters. Image media may now be included using the same-session binding described below.

`call('StartOrResumeSession')` returns current snapshot; `ReadSessionTurnDetails` provides durable text/briefs. `ReadCurrentUndoStatus` and `UndoCurrentBuild` reuse the original verified build, current object inspection and linked history. Undo stores its actual invocation/action descriptor, original transaction and new Undo request before dispatch; only a VERIFIED receipt plus changed, correctly linked history becomes user-visible success. Canvas appends the Undo row: the new head must equal that verified Undo transactionId, its originTransactionId must equal the original BUILD, and receipt/readback/operation digests, affected objects and history revision must all match.

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

## Two write methods (S1-WS-WRITE-TOOLS-01; current contracts candidate v0.5.4-rc.1)

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
to pass `protocolRequirement('BUILD/V3',['BUILD/V3:per-cell-compile'])`: BUILD
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
