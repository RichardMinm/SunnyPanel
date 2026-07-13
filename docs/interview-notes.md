# Query Runtime Interview Notes

## 为什么没有直接把 Router 切成 LLM-first？

Router Canary 证明了失败回退的安全性，但同步延迟不稳定，clarify adoption 没有形成足够价值，且 timeout 与 unsafe mismatch 必须阻塞采用。SunnyPanel 因此保持 Primary authoritative，不为了框架迁移牺牲既有安全合同。Query Runtime 只消费可信的 `preResolvedIntent`，没有切换 Router。

## 为什么 QueryFacts 必须确定性生成？

Progress 查询需要当前数据库事实、Legacy parity、visibility 和准确的资源匹配。模型不适合承担计数、除法、日期窗口和资源选择。请求时 loader 生成一次 `QueryFacts`，Legacy 语义与 guarded LangChain 路径共享该事实对象；模型只处理由本地代码生成的定性枚举。

## 为什么 Provider 看不到用户问题和 workspace？

早期输入边界会把 prompt injection、invented ID 和 numeric hallucination 风险带进表达层。Commentary 只需要定性状态，因此最小输入是更可靠的控制：静态协议加 enum-only projection。Provider 不需要也看不到用户问题、workspace、ID、标题、数字或日期。

## 为什么 Commentary 是 optional？

Canonical answer 在模型调用前已经完整。Provider timeout、error 或无效输出不应使正确 Query 失败。LLM 是表达增强，不是事实来源；失败只退化成 canonical-only，并保持正常 persistence 和 done。

## Admin Gate 是权限系统吗？

不是完整 RBAC。当前是 single-user admin model，复用 Payload 服务端认证结果，防止客户端伪造 actor 状态并避免意外启用。它不提供多用户细粒度授权，也不应被描述为企业权限系统。

## 如何回滚？

运行时有两个独立开关：

```text
AGENT_QUERY_ADOPTION=off
AGENT_QUERY_RUNTIME=legacy
```

任意一个都会让下一请求留在 Legacy。代码/文档提交使用 `git revert` 按倒序回滚；C2 的 no-ff merge 如需回滚，使用 `git revert -m 1 <merge-commit>`。

## 如何证明没有进入写入链？

- allowlist 只有两个精确 read variants；
- gate 在 facts loader 和 Provider 前；
- Query runtime 没有 Executor、Draft、Dry-run、Confirmation、Receipt 或 Rollback 能力；
- write 与 compound 继续原路径；
- protected tests 检查 no-business-mutation、no-double-run 和 exact eligibility；
- limited evaluation 的 `businessMutation` 为 0。

## 当前限制是什么？

- 默认仍是 `legacy/off`；
- 只支持两个精确只读变体；
- plan query 需要 positive integer `planId`；
- limited-adoption Provider upper tail 约 8 秒；
- observation collector 非持久审计；
- 不支持多用户 RBAC；
- 不支持所有 Query；
- 不删除 Legacy；
- 不承诺正式 SLA。

## 项目亮点如何概括？

### 30 秒

SunnyPanel 把进展查询拆成确定性事实和可选表达两层。请求时 `QueryFacts` 保持数据库新鲜度和 Legacy parity，canonical answer 先完成；Provider 只看 enum-only 状态，输出经完整 buffering 和本地验证后才可能追加。双开关和 trusted admin gate 默认关闭，失败回到 canonical-only 或既有路径，不进入写入链。

### 90 秒

最初的 Router Canary 和 context-only Query 方案都没有满足采用条件：前者有延迟与 clarify 价值问题，后者无法证明数据库事实 parity。继续把原始事实交给 Provider 又暴露数字复述、prompt injection 和 invented ID 风险；边流边拒绝还会产生 partial output。

最终方案用 request-time deterministic `QueryFacts` 统一事实来源，canonical-first 保证模型不可用时答案仍完整，再把事实投影成不含 ID、名称、数字或日期的 enum-only 状态。Provider 输出全部缓冲，数字、工具调用、执行声明、资源引用等都会被本地省略。Admin limited evaluation 覆盖 30 个真实管理员读样本和 10 个负向控制，安全指标为零且双 kill switch 有回滚证据；但默认仍是 `legacy/off`，没有扩大到所有用户或所有 Query。

### 深入版

关键设计不是“用 LangChain 回答进度”，而是把模型从事实与资源决策中移除。生产 seam 保留 Primary `preResolvedIntent`，先检查 runtime、adoption、服务端 actor、exact intent 和 exact args。拒绝时完全保留 existing path；接受时 loader 最多读一次数据库，并生成 aggregate 或 plan `QueryFacts`。Deterministic renderer 立即形成 canonical block。

Qualitative projection 只保留有限枚举。输入审计检查两条消息、静态协议、精确 keys 和枚举成员；runner 最多调用一次模型并完整缓存流。Reasoning block 被忽略，tool call、数字、Markdown、结构化内容、资源引用、执行声明、unsafe escalation、timeout 或 error 都会使 commentary omitted。Composer 只允许 canonical 或 canonical 加 accepted commentary，随后复用 existing conversation persistence。

这个边界通过 parity、input audit、canonical-first、no-partial、trusted actor、dual kill switch、no-mutation、no-double-run 和 persistence tests 保护。Collector 只保留 200 条进程内脱敏计数，不是 durable audit。Live evidence 是 limited-adoption observed data，不是 SLA，也不足以授权 Router 切换、allowlist 扩展、Legacy 删除或 multi-user RBAC。
