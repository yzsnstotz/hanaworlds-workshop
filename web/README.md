# Workshop 图片链接开发网页

入口：http://127.0.0.1:47605/

这是源仓自带开发服务 `hanaworlds-workshop-image-link-web@0.1.0`，没有新 tar，不包含在已冻结的 Workshop0.4.5 App 候选包内。旧 App 面板和唯一0.4.5实包/E保留；App 内接入归整合卡。

使用 Node24，先在 source 根执行 `npm ci --cache /Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-LINK-01/npm-cache`（服务复用根 lock 已固定的公开 SDK），随后运行 `npm --prefix web start`。本机当前启动命令：

```sh
/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin/node /Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-LINK-01/source/web/server.mjs
```

只监听127.0.0.1:47605；新服务实例在本卡 runtime/web 下创建全新示例会话，不加载任何 App profile。端口被占即准确失败，不换端口或重试。服务需保留 source/node_modules 和自己的当前 runtime。

网页 → 同源本机 HTTP → 原 Workshop `downloadImageForPanel` → 原下载/附件/投影算法；网页再调用 `readPanelImage` 独立读回同一会话、同一附件后展示真实 data 图片及类型/尺寸/bytes。根 src、lib、App client、package/lock、NOTICE 字节不改，不重跑 strict 或旧组件门。

**FIXTURE**：示例会话业务身份、public Session→Core JSONL 持久化桥、内置2×2示例PNG内容。**真实执行**：HTTP图片 bytes、官方附件解码/内容存储、Core JSONL和Workshop投影、同会话附件关联及单独读回。Fixture 标记在输入区和每个关联结果中持续可见；不是正式 App Host 当前对话。

没有模型或世界服务端口，只有示例 Session、Session persistence、attachments、projectionStore；执行路径没有模型调用和世界写入。沿用已交下载策略：仅直接HTTP(S)、不转发凭据、不跟随跳转、公开附件大小/类型限制。新HTTP入口限定本机Host、同源POST/JSON、匹配自身示例会话；有串行队列和连接取消，不自动重试或静默兜底。

`node --test test/web-entry.test.mjs` 只验证新网页路由及其信任边界/初始化，不重复已有组件门。首版漏初始Core事件导致准确422/Session not found；新增请求复现红灯，按已有公开示例追加首个turn/start后绿灯，原失败保留E。

新增代码MIT；复用公开依赖名称/准确版本/许可/来源/用途仍由根NOTICE及已交current-dependencies.json列明。本轮无新第三方依赖。并发、超大图/超时/恢复、完整非法输入矩阵、正式App整合归后续验证。

## 附图提问页 · http://127.0.0.1:47608/ask（F-WS-IMAGE-ASK-01）

启动：source 根 `npm ci` 后 `npm --prefix web run start:ask`（或 `node web/ask-server.mjs`）。监听 127.0.0.1 与 ::1 的 47608；Host 头只收 `127.0.0.1` / `localhost` / `[::1]`，POST 需同源 JSON。端口被占即准确失败，不换端口、不重试。每次启动在 `../runtime/ask-web/session-*` 建全新运行目录，不读任何 App profile。

页面：选对话 / 新对话；附本机图片或贴链接（缩略图、类型、尺寸、状态可见）；提交问题给当前对话的模型，回答与本回合模型实际收到的图片字节 sha256 一同显示。错误显示具名代码与说明，页面可继续使用。

**FIXTURE**：模型（`hanaworlds-fixture/fixture-vision-1`，不看图，只报告收到的真实字节）；会话是本页独立会话。**真实**：官方 AgentLoop、官方 skill registry / tool-skill catalog（页内 FIXTURE 模型不调用 skill；完整正文消费另由隔离 tool-skill 测试验证）、图片 Agent 仅见 skill + hanaworlds_download_image，Session/JSONL、附件存储/解码、HTTP 下载。真实模型/鉴权/费用 UNKNOWN，未授权。不写世界。

### 真实模型登录（准备，0.4.8）

页面顶部「真实模型登录」卡对应官方 openai-codex（ChatGPT Plus/Pro 订阅）登录流程；登录记录只存本次运行目录 `dsh-home/`。人点击「登录 ChatGPT」才开始，页面显示登录页链接和流程提问；「退出登录」删除本页记录。新对话可在「新对话模型」里选真实模型；未登录时提问被拒绝 `REAL_MODEL_SIGN_IN_REQUIRED`。费用：计入所登录账号的订阅额度，订阅外是否另计费 UNKNOWN。
