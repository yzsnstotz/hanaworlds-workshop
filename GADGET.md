# HanaWorlds Workshop 0.1.0

Status: Stage 1 component candidate. This repository owns `session/v2` and
`interaction-surface/v3` Workshop orchestration. It does not own a world
transport, painter, compiler, credential bridge, Session store, or media library.
Product composition and user acceptance remain unproven.

## Install and public ports

The DSH bundle applies `cordis.patch.yml` and provides
`hanaworldsWorkshopV1` and the Adapter-facing `hanaworldsWorkshop` alias.
The public service exports `contractHandshake`,
`call(operation, request)` for the `session/v2` and `interaction-surface/v3`
operations, and the component orchestration methods:

- `AdvanceCurrentBuild` on `session/v2` is the public current-turn build action.
  It resolves the turn and phase from the Workshop projection, calls only
  published peer ports, and returns a typed choice, pending state, or a Canvas
  VERIFIED receipt linked to a fresh public history readback. Its 0.3.5
  capability check rejects older contract peers.

- `beginFirstBuilding`, `getPlacementState`, `createBuildPlan`,
  `compileCurrentBuild`, `analyzeCurrentBuild`, `applyCurrentBuild`;
- `listObjects`, `selectObjects`.

The Adapter-facing alias also exposes `invokeAction(request, relayPrincipal)`
as a raw `InvokeActionReceipt` and `verifyFrameDelivery(...)`. Both recheck
the current authority and durable pending frame. Luanti relay delivery still
requires the Adapter to resolve this alias when Workshop becomes available;
the Adapter's current startup capture happens before Workshop installation in
the approved composition order.

The package contributes a DSH web-client `./client` entry. It registers the
Workshop sidebar/main panel and contains a typed Shell `SELECT_CHOICE`
presenter. The panel lists only live Sessions with a trusted Shell binding;
the host rechecks the chosen Session, actor and authorization on every call.
For Electron the client accepts a host-injected `hanaworldsWorkshopTransport`
with `invoke(command, args)`; the existing Tauri transport remains the
fallback. The host must route `hanaworlds_request` to its own trusted
Workshop service, supplying and rechecking current binding facts. The
renderer cannot mint an authorization from an old archive.

The separate Host service `hanaworldsWorkshopLegacyHistoryV1` exposes
`importArchive({ projectId, creationSessionId, actorName, panelJson,
projectMemoryJson, evidenceJson })`, `readArchive({ projectId,
creationSessionId, actorName })`, and `listArchives({ actorName })`.
`panelJson` and `projectMemoryJson` are original UTF-8 JSON bytes supplied
by the Desktop migration host; `evidenceJson` is the array of original turn
evidence JSON bytes for that project. Workshop does not open another plugin's
private files. Import verifies the old panel's project/Creation Session,
the project-created event, each committed turn's original utterance and
structured response digests, and a unique request-ID digest match against
its evidence. Missing or conflicting input fails before publication. Exact
repeat import is idempotent; changed bytes for an existing project are
rejected. The independent storage domain holds only a read-only archive,
not a Core Session projection. Its entries have no `sessionRef` or grant.

The injected client transport may additionally expose
`legacyHistory('list', {})` and `legacyHistory('read', { projectId,
creationSessionId })`. The host supplies the trusted actor for the service
call. This populates a separate read-only panel section even when no live
Session is bound; send/build controls remain disabled until the ordinary
current Session/world/Adapter authorization path succeeds. The Desktop
origin owns the preload routing and old-profile migration/rollback.
It never asks a user to enter internal refs. The typed
`ReadSessionTurnDetails` operation returns complete replies and confirmed
Briefs for reopening the same Session.
For a completed build with a durable VERIFIED Apply receipt, the same panel
reads `ReadCurrentUndoStatus` and shows a withdraw button only when the
current author history has that Apply transaction at its head. The Shell host
supplies the current actor, Session, world and authorization; the client sends
only the two displayed CAS revisions to `UndoCurrentBuild`.
The current-turn build button sends only the displayed turn revision. A
placement choice is submitted through `InvokeAction` using the published
frame, action digest, and the current turn's public intent digest. The panel
shows a pending state until the service returns a verified readback.

The service resolves peer ports through the host at call time. Required host
ports are `sessionPersistence` (read-only Core Session access),
`storageDomain` (durable Workshop projection), `attachments` (readImage,
readImageRequest), `llm` (stream), `hanaworldsAuthority` (verify),
`hanaworldsMediaAuthority` (verify), `hanaworldsModelRoute` (provider,
gpt-5.6-luna, imagePolicy), `hanaworldsCanvasV4`,
`hanaworldsPainterV2PictureBlocks`, `hanaworldsBrushV2`,
`hanaworldsCatalogue`, `hanaworldsSafetyProfile`,
`hanaworldsCompilerConfig`, `hanaworldsApplyAuthority`, and
`hanaworldsRequiredResources`. Missing ports fail closed at the operation
that needs them; Workshop does not insert fixture policies. The host is
responsible for a current authenticated authorization proof and for binding
these services to one isolated HanaWorlds profile.

## Flow and recovery

Workshop stores its projection in its own `storageDomain` JSON KV table under
the live Core Session ID and awaits the table write before acknowledging a
state change. It reads the Core JSONL Session for identity and confirmed user
messages without taking the live Session's write handle or creating another
Core Session. Shell currently pins `@deepseek-ai/dsh-session` `0.2.0-rc.2`.
A world switch uses the Contracts 0.3.8 `ReadWorldSelectionContext` capability
to obtain Canvas's current binding, exact CAS and target connection inventory.
Confirmed UNBOUND selects the one available target connection; a different
bound world switches using Canvas's old world and CAS. Multiple candidates
without an existing target binding fail closed; Workshop never chooses the
first candidate. An already bound target reuses its confirmed connection.
Select/Switch success is followed by a fresh context read, then ListObjects,
then another current-context read. Correlation, selection and inventory drift
are checked before Workshop saves readiness. No connection or revision is
derived from Workshop state. Old peer advertisements are rejected, without
fallback to the old inventory-only flow.

The trusted `hanaworldsAuthority.verify(request, 'SwitchWorldContext')` callback
must verify the captured parent against its original grant and live Session.
Besides current actor/session/authorization/world and SELECT, it returns
`sessionIncarnationRef`, `nativeGrantRef`, `invocationRef`,
`invocationStatus: 'ACTIVE'` and `grantStatus: 'CURRENT'`. Workshop snapshots
and rechecks these facts around each await and durable acknowledgement; a
missing incarnation, ended/cancelled invocation or changed grant fails closed.
These are authenticated Host service results, never renderer credentials.
The Host captures each exact Canvas child in the active parent invocation;
Canvas independently authorizes the exact operation. The Contracts
`validateWorldContextDelegation` checker describes that narrow association,
including old-world metadata on Switch versus the grant's target world; it
does not issue a grant. Host must implement that association from current
original binding, Adapter and live Session facts. The component fixture
tests the association; formal Desktop issuance is not established here.

Before dispatching Canvas selection, Workshop durably clears its own ready
world, selection and placement. A failed/uncertain child therefore leaves no
old-world readiness. This advances Workshop's own CAS even on a later error;
reopen StartOrResumeSession for the current revision and use a new request ID.
A lost Canvas receipt is recovered by a subsequent public current-context
query, without replaying a guessed Select. A cancellation during the final
save clears the exact saved Workshop revision before returning an error.
Typed dependency errors are preserved and self-validated with 0.3.8.
A turn sends user-selected text and
authorized, digest-checked image attachments through the host model route.
Ambiguous output requests clarification; later user corrections are sent
through the model again with the accumulated answers, and a concrete proposal
still requires explicit confirmation. A first new structure calls Canvas
`InspectPlacementRegion` with `DEFAULT_PLAYER` and the confirmed node
footprint. It offers only Canvas candidate players or typed in-game point
picking. Its recorded `RegionInspection` is passed to Exterior unchanged and
is carried into Canvas Apply with the matching BUILD/V2 document.

### Explicit text plan source

For a confirmed structure whose real Brief has `media: []`, Host may inject
`hanaworldsTextPlanSource` (constructor field `textPlanSource`). This is a
local domain planning function, not a new remote wire or a model loop. It
advertises the public `BUILD/V2` and `target-facts/v3` handshake and implements
`createBuildPlan(facts) -> BuildPlan`. There is no built-in plan, image fallback
or implicit source. Missing capability fails `CAPABILITY_UNAVAILABLE`.

`facts` contains `actorRef`, `sessionRef`, `requestId`, `authorizationRef`,
`worldRef`, `turnRevision`, a fresh `invocationId`, and these existing public
contract values: `intent`/`intentDigest`, `referenceBrief`/`referenceBriefDigest`,
`catalogue`, `targetFacts`/`targetFactsDigest`,
`safetyProfile`/`safetyProfileDigest`, and `regionInspection`. Workshop derives
them from its durable confirmed turn and the unchanged Canvas inspection.
There is no `painterId`, invented attachment, authorization projection or
caller-supplied plan in this interface. The source is proposal-only and must
return the same invocation ID with a strictly decoded public `BuildPlan`.
Workshop checks its build digest, catalogue/facts/safety digests, exact frame
and protection/body evidence, then rechecks live authority/world before saving.
Brush still owns compilation and witness/geometry checks; Canvas still owns
analysis, authorization, transaction and world write decisions.

Image-bearing Briefs continue through the existing `painter/v3` picture-blocks
port with text and verified image bound to the same Brief. A text source is
never used to recover from an image validation or image Painter failure.
The component text test uses explicit model/plan/Brush/Canvas/authority
fixtures with real DSH/Core/Workshop persistence. It stops at the unavailable
default-build authorization source with zero Canvas Apply; this is not a
real-model, image-understanding or Luanti build claim. Host must separately
install an explicit text source and the admitted public authorization bridge.

Workshop never mutates a world. Canvas owns atomic Apply and recovery.
For first-building `DEFAULT_PLAYER`, the explicit `AnswerClarification`
confirmation must correspond to one durable Core Session `user/message` after
the outstanding clarification. Its message ID must equal that request's
`requestId`, its text must equal the answer, and its source must be a direct
user message. Workshop saves that ID with the confirmed intent and uses only
the saved ID as the placement `invocationId`; a later mismatched caller value
fails before Canvas. A missing or ambiguous Core input fails closed. Product
composition must prove that a Luanti-started confirmation uses the same ID as
the Adapter's recorded relay invocation. This host/Adapter mapping is not
established by the Workshop component fixture.

Workshop persists the exact Apply request before sending it; after an
uncertain transport outcome a later authorized call reuses the same request
ID and transaction ID. It records an action receipt only after a verified
Canvas result. Saved required artifact resources must come from the host's
durable resource service. The current Core Session delete seam is unsupported,
and `DeleteSession` reports that truthfully; reopening saved resources is
independent of the old Session log.

For Undo, Workshop stores the verified Apply request, receipt and inspection
bounds with the turn. It resolves the affected Canvas objects by matching that
transaction and receipt digest in the current author-scoped durable history,
then inspects current object and world revisions. It persists the exact Canvas
Undo request before calling Canvas. A success is shown only after Canvas
returns VERIFIED and a fresh HistoryQuery confirms the expected prior head.
Revocation, world switch, missing receipt, external edit and unconfirmed
readback are surfaced as failures. Workshop never writes the world or moves
Canvas history itself.

## Build and lifecycle

Use Node 24.13.1, a card-local npm cache and isolated DSH profile. `npm ci`,
`npm run build`, `npm test`, and `npm pack --ignore-scripts` operate from a
fresh public clone. Current runtime uses the fixed public Contracts 0.3.8 URL
at revision `ef681148fc4fd6e7871fcc8417baf102abf01b28` with lock integrity.
The prior v4 closure and placement fixture under `vendor/contracts/` remain
byte-identical to the Contracts 0.3.5 source pack at revision
`295cbc7fd0d8a1e56a0d89e651947e668f2ad658`.
`npm run build` verifies the pinned source/artifact, every file digest,
runtime import closure and permitted external imports. `canonicalize@5.1.0`
is an ordinary registry dependency. No sibling path, development symlink,
`file:` production dependency or local tarball is needed for installation.
For a real DSH installation, preserve the Core Session and required resource
stores across uninstall/reinstall; package rollback requires the compatible
contracts consumer set and must preserve any unresolved Canvas transaction.
An isolated package/lifecycle probe proves component bytes and loading only;
it does not prove provider login, Luanti effects, or the player-visible flow.
