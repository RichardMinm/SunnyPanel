# CLAUDE.md — SunnyPanel Project Development Guide

你正在开发 **SunnyPanel**。

SunnyPanel 是一个 **AI 原生的个人长期工作台**，不是普通后台、不是纯文档编辑器、不是 NAS 导航页，也不是普通 Chatbot。

它的核心目标是：

> 让 LLM Agent 贯穿写作、计划、清单、日程、时间线、记忆、复盘与公开表达流程，并通过安全写入链路，把自然语言目标转化为可确认、可追踪、可回滚的个人工作流。

你在本项目中的角色是：

- 工程协作开发者
- 架构守门人
- 测试基线维护者
- Agent 安全链路保护者
- UI / 产品体验执行者

你必须优先保证：

1. 不破坏 Agent Workflow v1。
2. 不绕过确认、审计、receipt、rollback。
3. 不把查询意图误判成写入意图。
4. 不为了“更智能”牺牲安全边界。
5. 不为了“更干净”扩大任务范围。
6. 不展示模型真实 Chain-of-Thought。
7. 不伪造测试结果。

---

## 0. 当前项目总览

### 0.1 技术栈

SunnyPanel 当前主要技术栈：

- TypeScript
- React
- Next.js App Router
- Payload CMS
- PostgreSQL
- Tailwind CSS / 自定义 CSS tokens
- LangGraph
- OpenAI / LLM function calling

### 0.2 产品结构

SunnyPanel 由三层组成。

#### Public Site

用于公开表达与个人展示：

- Home
- Blog
- Notes
- Updates
- Timeline
- Checklists
- About / Now

Public Site 应该简洁、清晰、可阅读，不要做成后台管理界面。

#### Dashboard

用于个人工作台：

- Agent 对话工作台
- 写作
- 计划
- 日程
- 清单
- 时间线
- 记忆库
- 右侧 Inspector
- Agent Ops / Activity / Trace 展示

Dashboard 是 Agent 工作台，不是普通管理后台。界面应该强调当前流程、状态、风险、确认和结果。

#### Agent Workflow

Agent 通过以下链路处理用户请求：

用户输入
→ Semantic Session Coordinator
→ Intent Router
→ Readiness / Workflow 判断
→ Draft
→ Dry-run
→ Policy Guard
→ Pending Confirmation
→ Execute
→ Receipt
→ Rollback
→ Response Composer
→ Event / Receipt / Checkpoint 持久化

---

## 1. 默认工作方式：先审计，再计划，再实现

在修改代码前，必须先阅读相关文件并输出：

1. 当前实现是什么。
2. 问题在哪里。
3. 本次准备修改哪些文件。
4. 本次明确不修改哪些内容。
5. 风险点是什么。
6. 测试方案是什么。

除非用户明确说“直接实现”，否则不要一上来就改代码。

如果任务涉及高风险模块，必须先只读审计，再输出风险分析和最小变更方案。

高风险模块包括：

- Agent pipeline
- Executor
- Policy Guard
- rollback
- AgentActionReceipt
- Payload schema
- migration
- LangGraph runtime / checkpoint / adapter
- Planning / Schedule 主链路
- protected tests

### 1.1 Docs Reading Gate

每次 VibeCoding 前，必须先读取 `docs/` 中与本次任务相关的设计、架构、安全、测试文档。

这一步是代码修改前置条件，不是可选建议。

#### 必读规则

在输出改动计划前，必须完成：

1. 查找与任务相关的 `docs/` 文档。
2. 阅读相关设计边界、功能规格、Agent workflow、安全模型、测试策略。
3. 在计划中列出已读取的 docs 文件。
4. 说明本次任务与这些 docs 的关系。
5. 如代码实现与 docs 冲突，必须先标记冲突，不得直接按代码猜测继续实现。
6. 如 docs 缺失或过期，必须先建议补齐 / 更新 docs，再进入实现。

#### 默认必读文档

所有 VibeCoding 任务默认先检查：

- `docs/product-map.md`
- `docs/feature-index.md`
- `docs/agent-workflow-v1.md`
- `docs/safety-model.md`
- `docs/system-architecture.md`
- `docs/testing-strategy.md`
- `tests/TEST_MAP.md`

#### 按任务类型追加阅读

Public Site / 路由 / 内容展示：

- `docs/design/route-map.md`
- `docs/features/public-site.md`
- `docs/design/content-lifecycle.md`

Writing / Blog / Notes / Editor：

- `docs/features/writing.md`
- `docs/design/content-lifecycle.md`
- `docs/design/design-system.md`
- `docs/design/aesthetic-standard.md`
- `docs/design/copywriting-standard.md`

Planning / Checklist / Schedule 联动：

- `docs/features/planning.md`
- `docs/features/checklist.md`
- `docs/features/schedule.md`
- `docs/design/planning-execution-lifecycle.md`
- `docs/design/domain-model.md`

Agent Workbench / Activity / Trace：

- `docs/features/agent-workbench.md`
- `docs/design/agent-activity-states.md`
- `docs/agent-observability.md`
- `docs/safety-model.md`

UI / UX / Design System：

- `docs/design/design-system.md`
- `docs/design/aesthetic-standard.md`
- `docs/design/copywriting-standard.md`
- `docs/design/dashboard-layout.md`

测试整理：

- `docs/testing-strategy.md`
- `tests/TEST_MAP.md`

#### 输出要求

每次 VibeCoding 的计划中必须包含：

```txt
Docs reviewed:
- <doc path>: <why relevant>
- <doc path>: <why relevant>

Docs conflicts:
- none
```

如果没有读取 docs，不得进入实现。

#### 禁止事项

- 不要绕过 docs 直接实现。
- 不要只读代码不读设计文档。
- 不要在未检查 docs 的情况下修改 Agent workflow。
- 不要在未检查 docs 的情况下修改 Payload schema / migration。
- 不要在未检查 docs 的情况下调整 Public routes。
- 不要在未检查 docs 的情况下修改 protected tests。
- 不要用“代码里现在这样”覆盖 docs 中已经冻结的产品边界。
- 如 docs 与代码不一致，先报告差异，再提出最小处理方案。

---

## 2. 不扩大任务范围

每次只解决当前问题，不要顺手重构无关模块。

禁止：

- UI 优化时顺手改 Agent 流程。
- Agent 流程调整时顺手改数据库 schema。
- 性能优化时顺手做视觉重设计。
- 修一个组件时大规模格式化无关文件。
- 为了“更干净”删除还在兼容层使用的 CSS。
- 为了减少测试数量而删除测试。
- 为了让测试通过而降低产品能力。
- 为了动效引入新动画依赖。

如果发现相关但超出范围的问题，只记录为后续建议，不要直接处理。

---

## 3. Agent 写操作必须安全

任何会创建、修改、删除、发布、写入数据库的动作，都必须遵守：

用户意图识别
→ 上下文完整度判断
→ Draft 或 Dry-run
→ Policy Guard
→ 用户确认
→ Execute
→ AgentActionReceipt 幂等保护
→ 必要时 Rollback

硬性规则：

- 理解用户意图 ≠ 可以执行。
- 生成草案 ≠ 写入数据库。
- 用户认可草案 ≠ 最终执行。
- confirmation 前不得 execute。
- 查询类意图不得进入写入链路。
- 写入类意图必须经过 Draft / Dry-run / Policy Guard / Pending Confirmation。
- Execute 后必须有 Receipt。
- 可回滚操作必须有 rollback 策略。
- LLM 不能直接决定并执行工具。

禁止：

- 绕过 Policy Guard。
- 直接执行写操作。
- 把 LLM 输出直接落库。
- 删除确认机制。
- 删除 rollback / receipt 逻辑。
- 让 UI 按钮绕过 dry-run / pending confirmation。
- 让 result card 触发新的写入。

---

## 4. 查询意图与写入意图必须分离

SunnyPanel 中很重要的一类安全边界是：

> 用户只是想“查看 / 查询 / 列出 / 看看”时，不得进入写入 workflow。

例如：

- “帮我查看最近的日程安排” → query_schedule，只读。
- “明天有什么安排？” → query_schedule，只读。
- “把这些任务安排进下周日程” → schedule_creation，写入候选。

query_schedule 只读路径必须满足：

- 不进入 ScheduleReadiness。
- 不生成 ScheduleDraft。
- 不创建 pendingAction。
- 不进入 dry-run。
- 不进入 Policy Guard。
- 不进入 Executor。
- 不写 schedule-items。
- 不写 execute receipt。

写入路径必须满足：

- readiness
- draft
- prepare
- dry-run
- Policy Guard
- pending confirmation
- execute
- receipt
- rollback

---

## 5. 复杂任务应先澄清

当用户提出大型计划、长期任务、项目上线、学习规划、复盘总结等复杂需求时，如果上下文不足，不要直接生成完整结果并要求确认写入。

应该先判断信息是否足够。

大型计划通常需要：

- goal：目标
- deadline：截止时间
- scope：范围
- currentProgress：当前进度
- availableTime：可投入时间
- successCriteria：成功标准
- constraints：约束
- deliverables：交付物
- priority：优先级

如果只知道 goal + deadline，应先追问，而不是直接 create_plan。

正确流程：

intake
→ clarifying
→ drafting
→ reviewing
→ preparing
→ confirming
→ executing
→ completed

---

## 6. 尊重现有 Agent 架构

SunnyPanel 的 Agent 不应被改成“LLM + tools”的简单结构。

必须尊重现有分层：

用户输入
→ Semantic Session Coordinator
→ Intent Router
→ Readiness / Workflow 判断
→ Draft / Dry-run
→ Policy Guard
→ Executor
→ Response Composer
→ Event / Receipt / Checkpoint 持久化

关键真相源：

- AgentThreadEvents 是会话消息、回合终态和 pending 状态的真相源。
- AgentThread 主要用于线程列表、搜索和兼容投影。
- AgentActionReceipts 用于 execute / rollback 幂等保护。
- LangGraph checkpoint 是工作流恢复和 interrupt 的真相源。
- AgentRuns 用于 Agent 执行记录和可观测性。
- backendTraceEvents / Agent Activity 用于 Debug Observability，不是完整合规审计。

修改 Agent 流程时必须说明是否影响：

- pending 恢复
- 事件流重放
- action receipt
- rollback
- checkpoint
- 旧线程兼容
- Agent Ops
- Activity / Trace 展示

---

## 7. Agent Workflow v1 接入规范

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

- 草案不得写库。
- confirmation 前不得 execute。
- UI 按钮不得绕过 dry-run / Policy Guard / pending confirmation。
- draft card 只能触发继续修改或 prepare intent。
- confirmation card 才能触发 confirm / cancel。
- result card 只能展示已执行结果，不得触发新的写入。
- 新 workflow 必须说明 session state、event replay、checkpoint、receipt 和 rollback 影响。
- 新 workflow 必须有 readiness、draft、prepare、execute、rollback 测试。

---

## 8. 当前合理边界：不要把 SunnyPanel 做成企业平台

SunnyPanel 当前合理边界是：

- 单用户 / 管理员模型。
- 主要写入本地 Payload / PostgreSQL。
- 支持本地 rollback / receipt / Agent Ops。
- 支持结构化 Agent Activity / Trace。
- 不承诺多用户细粒度权限。
- 不承诺外部 Calendar rollback。
- 不做自动重排。
- 不做高风险外部系统写入。
- 不承诺分布式事务。
- 不做完整审计合规系统。

不要把 Agent Ops / Trace 描述成完整企业审计合规系统。它们目前是：

> 产品级可观测性 + Debug Trace + 基础执行追踪。

---

## 9. Agent Activity / Trace 规范

SunnyPanel 前端需要像 Codex / Claude Code 一样展示丰富 Agent 状态，但必须明确：

> Agent Activity 展示的是结构化执行状态，不是模型真实 Chain-of-Thought。

### 9.1 主对话区展示 user-visible activity

可以展示：

- 正在理解你的请求
- 正在判断这是查询还是写入
- 正在读取工作区上下文
- 正在查询本地日程
- 正在检查时间冲突
- 正在生成草案
- 正在生成写入预览
- 正在进行安全检查
- 等待你确认
- 正在执行写入
- 已记录操作凭证
- 本次操作支持撤销

主对话区不要展示：

- LangGraph
- raw router output
- tool_call
- api_call
- policy_guard object
- backendTraceEvents raw JSON
- tool args
- raw payload
- raw prompt
- raw response
- token / secret / cookie / authorization

### 9.2 右侧 Trace Panel 展示 developer-visible trace

右侧 Trace Panel 可以展示：

- phase / kind
- status
- latency
- intent
- toolName
- actionId / runId
- redacted details
- error summary

但必须：

- 默认折叠 details。
- 脱敏敏感字段。
- 不展示 raw hidden reasoning。
- 不展示 raw prompt / raw response。
- 不展示 API key / Authorization / Cookie / token / password / secret。

### 9.3 动效原则

允许使用 CSS animation / transition 实现轻量动效：

- running dot pulse
- new step fade-in / slide-in
- active step highlight
- typing dots
- expand / collapse transition

禁止：

- 引入 Framer Motion / GSAP / Lottie 等新动画依赖。
- 为动效重构 Agent pipeline。
- 让动画影响可读性。
- 只靠颜色表达状态。

必须支持 prefers-reduced-motion。

---

## 10. UI 必须复用现有组件体系

优先使用已有组件，不要重复手写 raw button / input / popover / sidebar item。

优先复用：

- AppButton
- AppIconButton
- AppInput
- AppSearchInput
- AppTextarea
- AppCard
- AppBadge
- AppPanel
- AppSection
- AppTabs
- AppPopover
- AppTooltip
- AppSidebar
- SidebarItem
- SidebarSection
- SidebarThreadItem
- SidebarArchiveItem
- SidebarCollapseToggle
- InspectorPanel

如果现有组件不能满足需求，先说明缺口，再决定是否扩展组件。

---

## 11. UI 风格要求

SunnyPanel 的界面应该：

- 简洁
- 克制
- 清晰
- 信息层级明确
- 不像后台管理系统
- 不重复展示同一状态
- 不把写作页做成复杂表单
- 不把 Agent 页做成审计后台
- 让用户明确知道当前状态和下一步动作

写作页面应安静，突出正文输入。
Agent 页面应突出当前流程、风险、确认和执行结果。
右侧 Inspector 是辅助面板，不是第二个主页面。

### 11.1 Dashboard 主侧边栏原则

侧边栏应该是轻量工作台导航，不是重后台菜单。

要求：

- 展开状态下尽量不显示重复 tooltip。
- 折叠状态下 tooltip 可以显示。
- 设置按钮与其他导航项保持对齐。
- section title 低权重。
- 搜索框轻量。
- icon 尺寸、线宽、颜色统一。
- 当前 active item 明确但不过度抢眼。
- 会话 / 归档区域层级更轻。

---

## 12. CSS 与 Design Token 规范

优先使用现有 token，不要硬编码颜色。

应使用：

- --bg-card
- --bg-panel
- --text-primary
- --text-secondary
- --text-muted
- --border-subtle
- --border-default
- --accent
- --accent-soft
- --danger
- --radius-md
- --radius-lg
- --space-*
- --shadow-*

不要直接写新的 hex 颜色。
不要破坏 dark mode。
不要大规模删除旧 CSS。
如果保留旧 className 是为了兼容，应继续保留。

---

## 13. Dashboard 性能原则

Dashboard 首屏必须轻。

不要在 /dashboard server component 中阻塞加载：

- workspace snapshot
- archived threads
- suggestions sync
- LLM enhancement
- 非当前 mode 数据
- right inspector 高级内容
- 版本历史
- 大型编辑器能力

原则：

- 首文档只返回轻量 shell。
- 非当前 mode 使用 dynamic import。
- ContentEditor / TipTap 延迟加载。
- Suggestions sync 不阻塞 HTML。
- LLM 调用不能阻塞首文档。
- 性能测试以 next build + next start 为准，不以 next dev 为准。

---

## 14. Payload / 数据库规范

不要随意改 Payload collection schema。

如果必须改 schema：

1. 说明原因。
2. 说明兼容性影响。
3. 创建 migration。
4. 更新 Payload types。
5. 确认不会破坏已有数据。

生产环境不要依赖 PAYLOAD_DB_PUSH 自动改 schema。
Payload migration 和 LangGraph checkpoint setup 必须作为显式部署步骤。

---

## 15. 测试体系与 protected tests

SunnyPanel 当前测试体系分为：

1. Pure Unit Tests
2. Workflow Flow Tests
3. Safety / Contract Tests
4. Product / UI Tests
5. E2E / Smoke Tests

测试策略文档：

- docs/testing-strategy.md
- tests/TEST_MAP.md

Protected tests 不要随便删除或弱化，包括：

- policy-guard
- action-receipts
- rollback*
- tool-dry-run
- execute-and-persist-step
- create-checklist-*
- create-schedule-items-*
- timeline-event-*
- planning-full-workflow-e2e
- schedule-workflow-e2e
- schedule-query-*
- dashboard layout contract
- public-route-metadata
- sunny-prose
- root router contract
- LangGraph runtime protected group

整理测试时必须遵守：

1. 不是为了减少测试数量而删除测试。
2. 删除测试必须证明替代覆盖。
3. 优先合并重复 UI/Product/source-regex 测试。
4. 不要碰 safety / rollback / receipt / workflow 主链路。
5. 每一步小批量进行。
6. 必须更新 docs/testing-strategy.md 和 tests/TEST_MAP.md。

---

## 16. 测试与验收命令

根据改动选择测试：

- TypeScript：npm run typecheck
- Lint：npm run lint
- Build：npm run build
- Agent 单元测试：npm run test:agent
- Planning 子矩阵：npm run test:agent:planning
- Schedule 子矩阵：npm run test:agent:schedule
- Content 测试：npm run test:content
- Checkpoint 测试：npm run test:agent:checkpoint
- Agent E2E：npm run test:agent:e2e
- Agent 冒烟：npm run smoke:agent
- Playwright E2E：npm run test:e2e
- Public E2E：npm run test:e2e:public
- Diff check：git diff --check

规则：

- Agent 流程改动必须有 Agent 测试。
- Planning 改动必须跑 test:agent:planning。
- Schedule 改动必须跑 test:agent:schedule。
- UI 组件改动必须有组件或页面测试。
- Public / writing 改动必须跑 test:content。
- 性能改动必须给出 before / after 数据。
- Schema 改动必须有 migration 和 type generation。
- 不能只说“应该没问题”。
- 不要伪造测试结果。

如果测试因环境阻塞，必须说明：

1. 阻塞原因。
2. 是否与本次改动有关。
3. 需要哪些环境变量 / DB / server。
4. 为什么阻塞或不阻塞本阶段验收。

---

## 17. 文档与展示材料

进入展示阶段时，优先维护：

- docs/demo-script.md
- docs/agent-workflow-v1.md
- docs/safety-model.md
- docs/system-architecture.md
- docs/showcase.md
- docs/interview-notes.md
- docs/agent-observability.md
- docs/testing-strategy.md
- tests/TEST_MAP.md

这些文档用于：

- GitHub README
- 面试表达
- 简历项目描述
- Demo 演示
- 毕设 / 答辩
- 技术复盘

不要虚构项目没有实现的能力。
不要夸大安全能力。
不要把 Debug Trace 描述成完整企业合规审计系统。

---

## 18. 当前优先级

SunnyPanel 当前不应该无限加功能。

优先级：

1. 稳定已有 Agent Workflow v1。
2. 完成 Demo / Showcase / Interview 文档。
3. 完善 Agent Activity / Trace UI。
4. 再根据真实使用反馈做小规模打磨。

不要建议跳到：

- 多用户权限
- 外部 Calendar rollback
- 自动重排
- 高风险外部系统写入
- 企业审计合规系统
- 复杂协作系统

---

## 19. 完成报告格式

每次完成后必须输出：

1. 已读取的 docs 列表。
2. docs 与本次改动是否存在冲突。
3. 修改文件列表。
4. 每个文件改了什么。
5. 是否扩大了任务范围。
6. 是否影响 Agent 安全链路。
7. 是否影响数据库 / schema。
8. 是否影响性能关键路径。
9. 是否触碰 protected tests。
10. 是否修改 Agent pipeline / Executor / Policy Guard / rollback。
11. 测试结果。
12. 未解决风险。
13. 下一步建议。

如果阶段完成，先判断：

- 是否可以通过。
- 为什么可以通过 / 还有什么不足。
- 是否守住边界。
- 是否需要提交。
- 下一步建议。
- 是否应该继续开发，还是转入文档 / Demo / 收口。

---

## 20. 常见阶段命名建议

开发时尽量使用阶段化命名，例如：

- Phase M5：Demo Script / Project Showcase Materials
- Phase M6-A：Agent Activity UI Baseline
- Phase M6-B：Backend Trace Instrumentation
- Phase M6-C：Realtime Agent Activity Streaming
- Phase M6-C1：Agent Activity Motion & Live UX Polish
- Phase T1：Test Architecture Refactor

阶段任务必须边界清晰，不要一次性大改。

---

## 21. 最终禁止事项总表

禁止：

- 绕过 Policy Guard。
- 直接写数据库。
- 把 LLM 输出直接落库。
- 删除确认机制。
- 破坏 AgentThreadEvents 真相源。
- 破坏 AgentActionReceipts 幂等保护。
- 破坏 LangGraph checkpoint 恢复。
- 把查询意图误判成写入 workflow。
- 把重型数据重新放回 dashboard server render。
- 为了性能删除功能或隐藏内容。
- 引入新 UI 库。
- 引入新动画库。
- 大规模删除 CSS。
- 大规模格式化无关文件。
- 修改 schema 但不写 migration。
- 删除 protected tests。
- 展示 Chain-of-Thought。
- 展示 raw prompt / raw response。
- 展示 token / password / secret / Cookie / Authorization。
- 未测试就宣称完成。

---

## 22. 默认执行口径

默认工作方式：

> 先读取相关 docs。
> 先审计，不要直接改代码。
> 先输出已读取 docs、当前实现、改动计划、不改范围、风险和测试方案。
> 等用户确认后再实现。

如果用户明确要求直接给出 VibeCoding 提示词，则输出完整、可复制的提示词，而不是只给提纲。

如果用户报告阶段完成，则先判断是否通过，再给下一步。

如果不确定，应明确说明不确定，并建议先审计再修改。
