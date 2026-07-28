# Agent Core Linkage and UI Closure Design

Date: 2026-07-28
Status: Approved for implementation planning

## 1. Goal

Close the deterministic business relationship and user-interface loop between
Plan, Checklist, ScheduleItem, and TimelineEvent.

The finished behavior must let a user:

1. create or update the four core objects through the existing guarded Agent
   workflow;
2. preserve trustworthy relationships across those objects;
3. see the relationships in the Dashboard immediately after a successful
   write or rollback;
4. navigate between related objects without leaving the current Dashboard or
   losing the active Agent thread; and
5. roll back supported writes without leaving dangling references.

This phase does not add automatic Plan relationships for posts, notes, pages,
updates, or memories.

## 2. Approved Product Decisions

### 2.1 Core scope

This phase covers only:

- Plan
- Checklist
- ScheduleItem
- TimelineEvent

Writing content and AgentMemory remain outside this phase.

### 2.2 Timeline creation policy

Timeline events represent actual progress, not object-creation logs.

- Creating a Plan does not create a TimelineEvent.
- Creating a Checklist does not create a TimelineEvent.
- Creating a ScheduleItem does not create a TimelineEvent.
- Completing a Checklist item creates or updates one deterministic
  TimelineEvent.
- Completing a ScheduleItem creates or updates one deterministic
  TimelineEvent.
- Explicitly confirmed `compose_timeline_event` writes continue to create a
  TimelineEvent.
- Repeating the same completion is idempotent and cannot create duplicates.

### 2.3 Schedule completion policy

Schedule completion has three deterministic cases:

1. A ScheduleItem with both `relatedChecklist` and
   `relatedChecklistItemKey` completes that exact Checklist item. The existing
   Checklist progress hook updates Plan progress. The completion TimelineEvent
   records the ScheduleItem, Checklist, and Plan relationships.
2. A ScheduleItem with only `relatedPlan` does not change Plan progress. It
   creates or updates a Plan-linked TimelineEvent.
3. A standalone ScheduleItem changes only its own status and creates or
   updates a ScheduleItem-linked TimelineEvent. It does not change a Plan or
   Checklist.

Rollback of a ScheduleItem completion restores the prior ScheduleItem status,
the prior Checklist item state when one was changed, the derived Plan
progress, and the prior TimelineEvent state.

### 2.4 Dashboard navigation policy

Relationship navigation stays inside the existing Dashboard:

- Plan targets open the right-side Plans inspector and expand the target Plan.
- Checklist targets switch the main workspace to Checklist and expand the
  target Checklist.
- Schedule targets switch to Schedule, select the target month, and expand the
  target ScheduleItem.
- Timeline targets switch to Timeline, select the target month, and expand the
  target TimelineEvent.

Navigation preserves the active Agent `threadId`. It does not add new detail
routes or perform a full-page reload.

### 2.5 Component policy

Existing components and design-system primitives are preferred. Existing
components may be modified or split when their current interfaces cannot
support reusable relationship display, navigation, focus, or refresh.

The implementation must not duplicate relationship rendering or navigation
logic across four pages.

## 3. Current State

The repository already implements:

- `Checklist.planId -> Plan`;
- Checklist creation that also appends the Checklist to
  `Plan.linkedContent`;
- `ScheduleItem.relatedPlan`, `relatedChecklist`, and
  `relatedChecklistItemKey`;
- Schedule creation that appends ScheduleItems to `Plan.linkedContent`;
- Checklist completion to TimelineEvent synchronization;
- Checklist-derived `Plan.progress`;
- rollback cleanup for Plan-linked Checklist and ScheduleItem writes;
- Dashboard summaries for Plan-linked Checklists and ScheduleItems;
- Checklist display of its related Plan; and
- Schedule display of its related Plan, Checklist, and Checklist item key.

The repository does not yet implement:

- `TimelineEvent.relatedPlan`;
- `TimelineEvent.relatedScheduleItem`;
- Plan-side TimelineEvent linkage;
- Schedule completion to Checklist completion;
- Schedule completion TimelineEvent synchronization;
- Dashboard Timeline relationship summaries;
- clickable cross-module relationship navigation; or
- immediate data refresh after an Agent mutation or rollback.

The current Dashboard Schedule status endpoint also compares the
`ScheduleItem.createdBy` source marker (`"manual" | "agent"`) with a numeric
user ID. That comparison incorrectly rejects legitimate status updates and
must be replaced with server-authenticated administrator authorization.

## 4. Documentation Review

Docs reviewed:

- `docs/product-map.md`: defines Planning as the goal layer, Checklist as task
  decomposition, Schedule as time allocation, and completion as Plan progress
  feedback.
- `docs/feature-index.md`: freezes the P0 Planning, Checklist, Schedule,
  Timeline, Agent safety, and component-reuse boundaries.
- `docs/agent-workflow-v1.md`: requires Draft, Dry-run, Policy Guard,
  confirmation, Receipt, rollback, and Plan linkage cleanup.
- `docs/safety-model.md`: permits deterministic derived side effects after a
  confirmed write and forbids LLM-controlled business mutation.
- `docs/system-architecture.md`: records `TimelineEvent.relatedPlan` as the
  remaining D2-A3b lifecycle gap.
- `docs/testing-strategy.md`: requires unit, workflow, safety, UI, and
  non-production E2E coverage.
- `tests/TEST_MAP.md`: identifies protected planning, schedule, rollback,
  receipt, and execution tests that must not be weakened.
- `docs/features/planning.md`: requires Plan detail to show Checklist,
  Schedule, Progress, Activity, and Receipt.
- `docs/features/checklist.md`: defines optional Plan linkage and confirmed
  Checklist writes.
- `docs/features/schedule.md`: requires Plan-backed Schedule completion to
  feed Plan progress.
- `docs/features/timeline.md`: allows related Plan and content links while
  preserving Timeline confirmation and visibility boundaries.
- `docs/design/planning-execution-lifecycle.md`: defines the
  Plan -> Checklist -> ChecklistItem -> ScheduleItem -> Completion -> Progress
  chain.
- `docs/design/domain-model.md`: includes optional Plan relationship metadata
  on TimelineEvent.
- `docs/features/agent-workbench.md`: protects confirmation, Receipt,
  rollback, and sanitized UI state.
- `docs/design/design-system.md`: requires shared components and tokens.
- `docs/design/aesthetic-standard.md`: requires clear hierarchy, reusable
  components, and restrained state-driven motion.
- `docs/design/copywriting-standard.md`: requires short object/action/status
  copy without promotional language.
- `docs/design/dashboard-layout.md`: requires Planning, Checklist, and Schedule
  to work as connected views inside DashboardShell.

Docs conflicts:

- `docs/features/schedule.md` and
  `docs/design/planning-execution-lifecycle.md` require Plan-backed Schedule
  completion to feed Plan progress. Current production code updates only
  `ScheduleItem.status`. This design closes the conflict through exact
  Checklist-item completion when both Checklist ID and item key are present.
- `docs/system-architecture.md`, `docs/agent-workflow-v1.md`, and
  `docs/design/planning-execution-lifecycle.md` mark
  `TimelineEvent.relatedPlan` as deferred. This phase explicitly implements
  that previously deferred v1 capability.
- The Schedule collection defines `createdBy` as an origin marker, while the
  Dashboard Schedule status endpoint treats it as a user relationship. The
  approved single-user/admin contract authorizes the request from the
  server-authenticated administrator and retains `createdBy` as origin
  metadata.

## 5. Canonical Relationship Contract

### 5.1 Stored relationship direction

| Source | Field | Target | Required |
| --- | --- | --- | --- |
| Checklist | `planId` | Plan | no |
| ScheduleItem | `relatedPlan` | Plan | no |
| ScheduleItem | `relatedChecklist` | Checklist | no |
| ScheduleItem | `relatedChecklistItemKey` | embedded Checklist item | no |
| TimelineEvent | `relatedPlan` | Plan | no |
| TimelineEvent | `relatedChecklist` | Checklist | no |
| TimelineEvent | `relatedScheduleItem` | ScheduleItem | no |
| TimelineEvent | `relatedTaskKey` | embedded Checklist item | no |
| Plan | `linkedContent` | Checklist, ScheduleItem, TimelineEvent | no |

`Plan.linkedContent` is the Plan-side summary relationship. The typed fields
on Checklist, ScheduleItem, and TimelineEvent are the child-side source of
truth.

### 5.2 Relationship provenance

All automatic relationships must come from persisted, actor-authorized IDs:

- Checklist Timeline relationship comes from `Checklist.id`.
- Checklist Plan relationship comes from `Checklist.planId`.
- Schedule Timeline relationship comes from `ScheduleItem.id`.
- Schedule Checklist relationship comes from
  `ScheduleItem.relatedChecklist`.
- Schedule Checklist item relationship comes from
  `ScheduleItem.relatedChecklistItemKey`.
- Schedule Plan relationship comes from `ScheduleItem.relatedPlan`, or from
  the resolved Checklist's `planId` only when the ScheduleItem lacks a Plan
  relationship.

Forbidden relationship sources:

- title-only fuzzy matching;
- one visible Plan or Checklist in context;
- Provider-selected workspace IDs;
- user-visible text parsed after execution; or
- synthetic IDs before a document is created.

## 6. Core Linkage Service

Create one server-only deterministic linkage module with focused operations.
The implementation plan will lock exact file names and signatures, but the
service contract is:

```ts
type CoreLinkageResource =
  | { collection: "checklists"; id: number }
  | { collection: "schedule-items"; id: number }
  | { collection: "timeline-events"; id: number };

type CoreLinkageFailureCode =
  | "invalid_reference"
  | "resource_not_found"
  | "resource_not_authorized"
  | "plan_link_invalid"
  | "plan_link_write_failed"
  | "compensation_failed";

type CoreLinkageResult =
  | {
      ok: true;
      changed: boolean;
      planId: number | null;
    }
  | {
      ok: false;
      code: CoreLinkageFailureCode;
      safeMessage: string;
    };
```

The service owns:

- relationship ID normalization;
- exact resource loading;
- actor-aware authorization inputs;
- idempotent append/remove of Plan links;
- Timeline relationship derivation from persisted resources;
- compensation snapshots for any cross-document write; and
- bounded safe errors without raw Payload data.

The service does not own:

- intent classification;
- Draft or Dry-run generation;
- Policy Guard;
- confirmation;
- Receipt creation;
- LLM prompts;
- public visibility decisions; or
- UI navigation.

## 7. Write Flows

### 7.1 Checklist creation

The existing confirmed Checklist creation flow remains authoritative:

```text
confirmed create_checklist
-> create Checklist with planId
-> append Checklist to Plan.linkedContent
-> create Receipt and rollback payload
```

The new linkage service replaces duplicated Plan-link normalization only when
doing so preserves current compensation and rollback behavior.

### 7.2 Schedule creation

The existing confirmed Schedule creation flow remains authoritative:

```text
confirmed create_schedule_items
-> create ScheduleItems with Plan/Checklist/item references
-> append Plan-backed items to Plan.linkedContent
-> create Receipt and rollback payload
```

No TimelineEvent is created at this stage.

### 7.3 Checklist completion

```text
confirmed complete_checklist_item
-> update embedded Checklist item
-> calculate deterministic Plan progress
-> create or update TimelineEvent
-> write relatedChecklist and relatedTaskKey
-> derive and write relatedPlan from Checklist.planId
-> append TimelineEvent to Plan.linkedContent
-> create Receipt with combined rollback state
```

The event uniqueness key remains the Checklist ID plus Checklist item key.

### 7.4 Schedule completion

Every Schedule status transition to `done` uses the same server-side
operation. This includes the Dashboard status endpoint and any confirmed Agent
`modify_record` path that is permitted to set Schedule status:

```text
explicit Schedule completion
-> load actor-authorized ScheduleItem
-> snapshot ScheduleItem, optional Checklist item, TimelineEvent, Plan links
-> set ScheduleItem.status = done
-> if exact Checklist + item key exist:
     complete that Checklist item
     let existing Checklist hooks update Plan progress
-> create or update one TimelineEvent
-> write relatedScheduleItem
-> write any exact relatedChecklist / relatedTaskKey / relatedPlan
-> append TimelineEvent to Plan.linkedContent when Plan is known
-> return affected object summaries for Receipt and UI refresh
```

The TimelineEvent uniqueness key is `relatedScheduleItem`. Completion must
reuse the existing event when the operation is repeated.

### 7.5 Explicit Timeline composition

`compose_timeline_event` remains a guarded write. After confirmation:

- `sourceType = plan` writes `relatedPlan`;
- `sourceType = checklist_item` writes `relatedChecklist` and resolves its
  Plan;
- other current content source types keep their existing behavior;
- a resolved Plan receives the TimelineEvent in `linkedContent`; and
- invalid IDs clarify or fail closed rather than creating a partially linked
  event.

## 8. Payload Schema and Migration

Add two optional indexed relationship fields to TimelineEvent:

```text
relatedPlan -> plans
relatedScheduleItem -> schedule-items
```

Regenerate Payload types and create a versioned migration.

The migration backfills only deterministic historical relationships:

1. For a TimelineEvent with `relatedChecklist`, load the Checklist.
2. If the Checklist has a valid `planId`, set `TimelineEvent.relatedPlan`.
3. Append that TimelineEvent to the Plan's `linkedContent` if missing.
4. Leave unresolved records unchanged.

The migration must:

- be idempotent;
- deduplicate Plan links;
- preserve unrelated `linkedContent` entries;
- avoid title matching;
- avoid Provider calls;
- avoid changing visibility or publication state; and
- implement a safe down migration for the new fields without deleting
  TimelineEvents.

## 9. Rollback and Failure Semantics

### 9.1 Ordering

For newly introduced cross-document writes:

1. capture all before snapshots;
2. update the primary object;
3. update or create the TimelineEvent;
4. append the Plan link;
5. persist Receipt metadata;
6. compensate in reverse order on failure.

### 9.2 Compensation

- If Timeline creation succeeds and Plan linkage fails, delete the new event
  or restore the previous event.
- If Schedule completion fails after changing a Checklist item, restore the
  Checklist item and Schedule status.
- If Receipt persistence fails, use the same compensation contract as the
  current guarded write paths.
- If compensation fails, return `compensation_failed`, retain sanitized
  diagnostic metadata, and do not claim success.

### 9.3 Rollback

Rollback of a completion:

- removes the TimelineEvent from `Plan.linkedContent` before deleting it;
- restores a pre-existing TimelineEvent rather than deleting it;
- restores the prior Schedule status;
- restores the prior Checklist item state and completion note;
- lets the existing Checklist hook recalculate Plan progress; and
- records every affected document in the rollback result.

This phase does not add general cascade deletion. Existing high-risk delete
capabilities retain their current confirmation and scope.

## 10. Dashboard API Contract

All relationship API responses use minimal summaries:

```ts
type LinkedObjectSummary =
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

API changes:

- Plans API adds related TimelineEvent summaries.
- Checklist API adds related ScheduleItem and TimelineEvent summaries.
- Schedule API adds its related TimelineEvent summary.
- Timeline API resolves and returns related Plan, Checklist, and ScheduleItem
  summaries.

The Schedule status endpoint:

- requires a server-authenticated user;
- requires the server-authenticated administrator capability used by the
  current single-user Dashboard;
- never trusts a client role, header, request-body actor, or `createdBy` value
  for authorization;
- retains `createdBy` as `"manual" | "agent"` source metadata; and
- does not introduce a new user-owner relationship in this phase.

Missing or inaccessible targets return `null` or are omitted. APIs never
return full related documents, Agent prompts, raw Payload records, or secret
metadata.

## 11. Reusable Frontend Components

Create or adapt reusable Dashboard components:

### 11.1 `LinkedObjectLink`

- renders object icon, concise relation label, and title;
- uses existing Dashboard icon and button/link primitives;
- calls the shared in-Dashboard navigation callback;
- supports unavailable state without throwing; and
- never exposes a raw internal ID as the primary label.

### 11.2 `LinkedObjectList`

- renders a typed list of `LinkedObjectSummary`;
- owns empty, collapsed, and expanded states;
- supports Plan, Checklist, Schedule, and Timeline summaries; and
- delegates each item to `LinkedObjectLink`.

### 11.3 `LinkedObjectBadge`

- provides compact count or source display inside cards;
- uses existing design tokens and status semantics; and
- is non-interactive unless a valid navigation target exists.

### 11.4 `useLinkedObjectNavigation`

Consumes:

```ts
type LinkedObjectNavigationTarget =
  | { type: "plan"; id: number }
  | { type: "checklist"; id: number }
  | { type: "schedule"; id: number; date: string }
  | { type: "timeline"; id: number; date: string };
```

It delegates state changes to DashboardShell. Each destination view receives
the target, loads the correct period, expands the object, scrolls it into
view, and applies a restrained temporary highlight using existing motion
tokens.

### 11.5 `useDomainRefresh`

Subscribes to one typed browser event:

```ts
type DomainRefreshDetail = {
  domains: Array<"plans" | "checklists" | "schedule" | "timeline">;
  ids?: number[];
  reason:
    | "agent_execute"
    | "manual_update"
    | "completion"
    | "rollback";
};
```

The hook coalesces duplicate notifications and calls the view's existing
loader. It does not poll.

Existing components may be modified or split to consume these shared
components and hooks. No parallel visual system or new UI dependency is
introduced.

## 12. Dashboard Presentation

### 12.1 Plans inspector

Show:

- persisted progress;
- Checklist, ScheduleItem, and TimelineEvent counts;
- expanded linked-object lists; and
- clickable navigation to each object.

### 12.2 Checklist view

Show:

- owning Plan;
- related ScheduleItems;
- completion TimelineEvents;
- current Checklist progress; and
- clickable related objects.

### 12.3 Schedule view

Show:

- related Plan;
- related Checklist and Checklist item key;
- completion TimelineEvent when present; and
- clickable related objects.

### 12.4 Timeline view

Show:

- exact related Plan;
- exact related Checklist;
- exact related ScheduleItem;
- source type and event details; and
- clickable related objects.

Public Timeline behavior remains unchanged except that an already public
TimelineEvent may use its existing safe public links. Private Dashboard
relationships must not leak into Public Site responses.

## 13. Refresh Flow

After a confirmed local mutation or rollback:

```text
server returns affected collection IDs
-> existing client completion handler maps collections to domains
-> dispatch sunny:domain-refresh
-> mounted views refetch affected summaries
-> optional navigation target focuses the resulting object
```

Direct Dashboard Schedule completion dispatches the same event after its API
response succeeds.

The refresh flow:

- does not change the Agent SSE protocol;
- does not add polling;
- does not clear the current thread;
- does not fabricate optimistic relationship data; and
- keeps the previous UI state when refetch fails, while showing a bounded
  retryable error.

## 14. Security and Privacy

- No Provider call is required.
- No model determines relationship IDs.
- Existing Draft, Dry-run, Policy Guard, confirmation, Execute, Receipt, and
  rollback boundaries remain authoritative.
- Direct Schedule status updates use server-authenticated administrator
  authorization; `ScheduleItem.createdBy` remains an origin marker and is not
  treated as an owner ID.
- Public Site continues to require `published + public`.
- Relationship summaries contain only minimum display fields.
- No raw prompt, response, hidden reasoning, credentials, or cookies are
  stored or displayed.
- No new dependency is introduced.

## 15. Test Strategy

Implementation follows RED -> GREEN -> refactor for every behavior.

### 15.1 Pure relationship tests

- append and remove Plan links without overwriting unrelated links;
- deduplicate repeated Checklist, ScheduleItem, and TimelineEvent links;
- resolve Plan only from trusted persisted relationships;
- reject missing, deleted, inaccessible, and malformed targets;
- prove title-only matching is absent.

### 15.2 Workflow tests

- Checklist completion writes related Checklist, item key, and Plan to one
  TimelineEvent.
- Linked Schedule completion completes the exact Checklist item.
- Linked Schedule completion updates Plan progress through the existing hook.
- Plan-only Schedule completion does not change Plan progress.
- Standalone Schedule completion does not mutate Plan or Checklist.
- Repeated completion does not duplicate TimelineEvents.
- Explicit Plan Timeline composition writes both child and Plan-side links.

### 15.3 Failure and rollback tests

- Plan-link failure compensates Timeline creation.
- Schedule completion failure restores Schedule and Checklist states.
- Receipt failure compensates all derived writes.
- Rollback restores pre-existing Timeline events.
- Rollback removes newly created Timeline events and Plan links.
- Repeated rollback is idempotent.

Protected tests are extended, not deleted or weakened.

### 15.4 Migration tests

- deterministic Checklist-to-Plan backfill;
- unresolved records unchanged;
- existing unrelated Plan links preserved;
- duplicate links not created;
- repeated migration safe.

### 15.5 API tests

- all four APIs return minimum summaries;
- unauthorized requests remain rejected;
- authenticated administrator Schedule completion succeeds regardless of
  whether `createdBy` is `"manual"` or `"agent"`;
- client role, actor, and `createdBy` values cannot forge Schedule
  authorization;
- inaccessible related objects are omitted;
- no full related document leakage.

### 15.6 Component and integration tests

- shared components render all four object types;
- click emits the exact navigation target;
- unavailable targets are non-breaking;
- DashboardShell preserves `threadId`;
- destination view selects the period, expands, focuses, and highlights the
  target;
- domain refresh refetches only affected views;
- existing components use shared relationship components rather than
  duplicated markup.

### 15.7 Browser verification

Using a non-production database and authenticated Dashboard:

1. create a Plan through the Agent and confirm it;
2. create a Plan-linked Checklist and confirm it;
3. create a Checklist-item-linked ScheduleItem and confirm it;
4. complete the ScheduleItem;
5. verify the Checklist item and Plan progress update;
6. verify the TimelineEvent relationships;
7. navigate across all four views;
8. perform rollback and verify all four views refresh consistently.

No DeepSeek or other live Provider evaluation is part of this phase.

## 16. Acceptance Criteria

The phase passes only when:

1. TimelineEvent has typed optional Plan and ScheduleItem relationships.
2. Plan-linked TimelineEvents appear in `Plan.linkedContent` without
   duplicates.
3. Checklist completion links TimelineEvent to Checklist and Plan.
4. exact Checklist-backed Schedule completion updates Checklist completion
   and Plan progress.
5. Plan-only and standalone Schedule completion do not fabricate Plan
   progress.
6. Schedule completion links one TimelineEvent to every exact available
   source.
7. repeated completion and rollback are idempotent.
8. failure compensation leaves no dangling Plan link.
9. deterministic historical Timeline relationships are backfilled.
10. all four Dashboard surfaces display related objects.
11. all valid related objects are clickable through shared components.
12. navigation preserves the active Agent thread.
13. a successful mutation or rollback refreshes mounted affected views.
14. missing related objects fail safely in APIs and UI.
15. public visibility boundaries remain unchanged.
16. no write bypasses confirmation, Receipt, or rollback contracts.
17. authenticated administrators can complete manual- and Agent-created
    ScheduleItems, while unauthenticated or non-admin callers remain blocked.
18. no Provider call, new dependency, or external system is introduced.
19. deterministic, protected, typecheck, lint, migration, and browser
    verification pass.

## 17. Non-goals

- posts, notes, updates, pages, or memories automatically linked to Plans;
- public Checklist or Schedule pages;
- new Plan, Checklist, Schedule, or Timeline detail routes;
- external calendar integration;
- automatic schedule rearrangement;
- fuzzy relationship matching;
- generic cascade deletion;
- multi-user RBAC;
- changing LangGraph topology;
- changing Router or Orchestrator prompts;
- changing the default Agent runtime; or
- removing Legacy compatibility code.

## 18. Rollout and Revert

Ship as one feature branch with independently reviewable commits:

1. relationship schema, migration, and deterministic linkage service;
2. completion and rollback integration;
3. API summaries;
4. shared frontend components, navigation, and refresh;
5. documentation and verification closure.

The migration must deploy before code that writes the new TimelineEvent
fields. Reverting application code must not delete core business records.
Migration rollback removes the new optional columns only after application
code has stopped reading or writing them.
