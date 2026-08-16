# Agent Workflow v1

## 1. Intent Types

### Read Intent

Examples:

- 查询已有文章
- 查询已有计划
- 查询日程
- 总结已有内容
- 查找 timeline event

Flow:

```txt
User Input
→ Intent Router
→ Read Boundary
→ Query
→ Summarize
→ Response
```

Rules:

- 不生成 write draft
- 不进入 dry-run
- 不进入 Policy Guard
- 不进入 pending confirmation
- 不写数据库
- 不生成 write receipt

### Guarded Query Read Path

The guarded LangChain Query runtime is a narrow implementation of the read boundary, not a replacement for the write workflow:

```text
Primary preResolvedIntent
→ Read eligibility and trusted actor gate
├─ rejected → existing Legacy path
└─ adopted
   → deterministic QueryFacts
   → deterministic canonical answer
   → optional enum-only qualitative commentary
   → existing conversation persistence
   → response
```

Current adoption supports only exact deterministic Boundary-owned `query_progress` aggregate variants without a checklist title and exact `query_plan_progress` with a positive integer `planId`. Unset configuration defaults this narrow path to `langchain/admin`; LLM-owned or unsupported queries remain outside it. Either `AGENT_QUERY_RUNTIME=legacy` or `AGENT_QUERY_ADOPTION=off` is an immediate kill switch. The complete contract is in `docs/query-runtime-v1.md`.

Rules:

- Query does not enter Draft, Dry-run, Policy Guard, Pending Confirmation, Execute, Receipt, or Rollback.
- The Query Provider has no tools and cannot execute an operation.
- Deterministic `QueryFacts` is the fact source; optional commentary cannot change it.
- A rejected gate preserves the existing path and is not itself an error.
- Commentary failure degrades to a canonical-only response, not a second Legacy run.
- `evaluate_plan` is not a pure-read migration target.
- Write and compound intents remain on their existing workflows.

### Write Intent

Examples:

- 创建文章草稿
- 创建计划
- 创建 checklist
- 创建 schedule item
- 创建 timeline event
- 修改内容 metadata
- 发布内容

Flow:

```txt
User Input
→ Intent Router
→ Write Boundary
→ Draft
→ Dry-run
→ Policy Guard
→ Pending Confirmation
→ Execute
→ Receipt
→ Rollback if supported
```

Rules:

- 必须生成 draft
- draft 不写数据库
- dry-run 不写数据库
- Policy Guard 失败不得进入 confirmation
- 用户确认前不得 execute
- Execute 成功后必须生成 receipt
- rollback support 必须显式声明

---

## 2. Workflow Stages

### Intent Router

Responsibilities:

- 识别 read / write
- 识别目标模块
- 识别 action type
- 提取必要 entities

Rules:

- 不执行写入
- 不创建 receipt
- 不改变业务数据

### Read / Write Boundary

Responsibilities:

- 阻断 query 意图进入 write flow
- 阻断 write 意图直接 execute

Rules:

- query-only request 不得产生 pending confirmation
- write request 必须进入 draft

### Draft

Responsibilities:

- 创建可检查草案
- 保留 action type
- 保留 target collection
- 保留 proposed payload

Rules:

- 不写数据库
- 不调用 executor
- 不创建业务实体

### Dry-run

Responsibilities:

- 预览写入影响
- 预览冲突
- 预览目标 collection
- 预览 rollback support

Rules:

- 不写数据库
- 不修改现有实体
- 不创建业务实体

### Policy Guard

Responsibilities:

- 检查 action 是否允许
- 检查 payload 是否安全
- 检查是否需要 confirmation
- 检查是否支持 rollback

Rules:

- failure 阻止 pending confirmation
- 不允许 UI 绕过
- 不允许 executor 绕过

### Pending Confirmation

Responsibilities:

- 展示 draft summary
- 展示 dry-run impact
- 展示 policy result
- 展示 rollback support
- 等待用户确认

Rules:

- 用户未确认不得 execute
- 用户取消后不得写入

### Execute

Responsibilities:

- 执行确认后的 action
- 写入本地 Payload / PostgreSQL
- 返回 targetId

Rules:

- 只能执行 confirmed action
- 不能执行过期 confirmation
- 不能执行 policy failed action

### Receipt

Responsibilities:

- 记录 actionType
- 记录 status
- 记录 targetCollection
- 记录 targetId
- 记录 rollbackSupported
- 记录 createdAt

Rules:

- Execute 成功后必须生成
- Execute 失败也应记录失败状态或错误摘要
- 不记录 secrets
- 不记录 raw prompt
- 不记录 hidden reasoning

### Rollback

Responsibilities:

- 对支持 rollback 的本地写入提供回滚策略
- 展示 rollback availability
- 记录 rollback result
- 对支持 plan linkage 的写入，rollback 时清理关联 Plan.linkedContent

Rules:

- rollback support 必须显式声明
- 不承诺外部系统 rollback
- 不承诺分布式事务 rollback
- Plan.linkedContent cleanup 属于 rollback 一致性修复，不允许 dangling reference

---

## 3. Planning Execution Lifecycle

The Agent manages the full lifecycle from Plan through Checklist/ScheduleItem
to Progress tracking:

```
Plan
  → Checklist.planId                     (D2-A1)
  → Checklist groups/items (embedded)    (v1)
  → ScheduleItem.relatedPlan             (D2-A3a)
  → ScheduleItem.relatedChecklist
  → ScheduleItem.relatedChecklistItemKey
  → Schedule or Checklist item completion
  → Plan.progress auto-sync              (D2-A2)
  → TimelineEvent.relatedPlan
  → TimelineEvent.relatedChecklist
  → TimelineEvent.relatedScheduleItem
  → TimelineEvent.relatedTaskKey
  → Plan.linkedContent(schedule-items)   (D2-A3a)
  → Receipt (AgentRun + AgentActionReceipt)
  → Rollback (Schedule / Checklist / Plan / Timeline)
```

### Currently Implemented

- Checklist.planId → Plan bidirectional link
- Plan.progress auto-sync (hook, derived from checklist completion rate)
- ScheduleItem → Plan / Checklist / embedded ChecklistItem exact linkage
- Manual and confirmed-Agent Schedule completion share one transactional service
- Completion → linked TimelineEvent (deterministic)
- Completion and rollback refresh Plan / Checklist / Schedule / Timeline views
- Receipt and server-owned rollback source ID for supported write actions
- Exact Schedule completion can be pre-resolved without a Provider only when
  execute mode, actor-authorized context, positive ID, exact title, and
  `planned` status all agree; all other forms remain fail-closed

### Not Yet Implemented (v1 scope boundary)

- ChecklistItem as independent collection (current: embedded)
- Task collection
- Auto-rescheduling
- External Calendar integration
- Legacy data planId backfill

---

## 4. Protected Modules

- Agent pipeline
- Executor
- Policy Guard
- rollback
- AgentActionReceipt
- Payload schema
- migration
- LangGraph runtime / checkpoint / adapter
- Planning workflow (including Checklist.planId, Plan.progress sync)
- Schedule workflow (including Plan.linkedContent, rollback cleanup)
- protected tests

Rules:

- 未明确要求不得修改
- 必须先只读审计
- 必须输出风险分析
- 必须给出最小变更方案
- 必须运行对应测试
