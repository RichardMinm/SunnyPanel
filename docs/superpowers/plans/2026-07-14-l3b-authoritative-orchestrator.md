# L3-B Authoritative Orchestrator Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LangChain the guarded authoritative Orchestrator and conversational-answer model boundary without migrating domain specialists, changing deterministic write safety, or deleting Legacy rollback paths.

**Architecture:** `dispatchOrchestrator()` remains the only runtime selector. Orchestrator and replan structured calls share schema-derived prompts, `buildMessages()`, `createChatModel()`, and `invokeStructured()`; deterministic DAG/resource checks remain outside the model. Whole-turn model calls are counted by role, and conversational text generation uses a separate text-only LangChain stream with explicit complete/unavailable/incomplete terminal states.

**Tech Stack:** TypeScript, Node test runner, LangChain `BaseChatModel`, `ChatOpenAI`, Zod, existing SSE transport, existing Agent persistence pipeline.

## Global Constraints

- Do not change Policy Guard, confirmation, Executor, receipt, rollback, Payload schema/migrations, checkpoint format, or Query canonical-first behavior.
- Do not migrate Planning, Checklist, Schedule, Memory, Content, Review, or generic specialist prompts/schemas in L3-B.
- Do not parse model output with regex, substring extraction, fenced-block recovery, or ad hoc JSON parsing.
- Do not automatically fall back to a Legacy model after a LangChain call starts.
- Do not persist or log raw prompts, responses, hidden reasoning, workspace records, secrets, or API keys.
- Keep `AGENT_ORCHESTRATOR_RUNTIME` unset resolving to `legacy` until the separate Task 7 adoption commit passes every live gate.
- Keep Live Provider evaluation explicit, database-free, and outside default CI.
- No automatic push.

---

### Task 1: Lock schema-derived protocol and runtime contracts

**Files:**

- Modify: `src/lib/agent/llm/schemas/orchestrator-output.ts`
- Modify: `src/lib/agent/llm/schemas/router-output.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `src/lib/agent/prompts/orchestrator.ts`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify: `tests/agent/orchestration/orchestrator-runtime-config.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**

- Produces: exported `ROUTER_INTENT_NAMES`, `ORCHESTRATOR_AGENT_ROLES`, and `ORCHESTRATOR_MODES` used by both Zod and prompt rendering.
- Preserves: `runLangChainOrchestrator(options): Promise<OrchestratorPlan>` and pre-adoption runtime resolution.

- [x] **Step 1: Write failing tests** proving prompt allowlists/modes/roles come from the schema constants, the system message contains no workspace value, workspace injection is user-role data, no raw reasoning/execute/receipt/rollback field is accepted, and current unset/unknown/empty runtime remains Legacy.
- [x] **Step 2: Run RED:** `node --import tsx --test tests/agent/orchestration/langchain-orchestrator.test.ts tests/agent/orchestration/orchestrator-runtime-config.test.ts`; failed because the schema-shared constants/API did not exist.
- [x] **Step 3: Implement the minimum schema/prompt refactor:** export readonly values before constructing Zod enums; render the protocol from those values; move `now`, plans, checklists, memories, content, and thread summary exclusively into the bounded workspace projection passed to `buildMessages()`.
- [x] **Step 4: Run GREEN** with the same focused command (33/33) and `env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck` (exit 0).
- [x] **Step 5: Commit:** `31097ea fix(agent): derive orchestrator protocol from schema`.

### Task 2: Route replan through a typed authoritative service

**Files:**

- Modify: `src/lib/agent/orchestration/replan.ts`
- Modify: `src/lib/agent/chat-pipeline/orchestration-step.ts`
- Modify: `src/lib/agent/langgraph/full-adapter.ts`
- Modify: `tests/agent/replan.test.ts`
- Modify: `tests/agent/orchestration-step.test.ts`
- Modify: `tests/agent/langgraph-full-adapter.test.ts`

**Interfaces:**

- Produces:

```ts
export type ReplanResult =
  | { status: "success"; plan: OrchestratorPlan }
  | {
      status: "unavailable";
      reason: "provider_error" | "timeout" | "schema_failure" | "invalid_dag" | "invalid_resource_reference";
      safeMessage: string;
    };

export type OrchestratorService = (
  message: string,
  context: AgentPromptContext,
  signal?: AbortSignal,
) => Promise<OrchestratorInvocationResult>;

export type OrchestratorInvocationResult =
  | { status: "success"; plan: OrchestratorPlan }
  | {
      status: "unavailable";
      reason: "provider_error" | "timeout" | "schema_failure" | "invalid_dag" | "invalid_resource_reference";
      safeMessage: string;
    };
```

- Changes: `replanAfterTaskFailure(input, orchestratorService?): Promise<ReplanResult>`.

- [x] **Step 1: Write failing tests** proving incremental/global replan use an injected service, preserve completed observations/state, return typed unavailable without a fabricated plan, and never import/call the Legacy Orchestrator directly.
- [x] **Step 2: Run RED:** direct Legacy import failed first; a separate execution-graph RED proved typed failure otherwise exposed a stale confirmation proposal.
- [x] **Step 3: Implement the minimum service injection and typed result.** Added a result-returning authoritative entry point; retained the plan-returning dispatcher wrapper solely for deterministic safe-clarify projection; unavailable replan preserves observations and returns no replacement proposal.
- [x] **Step 4: Run GREEN:** 60 focused tests passed and typecheck exited 0.
- [x] **Step 5: Commit:** `git commit -m "fix(agent): route replans through orchestrator service"` (`ea3ddf3`).

### Task 3: Add role-based call budgets and specialist completeness bypass

**Files:**

- Create: `src/lib/agent/orchestration/model-call-budget.ts`
- Modify: `src/lib/agent/agents/run-specialized-agent.ts`
- Modify: `src/lib/agent/agents/types.ts`
- Modify: `src/lib/agent/orchestration/native-task-executor.ts`
- Modify: `src/lib/agent/orchestration/execution-graph.ts`
- Create: `tests/agent/orchestration/model-call-budget.test.ts`
- Modify: `tests/agent/run-specialized-agent.test.ts`

**Interfaces:**

```ts
export type ModelCallRole = "orchestrator" | "replan" | "conversational_answer" | "query_commentary" | "specialist";
export type TurnModelCallBudget = {
  orchestratorCalls: number;
  replanCalls: number;
  conversationalAnswerCalls: number;
  queryCommentaryCalls: number;
  specialistCalls: number;
  unexpectedDuplicateCalls: number;
};
export type SpecialistCallDisposition = "bypassed_complete" | "required_incomplete";
```

- [x] **Step 1: Write failing tests** for every role limit, zero unexpected duplicates, complete-task specialist bypass, exactly one specialist call for incomplete tasks, and unchanged intent when bypassed.
- [x] **Step 2: Run RED:** missing budget module failed both target suites before implementation.
- [x] **Step 3: Implement a deterministic task-completeness predicate** using only schema-valid task args and intent requirements. Thread an optional per-turn recorder through both native and compatibility execution graphs; do not change specialist prompt/schema/fallback logic.
- [x] **Step 4: Run GREEN:** 9 target tests, 36 orchestration-focused tests, and typecheck passed.
- [x] **Step 5: Commit:** `git commit -m "feat(agent): account for orchestrator model calls by role"` (`a10a8b8`).

### Task 4: Establish the LangChain conversational-answer stream

**Files:**

- Create: `src/lib/agent/answer/types.ts`
- Create: `src/lib/agent/answer/runtime.ts`
- Modify: `src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts`
- Modify: `src/lib/agent/chat-pipeline/resolve-intent-step.ts`
- Modify: `src/lib/agent/chat-pipeline/stream-envelope.ts` only to reuse the existing safe error terminal, without changing its event schema
- Modify: `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts`
- Modify: `src/lib/agent/langgraph/full-adapter.ts`
- Create: `tests/agent/conversational-answer-runtime.test.ts`
- Modify: `tests/agent/chat-pipeline/legacy-heuristic-retired.test.ts`

**Interfaces:**

```ts
export type ConversationalAnswerTerminalState =
  | { status: "complete"; persist: true; answer: string }
  | { status: "unavailable"; persist: false; errorCode: SafeAnswerErrorCode }
  | { status: "incomplete"; persist: false; partialOutputEmitted: true; errorCode: SafeAnswerErrorCode };
```

- [x] **Step 1: Write failing fake-model tests** for answer reuse with zero calls; one missing-answer call; reasoning ignored; tool call/chunk before text → unavailable; after text → incomplete; Provider error, first/total timeout, overflow, cancellation, empty final stream, and invalid blocks before/after text; complete persists, other states do not; no `done` after safe SSE error; no Query Commentary partial contract.
- [x] **Step 2: Run RED:** missing answer runtime and old direct token loop failed before implementation; a separate RED proved question-only Orchestrator tasks could not reach the answer runtime.
- [x] **Step 3: Implement the minimum text-only LangChain runtime** with `createChatModel()`, `buildMessages()`, an injectable fake model, one Provider call, bounded first/total timeout, and text/tool/reasoning block validation. Reuse complete `reply`/`args.answer`; do not call Query commentary; remove no Legacy code.
- [x] **Step 4: Integrate terminal behavior** so only complete answers reach the existing `persistAgentTurn()` success path. Unavailable/incomplete throw a typed safe stream failure before finalization; already-emitted partial text is never projected as a completed assistant message.
- [x] **Step 5: Run GREEN:** 36 answer/terminal tests, 60 combined chat-pipeline/LangGraph focused tests, Agent-test TypeScript compilation, production typecheck, and affected-file lint passed.
- [x] **Step 6: Commit:** `9cfbaba feat(agent): add LangChain conversational answer stream`.

### Task 5: Build deterministic L3-B evaluation and safety gates

**Files:**

- Create: `src/lib/agent/orchestration/l3b-evaluation.ts`
- Create: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `scripts/agent-orchestrator-canary-eval.mjs`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**

- Produces aggregate-only reporting for safety, availability, performance, role budgets, specialist disposition, API calls/usage/cost, task execution, and database mutation.

- [x] **Step 1: Write failing tests** for every independent gate and denominator, including 99 observations with one timeout failing the `<=1%` threshold, typed failures excluded from completion, and sanitized reports containing no raw prompt/response/context/secret.
- [x] **Step 2: Run RED:** missing report builder failed; retry-budget and numeric resource-ID classification received separate RED coverage.
- [x] **Step 3: Implement the pure report builder and update the explicit DB-free harness** to reuse the unchanged fixture matrix, fixed retry/timeout budgets, one authoritative attempt per observation, and role-call counters.
- [x] **Step 4: Run GREEN**, including 70 focused tests, typecheck, affected-file ESLint, disabled-by-default script check, and `git diff --check`.
- [x] **Step 5: Commit:** `03152d5 test(agent): add L3-B orchestrator evaluation`.

### Task 6: Run deterministic baseline and explicit Live Provider evaluation

**Files:**

- No production file changes unless a failed gate is traced to a scoped L3-B defect through systematic debugging and a new RED/GREEN cycle.
- Sanitized reports remain outside Git (for example under `/tmp`).

- [x] **Step 1: Run deterministic validation:** typecheck; `test:agent` (1364 tests, 1355 pass, 9 skip, plus 75/75 fixtures); planning (301/301); schedule (289/289); content (173/173); lint (0 errors, 91 baseline warnings); typography; and `git diff --check` passed.
- [ ] **Step 2: Run three consecutive fixed Live rounds** with at least 99 total authoritative observations, fixed timeouts/retries, no database connection, and no default switch.
- [ ] **Step 3: Run the single-round all-fixture acceptance matrix.**
- [ ] **Step 4: Report:** strict schema, typed failures, safety mismatches, DAG/resource/injection, `legacySpecialistCallCount`, `specialistBypassCount`, `specialistRequiredCount`, `unexpectedDuplicateModelCalls`, task execution, database mutation, transport/completion/timeout rates, TTFT/total latency, API calls, usage, and cost.
- [ ] **Step 5: Stop on any failed safety, availability, or performance gate.** Preserve safe implementation commits and leave the default Legacy.

### Task 7: Conditional Orchestrator default adoption

**Files:**

- Modify only after Task 6 passes: `src/lib/agent/orchestration/runtime-config.ts`
- Modify only after Task 6 passes: `tests/agent/orchestration/orchestrator-runtime-config.test.ts`
- Modify: `tests/TEST_MAP.md`

- [ ] **Step 1: Write RED tests** for the post-adoption exact table: unset → `langchain`; explicit `langchain` → `langchain`; explicit `legacy` → `legacy`; unknown → `legacy`; empty → `legacy`.
- [ ] **Step 2: Implement only the unset-default change; keep explicit invalid/empty fail-closed and explicit Legacy rollback.**
- [ ] **Step 3: Run focused, full deterministic, and rollback drill verification.**
- [ ] **Step 4: Create a separate adoption commit:** `git commit -m "feat(agent): adopt LangChain orchestrator by default"`.
- [ ] **Step 5: Stop.** Do not migrate domain specialists, enter L3-C/D, delete Legacy, or push.

## Phase completion evidence

- Implementation commits and the conditional adoption commit remain separate.
- Task 6 must state either `L3-B PASSED` or the exact blocking gate; safe implementation is retained on a failed adoption gate.
- Rollback remains `AGENT_ORCHESTRATOR_RUNTIME=legacy` plus commit-level `git revert <sha>`.
