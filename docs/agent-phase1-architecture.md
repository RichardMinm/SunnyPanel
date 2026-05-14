# SunnyPanel Agent Phase 1 Architecture

Phase24 focuses the Agent on a deterministic workflow spine:

`Plan -> Checklist -> Content -> Timeline -> Review -> Next Action`

The Agent is not treated as a generic chatbot. It is a single-user workflow agent that can read structured workspace context, propose auditable writes, wait for explicit confirmation, and leave enough execution state for review or rollback.

## Current Architecture

The chat entrypoint is `/api/agent/chat`. It builds workspace context, resolves an `AgentIntent`, runs a dry-run for write intents, stores pending confirmation in `AgentThread`, and only executes the write tool after the user confirms.

Core pieces:

- `AgentIntent` and `ProposedAgentAction` live in `src/lib/agent/schemas.ts`.
- `src/lib/agent/tool-registry.ts` owns write-tool dry-runs and execution dispatch.
- `src/lib/agent/safety.ts` gates write intents through dry-run and confirmation.
- `src/lib/agent/tools.ts` performs actual Payload writes and records `AgentRun`.
- `AgentRun` stores affected documents, before/after snapshots, rollback payload, trace metadata, and related content.
- `AgentChatPanel` renders pending confirmation cards from the structured action payload.
- Tests under `tests/agent/` compile and run without external API calls.

## Strengths

- Write actions are explicit and auditable.
- Dry-run resolves real target documents before confirmation where possible.
- Risk levels are centralized enough to test and reason about.
- `AgentRun` records snapshots and rollback preparation instead of only a text log.
- The streaming route keeps trace updates, so UX can show what the Agent is doing.
- The eval suite now covers intent parsing, safety, dry-run, rollback, context, memory, suggestions, weekly review, and timeline composition.

## Weaknesses

- Rollback is prepared but not executable yet.
- Confirmation handling is route-level logic, so it needs continued tests to avoid state-machine regressions.
- Some tools still use heuristic composition rather than a richer planner.
- Tool implementations share helper patterns but are still somewhat hand-written.
- Multi-step workflows beyond Phase1 need stronger orchestration and partial-failure handling.

## Incremental Plan

Phase 1 is the foundation:

1. Add a tool registry for current write tools.
2. Add dry-run previews for current write tools before confirmation.
3. Store confirmation payloads with resolved target collections, document IDs, operation, visibility, and preview.
4. Extend `AgentRun` with snapshots and rollback preparation.
5. Add safety and dry-run tests.

Next phases can build on this without rewriting the route or UI.

## Phase 1 File Set

Primary implementation files:

- `src/lib/agent/tool-registry.ts`
- `src/lib/agent/safety.ts`
- `src/lib/agent/schemas.ts`
- `src/lib/agent/tools.ts`
- `src/lib/agent/executor.ts`
- `src/lib/agent/audit.ts`
- `src/app/api/agent/chat/route.ts`
- `src/collections/AgentRun.ts`
- `src/collections/AgentThread.ts`
- `src/lib/agent/write-schemas.ts`

Primary tests:

- `tests/agent/safety.test.ts`
- `tests/agent/tool-dry-run.test.ts`
- `tests/agent/rollback.test.ts`
- `tests/agent/intent.test.ts`
- `tests/agent/fixtures/intents.json`

## Manual Tests

Run these from the Dashboard Agent panel:

1. Send `帮我创建计划：整理计算机组成原理复习路径`.
   - Expected: medium-risk confirmation card for creating a private draft plan.
   - Confirming should create the plan and record an `AgentRun`.

2. Send `给高等数学的映射与函数补一个条目：反函数习题复盘`.
   - Expected: medium-risk confirmation card with `checklists #id` as the update target.

3. Send `我完成了高等数学的映射与函数`.
   - Expected: high-risk confirmation because checklist completion can affect Timeline.

4. While a confirmation is pending, send an unrelated reply like `我再想一下`.
   - Expected: Agent keeps waiting for confirmation.

5. While a confirmation is pending, send `取消`.
   - Expected: pending action clears and cancellation is recorded.

## Next Phases

- Make rollback executable from `AgentRun`.
- Add richer tool contracts for content publishing and PlanReview recommendation application.
- Keep expanding `AgentContextBuilder` budgets and mode-specific retrieval.
- Use `AgentMemory` to influence deterministic suggestions without making tests depend on model calls.
- Move more proactive work into `AgentSuggestion` and Agent Inbox.
- Continue weekly review and Timeline Composer workflows as separate auditable tools.
