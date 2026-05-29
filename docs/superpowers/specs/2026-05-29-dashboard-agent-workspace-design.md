# Dashboard Agent Workspace Design

## Goal

SunnyPanel Dashboard first stage will become a Codex-like Agent workspace. The default `/dashboard` experience should center on Agent threads, conversation, execution flow, approvals, and contextual detail instead of a traditional dashboard made from statistics cards and content queues.

This first stage is intentionally focused on the cockpit: layout, navigation, interaction clarity, responsive behavior, and Admin separation. It should not rewrite the Agent backend pipeline or Payload data model yet, but it must leave room for later Payload schema and database changes.

## Source Requirements

This design follows `Agent_develop.md`, with the user-approved first-stage scope:

- Three-column Dashboard layout.
- Left Thread and function navigation.
- Main Agent workspace.
- Bottom Composer.
- Right Context / Approval / Trace panel.
- Sidebar bug fixes.
- Unified tool-like UI style.
- Dashboard and Admin separation.
- Basic responsive behavior.
- Simple Agent Thread display.

Out of scope for this stage:

- Complex multi-agent concurrent execution.
- Real long-running background jobs.
- Full workflow engine rebuild.
- Complex permission model.
- Multi-user collaboration.
- Plugin marketplace.
- Full automation system.
- Markdown writing overhaul.
- Full calendar and schedule detail overhaul.
- Payload schema/database restructuring, except for small label or grouping polish if implementation requires it.

## Approved Direction

Use approach A: Codex-like Agent Workspace.

The Dashboard should default to a three-column workbench:

- Left: tasks, navigation, Agent threads, pinned objects.
- Center: active Agent thread, conversation, execution flow, results, and Composer.
- Right: dynamic detail panel for context, approval, and trace.

The previous Dashboard modules, such as focus cards, content queues, plan runway, metrics, and calendar cards, should no longer dominate `/dashboard`. They can move into navigation targets, contextual summaries, or later dedicated pages.

## Architecture

### Top Bar

Keep a lightweight workspace top bar:

- SunnyPanel brand.
- Current workspace identity.
- Command entry point if available.
- Current model or Agent mode status.
- Links to public site and Admin.
- Theme/settings entry.

The Top Bar should feel like a thin shell around the workbench, not a marketing header or admin toolbar.

### Left Sidebar

The sidebar should combine system navigation and Agent thread management.

Primary groups:

- Workspace navigation: 总览, Agent, 今日, 计划, 日程, 写作, 记忆.
- Agent Threads: recent threads, active thread state, waiting/running/done/failed indicators when available.
- Pinned: important plans, projects, or recurring contexts.
- Pending: approvals or blocked actions that need attention.

The sidebar should support:

- New thread creation.
- Loading existing threads.
- Thread search if existing API support remains.
- Archiving/restoring threads if existing behavior remains.
- Collapsed desktop mode.
- Mobile drawer behavior.

It should not mirror Payload collection lists. It should be organized around how the user works.

### Main Workspace

The center column remains the core Agent experience.

It should include:

- Current thread title and status.
- Conversation history.
- Thinking or execution summary.
- DryRun or approval card preview when relevant.
- Tool/result messages.
- Errors with clear recovery.
- Bottom Composer fixed to the active work area.

The center should distinguish message kinds through UI treatment:

- Normal Q&A: answer-only, no database writes.
- Suggestions: proposed work, no writes by default.
- DryRun: preview of intended changes and required confirmation.
- Execution result: completed writes and links to affected objects.

### Composer

The Composer should remain command-like and compact.

It should support:

- Multiline natural language input.
- Slash-style prompts or quick prompts when already available.
- Mode/status copy that maps to user-facing concepts:
  - 只回答.
  - 生成建议.
  - DryRun.
  - 等待确认.
  - 可执行.
- Current Agent mode visibility.
- Submit and stop controls.

The UI must help prevent accidental writes by making operation state visible before confirmation.

### Right Panel

For the first stage, productize the right panel around three primary tabs:

- Context.
- Approval.
- Trace.

Context shows what the Agent is using:

- Current thread metadata.
- Message count and status.
- Related plans, checklists, memories, and recent runs when available.
- Current context preferences such as pinned/excluded items.

Approval shows pending write operations:

- Operation summary.
- Risk level.
- Affected collection/document preview.
- Before/after preview when available.
- Confirm/cancel/edit actions through the existing pending action flow.

Trace shows execution progress:

- Intent resolution.
- Context build.
- Orchestration.
- DryRun.
- Confirmation.
- Execution.
- Thread writeback.
- Errors.

Existing advanced/debug surfaces, such as artifacts, memory, DAG, and debug/token panels, may stay available as secondary or developer-oriented views, but they should not define the default first-stage user experience.

## Payload and Data Strategy

First stage should reuse current Payload collections and avoid deep schema changes:

- `agent-threads`.
- `agent-runs`.
- `agent-suggestions`.
- `agent-memories`.
- `plans`.
- `checklists`.
- `schedule-items`.
- content collections such as posts, notes, updates, pages, and timeline events.

The first-stage UI should derive its state from existing data:

- Thread messages and `pendingAction`.
- Client-side `traceSteps`.
- Recent runs.
- Current Agent suggestions.
- Existing workspace snapshot.

However, the design must explicitly preserve room for later Payload restructuring. Later phases should be allowed to change database schema, regenerate Payload types, and migrate local PostgreSQL data.

Expected later Payload changes include:

- `AgentThread`: stronger thread summary, linked objects, used memories, status, current objective, and compact context.
- `AgentRun`: full dryRun payload, confirmation metadata, tool trace, rollback payload, affected documents, token usage, timing, and error details.
- `ScheduleItem`: richer time blocks, status transitions, reschedule/cancel/done history, and exact plan/checklist item references.
- `AgentMemory`: active/disabled state, source links, trust/confidence, last-used metadata, and short-term versus long-term separation.
- Content and planning collections: clearer relationships for Agent-generated content, reviews, timelines, and plan progress.

## Admin Strategy

Dashboard is the primary daily interface. Admin is the lower-level data maintenance interface.

Admin should keep Payload power but feel productized:

- Group content under 内容管理.
- Group plan objects under 计划与日程.
- Group Agent objects under AI Agent.
- Group users/settings/system objects separately.
- Prefer natural Chinese labels.
- Keep `/admin` secondary to `/dashboard`.

First stage can refine Admin labels/grouping and visual consistency, but it should not make Admin the main workflow.

## Responsive Behavior

Desktop:

- Three columns visible.
- Left sidebar fixed within workbench.
- Center workspace fluid.
- Right panel visible or collapsible depending on viewport.

Tablet:

- Left sidebar collapsible.
- Right panel can become an inline compact panel or drawer.
- Center workspace remains primary.

Mobile:

- Agent workspace is the default visible surface.
- Sidebar opens as a drawer.
- Right panel opens as a bottom sheet or compact collapsible panel.
- Composer remains accessible at the bottom.
- Text and controls must not overflow or overlap.

## Safety and Confirmation

The UI must preserve existing backend write safety:

- Normal questions do not create plans or schedules.
- Suggestions do not write by default.
- Write operations require DryRun and user confirmation.
- High-risk operations require clear risk display and confirmation.
- The UI must not bypass `pendingAction`, confirmation, or rollback logic.

Approval interactions should call the existing confirm/cancel/edit paths rather than writing directly.

## Testing and Verification

Implementation should follow TDD.

Suggested first tests:

- `/dashboard` renders the Agent workbench as the primary surface.
- Sidebar includes workspace navigation and Agent Threads.
- Main workspace includes conversation and Composer with accessible labels.
- Right panel exposes Context / Approval / Trace tabs.
- Pending approval states are visible in the right panel and center preview when applicable.
- Mobile viewport does not overflow and keeps Composer accessible.

Verification commands:

- `npm run test:agent`.
- `npm run typecheck`.
- `npm run test:e2e` when local auth/test environment allows.
- Browser verification of desktop and mobile layouts after implementation.

## Acceptance Criteria

The first-stage implementation is complete when:

- `/dashboard` no longer presents the old card-heavy dashboard as the main experience.
- The default Dashboard view is a Codex-like Agent workspace.
- Left navigation supports system sections, thread management, and pending/pinned areas.
- Center workspace supports Agent conversation, execution visibility, and Composer.
- Right panel productizes Context / Approval / Trace.
- Admin remains available but clearly secondary.
- Existing Agent chat, pending action, confirmation, and rollback behavior still works.
- Existing tests pass, and new tests cover the changed Dashboard surface.

