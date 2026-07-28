# Agent Core Linkage and UI Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent 或 Dashboard 创建、完成和回滚 Plan、Checklist、ScheduleItem、TimelineEvent 后，四类对象保持确定性关联，并能在现有 Dashboard 中即时显示、互相跳转。

**Architecture:** Payload 关系字段保存可信 ID；一个 server-only 核心关联服务统一 Plan `linkedContent`、Checklist 精确条目完成和 Timeline 关系；Agent 与 Dashboard 的日程完成入口复用同一业务操作；API 只返回最小关联摘要；DashboardShell 统一管理跨视图导航，客户端通过单一领域刷新事件更新已挂载视图。模型不参与 ID 解析、事实计算、授权或写入。

**Tech Stack:** TypeScript, Next.js App Router, Payload CMS 3, React 19, motion/react, Node test runner, Playwright, PostgreSQL migrations.

## Global Constraints

- 保持现有 Agent 写入的 Draft → Dry-run → Policy Guard → Confirmation →
  Execute → Receipt → Rollback 边界。Dashboard 用户直接发起的手动状态更新
  继续使用服务端认证与确定性业务操作，不伪装成 Agent Receipt。
- 不修改 LangGraph topology、Router/Orchestrator Prompt、默认 Agent runtime 或 Legacy compatibility。
- 不新增依赖，不调用 DeepSeek 或其他 Provider。
- 不使用标题模糊匹配推导关系；只接受持久化且已授权的正整数 ID。
- `ScheduleItem.createdBy` 始终是 `"manual" | "agent"` 来源标记，不是用户 ID。
- Public Site 继续只显示 `published + public` 内容；Dashboard API 不返回完整关联文档。
- 不修改或提交用户现有的 `outputs/`。
- 每个任务先运行 RED，再写最小实现，再运行 GREEN；不得先批量写完再补测试。

---

## File and Responsibility Map

### Shared contracts and deterministic services

- `src/lib/core-linkage/contracts.ts`
  - `LinkedObjectSummary`
  - `LinkedObjectNavigationTarget`
  - `DomainRefreshDetail`
  - `AffectedDocumentSummary`
  - collection-to-domain mapping
- `src/lib/core-linkage/plan-links.ts`
  - normalize, append, remove and deduplicate `Plan.linkedContent`
- `src/lib/core-linkage/checklist-item-key.ts`
  - build and match the persisted deterministic Schedule-to-Checklist item key
- `src/lib/core-linkage/service.ts`
  - exact resource loading, trusted Plan derivation, Timeline relation linking and compensation
- `src/lib/core-linkage/checklist-completion.ts`
  - complete one embedded Checklist item by persisted item key
- `src/lib/schedule/complete-schedule-item.ts`
  - shared Schedule `status -> done` operation and combined rollback snapshot

### Payload and migrations

- `src/collections/TimelineEvent.ts`
  - add indexed `relatedPlan` and `relatedScheduleItem`
- `src/payload-types.ts`
  - regenerated Payload types
- `src/migrations/20260728_add_core_timeline_linkage.ts`
  - columns, indexes, foreign keys and deterministic historical backfill
- `src/migrations/20260728_add_core_timeline_linkage.json`
  - generated Payload snapshot
- `src/migrations/index.ts`
  - register the migration

### Existing write paths

- `src/lib/agent/checklist-resolvers.ts`
  - Checklist completion Timeline upsert uses new relation fields and Plan link service
- `src/lib/agent/tools/checklist-complete.ts`
  - compensation and affected-document output for Checklist completion
- `src/lib/agent/tools/checklist-rollback.ts`
  - snapshot `relatedPlan` and `relatedScheduleItem`
- `src/lib/agent/workflows/timeline-composer.ts`
  - derive typed Plan/Checklist relation fields from trusted persisted source
- `src/lib/agent/tools/timeline-tools.ts`
  - validate source, write Plan link, compensate on failure
- `src/lib/agent/write-schemas.ts`
  - allow the two new Timeline fields
- `src/lib/agent/tools/modify-record.ts`
  - route confirmed Schedule completion through the shared operation
- `src/lib/agent/tool-shared.ts`
- `src/lib/agent/tool-registry.ts`
- `src/lib/agent/chat-pipeline/execute-and-persist-step.ts`
- `src/lib/agent/schemas.ts`
  - carry sanitized affected-document summaries to the successful response
- `src/lib/agent/rollback.ts`
  - restore Schedule, Checklist, Timeline and Plan-link state in reverse order

### Dashboard APIs

- `src/app/api/agent/plans/route.ts`
- `src/app/api/agent/checklist/route.ts`
- `src/app/api/agent/schedule/route.ts`
- `src/app/api/agent/timeline/route.ts`
  - return shared minimum summaries; Schedule PUT uses authenticated administrator + shared completion

### Reusable Dashboard UI

- `src/components/dashboard/linked-objects/LinkedObjectBadge.tsx`
- `src/components/dashboard/linked-objects/LinkedObjectLink.tsx`
- `src/components/dashboard/linked-objects/LinkedObjectList.tsx`
- `src/components/dashboard/linked-objects/LinkedObjectNavigationContext.tsx`
- `src/components/dashboard/linked-objects/useDomainRefresh.ts`
- `src/components/dashboard/linked-objects/index.ts`
  - one reusable display/navigation/refresh system
- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/DashboardRightPanel.tsx`
- `src/components/dashboard/agent/PersistedPlanListPanel.tsx`
- `src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx`
- `src/components/dashboard/checklist/ChecklistView.tsx`
- `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- `src/components/dashboard/timeline/TimelineView.tsx`
  - consume the shared contracts and focus targets
- `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`
- `src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts`
  - dispatch refresh only after confirmed success or successful rollback
- `src/app/styles/sunny-dashboard-linked-objects.css`
- `src/app/styles/sunny-dashboard.css`
  - reusable relation, focus and highlight styling

---

### Task 1: Establish shared relationship contracts and pure Plan-link operations

**Files:**

- Create: `src/lib/core-linkage/contracts.ts`
- Create: `src/lib/core-linkage/plan-links.ts`
- Create: `tests/agent/planning/core-linkage-plan-links.test.ts`
- Modify: `src/lib/agent/tools/checklist-create.ts`
- Modify: `src/lib/agent/tools/schedule-create-items.ts`

**Interfaces:**

```ts
export type CoreLinkedCollection =
  | "checklists"
  | "schedule-items"
  | "timeline-events";

export type AffectedDocumentSummary = {
  collection: CoreLinkedCollection | "plans";
  documentId: number;
  operation: "create" | "delete" | "update";
};

export function appendPlanLink(
  current: unknown,
  link: { relationTo: CoreLinkedCollection; value: number },
): NonNullable<Plan["linkedContent"]>;

export function removePlanLink(
  current: unknown,
  link: { relationTo: CoreLinkedCollection; value: number },
): NonNullable<Plan["linkedContent"]>;
```

- [ ] Write tests proving unrelated links are preserved, duplicate links collapse, relationship objects and numeric values normalize, malformed structures fail closed, and removal is idempotent.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/core-linkage-plan-links.test.ts
```

Expected: module import fails because `src/lib/core-linkage/plan-links.ts` does not exist.

- [ ] Implement the shared types and pure helpers. Move the generic normalization logic out of `checklist-create.ts`; keep the existing exported Checklist-specific helper as a compatibility wrapper until all callers are migrated.
- [ ] Replace Schedule creation’s raw array append with `appendPlanLink`.
- [ ] Run GREEN with the same command, then run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/planning/checklist-plan-linkage.test.ts \
tests/agent/schedule/create-schedule-items-execute.test.ts \
tests/agent/schedule/schedule-rollback-plan-cleanup.test.ts
```

- [ ] Commit:

```bash
git add src/lib/core-linkage/contracts.ts src/lib/core-linkage/plan-links.ts \
  src/lib/agent/tools/checklist-create.ts src/lib/agent/tools/schedule-create-items.ts \
  tests/agent/planning/core-linkage-plan-links.test.ts
git commit -m "refactor(agent): centralize core plan links"
```

### Task 2: Add TimelineEvent relationship schema and deterministic migration

**Files:**

- Modify: `src/collections/TimelineEvent.ts`
- Modify: `src/lib/agent/write-schemas.ts`
- Modify: `src/payload-types.ts`
- Create: `src/migrations/20260728_add_core_timeline_linkage.ts`
- Create: `src/migrations/20260728_add_core_timeline_linkage.json`
- Modify: `src/migrations/index.ts`
- Create: `tests/agent/planning/core-linkage-migration.test.ts`

**Schema:**

```ts
{
  name: "relatedPlan",
  type: "relationship",
  relationTo: "plans",
  index: true,
}

{
  name: "relatedScheduleItem",
  type: "relationship",
  relationTo: "schedule-items",
  index: true,
}
```

**Migration behavior:**

- add `timeline_events.related_plan_id`;
- add `timeline_events.related_schedule_item_id`;
- add `SET NULL` foreign keys and indexes;
- derive `related_plan_id` only through
  `timeline_events.related_checklist_id -> checklists.plan_id`;
- insert missing `plans_rels` rows with `path = 'linkedContent'` and
  `timeline_events_id`, preserving all existing relation rows;
- use `NOT EXISTS` for idempotency;
- down migration drops only the new indexes, foreign keys and columns.

- [ ] Write a migration contract test that imports `up` and `down` with a recording DB adapter and asserts the deterministic join, `NOT EXISTS`, no title comparison, no delete of Timeline rows, and safe down behavior.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/core-linkage-migration.test.ts
```

Expected: migration module is missing.

- [ ] Add the two collection fields and `validateTimelineEventData` fields.
- [ ] Generate the migration and types using a non-production disposable database URL:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
DATABASE_URL="$SUNNYPANEL_TEST_DATABASE_URL" \
npm run migrate:create -- 20260728_add_core_timeline_linkage

PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
DATABASE_URL="$SUNNYPANEL_TEST_DATABASE_URL" \
npm run generate:types
```

- [ ] Add the deterministic data backfill to the generated `up`, verify `down`, and register it in `src/migrations/index.ts`.
- [ ] Run GREEN and:

```bash
env -u DATABASE_URL npm run typecheck
```

- [ ] Commit:

```bash
git add src/collections/TimelineEvent.ts src/lib/agent/write-schemas.ts \
  src/payload-types.ts src/migrations/20260728_add_core_timeline_linkage.ts \
  src/migrations/20260728_add_core_timeline_linkage.json src/migrations/index.ts \
  tests/agent/planning/core-linkage-migration.test.ts
git commit -m "feat(agent): add core timeline relationships"
```

### Task 3: Build the deterministic core linkage service

**Files:**

- Create: `src/lib/core-linkage/service.ts`
- Create: `tests/agent/planning/core-linkage-service.test.ts`

**Interfaces:**

```ts
export type CoreLinkageActor = {
  isAdministrator: true;
  userId: number;
};

export type CoreLinkageFailureCode =
  | "invalid_reference"
  | "resource_not_found"
  | "resource_not_authorized"
  | "plan_link_invalid"
  | "plan_link_write_failed"
  | "compensation_failed";

export async function resolveChecklistPlanId(input: {
  checklistId: number;
  payload: CoreLinkagePayload;
}): Promise<CoreLinkageResult>;

export async function linkTimelineToPlan(input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
}): Promise<CoreLinkagePlanMutationResult>;

export async function unlinkTimelineFromPlan(input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
}): Promise<CoreLinkagePlanMutationResult>;
```

- [ ] Write fake-Payload tests for positive integer validation, exact `findByID`, deleted/missing resources, no title search, idempotent append/remove, before snapshots, safe error codes and compensation failure.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/core-linkage-service.test.ts
```

- [ ] Implement the server-only service. Catch Payload exceptions at the boundary and return only typed safe failures; never return raw document data in an error.
- [ ] Run GREEN and typecheck.
- [ ] Commit:

```bash
git add src/lib/core-linkage/service.ts \
  tests/agent/planning/core-linkage-service.test.ts
git commit -m "feat(agent): add deterministic core linkage service"
```

### Task 4: Close Checklist completion to Plan and Timeline

**Files:**

- Create: `src/lib/core-linkage/checklist-completion.ts`
- Create: `src/lib/core-linkage/checklist-item-key.ts`
- Modify: `src/lib/agent/checklist-resolvers.ts`
- Modify: `src/lib/agent/schedule/readiness-gate.ts`
- Modify: `src/lib/agent/tools/checklist-complete.ts`
- Modify: `src/lib/agent/tools/checklist-rollback.ts`
- Modify: `src/lib/agent/rollback.ts`
- Create: `tests/agent/planning/checklist-timeline-plan-linkage.test.ts`
- Extend: `tests/agent/planning/complete-checklist-item-timeline-rollback.test.ts`

**Interfaces:**

```ts
export async function completeChecklistItemByKey(input: {
  checklistId: number;
  completedAt: string;
  completionNote?: null | string;
  itemKey: string;
  payload: ChecklistCompletionPayload;
}): Promise<ChecklistItemCompletionResult>;

export function buildChecklistItemReferenceKey(input: {
  groupIndex: number;
  itemIndex: number;
  title: string;
}): string;
```

**Behavior:**

- exact Checklist ID and item key only;
- an item matches only when `relatedChecklistItemKey` equals its persisted
  embedded item ID or the canonical key generated by
  `buildChecklistItemReferenceKey`; no partial or fuzzy title comparison;
- `schedule/readiness-gate.ts` uses the same key builder so newly created
  ScheduleItems and completion resolution cannot drift;
- preserve all other groups/items;
- let the existing Checklist hook recalculate Plan progress;
- Checklist Timeline upsert writes `relatedChecklist`, `relatedTaskKey`,
  `relatedPlan`;
- append the Timeline event to Plan `linkedContent`;
- on Plan-link failure, restore the prior event or delete the new event, then
  restore Checklist groups;
- rollback removes the Plan link before deleting a new event, or restores a
  pre-existing event and prior Plan link.

- [ ] Write RED tests for the fields, Plan link, idempotent repeat, Plan progress hook call, compensation ordering and rollback restoration.
- [ ] Add key-contract tests for current `groupIndex-itemIndex-title` fixtures,
  embedded item IDs, title changes failing closed and duplicate keys failing
  closed.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/planning/checklist-timeline-plan-linkage.test.ts \
tests/agent/planning/complete-checklist-item-timeline-rollback.test.ts
```

- [ ] Implement the exact-key helper and integrate it after the existing Agent title resolver has selected a unique persisted item.
- [ ] Extend the rollback snapshot with Timeline Plan/Schedule relations and Plan `linkedContent` before state.
- [ ] Return affected documents for Checklist, Timeline and Plan.
- [ ] Run GREEN plus:

```bash
npm run test:agent:planning:h4b-h4c-h4d
```

- [ ] Commit:

```bash
git add src/lib/core-linkage/checklist-completion.ts \
  src/lib/core-linkage/checklist-item-key.ts \
  src/lib/agent/checklist-resolvers.ts src/lib/agent/tools/checklist-complete.ts \
  src/lib/agent/schedule/readiness-gate.ts \
  src/lib/agent/tools/checklist-rollback.ts src/lib/agent/rollback.ts \
  tests/agent/planning/checklist-timeline-plan-linkage.test.ts \
  tests/agent/planning/complete-checklist-item-timeline-rollback.test.ts
git commit -m "feat(agent): link checklist completion timeline"
```

### Task 5: Implement one shared Schedule completion operation

**Files:**

- Create: `src/lib/schedule/complete-schedule-item.ts`
- Create: `tests/agent/schedule/schedule-completion-linkage.test.ts`
- Create: `tests/agent/schedule/schedule-completion-compensation.test.ts`

**Interface:**

```ts
export async function completeScheduleItem(input: {
  actor: CoreLinkageActor;
  additionalPatch?: Omit<ScheduleRecordPatch, "status">;
  completedAt?: string;
  itemId: number;
  payload: ScheduleCompletionPayload;
}): Promise<ScheduleCompletionResult>;
```

**Three cases:**

1. exact `relatedChecklist + relatedChecklistItemKey`: complete that item,
   derive Plan from Schedule or Checklist, create/update one Schedule-keyed
   Timeline event;
2. Plan-only: do not mutate Plan progress, create/update a Plan-linked event;
3. standalone: mutate only Schedule status and one Schedule-linked event.

The event uniqueness query is exact `relatedScheduleItem = itemId`. A repeated
completion returns `changed: false` when all persisted state already matches.

- [ ] Write RED tests for all three cases, exact key behavior, Plan-source precedence, no fuzzy lookup, duplicate prevention, and reverse-order compensation.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/schedule/schedule-completion-linkage.test.ts \
tests/agent/schedule/schedule-completion-compensation.test.ts
```

- [ ] Implement the operation with full before snapshots for Schedule fields,
  optional Checklist groups, Timeline event and Plan links.
- [ ] Return a `restore_schedule_completion` rollback payload and affected
  document summaries.
- [ ] Run GREEN and the existing schedule suite.
- [ ] Commit:

```bash
git add src/lib/schedule/complete-schedule-item.ts \
  tests/agent/schedule/schedule-completion-linkage.test.ts \
  tests/agent/schedule/schedule-completion-compensation.test.ts
git commit -m "feat(agent): complete linked schedule items"
```

### Task 6: Fix Schedule API authorization and wire the manual completion button

**Files:**

- Modify: `src/app/api/agent/schedule/route.ts`
- Modify: `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- Create: `tests/agent/schedule/schedule-status-api-auth.test.ts`
- Extend: `tests/agent/schedule/schedule-summary-linkage.test.ts`

**Authorization contract:**

- `getPayloadAuthResult().user` is required;
- the authenticated `users` collection is the current administrator
  capability;
- ignore client-supplied actor, role and `createdBy`;
- never compare `createdBy` with `user.id`;
- both `"manual"` and `"agent"` ScheduleItems are mutable by the authenticated
  administrator.

- [ ] Write RED tests: unauthenticated 401, malformed input 400, authenticated
  manual/agent items succeed, forged body role does not grant access, and
  `status = done` calls `completeScheduleItem`.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/schedule/schedule-status-api-auth.test.ts
```

- [ ] Replace the false ownership check. For `done`, call the shared operation;
  for planned/skipped/canceled, keep a direct authenticated scalar update only
  while the current item is not `done`. A completed item returns 409 and must
  be restored through the supported rollback path so Checklist, Timeline and
  Plan state cannot drift.
- [ ] Return `{ success, affectedDocuments, item }` with minimum fields.
- [ ] Wire the existing “完成” button to PUT, disable it during the request,
  preserve current data on failure, and show a bounded retryable error.
- [ ] Run GREEN plus the schedule summary tests.
- [ ] Commit:

```bash
git add src/app/api/agent/schedule/route.ts \
  src/components/dashboard/schedule/ScheduleMonthView.tsx \
  tests/agent/schedule/schedule-status-api-auth.test.ts \
  tests/agent/schedule/schedule-summary-linkage.test.ts
git commit -m "fix(agent): authorize and complete schedule items"
```

### Task 7: Route confirmed Agent Schedule completion and expose every core write impact

**Files:**

- Modify: `src/lib/agent/tools/modify-record.ts`
- Modify: `src/lib/agent/tools/plan-create.ts`
- Modify: `src/lib/agent/tools/checklist-create.ts`
- Modify: `src/lib/agent/tools/schedule-create-items.ts`
- Modify: `src/lib/agent/tools/timeline-tools.ts`
- Modify: `src/lib/agent/tool-shared.ts`
- Modify: `src/lib/agent/tool-registry.ts`
- Modify: `src/lib/agent/schemas.ts`
- Modify: `src/lib/agent/chat-pipeline/execute-and-persist-step.ts`
- Modify: `src/lib/agent/rollback.ts`
- Create: `tests/agent/schedule/schedule-completion-agent-path.test.ts`
- Extend: `tests/agent/modify-record.test.ts`

**Response contract:**

```ts
export type AgentToolResult = {
  affectedDocuments?: AffectedDocumentSummary[];
  assistantMessage: string;
  pendingAction: null | PendingAction;
  rollbackPayload?: unknown;
  status?: "completed" | "failed";
};
```

- [ ] Write RED tests proving an unconfirmed `modify_record` still only returns
  a proposal, confirmed `schedule.status = done` calls the shared operation
  once, additional scalar fields are included in the combined snapshot, and
  no duplicate model/tool call is introduced.
- [ ] Add RED coverage proving successful Plan creation, Checklist creation,
  Schedule creation, Checklist completion, Schedule completion, explicit
  Timeline creation and scalar modification each expose sanitized
  `affectedDocuments`. Derived Plan and Timeline mutations must be included,
  not only the primary created document.
- [ ] Add `affectedDocuments` to the sanitized `AgentChatResponse` parser and
  terminal response without exposing snapshots.
- [ ] Implement `restore_schedule_completion` in rollback: Plan link,
  Timeline, Checklist groups, Schedule fields, in that reverse order; repeated
  rollback must be safe.
- [ ] Run RED/GREEN:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/schedule/schedule-completion-agent-path.test.ts \
tests/agent/modify-record.test.ts \
tests/agent/rollback.test.ts
```

- [ ] Run:

```bash
env -u DATABASE_URL npm run typecheck
npm run test:agent:schedule
```

- [ ] Commit:

```bash
git add src/lib/agent/tools/modify-record.ts src/lib/agent/tools/plan-create.ts \
  src/lib/agent/tools/checklist-create.ts \
  src/lib/agent/tools/schedule-create-items.ts \
  src/lib/agent/tools/timeline-tools.ts src/lib/agent/tool-shared.ts \
  src/lib/agent/tool-registry.ts src/lib/agent/schemas.ts \
  src/lib/agent/chat-pipeline/execute-and-persist-step.ts \
  src/lib/agent/rollback.ts \
  tests/agent/schedule/schedule-completion-agent-path.test.ts \
  tests/agent/modify-record.test.ts
git commit -m "feat(agent): unify schedule completion execution"
```

### Task 8: Link explicit Timeline composition without changing its safety boundary

**Files:**

- Modify: `src/lib/agent/workflows/timeline-composer.ts`
- Modify: `src/lib/agent/tools/timeline-tools.ts`
- Create: `tests/agent/planning/timeline-composer-core-linkage.test.ts`

**Behavior:**

- `sourceType = plan` requires a persisted Plan ID and writes `relatedPlan`;
- `sourceType = checklist_item` requires persisted Checklist ID + item key and
  derives Plan from `Checklist.planId`;
- other current source types keep existing behavior;
- Timeline creation occurs only after the current confirmation;
- Plan link failure compensates Timeline creation or restores the prior event.

- [ ] Write RED tests for Plan source, Checklist source, invalid/deleted IDs,
  no title inference, preview-only no write, and Plan-link compensation.
- [ ] Run RED/GREEN:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/planning/timeline-composer-core-linkage.test.ts \
tests/agent/planning/timeline-event-semantics.test.ts \
tests/agent/planning/timeline-event-rollback.test.ts
```

- [ ] Commit:

```bash
git add src/lib/agent/workflows/timeline-composer.ts \
  src/lib/agent/tools/timeline-tools.ts \
  tests/agent/planning/timeline-composer-core-linkage.test.ts
git commit -m "feat(agent): link explicit timeline events"
```

### Task 9: Return minimum linked-object summaries from all four APIs

**Files:**

- Modify: `src/lib/core-linkage/contracts.ts`
- Modify: `src/app/api/agent/plans/route.ts`
- Modify: `src/app/api/agent/checklist/route.ts`
- Modify: `src/app/api/agent/schedule/route.ts`
- Modify: `src/app/api/agent/timeline/route.ts`
- Create: `tests/agent/planning/core-linkage-api.test.ts`

**Shared summary:**

```ts
export type LinkedObjectSummary =
  | { type: "plan"; id: number; title: string }
  | { type: "checklist"; id: number; title: string }
  | {
      type: "schedule";
      id: number;
      title: string;
      date: string;
      status: string | null;
    }
  | {
      type: "timeline";
      id: number;
      title: string;
      date: string;
      status: string | null;
    };
```

- [ ] RED tests cover:
  - Plans: Checklist, Schedule and Timeline arrays;
  - Checklist: owning Plan, Schedule and Timeline arrays;
  - Schedule: Plan, Checklist and completion Timeline;
  - Timeline: Plan, Checklist and Schedule;
  - missing/inaccessible related resources omitted;
  - no full document, groups, prompt, Agent metadata or secrets.
- [ ] Run RED/GREEN:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/core-linkage-api.test.ts
```

- [ ] Move `PlanSummary` and view summary types out of route modules into the
  shared contract file so client components never import a route module.
- [ ] Commit:

```bash
git add src/lib/core-linkage/contracts.ts src/app/api/agent/plans/route.ts \
  src/app/api/agent/checklist/route.ts src/app/api/agent/schedule/route.ts \
  src/app/api/agent/timeline/route.ts \
  tests/agent/planning/core-linkage-api.test.ts
git commit -m "feat(agent): expose core linked object summaries"
```

### Task 10: Build reusable relationship components

**Files:**

- Create: `src/components/dashboard/linked-objects/LinkedObjectBadge.tsx`
- Create: `src/components/dashboard/linked-objects/LinkedObjectLink.tsx`
- Create: `src/components/dashboard/linked-objects/LinkedObjectList.tsx`
- Create: `src/components/dashboard/linked-objects/index.ts`
- Create: `src/app/styles/sunny-dashboard-linked-objects.css`
- Modify: `src/app/styles/sunny-dashboard.css`
- Create: `tests/agent/planning/linked-object-components.test.tsx`

- [ ] Write render tests for all four summary variants, empty/collapsed/expanded
  list states, unavailable target, accessible button names, short Chinese
  labels and no raw ID as the primary label.
- [ ] Run RED:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/linked-object-components.test.tsx
```

- [ ] Implement with `AppBadge`, `AppButton` or the existing button semantics
  and `DashboardIcon`; do not copy four page-specific relation markups.
- [ ] Add token-based focus/highlight/disabled styles, including dark mode and
  reduced-motion handling.
- [ ] Run GREEN, typography check and lint on these files.
- [ ] Commit:

```bash
git add src/components/dashboard/linked-objects \
  src/app/styles/sunny-dashboard-linked-objects.css \
  src/app/styles/sunny-dashboard.css \
  tests/agent/planning/linked-object-components.test.tsx
git commit -m "feat(dashboard): add linked object components"
```

### Task 11: Add in-Dashboard navigation and destination focus

**Files:**

- Create: `src/components/dashboard/linked-objects/LinkedObjectNavigationContext.tsx`
- Modify: `src/components/dashboard/linked-objects/index.ts`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/components/dashboard/DashboardRightPanel.tsx`
- Modify: `src/components/dashboard/agent/PersistedPlanListPanel.tsx`
- Modify: `src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx`
- Modify: `src/components/dashboard/checklist/ChecklistView.tsx`
- Modify: `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- Modify: `src/components/dashboard/timeline/TimelineView.tsx`
- Create: `tests/agent/planning/linked-object-navigation.test.tsx`

**Target:**

```ts
export type LinkedObjectNavigationTarget =
  | { type: "plan"; id: number }
  | { type: "checklist"; id: number }
  | { type: "schedule"; id: number; date: string }
  | { type: "timeline"; id: number; date: string };
```

- [ ] RED tests cover target-to-mode mapping, month derivation, target ID
  preservation and Plan inspector selection.
- [ ] Implement a provider owned by DashboardShell:
  - Plan: `activeMode = agent`, `activeInspectorTab = plans`,
    `panelOpen = true`;
  - Checklist: `activeMode = checklist`;
  - Schedule: `activeMode = schedule`, pass date and ID;
  - Timeline: `activeMode = timeline`, pass date and ID.
- [ ] Destination views use a target prop to set period/filter, expand the
  record, scroll after data load and apply a temporary restrained highlight.
- [ ] Never call `setThreadId`, reload the page or push a new route.
- [ ] Run RED/GREEN:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/planning/linked-object-navigation.test.tsx \
tests/agent/dashboard.test.ts
```

- [ ] Commit:

```bash
git add src/components/dashboard/linked-objects \
  src/components/dashboard/DashboardShell.tsx \
  src/components/dashboard/DashboardRightPanel.tsx \
  src/components/dashboard/agent/PersistedPlanListPanel.tsx \
  src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx \
  src/components/dashboard/checklist/ChecklistView.tsx \
  src/components/dashboard/schedule/ScheduleMonthView.tsx \
  src/components/dashboard/timeline/TimelineView.tsx \
  tests/agent/planning/linked-object-navigation.test.tsx
git commit -m "feat(dashboard): navigate linked core objects"
```

### Task 12: Render complete relationships on Plan, Checklist, Schedule and Timeline

**Files:**

- Modify: `src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx`
- Modify: `src/components/dashboard/checklist/ChecklistView.tsx`
- Modify: `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- Modify: `src/components/dashboard/timeline/TimelineView.tsx`
- Extend: `tests/agent/planning/persisted-plan-visibility.test.ts`
- Extend: `tests/agent/schedule/schedule-summary-linkage.test.ts`
- Create: `tests/agent/planning/core-linkage-view-contract.test.tsx`

- [ ] RED tests require:
  - Plan counts and lists for Checklist/Schedule/Timeline;
  - Checklist owning Plan plus Schedule/Timeline;
  - Schedule Plan/Checklist/item key plus Timeline;
  - Timeline Plan/Checklist/Schedule;
  - all valid objects rendered through `LinkedObjectList` or
    `LinkedObjectLink`;
  - safe empty state for missing relationships.
- [ ] Replace duplicated relation markup with the shared components while
  retaining each view’s existing status/progress content.
- [ ] Keep copy concise: object, status, action; no internal implementation
  wording.
- [ ] Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test \
tests/agent/planning/core-linkage-view-contract.test.tsx \
tests/agent/planning/persisted-plan-visibility.test.ts \
tests/agent/schedule/schedule-summary-linkage.test.ts
```

- [ ] Commit:

```bash
git add src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx \
  src/components/dashboard/checklist/ChecklistView.tsx \
  src/components/dashboard/schedule/ScheduleMonthView.tsx \
  src/components/dashboard/timeline/TimelineView.tsx \
  tests/agent/planning/core-linkage-view-contract.test.tsx \
  tests/agent/planning/persisted-plan-visibility.test.ts \
  tests/agent/schedule/schedule-summary-linkage.test.ts
git commit -m "feat(dashboard): show core object relationships"
```

### Task 13: Add mutation and rollback refresh without polling

**Files:**

- Create: `src/components/dashboard/linked-objects/useDomainRefresh.ts`
- Modify: `src/components/dashboard/linked-objects/index.ts`
- Modify: `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`
- Modify: `src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts`
- Modify: `src/components/dashboard/agent/PersistedPlanListPanel.tsx`
- Modify: `src/components/dashboard/checklist/ChecklistView.tsx`
- Modify: `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- Modify: `src/components/dashboard/timeline/TimelineView.tsx`
- Create: `tests/agent/planning/domain-refresh.test.tsx`

**Event:**

```ts
export const DOMAIN_REFRESH_EVENT = "sunny:domain-refresh";

export type DomainRefreshDetail = {
  domains: Array<"plans" | "checklists" | "schedule" | "timeline">;
  ids?: number[];
  reason: "agent_execute" | "manual_update" | "completion" | "rollback";
};
```

- [ ] RED tests cover collection-to-domain mapping, deduplication, one
  notification per completed turn, rollback mapping, irrelevant-domain ignore
  and cleanup on unmount.
- [ ] Dispatch after:
  - successful confirmed Agent response using `affectedDocuments`;
  - successful artifact rollback;
  - successful selected-run rollback;
  - successful direct Schedule completion.
- [ ] Subscribe each view to its own domain and call its existing loader. Keep
  prior data when refetch fails.
- [ ] Do not change SSE events, add polling, or clear the current thread.
- [ ] Run RED/GREEN:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
node --import tsx --test tests/agent/planning/domain-refresh.test.tsx
```

- [ ] Commit:

```bash
git add src/components/dashboard/linked-objects \
  src/components/dashboard/agent-chat/use-agent-chat-messaging.ts \
  src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts \
  src/components/dashboard/agent/PersistedPlanListPanel.tsx \
  src/components/dashboard/checklist/ChecklistView.tsx \
  src/components/dashboard/schedule/ScheduleMonthView.tsx \
  src/components/dashboard/timeline/TimelineView.tsx \
  tests/agent/planning/domain-refresh.test.tsx
git commit -m "feat(dashboard): refresh linked domains after writes"
```

### Task 14: Complete browser verification, docs and full deterministic closure

**Files:**

- Create: `tests/e2e/dashboard-core-linkage.spec.ts`
- Modify: `tests/e2e/helpers/dashboard-shell.ts`
- Modify: `tests/TEST_MAP.md`
- Modify: `docs/system-architecture.md`
- Modify: `docs/agent-workflow-v1.md`
- Modify: `docs/design/planning-execution-lifecycle.md`
- Modify: `docs/features/planning.md`
- Modify: `docs/features/schedule.md`
- Modify: `docs/features/timeline.md`

- [ ] Add non-production authenticated browser coverage as two separate
  journeys:

  **Manual Dashboard completion**

  1. seed one Plan, Checklist, exact Checklist item and linked Schedule;
  2. complete Schedule from Dashboard;
  3. assert Schedule done, Checklist item complete, Plan progress updated;
  4. assert one Timeline event with Plan/Checklist/Schedule links;
  5. navigate Timeline → Plan → Checklist → Schedule without losing
     `threadId`.

  **Confirmed Agent completion and rollback**

  1. seed a second equivalent linked object set;
  2. request and confirm Schedule completion through the Agent;
  3. assert Receipt/rollback metadata exists;
  4. execute the supported rollback;
  5. assert Schedule, Checklist, Plan progress, Timeline and Plan links return
     to their before state and all four views refresh.
- [ ] Run the E2E test against the local non-production database:

```bash
AGENT_E2E_EMAIL="$AGENT_E2E_EMAIL" \
AGENT_E2E_PASSWORD="$AGENT_E2E_PASSWORD" \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
./node_modules/.bin/playwright test tests/e2e/dashboard-core-linkage.spec.ts
```

- [ ] Update docs from “deferred” to “implemented” only after the E2E
  assertions pass. Record the new tests in `tests/TEST_MAP.md` without
  weakening protected entries.
- [ ] Run the deterministic baseline:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

- [ ] Run migration verification against a disposable database:

```bash
PAYLOAD_SECRET="$PAYLOAD_SECRET" \
DATABASE_URL="$SUNNYPANEL_TEST_DATABASE_URL" \
npm run migrate
```

- [ ] Verify `git status --short` contains no generated secrets, raw Payload
  records, Provider data, E2E credentials, temporary reports or `outputs/`
  additions.
- [ ] Commit:

```bash
git add tests/e2e/dashboard-core-linkage.spec.ts \
  tests/e2e/helpers/dashboard-shell.ts tests/TEST_MAP.md \
  docs/system-architecture.md docs/agent-workflow-v1.md \
  docs/design/planning-execution-lifecycle.md \
  docs/features/planning.md docs/features/schedule.md docs/features/timeline.md
git commit -m "test(agent): verify core linkage experience"
```

---

## Final Acceptance Checklist

- [ ] TimelineEvent has optional typed Plan and ScheduleItem relationships.
- [ ] Checklist completion creates one Plan-linked Timeline event.
- [ ] exact Checklist-backed Schedule completion updates Checklist and Plan
  progress.
- [ ] Plan-only and standalone Schedule completion do not fabricate progress.
- [ ] repeated completion and rollback are idempotent.
- [ ] failure compensation leaves no dangling Timeline or Plan link.
- [ ] deterministic migration backfills only Checklist-derived Plan links.
- [ ] authenticated administrators can complete manual- and Agent-created
  ScheduleItems; unauthenticated callers cannot.
- [ ] all four APIs return minimum summaries and omit inaccessible targets.
- [ ] all four Dashboard surfaces use shared relation components.
- [ ] cross-object navigation preserves the active Agent thread.
- [ ] successful writes and rollbacks refresh affected views without polling.
- [ ] no Provider call, new dependency, Prompt change, runtime switch or
  public visibility regression occurred.
- [ ] deterministic baseline, migration check and browser journey pass.

## Rollback Order

If the feature must be reverted after deployment:

1. revert Dashboard components and refresh/navigation commits;
2. revert API and write-path integration commits;
3. deploy code that no longer reads or writes the new Timeline fields;
4. run the migration down only after step 3;
5. retain Plan, Checklist, ScheduleItem and TimelineEvent business records.

Never drop the new relationship columns while application code still depends
on them.
