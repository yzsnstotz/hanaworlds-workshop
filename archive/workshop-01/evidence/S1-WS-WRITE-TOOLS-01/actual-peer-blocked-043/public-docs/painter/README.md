# HanaWorlds Building Exterior Painter

建筑外形画师 / P3 `picture-blocks` (照片积木) for HanaWorlds Stage 1. It is a DSH
plugin that validates confirmed text proposals through `painter/v4` and returns
`BUILD/V3` plans. It also retains image-plus-text planning and clarification.
Both paths consume Canvas-relayed `regionInspection`; neither mutates a world.

See [GADGET.md](GADGET.md) for the host boundary, settings, invariants, known
contract gaps, and the install and rollback steps. Licensing: MIT for
HanaWorlds-owned source; see [NOTICE](NOTICE) and
[LICENSE_AUDIT.md](LICENSE_AUDIT.md).

One pure `MatchCurrentImageMaterials` tool decodes actual PNG/JPEG/WebP bytes and
matches against current validated MaterialSources texture bytes with static
Catalogue legality. It calls no model and writes no world. Its public method is
`matchCurrentImageMaterials({imageBytes, materialSources, catalogue, currentConnection})`;
see GADGET.md for binding, UNKNOWN and server-asset limits. The historical 0.3.1
measured-index method remains available but is not advertised for current worlds.
