# SunnyPanel Agent Workflow v1

Status: frozen for Agent Workflow v1 closure.

This document records the current Agent workflow contract after the Planning, Checklist, Schedule, Timeline, Progress, Safety, and Dashboard closure phases. It is a product and engineering reference for future workflow changes. It does not introduce new behavior.

## 1. Agent v1 Overview

SunnyPanel Agent v1 is a workflow agent for a personal long-term workspace. It coordinates plans, checklists, schedules, timeline events, memory, and rollback-safe writes through a staged pipeline.

Core principles:

- Understanding user intent is not execution.
- Drafting is not database persistence.
- User approval of a draft is not final execution.
- Final writes must pass dry-run, Policy Guard, pending confirmation, execute, receipt, and rollback boundaries.
- Complex workflow requests should clarify or draft before creating write proposals.

High-level flow:

```text
user message
-> Semantic Session Coordinator
-> Intent Router / Arbitration
-> Readiness / Workflow gates
-> Draft or clarification response
-> Prepare creation intent
-> dry-run and Policy Guard
-> pending confirmation
-> execute
-> AgentActionReceipt
-> rollback metadata
-> response / ActionResultCard
```

## 2. Planning Workflow

Planning v1 supports a staged path for large plan requests:

```text
clarify_plan_requirements
-> collect plan slots in session
-> draft_plan
-> PlanDraftCard
-> prepare_plan_creation
-> dry-run compose_plan / create_plan
-> pending confirmation
-> confirmed execute
-> createdPlanId backfill
-> ActionResultCard
```

Key rules:

- `PlanReadinessEvaluator` is rule-first and does not call an LLM.
- A large plan with only `goal + deadline` is insufficient.
- `draftable` creates a PlanDraft response and does not write.
- `confirmable` only allows preparation for confirmation; it is not execution.
- `prepare_plan_creation` converts a valid draft into existing plan creation args.
- Pending confirmation remains owned by the existing dry-run / Policy Guard path.

Important slots:

- `goal`
- `deadline`
- `scope`
- `currentProgress`
- `availableTime`
- `successCriteria`
- `priority`
- `deliverables`
- `constraints`

## 3. Checklist Workflow

Checklist v1 is downstream from PlanDraft and can create a checklist from a plan draft.

```text
PlanDraft
-> generate ChecklistDraft
-> ChecklistDraftCard
-> prepare_checklist_creation
-> create_checklist dry-run
-> Policy Guard
-> pending confirmation
-> confirmed create_checklist execute
-> Plan.linkedContent update when sourcePlanId exists
-> receipt / rollback metadata
-> ActionResultCard
```

Key rules:

- ChecklistDraft is a draft-only UI state and never writes.
- Checklist creation executes only after pending confirmation is confirmed.
- `sourcePlanId` is never guessed from a title.
- If checklist creation succeeds but Plan linkage fails, created checklist cleanup is compensating behavior.
- Duplicate confirmation is protected by AgentActionReceipts.

## 4. Schedule Workflow

Schedule v1 supports planning work into concrete schedule items without recurrence, external calendar sync, or automatic rescheduling.

```text
schedule readiness
-> ScheduleDraft
-> ScheduleDraftCard
-> prepare_schedule_creation
-> local conflict detection
-> optional conflict suggestions
-> revise_schedule_draft when user selects a suggestion
-> prepare_schedule_creation again
-> create_schedule_items dry-run
-> Policy Guard
-> pending confirmation
-> confirmed execute
-> ActionResultCard
-> rollback
```

Key rules:

- ScheduleDraft is not persistence.
- Preparing creation checks SunnyPanel local schedule conflicts.
- Conflict suggestions are suggestions only.
- Selecting a suggestion updates the draft through revise flow and does not write.
- Confirmation is required before `create_schedule_items` writes schedule-items.
- v1 does not support recurrence, external calendars, or automatic rescheduling.

## 5. Timeline / Progress

Timeline and progress semantics are intentionally narrow in v1.

Checklist completion:

- Completing a checklist item creates or updates one checklist-sourced Timeline event.
- `relatedChecklist` points to the checklist.
- `relatedTaskKey` uses the checklist item id.
- Completion notes update Timeline description without duplicate events.
- Creating a checklist does not create Timeline events.
- Appending checklist items does not create Timeline events.

Plan progress:

- Plan progress is computed from linked checklist content.
- v1 does not write `Plan.progress`.
- Rollback restores checklist state or linkedContent, and progress follows from the restored data.

## 6. Safety Workflow

Every write path must obey the same safety chain:

```text
intent
-> readiness / workflow gate
-> draft or dry-run
-> Policy Guard
-> pending confirmation
-> execute
-> AgentActionReceipt
-> rollback payload
```

Non-negotiable rules:

- No direct database writes from draft cards.
- No write before confirmation for medium or high risk actions.
- No executor bypass of Policy Guard.
- No LLM output directly persisted as final data.
- No repeated execution when a receipt already records a terminal result.
- Rollback payloads must be executable or clearly unavailable.

## 7. Session State

AgentSessionState stores workflow context without schema changes.

Planning state can hold:

- workflow stage, such as `clarifying`, `drafting`, or `confirming`
- plan slots
- PlanDraft
- ChecklistDraft
- source plan id lifecycle metadata

Schedule state can hold:

- scheduling stage
- schedule slots
- ScheduleDraft
- conflict policy and local conflict notes
- local free slot suggestions

Compatibility rules:

- Session normalization must tolerate old threads.
- Invalid draft fields are filtered, not trusted.
- Session state must not force writes.
- Projection onto the latest assistant message is UI state, not execution.

## 8. UI Cards

Workflow UI is intentionally state-separated.

Draft cards:

- `PlanDraftCard`
- `ChecklistDraftCard`
- `ScheduleDraftCard`

Draft cards must say the work is not written yet and must not show confirmation or result language.

Confirmation cards:

- `PlanConfirmationCard`
- `AgentApprovalCard` variants for checklist and schedule creation

Confirmation cards must say confirmation is required before writing.

Result cards:

- `ActionResultCard`

Result cards show that writes have completed, including ids, counts, linked sources, rollback availability, and user-facing summaries.

MessageCard remains a dispatcher. It should not accumulate workflow-specific card body JSX.

## 9. Rollback / Receipt

AgentActionReceipts provide idempotency for execute and rollback.

Write execution should:

- claim or replay a receipt by stable action id
- write exactly once for repeated confirmations
- store created ids and rollback payloads
- return prior terminal results when replayed

Rollback should:

- target only documents created or changed by the action
- be idempotent where practical
- avoid affecting unrelated Timeline, Checklist, Plan, or Schedule records
- report indeterminate state when compensation cannot be completed

## 10. Known Boundaries

Agent Workflow v1 intentionally does not include:

- ChecklistDraft revise workflow.
- Schedule recurrence.
- External Calendar integration.
- Automatic conflict rescheduling.
- Multi-user planning permissions beyond existing access boundaries.
- New Payload schema or migrations for workflow state.
- Direct Plan progress writes.
- Full natural-language editing of every created draft field.

Dashboard boundaries:

- Dashboard server render must stay light.
- Suggestions sync runs through the server endpoint after mount and must not block HTML.
- Sidebar and Inspector ownership must remain separated.

## 11. Backlog

Recommended post-v1 backlog:

- ChecklistDraft revise workflow.
- More precise natural-language draft editing.
- Optional Plan to Schedule sequencing controls.
- External Calendar read-only conflict awareness.
- Recurrence design with explicit confirmation and rollback semantics.
- Schedule conflict resolution drafts that can compare multiple alternatives.
- Richer rollback result UI for partially compensated actions.
- Workflow observability dashboards for receipt, checkpoint, and event replay health.
- Additional E2E coverage for full browser interaction flows.

## 12. Freeze Checklist

Agent Workflow v1 is considered frozen only when:

- `npm run test:agent` passes.
- `npm run test:agent:planning` passes.
- `tests/agent/schedule` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `git diff --check` passes.
- Documentation records the workflow boundaries.
- No new feature work is included in the closure pass.
