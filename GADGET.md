# HanaWorlds Workshop 0.1.0

Status: Stage 1 component candidate. This repository owns `session/v2` and
`interaction-surface/v3` Workshop orchestration. It does not own a world
transport, painter, compiler, credential bridge, Session store, or media library.
Product composition and user acceptance remain unproven.

## Install and public ports

The DSH bundle applies `cordis.patch.yml` and provides
`hanaworldsWorkshopV1`. The public service exports `contractHandshake`,
`call(operation, request)` for the `session/v2` and `interaction-surface/v3`
operations, and the component orchestration methods:

- `beginFirstBuilding`, `getPlacementState`, `createBuildPlan`,
  `compileCurrentBuild`, `analyzeCurrentBuild`, `applyCurrentBuild`;
- `listObjects`, `selectObjects`.

The service resolves peer ports through the host at call time. Required host
ports are `sessionPersistence` (create/open and per-Session read/append/flush/close handles), `attachments` (readImage,
readImageRequest), `llm` (stream), `hanaworldsAuthority` (verify),
`hanaworldsMediaAuthority` (verify), `hanaworldsModelRoute` (provider,
gpt-5.6-luna, imagePolicy), `hanaworldsCanvasV4`,
`hanaworldsExteriorPainterV3`, `hanaworldsBrushV4`,
`hanaworldsCatalogue`, `hanaworldsSafetyProfile`,
`hanaworldsCompilerConfig`, `hanaworldsApplyAuthority`, and
`hanaworldsRequiredResources`. Missing ports fail closed at the operation
that needs them; Workshop does not insert fixture policies. The host is
responsible for a current authenticated authorization proof and for binding
these services to one isolated HanaWorlds profile.

## Flow and recovery

Workshop stores its projection in the Core SessionPersistence append-only
event log and calls the public handle durability barrier before acknowledging
a state change. The Session header uses the installed Core
`SESSION_FORMAT_VERSION`; Shell currently pins `@deepseek-ai/dsh-session`
`0.2.0-rc.2`. A world switch verifies the world through Canvas inventory and
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
Workshop persists the exact Apply request before sending it; after an
uncertain transport outcome a later authorized call reuses the same request
ID and transaction ID. It records an action receipt only after a verified
Canvas result. Saved required artifact resources must come from the host's
durable resource service. The current Core Session delete seam is unsupported,
and `DeleteSession` reports that truthfully; reopening saved resources is
independent of the old Session log.

## Build and lifecycle

Use Node 24.13.1, isolated HOME, npm cache and DSH profile. `npm ci`,
`npm run build`, `npm test`, and `npm pack --ignore-scripts` operate from a
fresh public clone. The contracts dependency is pinned to its public commit;
there is no sibling path, `file:` dependency or local tarball requirement.
For a real DSH installation, preserve the Core Session and required resource
stores across uninstall/reinstall; package rollback requires the compatible
contracts consumer set and must preserve any unresolved Canvas transaction.
An isolated package/lifecycle probe proves component bytes and loading only;
it does not prove provider login, Luanti effects, or the player-visible flow.
