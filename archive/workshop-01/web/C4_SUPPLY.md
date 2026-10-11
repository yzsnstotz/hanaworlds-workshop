# 独立零模型供给准备页

准确业务基线 Workshop0.4.13 / 9116ed2972ce9542c2aa3ef65db530552911f0ad，contracts0.5.4、固定DSH0.2.0-rc.2/Cordis4.0.4。此页是SOURCE随带开发输入→输出入口，web与两新增测试不在原业务包files里；0.4.13 tar/src/manifest保持原字节，不能宣称该tar含这个新页。

运行必须用PM明确的全新绝对root和端口，没有默认profile/root/port。命令：

```sh
HW_C4_SUPPLY_ROOT=<PM批准的新绝对根> HW_C4_SUPPLY_PORT=<批准端口> node web/c4-supply-server.mjs
```

boot仅官方Context/SessionStore/AgentRegistry/AgentLoop工厂、JSONL/Storage和原Workshop；LLM空registry，没有credentials/auth/model adapter/Canvas/native，防御pre-step必拒绝。创建按钮同步消耗唯一attempt槽位（失败不自动补建），调用官方factory产生独立fresh UUID，公开flush/ListSessions读回；没有driver输入、system head、user message或Workshop brief。原服务/profile/Store不复用；root存在即拒绝。

Host read bridge只绑定既有hanaworldsPainterLocalFacts.read，对ValidateBuildProposal委派当前Workshop的readBuildProposalProviderFacts(exact request)，operation/signal/provider检查、不进入mutation锁，不从请求生成facts。没有Painter时不会凭该绑定宣称retained请求已产生。CreateBuildPlan明确不可复用text getter。

页面输入来自同源用户控件，server只接受持有自己的creator handle且仍在官方store的Session。未有官方system首节点的fresh对话以CONVERSATION_NOT_STARTED_MODEL_PATH_UNPROVEN拒绝，不能send(false)/inject冒充已确认。正常已开始会话才可公共Session.append真实输入并flush；这不唤醒模型，也不直接生成confirmed brief。已提交输入遇flush/cancellation问题在独立receipt保留committedInputId并锁定；刷新不清除收据，不自动重试。

最新owner已授正常SDK认证接续和必要新隔离Session，不再以旧A/B/C挡工程；真实模型仍只允许可确认不新增现金的现额度。固定路由未核到账户同一性与paid-credit禁用证明前，不能启动首次followup/steer/model step。此页不是模型试用、五包整合、C4/Prepare/Apply或owner验收；真实Canvas选择/Capabilities/配置与brief/context/retained正向供应尚未接入，UNKNOWN或NOT_RUN不能当通过。

8项新guard检查：

```sh
node --test --test-reporter=tap test/c4-supply-guard.test.mjs test/c4-core-input-guard.test.mjs
```

它们只测拒绝/取消/provider换/原错误保真，不创建Core Session或fixture livefacts，不代真实组件/GUI。运行页的创建/首步和释放按PM逐段GO另验：close监听、断HTTP连接、等待正在受理的操作、dispose自己的owner handle/fiber，持久文件保留，dispose不当G-L删除。无默认能力、政策或版本revision。
