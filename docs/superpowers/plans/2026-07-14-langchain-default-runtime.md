# LangChain Default Runtime Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement one approved phase at a time. Each phase requires a fresh branch, requirement-by-requirement review, full validation, a separate commit, and an explicit stop. This program plan does not authorize implementation during L3-A; each phase receives its own executable TDD checklist before code changes.

**Goal:** Move every active production chat-model call to an explicit LangChain or deterministic boundary, adopt those boundaries only after safety, availability, and performance gates pass, then delete proven-unused Legacy paths.

**Architecture:** LangGraph coordinates a turn while dedicated Orchestrator, Conversational Answer, Query, and domain services own model calls. Structured calls share `createChatModel`, `buildMessages`, `invokeStructured`, and Zod contracts; deterministic policy, confirmation, execution, persistence, receipt, and rollback remain outside model control.

**Tech Stack:** TypeScript, LangChain `ChatOpenAI`, Zod, LangGraph, Node test runner, Payload repositories, and the existing SSE transport.

**Design:** `docs/superpowers/specs/2026-07-14-langchain-default-runtime-design.md`

**L3 baseline:** `236c0702a1057ab6cced1da2301f3771d23750fc`

## Program rules

- Never combine implementation, default adoption, and Legacy deletion.
- No automatic within-turn fallback from LangChain to a Legacy model.
- Preserve deterministic safety, policy, confirmation, executor, receipt, rollback, persistence, and checkpoint boundaries.
- Use `createChatModel`, `buildMessages`, `invokeStructured`, and shared Zod schemas/constants as the only chat structured-output boundary.
- Do not parse model JSON with regex, substring, fenced-block extraction, or ad hoc `JSON.parse`.
- Keep workspace context untrusted and minimal. Never persist raw prompt/response/reasoning/secrets.
- Live provider evaluations are explicit commands, never default CI.
- Do not push automatically.

## Phase L3-B — Authoritative Orchestrator migration

### Task B1: Lock runtime and bypass contracts with failing tests

**Files:**

- Modify `tests/agent/orchestration/orchestrator-dispatcher.test.ts`
- Add or modify focused tests for `src/lib/agent/orchestration/replan.ts`
- Modify `tests/TEST_MAP.md`

Add tests proving:

1. before adoption, current values retain current behavior; after adoption, unset resolves to `langchain`, explicit `langchain`/`legacy` remain exact, and unknown/empty resolve to `legacy`;
2. dispatcher is the only authoritative Orchestrator entry;
3. incremental/global replan use the injected/selected Orchestrator service, never direct Legacy import;
4. provider/schema failure produces safe typed clarify and never calls Legacy;
5. role-based call budgets separately count Orchestrator, explicit replan, conversational answer, Query commentary, and specialist calls, with zero unexpected duplicates;
6. Primary remains unchanged when Shadow/Canary fails.

Run focused tests and confirm they fail for the direct replan bypass before implementation.

### Task B2: Make Orchestrator protocol schema-derived and context-free

**Files:**

- Modify `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify schema-adjacent constants under `src/lib/agent/llm/schemas/`
- Modify `src/lib/agent/prompts/orchestrator.ts` if it remains the message builder
- Add/modify focused Orchestrator protocol tests

Actions:

- export the intent/role/mode constants already used to construct Zod enums;
- render prompt allowlists from those constants, not a hand-copied list;
- remove plans, IDs, memory, content, and all workspace values from the system message;
- build a minimal resource projection for the user/context message;
- retain strict schema, DAG validation, clarify linkage, and resource-reference guard;
- treat all workspace text as untrusted, including titles and memory content;
- do not add a parallel schema.

### Task B3: Route replan through the authoritative service

**Files:**

- Modify `src/lib/agent/orchestration/replan.ts`
- Modify injection points in `src/lib/agent/chat-pipeline/orchestration-step.ts`
- Modify `src/lib/agent/langgraph/full-adapter.ts` and/or `orchestration-subgraph.ts` only as required for dependency injection

Replace direct `runOrchestrator` imports with an injected service whose default is `dispatchOrchestrator`. Preserve completed-task observations, resource references, dependency fixups, and deterministic failure strategy. Define `ReplanResult` as `success` with a validated `OrchestratorPlan` or `unavailable` with `provider_error | timeout | schema_failure | invalid_dag | invalid_resource_reference` and a safe message. Failure returns this typed safe failure result and preserves the current accepted plan/state: it creates no task, modifies no completed task, executes no replacement plan, performs no automatic within-call retry, and never calls Legacy. The existing pipeline maps the failure to safe unavailable/clarify behavior.

### Task B4: Specialist duplicate-call accounting and deterministic bypass

**Files:**

- Audit/modify `src/lib/agent/orchestration/native-task-executor.ts`
- Audit/modify `src/lib/agent/agents/run-specialized-agent.ts`
- Audit/modify `src/lib/agent/agents/enrich-intent.ts`

L3-B closes duplicate-call risk without migrating a domain specialist. Add a `TurnModelCallBudget` that records `orchestratorCalls`, `replanCalls`, `conversationalAnswerCalls`, `queryCommentaryCalls`, `specialistCalls`, and `unexpectedDuplicateCalls`. Enforce at most one Orchestrator call per authoritative attempt, one replan call per explicit replan event, one answer call only when no complete answer exists, one commentary call per eligible Query, one specialist call per task only when deterministic completeness fails, and zero unexpected duplicates. Add a deterministic completeness predicate for each schema-valid Orchestrator task. A complete task skips specialist enrichment; an incomplete task keeps its current known specialist path and is recorded as a remaining Legacy domain seam.

L3-B must not change specialist prompts, domain schemas, domain fallbacks, write workflows, or `completeStructured()` callers. Tests measure the entire turn, prove the complete-task bypass, and prove an incomplete-task route is classified rather than hidden. The L3-B report must include `legacySpecialistCallCount`, `specialistBypassCount`, `specialistRequiredCount`, and `unexpectedDuplicateModelCalls`; only the last must be zero in L3-B. It must also state: authoritative Orchestrator default is LangChain, downstream specialist seams may still be Legacy, and whole-system migration is not complete. L3-D owns `legacySpecialistCallCount = 0`.

### Task B5: Orchestrator evaluation without default switch

Run deterministic and explicit live evaluation with the unchanged fixed fixtures. Report the exact safety, availability, and performance metrics and denominators from the design. Run three consecutive rounds with at least 99 total authoritative observations and one single-round fixed-matrix acceptance run. Do not change timeout/retry budgets between rounds.

Do not switch the default in this task. Failed safety gates stop L3-B; failed availability/performance gates preserve the implementation but block adoption.

### Task B6: Conversational Answer Generation Boundary

**Files:**

- Audit `src/lib/agent/client.ts::generateStreamingReply`, `streamChatCompletion`, and `fetchChatCompletionText`
- Modify `src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts`
- Modify production dependency wiring in `src/lib/agent/langgraph/full-adapter.ts` and `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts` only where the answer dispatcher requires it
- Create focused answer-runtime modules under `src/lib/agent/answer/` using `createChatModel()`
- Add `tests/agent/conversational-answer-runtime.test.ts`
- Modify `tests/TEST_MAP.md`

First classify every old answer helper as active production, injected-but-unused, compatibility, test-only, or dead/unwired. The target flow is:

```text
Primary/Orchestrator result
  -> one authoritative answer-generation decision
  -> reuse complete reply/args.answer OR one LangChain text-model call
  -> existing SSE emission, persistence, and terminal contract
```

Required contracts:

- `answer_question` never enters the LangChain Query commentary runner;
- a complete Primary answer is emitted directly and causes zero additional answer-model calls;
- a missing natural-language answer uses `createChatModel()` and at most one authoritative answer-generation call;
- no active answer path uses direct `/chat/completions` HTTP or an empty-stream non-stream second-call fallback;
- reasoning/thinking blocks are ignored and never emitted or persisted;
- `tool_call` and `tool_call_chunk` abort the answer stream, are never executed, and cannot contribute later text;
- before the first text token, Provider error, first/total timeout, tool call/chunk, overflow, cancellation, empty final stream, or invalid content returns `unavailable`, emits no answer text, persists no successful assistant message, sends the existing safe SSE error terminal, sends no later `done`, and never falls back to Legacy;
- after text emission, the same failures return `incomplete`; already-sent text may remain visible but is never persisted/projected as a completed assistant answer, later chunks are rejected, the existing safe SSE error terminal is sent with no later `done`, and no Legacy fallback occurs;
- reasoning/thinking blocks are ignored and streaming continues; a tool call immediately maps to `unavailable` before text or `incomplete` after text;
- `complete` persists the answer, while `unavailable` and `incomplete` use `persist: false`; focused tests identify the existing persistence function/return path and prove no empty or incomplete successful assistant message remains;
- this partial contract is only for general conversational answers; Query Commentary remains fully buffered with `accepted | omitted` and never exposes partial output;
- whole-turn accounting distinguishes Orchestrator, answer generation, optional Query commentary, and still-Legacy domain specialist calls.

Do not migrate Planning, Schedule, Memory, Content, Review, or generic specialist schemas in B6. Dead `client.ts` helper deletion remains L3-G work after caller proof.

### Task B7: Combined adoption gate and Orchestrator default switch

Re-run the Orchestrator and conversational-answer matrices after B6. Require all safety gates, `providerTransportSuccessRate >= 99%`, `providerTimeoutRate <= 1%`, `orchestratorCompletionRate >= 99%`, conversational TTFT P50/upper-tail `<= 4,000/8,000 ms`, and Orchestrator/answer total P50/upper-tail `<= 8,000/20,000 ms`.

Only after these gates pass, create a separate adoption commit with this exact resolver table:

```text
unset    -> langchain
langchain -> langchain
legacy   -> legacy
unknown  -> legacy
empty    -> legacy
```

Supported non-empty values may be trimmed/case-normalized. Explicit invalid or empty configuration must not silently select LangChain. Retain `AGENT_ORCHESTRATOR_RUNTIME=legacy` rollback. Do not delete Legacy or claim downstream specialist migration is complete.

## Phase L3-C — Query default runtime

### Task C1: Re-audit eligible QueryFacts parity

**Files:**

- `src/lib/agent/query/facts-repository.ts`
- `src/lib/agent/query/facts.ts`
- `src/lib/agent/query/intent-scope.ts`
- corresponding query tests

For each proposed intent, compare repository queries, visibility, archived/deleted behavior, checklist aggregation, freshness, and formatting. Mark `PARITY_CONFIRMED`, `CONTEXT_INCOMPLETE`, `CONTEXT_STALE_RISK`, or `NOT_ELIGIBLE`. Only `PARITY_CONFIRMED` intents enter the allowlist.

### Task C2: Preserve fact-first answer construction

Keep numerical and status facts deterministic. The model receives a bounded projection and may only add qualitative commentary. Validate that canonical facts are byte-for-byte preserved, model tool calls are rejected/omitted, and missing facts deterministically clarify.

### Task C3: Canonical-first persistence and terminal contracts

Lock the already-shipped production contract rather than restoring the retired partial-stream design:

- canonical answer is rendered before the Provider call;
- commentary is fully buffered and has only `accepted` or `omitted` status;
- `omitted` persists the complete canonical answer and terminates with normal `done`;
- timeout, Provider error, invalid commentary, numeric content, reasoning-only content, or tool-call metadata omit commentary and still complete normally;
- no Query SSE error, user-visible partial commentary, or empty assistant message is produced;
- facts load exactly once and the Query Provider is called at most once;
- no Legacy fallback occurs after Provider start;
- conversation persistence remains the current canonical-first contract.

Only resource missing, facts-loader failure, canonical-renderer internal failure, or request cancellation may produce a Query-level clarify/failure. Do not reintroduce `QueryStreamFailure` as a production producer.

### Task C4: Admin/live evaluation, then default adoption

Run fixed parity and live fixtures. Require zero factual mismatch, write adoption, unsafe resource reference, partial user-visible output, duplicate call, task execution, and database mutation. Switch defaults in a separate commit only after evaluation:

```text
unset AGENT_QUERY_RUNTIME  -> langchain
unset AGENT_QUERY_ADOPTION -> admin
```

The explicit rollback remains:

```text
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
```

Do not remove the adoption gate in L3-C.

### Task C5: Eliminate active Legacy Query model ownership

Inventory every active Query intent and assign exactly one terminal classification:

- `LANGCHAIN_ENHANCED` — deterministic facts with optional LangChain expression;
- `DETERMINISTIC` — complete read response with no model call;
- `NOT_PURE_READ` — routed to the owning Write or Review domain;
- `RETIRED` — no longer a supported production path.

L3-C cannot exit while any path is `active + unsupported + Legacy model`. The exit report and tests require `activeLegacyQueryModelCalls = 0`. This does not require every Query to call a model.

## Phase L3-D — Specialized domain model seams

Perform D1–D6 as independent domain slices. For every slice: write failing contract tests, add/reuse a strict Zod schema, use shared model config/factory/messages/invocation, preserve deterministic fallback explicitly, run domain live smoke, and commit separately.

L3-D owns all specialist prompt, domain schema, domain fallback, and domain model-call migrations deferred by Task B4. Do not treat B4 accounting/bypass as a completed specialist migration.

### D1 Planning and Checklist

Targets:

- `src/lib/agent/workflows/plan-decomposer.ts`
- `src/lib/agent/workflows/plan-seed.ts::inferTopicWithLLM`
- `src/lib/agent/planning/readiness-gate.ts`
- plan/checklist specialist enrichment

Remove direct chat HTTP and regex JSON extraction. Models produce typed draft facts only. Deterministic readiness, resource resolution, proposal creation, confirmation, and executor remain authoritative.

### D2 Schedule

Targets:

- `src/lib/agent/schedule/slot-extraction/llm-extractor.ts`
- `src/lib/agent/workflows/schedule-time-llm.ts`
- `src/lib/agent/workflows/plan-schedule-llm.ts`
- schedule clarification/enrichment

Preserve time normalization, conflict policy, resource validation, draft/confirmation, and idempotency. A model cannot create schedule items.

### D3 Review

Target `src/lib/agent/workflows/weekly-review-llm.ts` and review specialist enrichment. Compute source facts deterministically, validate recommendations as typed data, and keep plan-review persistence outside the model seam.

### D4 Memory and learning

Targets include `src/lib/agent/learning-loop.ts`, cognitive advisory, memory enrichment, and clarification where applicable. Keep candidate extraction separate from deterministic save/suggest policy. No raw messages or hidden reasoning enter memory. Treat embeddings as a separate provider capability; do not force chat abstractions onto embeddings.

### D5 Content

Migrate content/timeline specialist enrichment to the shared structured boundary. Preserve content schemas, resource ownership, proposal, and persistence behavior.

### D6 Session Coordinator and remaining compatibility planners

Resolve the default-on/default-off contradiction in `coordinator-feature-flag.ts`. If Transition Engine remains enabled, replace manual model-output extraction with a strict shared schema. Review the feature-flagged LLM Tool Planner; migrate only if it is an intended supported path, otherwise keep it off pending L3-G deletion proof.

## Phase L3-E — LangGraph consolidation

### Task E1: Prove active node ownership

Map every production step to one LangGraph node/service and identify duplicate `run-agent-chat-pipeline`, execution graph, subgraph, or adapter logic. Add graph topology and dependency-injection tests before deletion.

### Task E2: Consolidate orchestration without moving safety

LangGraph may own sequencing, state transitions, streaming lifecycle, and resume. It must call existing deterministic policy/executor/persistence services rather than reimplementing them. Preserve checkpoint IDs, pending actions, idempotency, receipt, rollback, and failure terminal semantics.

### Task E3: Checkpoint/version strategy

Define whether in-flight Legacy checkpoints are drained, version-routed, or migrated. Test resume across the supported boundary. Do not delete a node/schema while persisted checkpoints can still require it.

## Phase L3-F — Remaining Default Closure & Global Production Soak

After B–E pass, create configuration-only/default-adoption changes only for remaining Graph/Domain defaults that were not already switched. Do not repeat the Orchestrator default commit completed in L3-B or the Query runtime/adoption default commit completed in L3-C. Verify those earlier defaults remain effective, then run the global soak and rollback drill. During a defined soak window collect only redacted counters:

- runtime selected per turn;
- provider/schema/timeout failures;
- fallback selection before turn;
- role-based model-call counts and unexpected duplicates;
- latency P50/P95/upper tail, API calls, and cost;
- read/write/clarify/resource mismatch;
- task execution and database mutation during evaluation;
- checkpoint/resume and persistence failures.

Before calling the whole runtime LangChain-default, the active-path inventory must report `activeProductionDirectChatHttpCalls = 0`, `activeProductionCompleteStructuredCalls = 0`, and `activeLegacyChatModelCalls = 0`. Deterministic paths and embedding-only transport are separately classified and do not count as Legacy chat-model calls.

Apply the design's denominators exactly: schema validity is over completed Provider payloads; transport success, timeout, and Orchestrator completion are over all Provider requests or all authoritative observations as defined. Safe typed failure does not count as product completion. Safety failure stops the phase; availability or performance failure blocks the default switch without discarding the safe implementation.

At exactly 99 observations, one timeout is approximately `1.01%`, so the `providerTimeoutRate <= 1%` gate permits zero timeouts. Fix the observation count and timeout/retry policy before evaluation; never add requests after a failure merely to dilute the denominator.

No raw prompt, response, reasoning, workspace record, or secret is collected. Drill rollback using explicit Legacy environment values and record the result.

## Phase L3-G — Legacy decommission

Delete one proven-unused group at a time:

1. Legacy Orchestrator and direct replan imports;
2. old Router V2/manual final-content parsing;
3. `completeStructured` and migrated callers;
4. direct chat-completion helpers no longer needed by answer/stream paths;
5. duplicate graph/pipeline compatibility layers;
6. retired feature flags, prompts, tests, and docs.

Before each deletion, require production import search, runtime telemetry, rollback-window closure, checkpoint compatibility, full validation, and a dedicated revert command. Never delete deterministic safety code based only on regex-heavy implementation or a “legacy” filename.

## Validation required for every phase

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run check:typography
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Provider evaluations and database-connected smoke tests are separate explicit commands. They are not added to default CI.

## Commit and stop discipline

- L3-A commit: `docs(agent): define LangChain default runtime migration`
- Each later phase uses a distinct implementation commit and, where applicable, a distinct adoption/default commit.
- After each phase: report baseline, branch, commit, worktree, tests, evaluation, safety counters, unmet gates, and `git revert <commit>`; then stop.
