# F-WS-IMAGE-LINK-01 REPORT · Workshop 0.4.5 / 新 SRC 主路线（2026-10-07 JST）

**PARTIAL / SOURCE_PACKAGE_READY_AWAIT_PRODUCT_ENTRY；非 TO_TEST、非 ACCEPTED。** 按当前CARD明确的新唯一工程主路线，已完成图片链接开发面板源码及固定0.4.5候选包。官方新SRC端点的源码与独立安装实包相关组件检查各3/3，Client控制器3/3，build与相关原生工具exit0；这些是组件材料。现PM已收候选请求，随后明确因共享App启动 `Host startup / DesktopDeploymentPolicy.open` 错误暂不给GUI GO，路由原Desktop责任线处理。本worker产品安装请求0、GUI动作0、正式Host/UI结果NOT_RUN；不重演共享失败、不旁路profile/CLI/手放App字节。

## 改了什么与公开边界

- `client.cjs`：新增侧栏 **Workshop 开发面板**、图片URL输入、下载/读回状态、真实bytes产生的data缩略图、MIME/宽高/bytes、准确可见错误及附件详情。仅独立读回成功才显示关联状态；切换对话后不展示旧结果，不用URL/文件名冒充图片。未实现fixture对话或示例图片替代；将来若引入fixture必须醒目标注。
- 当前对话来源：官方公开Client Session catalog没有 `current` 字段；本面板取 `retainedBy.mainView` 的唯一实际主视图引用事实，不自选一个catalog/示例Session。Host在每次请求中解析真实live Session对象，原Workshop路径核其对象身份与Core header/lifecycle；仅客户端字符串或自造header不能代Host事实。该Client引用在正式App全局面板中的行为仍待产品首步核实。
- `src/index.mjs`：新增公开 `downloadImageForPanel` / `readPanelImage`，用户面板链接经公开Session.append/flush进入真实日志，复用既有downloadImage的HTTP、附件解码/内容存储、来源/摘要核验；实际image block进入同一对话，核Core关联与附件bytes再读回。没有新媒体仓、prompt/agent-loop启动、模型调用或世界写入口。
- `panel/src/index.ts` → 标准TypeScript编译的 `lib/panel-host.mjs`：**新**namespace `hanaworldsWorkshopImageLinks`，公开 `@Remote` 方法 `downloadLink(sessionRef,url,signal)` / `readLink(sessionRef,attachmentRef,signal)`，简单JSON参数、Host Session解析及公开RemoteError。Client经 `ctx.connection.rpc.call('/api', endpoint, {args}, signal)` 调用。
- 这些端点从未strict定义/挂载。唯一构建路线 `scripts/build-image-panel.mjs` 仅降低标准装饰器，不跑Typert贡献生成、不手造strict描述符、不撤已观察strict、不提供生成Client类型投影、不运行时降级。旧两次strict生成失败与根因未明事实仍在E/旧归档，未第三次尝试或声称旧路线已修复。
- 只改Workshop origin；准确0.4.4 base的下载/Session/附件能力复用，原writer树未动；无peer私有源码/import、模型/图片规划/世界建造/契约修改/Stage2/凭据/EULA或发布。

## 固定交件身份与卫生

| 项 | 精确值 |
| --- | --- |
| origin / own source | `hanaworlds-workshop` / `/Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-LINK-01/source` |
| branch / artifact source | `codex/f-ws-image-link-01` / **`272b0afa586ffcc856badf4c77af01b2fcc82ef1`**，已push |
| 首次完整候选E HEAD | **`a7b124068349322d376489f4728d4a1a52f94fbb`**，已push；相对artifact仅证据/固定tar |
| 当前最终 evidence HEAD | **`e7ce7146800854687db4fb367779fa2f267011d8`**，已push/ls-remote同值；只追加当前许可与初次pack-cache失败原件，生产字节未变 |
| base | artifact `200096ae4c8871daccaefa1977306d01effcdde4` / evidence `26d4462265af7f0f7c547d8a96f53f6d53475e90` / 原分支 `codex/s1-ws-write-tools-01`；不降0.2.2、不套旧精确版本/profile兼容规则 |
| 唯一候选 | **`hanaworlds-workshop@0.4.5`** · `/Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-LINK-01/_evidence/package-045/hanaworlds-workshop-0.4.5.tgz` |
| tar SHA256 / bytes | **`affddfc6b058015d94094c42046b30107fdd3492e93a879b52b2f7044d03c068`** / **38,181B** |
| 字节闭合 | **13发布文件**全部逐字节核同冻结source；逐文件SHA见package-045/receipt.json |
| E | own run `_evidence/src-route-development/` 与 `_evidence/package-045/`；tracked副本 `evidence/F-WS-IMAGE-LINK-01/src-route-045/` 含固定tar |
| 固定候选E INDEX | **`85d8c4e861d3b7fc8e32c39d4865f11417b36c7fed809fb3250bde923a22c591`**（a7b12406主材料清单；e7ce714另追加2份许可/cache原件，不改该固定INDEX原文） |

工作树干净：本人source最终HEAD e7ce7146800854687db4fb367779fa2f267011d8，git status --short为空，push及remote实读同值。整合仓只更新本人REPORT，保留他人状态/源码/dirty。

构建清理：已先保存source/独立实包原文和receipts，再删own `packed-consumer`、`source/node_modules`、`npm-cache`及空own runtime目录。保留source、标准编译产物、唯一0.4.5候选身份、全部新旧E/准入及旧strict失败材料。固定tar在run E与tracked E中的副本字节一致，是同一候选身份；没有第二版本或旧本卡候选，无卡外/旧writer清盘。

## 组件材料、自测与真实边界

| 检查 | 实际结果 |
| --- | --- |
| build | 当前vendor来源校验、相关JS语法、标准装饰器编译exit0；`SRC_ONLY_NEW_ENDPOINTS`，无Typert生成重跑 |
| Client控制器 | 新测试先因缺控制器3/3红灯；实现后最终**3/3、fail0/skip0**：独立readback后才发布成功、无Session/切换拒旧回复、下载/解码/关联错误保持可见 |
| Source相关组件 | **3/3、fail0/skip0**：真实HTTP→附件→同一Session图片/读回；foreign Session、未关联图片与解码失败拒绝；官方Gateway调用新source-mode JSON端点正常下载/读回，未绑定Session在HTTP前拒绝 |
| 独立装固定tar相关组件 | 新目录生产依赖安装exit0，导入该安装包自身index/标准编译Host入口，**同3/3、fail0/skip0**；没有用source entry冒充实包 |
| 字节闭合 / diff | 13发布文件与artifact source一致；git diff --check通过 |

**REAL_RUNTIME（组件范围）**：真实HTTP、官方Gateway/Registry、Session类型与事件验证、Core JSONL、现有attachments实际解码和内容存储/读回；实图2×2 PNG、stored96B、内容digest `ff9f970de8b6a6c692eb9703a7ae2d37db2a0e3bd59fdd260d496cc7924aa6b3`。**FIXTURE**：组件里的Session业务身份（s1/s2）和Host Agent的持久writer生命周期bridge明确fixture；它们不代正式Host当前对话。组件modelCalls=0/worldWrites=0不代正式App事实。**NOT_RUN**：正式Host live Session/主视图身份/附件、App安装与面板/首步截图/真实用户下载、REAL_UI、owner验收/独立功能验证/干净机/远端门。

原生相关call/CommandExecution、完整原行/ordinal/SHA在 E/native-events.json；build/client/source原文与packed-panel.log均保存。首次pack遗漏显式本run cache，沿机器既有 `/Volumes/clawso-build` cache配置遇EACCES；没有改全局配置或提权，明确使用本run cache后正常pack成功，失败原件另保存于native-initial-pack-cache-failure.json。此环境错误不抹掉，也不当新SRC路线缺口。

## 产品供给与完成判据

**已装进统一客户端：NOT_RUN。** 无0.4.5安装位置和首步截图。现PM已收固定候选请求；随后因Inspector在共享App入口的新鲜 `Host startup / DesktopDeploymentPolicy.open` 启动错误明确暂不给本卡GUI GO，原责任线处理。本worker未复现该共享入口失败、未安装/重装App、未改profile/CLI旁路、未操作其他已交测插件，GUI不占位。

| CARD完成判据 | 本次状态 |
| --- | --- |
| 1 正常产品安装并打开开发面板 | NOT_RUN，待共享App正常入口恢复后PM给同worker安装窗口 |
| 2 真实bytes、缩略图、类型、尺寸 | 实现与组件/固定tar材料已备；正式App缩略图及用户下载NOT_RUN |
| 3 当前对话真实附件及同图读回，fixture明示 | 实现与明确fixture组件材料已备；正式Host当前Session/真实附件NOT_RUN，不fixture代签 |
| 4 失败准确可见、模型0、世界写0 | 组件相关拒绝/Client可见错误有材料；正式Host/UI运行NOT_RUN |
| 5 本机首步截图、纯UI清单、交TO_TEST | NOT_RUN；无usable正式入口，未编造owner清单/TO_TEST |

- 整合卡改动分类：不适用。
- 研发依赖：Node24.13.1/npm11.8.0；官方公开npm SDK与标准TypeScript。当前原生调用均明确Node24；前轮裸node曾落到22的问题留旧E。当前runtime/编译/检查库的名称、准确版本、协议、来源、用途见own NOTICE及current-dependencies.json；旧Typert generator已从当前dev/build去掉。无其他项目、私有registry、手工App字节、凭据或本卡产品profile依赖。
- 未解决项：共享产品入口供给未恢复，本worker没有正式安装窗口；正式Client mainView引用/Host live Session持久writer与真实附件尚未产品核实。旧strict贡献发现根因仍未明，但旧路线已按新CARD停止，不阻塞这份新SRC源码/实包材料，也未伪称其已修好。
- 需要PM知道的：供给恢复后只续本worker按正常产品安装固定0.4.5，亲走首步截图再交完整≤10步纯UI清单/REPORT。无新writer、重复build/成功组件门或准入需要。旧BLOCKED定位 `BLOCKED-20261007T103844Z.md`，不重挂旧阻塞。

上线前补测：正式Host/Client完整当前Session和持久writer组合、全局面板切换对话后的引用/取消/旧结果、失败整体关联及不重复附件、Host实际模型0/世界写0。复杂重放/并发/恢复依原后延；未跑如实NOT_RUN，不以组件材料代产品通过。
