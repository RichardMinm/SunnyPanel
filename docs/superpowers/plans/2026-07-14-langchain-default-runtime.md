# LangChain Default Runtime Migration — Implementation Plan

> Execute one phase at a time. Each phase requires a fresh branch, requirement-by-requirement review, full validation, a separate commit, and an explicit stop. This plan does not authorize implementation during L3-A.

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

1. unset/unknown/current explicit values resolve to the documented runtime;
2. dispatcher is the only authoritative Orchestrator entry;
3. incremental/global replan use the injected/selected Orchestrator service, never direct Legacy import;
4. provider/schema failure produces safe typed clarify and never calls Legacy;
5. one orchestration decision is made per turn and model-call counts include replan/specialist calls;
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

Replace direct `runOrchestrator` imports with an injected service whose default is `dispatchOrchestrator`. Preserve completed-task observations, resource references, dependency fixups, and deterministic failure strategy. A failed LangChain replan returns a typed safe plan; it never calls Legacy.

### Task B4: Define the specialist duplicate-call boundary

**Files:**

- Audit/modify `src/lib/agent/orchestration/native-task-executor.ts`
- Audit/modify `src/lib/agent/agents/run-specialized-agent.ts`
- Audit/modify `src/lib/agent/agents/enrich-intent.ts`

Before switching Orchestrator default, decide per task whether specialist enrichment is necessary. Do not automatically make a second Legacy call after a schema-valid Orchestrator task. Either:

- deterministically accept already-complete typed args; or
- call one migrated structured specialist extractor with explicit accounting.

Tests must measure whole-turn calls, not only calls inside one runner.

### Task B5: Orchestrator evaluation and default switch (separate commits)

First run deterministic and explicit live evaluation with fixed fixtures. Report schema validity, intent/mode mismatch, read-to-write, clarify-to-write, resource invention, unresolved write, injection, DAG, provider failure, duplicate calls, execution, mutation, latency, calls, and cost.

Only after gates pass, create a separate adoption commit changing the unset default to LangChain while retaining explicit `legacy` rollback. Unknown values must fail safely and be tested. Do not delete Legacy.

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

### Task C3: Stream and persistence contracts

Test complete/unavailable/partial terminal states at the real persistence seam. Complete may persist; unavailable/partial may not persist a full assistant answer. Use the existing terminal/error protocol and do not change Payload schema unless a later phase separately authorizes it.

### Task C4: Admin/live evaluation, then default adoption

Run fixed parity and live fixtures. Require zero factual mismatch, write adoption, unsafe resource reference, duplicate call, task execution, and database mutation. Switch runtime/adoption defaults in a separate commit only after evaluation; retain `AGENT_QUERY_RUNTIME=legacy` and adoption off as rollback through soak.

## Phase L3-D — Specialized domain model seams

Perform D1–D6 as independent domain slices. For every slice: write failing contract tests, add/reuse a strict Zod schema, use shared model config/factory/messages/invocation, preserve deterministic fallback explicitly, run domain live smoke, and commit separately.

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

## Phase L3-F — Default switch and soak

Create one configuration-only/default-adoption change after B–E pass. During a defined soak window collect only redacted counters:

- runtime selected per turn;
- provider/schema/timeout failures;
- fallback selection before turn;
- duplicate model calls;
- latency P50/P95/upper tail, API calls, and cost;
- read/write/clarify/resource mismatch;
- task execution and database mutation during evaluation;
- checkpoint/resume and persistence failures.

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
