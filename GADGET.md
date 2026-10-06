# Workshop 0.2.0 — local-world skill business component

Fresh profile only. Exact contracts 0.4.0 / source 8cfb18f8e13aa33d7a942f230ec6117914322cdd; root import `hanaworlds-contracts`. No old wire or profile adapter and no construction permission/grant provider.

## Host assembly

Cordis services: `hanaworldsWorkshop` and `hanaworldsWorkshopV3` refer to the same service. Inject real `sessionPersistence`, `storageDomain`, `hanaworldsCanvasV5`, `hanaworldsPainterV4PictureBlocks`, `hanaworldsBrushV3`, `hanaworldsCatalogue.read(worldRef)`, `hanaworldsSafetyProfile.read(worldRef)`, `hanaworldsCompilerConfig.read(worldRef)` and `hanaworldsCapabilities`. Compiler settings return `{compilationConfig,compilerRevision}`. Peer services advertise exact `contractHandshake`. No other plugin import, model loop, MCP or world mutator is included.

Host must keep these ports in its internal runtime. Register only the three business categories as agent tools and derive the real Core Session and selected local context in Host. A model does not choose a service or call Canvas/Adapter mutators. `LocalRequestFacts` is generated from Workshop's own durable journal/current brief and fresh Canvas `ReadWorldSelectionContext`; it is never a tool input or a permission assertion.

The Host first selects the actual connection through Canvas `SelectWorldConnection` using the real transport incarnation and expectedContext. Then `call('SwitchWorldContext', session/v3 request)` reads that selection back and binds Workshop to it. It does not create an incarnation or assume selection from JSON. Session, world, connection and incarnation must agree. Unbound/current mismatch is an explicit rejection.

## Three business actions

1. `readBuildProposalContext(AdvanceCurrentBuildRequest): Promise<BuildProposalContext>` — current confirmed text brief and CURRENT_VIEW placement through Canvas; captures immutable context. Missing/ambiguous placement returns TARGET_REQUIRED (point-pick UI remains deferred). No world write.
2. `submitBuildProposal(ValidateBuildProposalRequest): Promise<ValidateBuildProposalResponse>` — Host joins captured context with the model's pure `BuildProposal`; exact Painter validation, same current context/brief/turn and durable result. No direct plan injection.
3. `call('AdvanceCurrentBuild', AdvanceCurrentBuildRequest)` — reuses validated plan through Brush BuildDocument, Canvas analysis and CurrentBuildSubmission, durable apply, public Readback and linked object/history. No bypass of Painter/Brush/Canvas.

Request types are from root contracts. Current wires: session/v3, painter/v4, BUILD/V3 and canvas/v5. Session controls use original `AppendMultimodalTurn` with complete text controls and `AnswerClarification`; user intent confirmation is backed by a real subsequent Core `user/message`. It is not a world/range permission confirmation. The skill owns understanding, clarification and proposal; Workshop has zero model calls. Incomplete controls return a question for the skill; corrections resubmit complete parameters. media=[] for this MVP.

`call('StartOrResumeSession')` returns current snapshot; `ReadSessionTurnDetails` provides durable text/briefs. `ReadCurrentUndoStatus` and `UndoCurrentBuild` reuse the original verified build, current object inspection and linked history. Undo stores its actual invocation/action descriptor, original transaction and new Undo request before dispatch; only a VERIFIED receipt plus changed, correctly linked history becomes user-visible success.

## Durable results and evidence boundary

Normal requests reserve a digest in the Workshop domain before execution and store the response. Completed exact duplicates use contracts RETURN_STORED, including after restart, without a second mutation. A later request ID cannot reapply the same completed turn. Unknown/dispatched work stays pending and is not retried as a new transaction. Full RPC recovery and concurrency matrices remain deferred; no guessed recovery is performed.

Canvas owns actual writes, footprint conflicts, complete readback and whole rollback. Workshop compares its receipt with Canvas Readback and exact durable history linkage; it does not claim to independently read Luanti nodes. A Canvas ROLLED_BACK result is surfaced as failure with ROLLED_BACK; an inconsistent readback remains UNKNOWN and never exposes Undo as available.

`npm test` runs only the current normal-flow/core-invariant suite on real Cordis/DSH JSONL and Workshop domain persistence. Painter/Brush/Canvas/world are explicit public fixtures. `scripts/gate-local-world.sh <evidence-dir> <contracts-tar>` repeats it against actual packed Workshop and contracts tar bytes. No real model, App/GUI, world or product Undo claim follows from these component tests.

## Retained work

Earlier source and tests remain in `deferred/pre-local-world`, existing test files and Git 323bd5fe. They are not shipped as old-profile compatibility. Base plugin repositories are unchanged. Images, resource lifecycle, interior/entity completion and extended recovery remain deferred, not implemented claims. The real skill closed loop has not yet happened, so fixed orchestration is not declared frozen.
