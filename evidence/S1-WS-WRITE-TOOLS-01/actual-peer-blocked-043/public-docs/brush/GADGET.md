# Brush 0.5.0 current public boundary

Evidence: SOURCE/FIXTURE. This package has no external runtime of its own.
Actual pack installation and execution do not prove App/world/model/Undo or
owner acceptance.

Exports: `compileBuildDocument(request)`, `compileBuildDocumentBytes(Uint8Array)`,
`expandEffects(operations, materials)`, `BrushV3`, `contractHandshake`, version,
serviceName, hostCapabilities, invariants and the default Cordis plugin. Types are
provided at the root export. `apply(ctx)` provides exactly `hanaworldsBrushV3`,
with no injected services. The service exposes compile/compileBytes/handshake/status.
Low-level expandEffects requires already validated geometry/materials; public
compile is the admitted boundary.

The bundled contracts are the unmodified 21-file npm artifact 0.4.2 from source
`aad7c0ea2a4a9a93dfb13555c46cd98b9b5da777`, SHA256
`c3528a4fc3f0cdf94245c4d2d8b1cfa5d28db96d1cd00ae74737bdbdfcd26ec6`.
The imports map uses its root API. `verify:contracts` checks repack hash, inventory
and file bytes. Only runtime dependency is canonicalize 5.1.0. There are no peer
plugin imports, old wire adapters, authority/grant fields or world ports.

Compile order reuses dfbf8e0: strict UTF-8/duplicate keys/pure JSON; complete current
BUILD schema; payload/catalogue/frame/world association; exact integer geometry;
static materials; attributed engine capacity; exact ordered effects; known target
cells; recomputed coverage/body/hazard witnesses; current domain-separated digest.
BUILD/V3 requires the supplied localContext world to match request and observed
facts. Brush cannot observe whether a connection/selection remains live; the
owning runtime checks actual current facts before any write. PLANNED facts refer
to a preceding build, never the current build.

Geometry is unchanged: inclusive set_box, last writer wins, one effect per cell,
numeric x/y/z order, exact union bounds, no rounding/cropping/compression. Unknown
or unsampled cells are never air. Static materials must resolve catalogue nodes,
allowed param2 and definition revision, without callbacks/persistent state.
The sole capacity is the attributed ECMAScript array maximum (2^32−1); V8
string/array allocation failures return LIMIT_EXCEEDED. No policy volume cap.

Compile returns current BuildDocumentResponse with exactly result/error. Result
contains operations/v3 projection, current digest, readBounds and writeBounds.
Typed rejection has zero output and mutationState NONE. Raw decoding failures or
no recoverable requestId throw ContractError. Other exceptions propagate as defects.
Current response schema governs error shape; there is no legacy failureCodes list.
Repeated payloads yield identical responses without mutation or a replay store.
The compilerRevision is the caller's bound revision; package identity is status.version.
Canvas owns transaction admission, durable replay, readback/rollback/history/Undo;
Brush makes no transaction or permission decision.

Fresh installation uses one current peer/contracts set and exact handshake.
No compatibility or profile migration. The original implementation and complex
matrices remain in Git/test/legacy, indexed through DEFERRED; this card only runs
normal compilation and core invariants. No release or deployment is claimed.

Image pin delta: MaterialSources adds no Brush input or operation fields. The
compiler and expander behavior remain from bc1626a; only exact bundled contract
identity/handshake and current public declarations change. Use test:image and
gate-image-contracts.sh for the affected install/type/compile smoke; the original
nine core checks and complex legacy matrix are retained without rerunning here.

## Region compile (0.5.0, contracts region v1)

`compileRegionBuild(request)` / `compileRegionBuildBytes(Uint8Array)` /
`BrushV3.compileRegion(Bytes)` implement contracts `region-build/v1
CompileRegionBuild`. The `region-voxels/v1` build block is split with the public
`regionChunksOfBox` into Luanti mapblocks (16³, ascending x,y,z); each chunk is
the build clipped to that mapblock, canonically re-encoded with the public
`encodeRegionBlock` (sorted used palette, canonical runs). `writeBounds` is the
union of the emitted chunk boxes; `operationDigest` is the contracts
`region-operations` digest (protocol domain, independent of package version).

- Carve is only the explicit `{air,0}` palette entry; `null` (UNSPECIFIED) stays
  `null` and is never air. A mapblock with no specified cell emits no chunk.
- Request admission is the public `validateCompileRegionBuildRequest` (schema,
  build/catalogue digest binding, world binding, static palette); every success
  also passes the public `validateCompiledRegionSet` exact equivalence before
  it is returned. Failures are typed responses with zero chunks.
- Compatibility: `protocolHandshake` (`protocol-handshake/v1`) advertises
  `BUILD` major 3 and `region-build` major 1 with capabilities
  `BUILD/V3:per-cell-compile` and `region-build/v1:compile-mapblock-chunks`.
  Consumers decide with `checkProtocolCompatibility`; package version is
  provenance only. The per-cell `contractHandshake` stays exact-package.
- Brush does not decide load state, lighting, transactions, snapshots or Undo:
  Adapter transports and Canvas owns the cross-chunk transaction.
- Use: the skill picks region writes for large fills/carves (terrain, levelling,
  digging) and the per-cell BUILD path for fine edits; it is the skill's choice,
  Brush has no threshold or setting. Observed on a dev machine: 256×32×256
  (2,097,152 cells) → 512 chunks in about 4 s, most of it inside the contracts
  validators. Precondition: the current connection's catalogue and world context.
