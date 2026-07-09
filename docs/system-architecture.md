# System Architecture

## 1. Stack

- TypeScript
- React
- Next.js App Router
- Payload CMS
- PostgreSQL
- Tailwind CSS
- LangGraph
- OpenAI / LLM function calling

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

- 不展示 hidden reasoning
- 不将 raw prompt 进入 UI

### Planning Execution Lifecycle

Responsibilities:

- Plan → Checklist.planId bidirectional linkage
- Checklist item completion → TimelineEvent + Plan.progress auto-sync
- ScheduleItem → Plan.linkedContent (with dedup)
- Rollback cleanup for plan-linked content
- Deterministic conflict detection for schedule items

Implementation status:

- ✅ Checklist.planId (D2-A1)
- ✅ Plan.progress auto-sync hook (D2-A2)
- ✅ ScheduleItem → Plan.linkedContent (D2-A3a)
- ✅ Rollback linkedContent cleanup (D2-A3a-fix)
- ⏳ TimelineEvent.relatedPlan (D2-A3b deferred)

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
