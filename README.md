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


## Workshop 图片链接开发面板（0.4.5）

正常产品安装本包后，侧栏 **Workshop 开发面板** 提供图片链接 → 当前对话附件。打开真实对话后切到面板，粘贴直达 PNG/JPEG/WebP/GIF 的 HTTP(S) 图片链接，点「下载到当前对话」。结果来自真实附件 bytes，显示缩略图、MIME、宽高；公开 Session 日志里的实际 image block 与附件读回通过后才显示已关联状态。重定向、下载、解码、当前对话或附件关联失败显示原因。

当前对话由官方 Client Session catalog 的公开 `retainedBy.mainView` 引用来源确定（唯一被实际主视图持有的对话）；Host再次解析同一个真实 live Session 并核Core身份。没有真实对话或身份不唯一时拒绝，不选择一个示例Session替代。面板不触发prompt/agent-loop或模型，不写世界。

唯一开发接入路线是官方 Gateway 的新 SRC/source-mode JSON 端点 `hanaworldsWorkshopImageLinks/downloadLink`、`readLink`；它们从未注册strict定义。标准 `@Remote` 装饰器由TypeScript编译，不生成/手造Typert描述符、不撤已存在的strict定义、不做运行时降级。Client使用公开 `ctx.connection.rpc.call`。本开发端点不提供生成Client类型投影。

旧strict生成路线的两次exit1与根因未明事实保留在 `evidence/F-WS-IMAGE-LINK-01/blocked-20261007/`，不当成已修复。组件材料不能代正式Host/UI/产品安装/owner验收；其Host Agent持久writer bridge在组件检查中明确标为fixture，正式面板不创建fixture对话。
