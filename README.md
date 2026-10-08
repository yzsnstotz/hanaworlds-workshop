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


## 附图提问（0.4.7，F-WS-IMAGE-ASK-01）

Workshop 为一个对话的 Agent 提供建造 skill 的「看图」步骤：

- `workshop.prepareImageAsk(agent)`：通过官方 `agent.ctx` 作用域加一段系统提示 `hanaworlds-building:image-ask`（看实际图片描述结构；不按文件名/链接描述；只描述不建造；比例或用途不清先问一个问题），并用 `ctx.tools.restrict({allow:['hanaworlds_download_image']})` 只留下只读图片工具，写世界的工具在这一步不可见。返回解除两者的 disposer。只影响这一个 Agent。Host 缺 `systemPrompt`/`tools` 时具名拒绝。
- `workshop.attachImageForPanel(session,{data,mediaType},signal)`：本机图片（用户选的字节），与链接同一套 Session 核对、存储、绑定和新/已开始对话语义（新对话 `QUEUED_FOR_NEXT_TURN` 经公开 Agent inbox，已开始对话 `ATTACHED`）。类型、空图、大小上限具名拒绝；附件存储仍完整解码校验。

开发入口：`web/ask-server.mjs` 起 **http://127.0.0.1:47608/ask**（也接受 `localhost`，带参数可开）。它扮演 Host：真实 Cordis / Session / JSONL / AgentRegistry / 官方 AgentLoop / system-prompt / tools / 本地附件 / HTTP 下载 + Workshop；**模型是醒目标注的 FIXTURE**——它读取请求里每张图片的实际存储字节并报告 sha256，不会看图、不描述结构。真实模型、鉴权、费用未授权（UNKNOWN）。会话是本页独立会话，不是 App 当前对话；不写世界。

`npm run test:ask`：`test/image-ask.test.mjs`（真实 Loop + FIXTURE 模型）与 `test/ask-web.test.mjs`（47608 路由与信任边界）。

## 新对话里的图片链接顺序（0.4.6）

DSH Core v4 规定：对话的系统提示必须是表面第 0 个节点，并且只能由原生 AgentLoop 在第一个回合内写入（`dsh-session` README「`system/message` … the first one is surface node 0」，`dsh-session-format-v3-to-v4`「protected first system head」）。0.4.5 的 `downloadImageForPanel` 在**还没开始的对话**里先直接写 user/message，之后第一个正常回合的系统提示就被持久化拒绝：`system/message requires a protected first surface head`。

0.4.6 起，`downloadImageForPanel` 先看当前 live Session 是否已有这个系统头：

- **已开始的对话**：原路径不变——写入链接与图片 user/message，返回 `status: 'ATTACHED'`。
- **还没开始的对话**：下载、解码、存储与同 Session 绑定照旧，但用户输入改走官方 `ctx.agents.get(id).inject(message)`（公开 Agent inbox，不唤醒模型）。一条 user 消息同时带链接文本和真实 image block，返回 `status: 'QUEUED_FOR_NEXT_TURN'`；用户自己的下一次提问开启第一个回合时，Loop 先提交系统提示，再把这条消息与提问一起交给当前模型。回合之后 `readPanelImage` 返回 `ATTACHED`。
- 该对话没有 live Agent 时，在下载和任何写入之前具名拒绝 `CONVERSATION_AGENT_REQUIRED`（需要 Host 先为这个对话创建 Agent）。

新增 Host 端口：Cordis `agents`（官方 `@deepseek-ai/dsh-agent` 注册表）。`npm run test:new-session` 用真实 Cordis / SessionStore / AgentRegistry / AgentLoop / JSONL / 本地附件 / HTTP 复现并验证；只有模型适配器是 FIXTURE（固定文本回答并记录收到的请求）。它不代表真实模型看图、Desktop 产品路径或 owner 验收。

## Workshop 图片链接开发面板（0.4.5）

正常产品安装本包后，侧栏 **Workshop 开发面板** 提供图片链接 → 当前对话附件。打开真实对话后切到面板，粘贴直达 PNG/JPEG/WebP/GIF 的 HTTP(S) 图片链接，点「下载到当前对话」。结果来自真实附件 bytes，显示缩略图、MIME、宽高；公开 Session 日志里的实际 image block 与附件读回通过后才显示已关联状态。重定向、下载、解码、当前对话或附件关联失败显示原因。

当前对话由官方 Client Session catalog 的公开 `retainedBy.mainView` 引用来源确定（唯一被实际主视图持有的对话）；Host再次解析同一个真实 live Session 并核Core身份。没有真实对话或身份不唯一时拒绝，不选择一个示例Session替代。面板不触发prompt/agent-loop或模型，不写世界。

唯一开发接入路线是官方 Gateway 的新 SRC/source-mode JSON 端点 `hanaworldsWorkshopImageLinks/downloadLink`、`readLink`；它们从未注册strict定义。标准 `@Remote` 装饰器由TypeScript编译，不生成/手造Typert描述符、不撤已存在的strict定义、不做运行时降级。Client使用公开 `ctx.connection.rpc.call`。本开发端点不提供生成Client类型投影。

旧strict生成路线的两次exit1与根因未明事实保留在 `evidence/F-WS-IMAGE-LINK-01/blocked-20261007/`，不当成已修复。组件材料不能代正式Host/UI/产品安装/owner验收；其Host Agent持久writer bridge在组件检查中明确标为fixture，正式面板不创建fixture对话。
