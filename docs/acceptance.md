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
