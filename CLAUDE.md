你正在开发 SunnyPanel。

SunnyPanel 是一个 AI 原生的个人长期工作台，不是普通后台、不是纯文档编辑器、也不是普通 Chatbot。它的核心是：通过 Agent 理解用户工作区，在写作、计划、日程、清单、记忆、时间线和复盘之间协调任务。

开发时请始终遵守以下原则：

## 1. 先审计，再计划，再实现

在修改代码前，必须先阅读相关文件并输出：

1. 当前实现是什么。
2. 问题在哪里。
3. 本次准备修改哪些文件。
4. 本次明确不修改哪些内容。
5. 风险点是什么。
6. 测试方案是什么。

除非我明确要求“直接实现”，否则不要一上来就改代码。

## 2. 不扩大任务范围

每次只解决当前问题，不要顺手重构无关模块。

禁止：

* UI 优化时顺手改 Agent 流程。
* Agent 流程调整时顺手改数据库 schema。
* 性能优化时顺手做视觉重设计。
* 修一个组件时大规模格式化无关文件。
* 为了“更干净”删除还在兼容层使用的 CSS。

## 3. Agent 写操作必须安全

任何会创建、修改、删除、发布、写入数据库的动作，都必须遵守：

用户意图识别
→ 上下文完整度判断
→ 草案或 dryRun
→ Policy Guard
→ 用户确认
→ execute
→ action receipt 幂等保护
→ 必要时 rollback

禁止：

* 绕过 Policy Guard。
* 直接执行写操作。
* 把 LLM 输出直接落库。
* 删除确认机制。
* 删除 rollback / receipt 逻辑。
* 让 LLM 直接决定并执行工具。

理解用户意图不等于可以执行。
生成草案不等于写入数据库。
用户认可草案不等于最终执行。
最终写入必须经过确认。

## 4. 复杂任务应先澄清

当用户提出大型计划、长期任务、项目上线、学习规划、复盘总结等复杂需求时，如果上下文不足，不要直接生成完整结果并要求确认写入。

应该先判断信息是否足够。

例如大型计划通常需要：

* goal：目标
* deadline：截止时间
* scope：范围
* currentProgress：当前进度
* availableTime：可投入时间
* successCriteria：成功标准
* constraints：约束
* deliverables：交付物
* priority：优先级

如果只知道 goal + deadline，应先追问，而不是直接 create_plan。

正确流程：

intake
→ clarifying
→ drafting
→ reviewing
→ confirming
→ executing
→ completed

## 5. 尊重现有 Agent 架构

SunnyPanel 的 Agent 不应被改成“LLM + tools”的简单结构。

请遵守分层：

用户输入
→ Semantic Session Coordinator
→ Intent Router
→ Readiness / Workflow 判断
→ Policy Guard
→ Executor
→ Response Composer
→ Event / Receipt / Checkpoint 持久化

AgentThreadEvents 是会话消息、回合终态和 pending 状态的真相源。
AgentThread 主要用于线程列表、搜索和兼容投影。
AgentActionReceipts 用于 execute / rollback 幂等保护。
LangGraph checkpoint 是工作流恢复和 interrupt 的真相源。

修改 Agent 流程时必须说明是否影响：

* pending 恢复
* 事件流重放
* action receipt
* rollback
* checkpoint
* 旧线程兼容

## 6. UI 必须复用现有组件体系

优先使用已有组件，不要重复手写 raw button / input / popover / sidebar item。

优先复用：

* AppButton
* AppIconButton
* AppInput
* AppSearchInput
* AppTextarea
* AppCard
* AppBadge
* AppPanel
* AppSection
* AppTabs
* AppPopover
* AppTooltip
* AppSidebar
* SidebarItem
* SidebarSection
* SidebarThreadItem
* SidebarArchiveItem
* SidebarCollapseToggle
* InspectorPanel

如果现有组件不能满足需求，先说明缺口，再决定是否扩展组件。

## 7. UI 风格要求

SunnyPanel 的界面应该：

* 简洁
* 克制
* 清晰
* 信息层级明确
* 不像后台管理系统
* 不重复展示同一状态
* 不把写作页做成复杂表单
* 不把 Agent 页做成审计后台
* 让用户明确知道当前状态和下一步动作

写作页面应安静，突出正文输入。
Agent 页面应突出当前流程、风险、确认和执行结果。
右侧 Inspector 是辅助面板，不是第二个主页面。

## 8. CSS 与 Design Token 规范

优先使用现有 token，不要硬编码颜色。

应使用：

* --bg-card
* --bg-panel
* --text-primary
* --text-secondary
* --text-muted
* --border-subtle
* --border-default
* --accent
* --accent-soft
* --danger
* --radius-md
* --radius-lg
* --space-*
* --shadow-*

不要直接写新的 hex 颜色。
不要破坏 dark mode。
不要大规模删除旧 CSS。
如果保留旧 className 是为了兼容，应继续保留。

## 9. Dashboard 性能原则

Dashboard 首屏必须轻。

不要在 /dashboard server component 中阻塞加载：

* workspace snapshot
* archived threads
* suggestions sync
* LLM enhancement
* 非当前 mode 数据
* right inspector 高级内容
* 版本历史
* 大型编辑器能力

原则：

* 首文档只返回轻量 shell。
* 非当前 mode 使用 dynamic import。
* ContentEditor / TipTap 延迟加载。
* Suggestions sync 不阻塞 HTML。
* LLM 调用不能阻塞首文档。
* 性能测试以 next build + next start 为准，不以 next dev 为准。

## 10. Payload / 数据库规范

不要随意改 Payload collection schema。

如果必须改 schema：

1. 说明原因。
2. 说明兼容性影响。
3. 创建 migration。
4. 更新 Payload types。
5. 确认不会破坏已有数据。

生产环境不要依赖 PAYLOAD_DB_PUSH 自动改 schema。
Payload migration 和 LangGraph checkpoint setup 必须作为显式部署步骤。

## 11. 测试与验收

完成任务后必须说明测试结果。

根据改动选择测试：

* TypeScript：npm run typecheck
* Lint：npm run lint
* Build：npm run build
* Agent 单元测试：npm run test:agent
* Checkpoint 测试：npm run test:agent:checkpoint
* Agent E2E：npm run test:agent:e2e
* Agent 冒烟：npm run smoke:agent
* Playwright E2E：npm run test:e2e

规则：

* Agent 流程改动必须有 Agent 测试。
* UI 组件改动必须有组件或页面测试。
* 性能改动必须给出 before / after 数据。
* Schema 改动必须有 migration 和 type generation。
* 不能只说“应该没问题”。

## 12. 完成报告格式

每次完成后输出：

1. 修改文件列表。
2. 每个文件改了什么。
3. 是否扩大了任务范围。
4. 是否影响 Agent 安全链路。
5. 是否影响数据库 / schema。
6. 是否影响性能关键路径。
7. 测试结果。
8. 未解决风险。
9. 下一步建议。

## 13. Agent Workflow v1 接入规范

Agent Workflow v1 已冻结。新增或调整任何写入型 workflow 前，必须先证明它满足以下阶段：

1. readiness：判断上下文是否足够。
2. draft：信息足够但未确认时，只生成草案。
3. prepare：用户明确要求创建 / 保存 / 写入时，才把草案转换为待创建参数。
4. dry-run：展示拟执行动作和影响范围。
5. Policy Guard：评估风险、权限和确认要求。
6. pending confirmation：等待用户明确确认。
7. execute：确认后才执行真实写入。
8. receipt：用 AgentActionReceipts 保证重复确认不会重复写入。
9. rollback：提供可执行回滚或明确说明不可回滚。

硬性规则：

* 草案不得写库。
* confirmation 前不得 execute。
* UI 按钮不得绕过 dry-run / Policy Guard / pending confirmation。
* draft card 只能触发继续修改或 prepare intent。
* confirmation card 才能触发 confirm / cancel。
* result card 只能展示已执行结果，不得触发新的写入。
* 新 workflow 必须说明 session state、event replay、checkpoint、receipt 和 rollback 影响。
* 新 workflow 必须有 readiness、draft、prepare、execute、rollback 测试。

## 14. 禁止事项

禁止：

* 绕过 Policy Guard。
* 直接写数据库。
* 把 LLM 输出直接落库。
* 删除确认机制。
* 破坏 AgentThreadEvents 真相源。
* 破坏 AgentActionReceipts 幂等保护。
* 破坏 LangGraph checkpoint 恢复。
* 把重型数据重新放回 dashboard server render。
* 为了性能删除功能或隐藏内容。
* 引入新 UI 库。
* 大规模删除 CSS。
* 大规模格式化无关文件。
* 修改 schema 但不写 migration。
* 未测试就宣称完成。

默认工作方式：

先审计，不要直接改代码。
先输出当前实现、改动计划、不改范围、风险和测试方案。
等我确认后再实现。
