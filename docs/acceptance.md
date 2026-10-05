# hanaworlds-workshop · 插件级验收

真实运行时：**本地存储 + 存根模型**（Core Session JSONL 是它自己的真实持久化；模型用固定回答的存根）。
Workshop 不猜、不编译、不写世界。证据上限：`REAL_RUNTIME`（存储）/ `FIXTURE`（模型）。

| ID | 验收条目 | 可见结果 | 怎么跑 | 证据上限 |
| --- | --- | --- | --- | --- |
| WS-01 | 一段对话持久化后重启可续 | 两轮对话 → 关闭进程 → 重开同一存储 → 同一 Session 的 turn 与 revision 继续，不新建 Session | `npm test`（session retention 用例） | REAL_RUNTIME |
| WS-02 | 模糊输入触发追问而非下发 | 图文意图不清时，Workshop 在同一 Session 返回追问 ActionDescriptor，不产出 ReferenceBrief，不调用 Painter | `npm test`（clarification 用例） | FIXTURE |
| WS-03 | 存根模型下能产出 ReferenceBrief | 存根模型固定把「放一个方块」翻成一份合法 ReferenceBrief/v2；输出通过 schema | `npm test`（stub-model 用例） | FIXTURE |
| WS-04 | 对象选择只接受 Canvas 返回的 ref | SetObjectSelection 只用 ListObjects 返回的 ref；手填 ID 被类型化拒绝 | `npm test`（selection 用例） | FIXTURE |
| WS-05 | 多在线玩家只在 Shell 侧列名 | 多玩家的 PlacementChoiceRequired 在 Shell 渲染为 SELECT_CHOICE 名单；游戏内渲染器收到同一请求返回 `RENDERER_CAPABILITY_UNAVAILABLE` | `npm test`（placement-ask 用例） | FIXTURE |
| WS-06 | Shell 中撤回本 Session 的已验证建造 | 只在当前作者的 Apply 交易位于 Canvas 历史 head 时显示「撤回此建造」；点击后 VERIFIED 回执与后续历史读回共同确认回退；重启后历史位置一致，拒绝情形显示原因 | `npm test`（undo 与 client-flow 用例）；PM 在隔离 DSH profile 跑真实门 | REAL_UI（待真实门） |
| WS-07 | 受信服务恢复本 Session 已待决 Undo | Workshop 从自身耐久 pendingUndo 选定原请求；撤权后只经 Canvas 公开服务端口读回或恢复，返回 VERIFIED／ROLLED_BACK／RECOVERY_PENDING／UNKNOWN；无 pending、错 Session／世界／授权、伪造 ID 拒绝；普通 Undo 仍须当前授权 | `npm test`（undo-recovery-runtime 与 undo 用例）；Canvas、服务身份及游戏端是明示 fixture | REAL_RUNTIME（Core JSONL 与 Workshop 投影） |
| WS-08 | 当前已确认轮点击建造 | 缺 placement 时显示确切 frame 并可提交其公开选择；Workshop 从耐久当前轮推进 Painter、Brush、Canvas，只有 Canvas VERIFIED 与公开历史读回一致才显示成功；错轮次、错世界、撤权及同笔重放拒绝或保持待决 | `npm test`（build-entry、build-entry-runtime、client-flow）；Canvas、Painter、Brush 和游戏世界为明示 fixture | REAL_RUNTIME（Core JSONL 与 Workshop 投影）；产品 REAL_UI 待整合 |
