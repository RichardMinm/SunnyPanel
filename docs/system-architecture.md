# System Architecture

## 1. Stack

- TypeScript
- React
- Next.js App Router
- Payload CMS
- PostgreSQL
- Tailwind CSS
- LangGraph
- LangChain Structured Output and streaming model boundaries

---

## 2. Surfaces

### Public Site

Responsibilities:

- 读取 published + public 内容
- 渲染 Home / Blog / Notes / Timeline / About
- 渲染 tags / categories browsing

Rules:

- 不执行写入
- 不显示 Dashboard 私有状态
- 不显示 Agent Trace

### Dashboard

Responsibilities:

- 内容管理
- Agent Workbench
- Planning / Checklist / Schedule / Timeline
- Inspector
- Activity / Receipt / Rollback UI

Rules:

- 写入操作必须走 Agent Workflow 或明确的用户操作确认流程

### Payload / PostgreSQL

Responsibilities:

- 存储内容
- 存储计划
- 存储清单
- 存储日程
- 存储时间线
- 存储 receipt / rollback metadata

Rules:

- schema / migration 属于高风险区域
- 修改前必须只读审计

### Agent Runtime

Responsibilities:

- Router
- Session Coordinator
- Readiness
- Draft
- Dry-run
- Policy Guard
- Pending Confirmation
- Execute
- Receipt
- Rollback

Rules:

- LangChain Structured Orchestrator 是唯一生产 Orchestrator
- 不存在 Orchestrator 运行时选择开关或 Legacy 回退分支
- LangChain 失败返回 typed safe failure，不调用第二个 Orchestrator
- 不展示 hidden reasoning
- 不将 raw prompt 进入 UI

### Planning Execution Lifecycle

Responsibilities:

- Plan → Checklist.planId bidirectional linkage
- Checklist item completion → TimelineEvent.relatedPlan + Plan.progress auto-sync
- ScheduleItem → Plan / Checklist / embedded ChecklistItem exact linkage
- Schedule completion → Checklist item completion → Plan progress → linked Timeline event
- Rollback restores Schedule / Checklist / Plan and removes completion Timeline links
- Dashboard linked-object navigation and retained domain refresh
- Deterministic conflict detection for schedule items

Implementation status:

- ✅ Checklist.planId (D2-A1)
- ✅ Plan.progress auto-sync hook (D2-A2)
- ✅ ScheduleItem → Plan.linkedContent (D2-A3a)
- ✅ Rollback linkedContent cleanup (D2-A3a-fix)
- ✅ TimelineEvent.relatedPlan / relatedScheduleItem / relatedTaskKey
- ✅ Transactional Schedule completion and rollback closure
- ✅ Plan / Checklist / Schedule / Timeline Dashboard linkage and refresh

Completion remains deterministic. The model may classify or extract an
authorized target, but it does not calculate progress, invent relationships, or
write completion state. Both manual Dashboard completion and confirmed Agent
completion call the same core linkage service.

---

## 3. Boundary

Single-user / admin model:

- v1 按单用户 / 管理员模型设计
- 不做多租户
- 不做企业 RBAC
- 不做多人审批

Local-first write model:

- 主要写入本地 Payload / PostgreSQL
- 本地写入可设计 rollback
- 外部系统写入不进入 v1

---

## 4. LangGraph Topology Ownership

Production uses one Full LangGraph and one directly mounted compound subgraph.
The checkpoint-visible node names and their service owners come from
`src/lib/agent/langgraph/topology.ts`; the real graph builders consume the same
constants.

LangGraph owns sequencing, state transition, interruption, resume, and terminal
ordering. It delegates protected behavior to existing services:

- `runBuildContextStep` owns context loading;
- `runOrchestrationStep` owns Orchestrator dispatch;
- `runResolveIntentStep` owns deterministic resolution boundaries;
- `runDryRunAndProposeStep` owns draft, dry-run, and confirmation preparation;
- `runExecuteAndPersistStep` plus `runIdempotentAgentAction` own single-action
  execution and Receipt idempotency;
- `NativeOrchestrationTaskExecutor` owns compound task preparation and execution;
- `createAgentTurnFinalizer` owns terminal turn persistence.

The graph does not reimplement policy, resource validation, Executor, Receipt,
Rollback, or business persistence. The active production adapter always defers
compound execution to the mounted subgraph.

Two compatibility implementations remain classified for L3-E2 parity work:

- the imperative `executeOrchestrationGraph()` runner is test-only;
- inline `runOrchestrationSubgraph()` branches inside `orchestration-step.ts`
  are bypassed by production through `deferCompoundExecution: true`.

The checkpoint namespace remains `sunny-agent:v1:<userId>:<threadId>`. Node
renames or topology-breaking changes require a new version plus an explicit
drain, expiry, or version-routing decision; v1 state must not be reinterpreted
as a newer topology.

---

## 5. Guarded Query Runtime

The Query runtime is a read-only branch inside the existing trusted `preResolvedIntent` production seam. It is not a new Router, LangGraph node, or workflow graph.

### Components

| Component | Responsibility | Source |
| --- | --- | --- |
| Query Runtime Config | Dynamically resolve `legacy/langchain`, `off/admin`, and bounded commentary timeouts. | `src/lib/agent/query/runtime-config.ts` |
| Admin Adoption Gate | Default-deny trusted actor, exact intent, and exact argument eligibility. | `src/lib/agent/query/admin-adoption.ts` |
| Shared QueryFacts Loader | Read current aggregate or plan facts once and build deterministic fact objects. | `src/lib/agent/query/facts-repository.ts`, `facts.ts` |
| Canonical Renderer | Render the authoritative user-visible fact block without a model. | `src/lib/agent/query/langchain-query-agent.ts` |
| Qualitative Projection | Reduce facts to a frozen enum-only state object. | `src/lib/agent/query/qualitative-projection.ts` |
| Provider Input Audit | Verify static protocol, roles, exact keys, serialization, and enum values before a call. | `src/lib/agent/query/qualitative-projection.ts` |
| Buffered Commentary Runner | Make at most one optional model call and buffer the complete stream. | `src/lib/agent/query/qualitative-commentary.ts` |
| Commentary Validator | Reject numbers, resources, execution claims, structure, Markdown, overflow, and unsafe escalation. | `src/lib/agent/query/qualitative-projection.ts` |
| Composer | Keep canonical facts first and append only accepted commentary. | `src/lib/agent/query/qualitative-projection.ts` |
| Observation Collector | Keep at most 200 sanitized process-local observations. | `src/lib/agent/query/admin-adoption-observer.ts` |
| Legacy Query Path | Remain authoritative whenever the dual gate or exact eligibility rejects. | existing chat pipeline |

### Dependency Direction

```text
Runtime / Adoption Gate
→ QueryFacts Loader
→ Canonical Renderer
→ Qualitative Projection
→ Provider Input Audit
→ Buffered Provider Runner
→ Commentary Validator
→ Canonical-first Composer
→ Existing Conversation Persistence
```

Forbidden reverse dependencies:

```text
Provider → QueryFacts mutation
Provider → Database
Provider → Executor
Provider → Router decision
Provider → Resource selection
```

The Provider is downstream and optional. It cannot feed facts or decisions back into the gate, database, Router, or business execution path.

### Deployment and Storage Boundary

- No new LangGraph node or graph transition.
- No checkpoint state or schema change.
- No Payload migration or new business collection.
- No Query-specific durable storage.
- Existing conversation persistence stores the final complete answer.
- Observation collection is bounded, in-process, and non-durable; it is not enterprise audit storage.
- Unset configuration defaults only deterministic Boundary-owned eligible queries to `langchain/admin`; `legacy` and `off` remain independent kill switches.
