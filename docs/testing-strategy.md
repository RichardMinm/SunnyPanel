# SunnyPanel Testing Strategy

Status: baseline for Phase T1. This document describes how SunnyPanel tests should protect the product after Agent Workflow v1. It does not introduce behavior or change test scripts.

## 1. Testing Goals

SunnyPanel tests are not optimized for raw test count. They exist to protect the contracts that make the product safe and understandable:

- Agent read/write boundaries.
- Draft / confirmation / execute / rollback safety model.
- Planning workflow.
- Schedule workflow.
- Agent Ops read-only observability.
- Dashboard layout contracts.
- Public site and writing experience.
- Release baseline.

Core Agent rules that tests must preserve:

- Understanding intent is not execution.
- A draft is not a database write.
- Nothing executes before confirmation.
- Writes must be traceable.
- Rollback-capable operations must be protected by rollback payloads and receipts.

## 2. Test Layers

### Pure Unit Tests

Purpose: test pure functions, deterministic rules, and helpers.

Representative coverage:

- Readiness evaluators.
- Slot merge helpers.
- Draft generation.
- Draft revision.
- Local free-slot rules.
- Intent boundaries.
- Parser and formatter helpers.

Requirements:

- Do not access the database.
- Do not depend on React rendering.
- Do not depend on Payload runtime.
- Run quickly and deterministically.
- Each test should protect one clear rule.

### Workflow Flow Tests

Purpose: test Agent workflow transitions and state boundaries.

Representative coverage:

- Planning workflow.
- Checklist workflow.
- Schedule workflow.
- Timeline workflow.
- Query schedule workflow.

Requirements:

- Assert session state changes.
- Assert `pendingAction` behavior.
- Assert draft / prepare / execute separation.
- Assert that writes do not happen early.
- Prefer behavior-level state assertions over private function shape.

### Safety / Contract Tests

Purpose: protect write safety boundaries. These are protected tests and should not be removed casually.

Required coverage:

- Dry-run does not write.
- Policy Guard gates write proposals.
- Pending confirmation is required before medium/high-risk writes.
- Receipts are idempotent.
- Rollback is idempotent.
- Rollback does not affect unrelated data.
- Query flows do not enter write flow.
- `sourceText` or raw prompts are not persisted as business body content.

### Product / UI Tests

Purpose: test what users can see and understand.

Representative coverage:

- `PlanDraftCard`.
- `ChecklistDraftCard`.
- `ScheduleDraftCard`.
- `AgentApprovalCard`.
- `ActionResultCard`.
- `AgentOpsPanel`.
- Sidebar layout contract.
- Public site cards.

Requirements:

- Prefer visible text, roles, labels, and state wording.
- Avoid unnecessary dependence on DOM nesting.
- Avoid locking private `className` details unless the test is explicitly an architecture guard.
- Source-regex tests are allowed as temporary architecture guardrails, but they should not replace product behavior tests.

### E2E / Smoke Tests

Purpose: verify that the real system can run across the browser, server, and database boundary.

Representative coverage:

- Public site smoke.
- Agent JSON/SSE smoke.
- Dashboard smoke.
- Schedule browser smoke.
- Checkpoint / runtime recovery.

Requirements:

- State whether the test needs Postgres, a Next server, auth, or seed users.
- Never connect to production databases.
- Do not mix E2E tests into ordinary unit baselines.
- Document local and CI prerequisites.

## 3. Protected Tests

The following categories and files protect safety boundaries or core product contracts. Treat them as protected, not as ordinary duplicate tests.

### Agent Safety

- `tests/agent/policy-guard.test.ts`
- `tests/agent/action-receipts.test.ts`
- `tests/agent/rollback.test.ts`
- `tests/agent/rollback-execute.test.ts`
- `tests/agent/rollback-request.test.ts`
- `tests/agent/tool-dry-run.test.ts`
- `tests/agent/execute-and-persist-step.test.ts`
- `tests/agent/confirmation.test.ts`
- `tests/agent/permission-resolver.test.ts`

Protected contracts:

- Writes pass through preview / guard / confirmation.
- Confirmed execution is traceable.
- Duplicate confirmation does not duplicate writes.
- Rollback payloads are executable or explicitly unavailable.

### Planning / Checklist / Timeline

- `tests/agent/planning/create-checklist-execute.test.ts`
- `tests/agent/planning/create-checklist-idempotency.test.ts`
- `tests/agent/planning/create-checklist-rollback.test.ts`
- `tests/agent/planning/checklist-plan-linkage*.test.ts`
- `tests/agent/planning/timeline-event-semantics.test.ts`
- `tests/agent/planning/timeline-event-rollback.test.ts`
- `tests/agent/planning/planning-full-workflow-e2e.test.ts`
- `tests/agent/planning/plan-readiness.test.ts`
- `tests/agent/planning/planning-readiness-gate.test.ts`

Protected contracts:

- Planning clarifies before under-specified writes.
- Drafts do not write.
- Checklist creation is confirmed and linked safely.
- Timeline semantics stay narrow and reversible.

### Schedule

- `tests/agent/schedule/create-schedule-items-dry-run.test.ts`
- `tests/agent/schedule/create-schedule-items-execute.test.ts`
- `tests/agent/schedule/create-schedule-items-idempotency.test.ts`
- `tests/agent/schedule/create-schedule-items-rollback.test.ts`
- `tests/agent/schedule/schedule-workflow-e2e.test.ts`
- `tests/agent/schedule/schedule-query-*.test.ts`
- `tests/agent/schedule/schedule-intent-boundary.test.ts`

Protected contracts:

- Schedule drafts and dry-runs do not write.
- Confirmed batch execution writes once.
- Rollback deletes only the created schedule items.
- Query schedule does not enter schedule creation.

### LangGraph Runtime

- `tests/agent/langgraph-runtime.test.ts`
- `tests/agent/langgraph-full-runtime.test.ts`
- `tests/agent/langgraph-full-adapter.test.ts`
- `tests/agent/langgraph-checkpointer.test.ts`
- `tests/agent/langgraph-dispatcher.test.ts`

Protected contracts:

- Runtime selection stays explicit.
- Checkpoint configuration remains isolated.
- Pending resume and adapter finalization do not duplicate writes.
- Stale resume and receipt regressions stay covered.
- Orchestration subgraph behavior remains observable.

### Dashboard / Content

- `tests/agent/dashboard.test.ts`
- `tests/content/public-route-metadata.test.ts`
- `tests/content/sunny-prose.test.ts`
- `tests/content/color-tokens.test.ts`
- `tests/content/writing-contract.test.ts`

Protected contracts:

- Dashboard shell keeps the current navigation model.
- Public routes expose metadata.
- Public prose remains readable.
- Design tokens remain centralized.
- Writing workspace preserves its editing contract.

## 4. Delete / Merge Standards

### Tests That Can Be Deleted

A test can be deleted only when its replacement coverage is explicit.

Allowed delete cases:

- It asserts old filenames, old directories, or old private functions and the user-facing behavior is covered elsewhere.
- It duplicates the exact same input/output with no extra scenario value.
- It only proves a component imports or renders without a behavior assertion.
- It asserts a deprecated architecture, such as an old client inbox state.
- It directly conflicts with current README/docs and the current product contract is covered.

### Tests That Cannot Be Deleted

Do not delete tests that protect:

- Read/write boundaries.
- `query_schedule` staying out of schedule creation.
- No writes before confirmation.
- Receipt idempotency.
- Rollback.
- Policy Guard.
- Timeline semantics.
- Dashboard layout contract.
- Public site metadata / prose.
- Historical bug regressions.

### Merge Standard

Merge tests when files protect the same contract at the same layer and the merged file can preserve the meaningful scenarios with less setup. Merge should not reduce protected safety assertions.

### Rewrite Standard

Rewrite tests when they assert private source details but should instead assert product behavior or stable architecture contracts.

## 5. Test Command Strategy

### Fast Local Baseline

Recommended before ordinary product work:

```bash
npm run typecheck
npm run lint
npm run test:content
npm run test:agent
npm run test:agent:planning
npm run test:agent:schedule
git diff --check
```

### Current Scripts

| Command | Scope | DB / server required | Notes |
| --- | --- | --- | --- |
| `npm run test:agent` | Agent root tests, Agent Ops, command tests, intelligent fixture | No real DB expected | Does not run `tests/agent/planning`, `tests/agent/schedule`, or `tests/agent/session` subdirectories. |
| `npm run test:agent:planning` | Planning / checklist / timeline / progress tests | Usually mocked or local fixtures | Main Planning Workflow matrix. |
| `npm run test:agent:schedule` | Schedule readiness / draft / conflict / execute / query tests | Usually mocked or local fixtures | Main Schedule Workflow matrix. |
| `npm run test:content` | Content, public site, writing, markdown tests | No server | Public/writing contract baseline. |
| `npm run test:e2e` | Playwright browser suite | Yes, Next server; some specs need auth/DB | Keep separate from unit baseline. |
| `npm run test:e2e:public` | Public site Playwright smoke | Yes, Next server and non-production Postgres | See `docs/public-site-e2e.md`. |
| `npm run test:e2e:public:local` | Public smoke against an already running server | Yes, external server and non-production Postgres | Use when sandbox cannot bind a port. |
| `npm run test:agent:checkpoint` | LangGraph Postgres checkpoint integration | Yes, non-production `DATABASE_URL` | Do not run against production. |
| `npm run test:agent:e2e` | Agent runtime HTTP/E2E script | Yes, env and server/runtime prerequisites | Keep out of ordinary unit baseline. |
| `npm run smoke:agent` | Deployed Agent smoke | Yes, deployed app and smoke credentials | Post-deploy check only. |
| `npm run typecheck` | Project TypeScript | No | Required baseline. |
| `npm run lint` | ESLint and typography check | No | Required baseline. |

### CI Baseline Recommendation

Use these commands for CI that does not provision a browser E2E environment:

```bash
npm run typecheck
npm run lint
npm run test:content
npm run test:agent
npm run test:agent:planning
npm run test:agent:schedule
```

Future optional script:

```text
verify:ci = typecheck + lint + test:content + test:agent + test:agent:planning + test:agent:schedule
```

This phase does not add the script because the existing scripts are already explicit and the current task is documentation-only.

## 6. New Feature Test Requirements

### New Agent Write Operation

Add tests for:

- Readiness or intent boundary.
- Draft or dry-run.
- Pending confirmation.
- Execute.
- Receipt idempotency.
- Rollback.
- Product UI result state.
- Regression cases for the bug or feature that introduced the workflow.

### New Read-Only Agent Capability

Add tests for:

- Does not write.
- Does not create `pendingAction`.
- Does not enter Policy Guard or Executor.
- Returns a useful product summary.
- Handles empty state.
- Does not inherit stale write workflow session state.

### New UI Component

Add tests for:

- User-visible copy.
- State separation.
- Empty state.
- Dark mode or layout contract when relevant.
- Avoiding source-regex tests unless the requirement is a stable architecture guard.

## 7. Test Pruning Plan

This plan is advisory. Any delete or move must list replacement coverage and safety impact before it is accepted.

### T1-C1 Completed

Low-risk UI state consolidation has been applied to:

- `tests/agent/schedule/schedule-ui-state-contract.test.tsx`
- `tests/agent/planning/planning-ui-state-contract.test.tsx`

The consolidation replaced duplicate product/state-separation assertions while keeping draft, confirmation, result, suggestion, and query empty-state coverage. Protected safety, receipt, rollback, executor, Policy Guard, and workflow tests were not touched.

### T1-C2 Completed

Writing/content source-regex consolidation has been applied to:

- `tests/content/writing-contract.test.ts`

The rewrite kept the writing workspace as a protected content contract, but reduced fragile source/CSS regular expressions into stable architecture guards and semantic contract matrices. The remaining source checks are named as architecture guards and cover durable boundaries: sidebar/provider wiring, editor-only workspace ownership, document library rail actions, writing CSS bundle imports, stable writing CSS tokens, Tiptap/slash command integration, upload helper routing, and publish visibility parsing. Public metadata, sunny-prose, and color-token protected tests were audited and left intact.

### T1-C3 Completed

Root legacy workflow consolidation has been applied to:

- `tests/agent/workflow.test.ts` -> `tests/agent/root-workflow-contract.test.ts`
- `tests/agent/schedule.test.ts` -> merged into `tests/agent/schedule/schedule-conflict-detection.test.ts`
- `tests/agent/schedule-pipeline-integration.test.ts` -> `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts`

The consolidation moved schedule-only coverage out of root `tests/agent` and renamed the broad workflow file into an explicit root workflow contract. The deleted root schedule file had no unique write-safety coverage; its four legacy single-item conflict detector cases are now preserved in the schedule conflict test matrix. At the end of T1-C3, Router workflow and LangGraph runtime/adapter tests were audited but kept in place because they still protected root capability/tool-plan boundaries and high-value checkpoint/resume regressions; T1-C4 then rewrote only the router file while continuing to leave LangGraph tests separate.

### T1-C4 Completed

Router workflow consolidation has been applied to:

- `tests/agent/router-workflow.test.ts` -> `tests/agent/root-router-contract.test.ts`

The rewrite turned broad numbered router/workflow cases into focused root router contracts: schedule query read-only routing, explicit schedule creation behind preview and confirmation, capability questions staying out of preview tools, destructive plan deletes staying preview-only, update routing resolving before preview, follow-up expansion using the last topic, unusable resolver results blocking previews, planned-vs-actual preview/execute trace pairing, router schema fallback, and target-specific create preview routing.

Duplicate detailed coverage was not deleted from the product safety matrix. Schedule query synonyms and low-confidence write disambiguation remain in `tests/agent/schedule/schedule-intent-boundary.test.ts` and `tests/agent/schedule/schedule-query-flow.test.ts`. Capability and tool-gate details remain in `tests/agent/capability-*.test.ts`. LangGraph runtime and adapter tests remain separate and are now treated as a protected runtime contract group, not a T1-C merge target.

### Keep

- Safety tests for Policy Guard, dry-run, confirmation, receipt, execute, rollback, and idempotency.
- Planning workflow tests that protect clarify / draft / prepare / confirmation / execute.
- Schedule workflow tests that protect readiness / draft / conflict / confirmation / execute / query.
- Timeline semantics and rollback tests.
- Dashboard layout contract tests.
- Public metadata, prose, token, and writing contract tests.
- E2E smoke tests, as long as their environment requirements are documented.

### Merge

| Candidates | Reason | Preserve | Risk |
| --- | --- | --- | --- |
| `tests/agent/planning/*card*.test.tsx` | Several files assert adjacent card/component wiring. | Draft-only wording, prepare/revise actions, confirmation state, result parsing. | Low |
| `tests/agent/schedule/schedule-ui-state-contract.test.tsx` | Consolidated in T1-C1 from duplicate product/state/query/suggestion UI tests. | Draft vs confirmation vs result wording, conflict suggestions, query summary, range-specific empty states, and pending-action precedence. | Low |

### Rewrite

| File / group | Current issue | New contract | Risk |
| --- | --- | --- | --- |
| `tests/agent/root-router-contract.test.ts` | Completed in T1-C4; formerly broad synthetic router workflow overlap. | Keep focused read/write routing boundary cases. | Low |
| UI tests using `readFileSync` for component source | Source regex is fragile as the primary assertion. | Prefer rendered markup or stable semantic UI state checks. | Low |

### Delete Candidate

No additional file is approved for direct deletion after T1-C4. The only T1-C3 deletion was replacement-backed: `tests/agent/schedule.test.ts` was merged into `tests/agent/schedule/schedule-conflict-detection.test.ts`. T1-C4 renamed and rewrote `tests/agent/router-workflow.test.ts` as `tests/agent/root-router-contract.test.ts`; no unique root router safety contract was removed.

Potential future delete candidates must first prove:

- The test protects no safety boundary.
- A replacement test covers the same product contract.
- No historical regression loses coverage.
- No write/rollback/receipt guarantee is removed.

If replacement coverage cannot be proven, classify the file as rewrite, not delete.
