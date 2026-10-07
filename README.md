# hanaworlds-workshop

HanaWorlds Stage 1 Workshop 0.4.4 component candidate. See [GADGET.md](GADGET.md)
for its host ports, Session flow, installation and recovery boundary. Product
composition and human acceptance remain unproven.


## Actual public-peer Undo consumption (0.4.4)

Undo consumes Canvas's appended verified transaction as the history head and
links its origin to the original BUILD. Receipt, readback, operation, object
and revision checks remain required. `scripts/gate-actual-peers.sh <new-E>`
freezes source, builds and independently installs its tar, then runs the affected
normal image proposal/advance/readback/same-build Undo and protocol checks with
actual Painter0.4.0, Brush0.5.0 and Canvas0.5.3. Host, Adapter, world and the
Canvas public NativeFacts provider are explicit fixtures. Model/Luanti/UI and
owner acceptance remain separate gates. Complete output and durable runtime
snapshots are retained in E.

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
