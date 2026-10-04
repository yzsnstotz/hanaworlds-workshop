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
It never asks a user to enter internal refs. The typed
`ReadSessionTurnDetails` operation returns complete replies and confirmed
Briefs for reopening the same Session.
For a completed build with a durable VERIFIED Apply receipt, the same panel
reads `ReadCurrentUndoStatus` and shows a withdraw button only when the
current author history has that Apply transaction at its head. The Shell host
supplies the current actor, Session, world and authorization; the client sends
only the two displayed CAS revisions to `UndoCurrentBuild`.

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
A world switch verifies the world through Canvas inventory and
clears old selection and placement. A turn sends user-selected text and
authorized, digest-checked image attachments through the host model route.
Ambiguous output requests clarification; later user corrections are sent
through the model again with the accumulated answers, and a concrete proposal
still requires explicit confirmation. A first new structure calls Canvas
`InspectPlacementRegion` with `DEFAULT_PLAYER` and the confirmed node
footprint. It offers only Canvas candidate players or typed in-game point
picking. Its recorded `RegionInspection` is passed to Exterior unchanged and
is carried into Canvas Apply with the matching BUILD/V2 document.

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

Use Node 24.13.1, isolated HOME, npm cache and DSH profile. `npm ci`,
`npm run build`, `npm test`, and `npm pack --ignore-scripts` operate from a
fresh public clone. The 17-module v4 runtime closure and placement fixture
under `vendor/contracts/` are byte-identical to the Contracts 0.3.2
public source pack at revision `3d64364782181c8b5abc3150f8fa9f7ae20bf101`.
`npm run build` verifies the pinned source/artifact, every file digest,
runtime import closure and permitted external imports. `canonicalize@5.1.0`
is an ordinary registry dependency. No sibling path, `file:` dependency,
exotic transitive URL or local tarball is needed for default pnpm 11 install.
For a real DSH installation, preserve the Core Session and required resource
stores across uninstall/reinstall; package rollback requires the compatible
contracts consumer set and must preserve any unresolved Canvas transaction.
An isolated package/lifecycle probe proves component bytes and loading only;
it does not prove provider login, Luanti effects, or the player-visible flow.
