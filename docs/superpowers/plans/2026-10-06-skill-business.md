> SCOPE SUPERSEDED / NOT A DELIVERABLE: owner decision 1dae1b9fc removes the MVP authorization system. This checkpoint preserves work done under the prior card. Contracts 0.3.10 still requires original grant/epoch/INSPECT and current-build issuance. Do not assemble this checkpoint for the new MVP; resume only after public local-world contracts replace those requirements. No fake grant or renamed permission shim is permitted.

# Workshop skill business implementation plan

Goal: expose readBuildProposalContext, submitBuildProposal and existing AdvanceCurrentBuild without a second model planner.
Architecture: existing complete text controls feed the durable human confirmation path; immutable public context and authenticated Host provider callbacks bind a pure BuildProposal to Painter validation. Existing compilation, analysis, current-build issuance, pending recovery and Undo remain shared.
Tech stack: Node 24, Cordis/DSH Core JSONL, Workshop domain persistence, exact contracts 0.3.10.

- [ ] Generate vendor closure from SHA-pinned admitted tar using scripts/generate-vendored-contracts.py; pin package/lock to e6680096; verify provenance and runtime version.
- [ ] Add test/skill-business-runtime.test.mjs with real Core confirmation and persistence, throwing model fixture, public proposal and explicit external fixtures. Run it before implementation and retain failure output.
- [ ] In src/index.mjs, use complete text controls directly for clarification; reject correction fallback to the model for that mode. Add typed local context/proposal methods and current-provider checks. Reuse AdvanceCurrentBuild and its original Host apply authority; never silently fall back to textPlanSource for a skill turn.
- [ ] Verify association, forged confirmation, grant/service/invocation drift, cancellation after async responses, replay conflicts, context change before compile, and pending apply recovery through real Workshop runtime; repeat this new suite against npm pack.
- [ ] Document callback contracts and precise reuse/savings in GADGET.md; commit/push own source; retain final pack and output manifest; remove own disposable runtime/install/cache only; write and commit exact new REPORT file in integration repo.

Current public types: AdvanceCurrentBuildRequest; BuildProposalContext; OriginalSessionBinding; ValidateBuildProposalRequest/Response; BuildProposalProviderFacts. Callbacks are local authenticated Host ports, not model inputs or a new remote wire. Host must independently source current INSPECT facts and bind exact Workshop/Painter service and operation. External host/Painter/Canvas/Brush remain fixtures in this component card.
