# SunnyPanel Test Map

Status: Phase T1 map. This file records the current test architecture and pruning candidates. T1-C1 has consolidated a small set of low-risk UI state tests, T1-C2 has reduced the brittle Writing source-regex contract, T1-C3 has moved low-risk schedule legacy tests out of the root Agent test directory, and T1-C4 has rewritten the broad router workflow file into a focused root router contract without touching protected safety or workflow tests.

## Overview

The current tests are organized around:

- Agent core.
- Planning.
- Schedule.
- Session.
- Safety.
- Ops.
- Dashboard.
- Content.
- Command.
- E2E.

Some root `tests/agent/*.test.ts` files are historical accumulations. T1-C3 started moving schedule-only legacy contracts into `tests/agent/schedule`; T1-C4 rewrote the router workflow accumulation into an explicit root router contract. Remaining root files should be classified, merged, or rewritten gradually.

Approximate current inventory:

| Area | Count | Notes |
| --- | ---: | --- |
| `tests/agent/*.test.ts` | 83 | Agent core, routing, safety, LangGraph, root workflow contracts, and activity builder contracts. |
| `tests/agent/planning` | 36 | Planning / checklist / timeline / progress workflow matrix. |
| `tests/agent/schedule` | 36 | Schedule readiness / draft / conflict / execute / query workflow matrix. |
| `tests/agent/session` | 11 | Semantic Session Coordinator contracts. |
| `tests/agent/ops` | 4 | Agent Ops read-only API, UI, and activity trace UI. |
| `tests/content` | 15 | Public site, writing, prose, token contracts. |
| `tests/command` | 1 | Floating command trigger. |
| `tests/e2e` | 6 specs + helper | Browser smoke tests. |

Other directories such as `tests/layout`, `tests/writing`, `tests/primitives`, and `tests/performance` exist outside the first T1 scan scope and should be included in a later full repository test map pass.

## Agent Core

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Routing and arbitration | `tests/agent/intent.test.ts`, `tests/agent/intent-arbitration.test.ts`, `tests/agent/intent-router-mismatch.test.ts`, `tests/agent/resolve-intent-step.test.ts` | Intent classification, router-chain metadata, correction away from write intents. | protected for routing regressions |
| Capability registry and tool gate | `tests/agent/capability-registry.test.ts`, `tests/agent/capability-pre-router.test.ts`, `tests/agent/capability-tool-gate.test.ts`, `tests/agent/capability-execute-path.test.ts` | Preview/execute pairing and no execute tools in preview gates. | protected |
| Policy and confirmation | `tests/agent/policy-guard.test.ts`, `tests/agent/confirmation.test.ts`, `tests/agent/permission-resolver.test.ts` | Writes require the correct guard and confirmation behavior. | protected |
| Receipts | `tests/agent/action-receipts.test.ts` | Stable action keys, execute/rollback isolation, idempotent replay. | protected |
| Rollback | `tests/agent/rollback*.test.ts`, `tests/agent/tool-rollback-payloads.test.ts` | Executable rollback payloads and safe restore/delete strategies. | protected |
| Pipeline execution | `tests/agent/execute-and-persist-step.test.ts`, `tests/agent/tool-dry-run.test.ts`, `tests/agent/safety.test.ts`, `tests/agent/tool-plan-consistency.test.ts` | Dry-run, proposed action, write safety, planned vs actual tool consistency. | protected |
| LangGraph runtime | `tests/agent/langgraph-*.test.ts` | Runtime selection, checkpoint config, full adapter behavior, orchestration subgraph. | protected runtime contract group |
| Orchestration | `tests/agent/orchestration-*.test.ts`, `tests/agent/execution-*.test.ts`, `tests/agent/transactional-executor.test.ts` | Observations, replanning, projections, transactional behavior. | normal |
| Thread events | `tests/agent/thread-events.test.ts`, `tests/agent/thread-summary.test.ts`, `tests/agent/thread-write-schema.test.ts`, `tests/agent/turn-finalizer.test.ts` | Turn claiming, terminal events, thread summaries, write schema. | protected where write/idempotency involved |
| Memory and learning | `tests/agent/memory*.test.ts`, `tests/agent/learning-loop.test.ts`, `tests/agent/strategy-feedback-memory.test.ts` | Memory validation, ranking, learning persistence and feedback. | normal |
| Suggestions | `tests/agent/suggestions.test.ts`, `tests/agent/suggestion-feedback.test.ts`, `tests/agent/llm-enhancement.test.ts` | Suggestion generation, feedback, LLM enhancement fallback. | normal |
| Content/writing assist | `tests/agent/writing-assist.test.ts`, `tests/agent/cognitive-advisory.test.ts` | Read-only assistance and writing prompt contracts. | normal |
| LLM Required Mode | `tests/agent/llm-required-mode.test.ts`, `tests/agent/no-llm-unavailable.test.ts` | Feature flag, availability check, pipeline stop before business fallback. Phase LLM-R1. | protected |
| Tool Registry Contract | `tests/agent/tool-registry-contract.test.ts` | Metadata completeness, invariants across 17 tools. Phase LLM-R2. | protected |
| Tool Planner | `tests/agent/llm-tool-catalog.test.ts`, `tests/agent/llm-tool-plan-validator.test.ts`, `tests/agent/llm-tool-planner.test.ts` | Catalog, validation safety, planner feature flags. Phase LLM-R3. | protected |
| Tool Planner Shadow | `tests/agent/llm-tool-planner-shadow-graph.test.ts`, `tests/agent/llm-tool-planner-trace-only-integration.test.ts` | Shadow runner trace-only mode. Phase LLM-R4A. | protected |
| Tool Planner Graph Runtime | `tests/agent/llm-tool-planner-langgraph-runtime.test.ts`, `tests/agent/llm-tool-planner-read-draft-runtime.test.ts`, `tests/agent/llm-tool-planner-runtime-integration.test.ts` | LangGraph StateGraph, read/draft dryRun previews, write blocked. Phase LLM-R4B. | protected |
| Tool Planner Write Proposals | `tests/agent/llm-tool-planner-write-dry-run-proposal.test.ts`, `tests/agent/llm-tool-planner-write-proposal-policy.test.ts`, `tests/agent/llm-tool-planner-write-proposal-integration.test.ts` | Write step eligibility, allowlist, dryRun proposals, preview-only. Phase LLM-R4C. | protected |
| Tool Planner Real Policy Guard | `tests/agent/llm-tool-planner-real-policy-guard.test.ts` | Real Policy Guard + PendingAction. Phase LLM-R4D. | protected |
| Tool Planner Real Pending Action | `tests/agent/llm-tool-planner-real-pending-action.test.ts`, `tests/agent/llm-tool-planner-real-pending-integration.test.ts` | Real PendingAction shape, feature flag gating. Phase LLM-R4D. | protected |
| Tool Planner Confirmation Compat | `tests/agent/llm-tool-planner-confirmation-compat.test.ts`, `tests/agent/llm-tool-planner-confirmation-to-execute-e2e.test.ts`, `tests/agent/llm-tool-planner-confirmation-cancel.test.ts` | confirmation-to-execute E2E. Phase LLM-R4E. | protected |
| Tool Planner Receipt / Rollback | `tests/agent/llm-tool-planner-receipt-rollback-compat.test.ts` | Receipt key, rollback metadata. Phase LLM-R4E. | protected |
| Tool Planner DB Smoke | `tests/agent/llm-tool-planner-db-smoke.test.ts` | Real Postgres DB smoke (skips without DATABASE_URL). Phase LLM-R4F. | protected |
| R5-A Heuristic Gate | `tests/agent/llm-required-no-heuristic-business-path.test.ts`, `tests/agent/tool-planner-required-mode.test.ts`, `tests/agent/tool-planner-failure-responses.test.ts` | AGENT_REQUIRE_LLM=1 disables heuristic business fallback. Phase R5-A. | protected |
| R5-B Read/Draft Parity | `tests/agent/tool-planner-read-draft-parity.test.ts`, `tests/agent/tool-planner-read-query-parity.test.ts`, `tests/agent/tool-planner-capability-response.test.ts` | Read/draft dryRun preview, schedule query unsupported, capability answer. Phase R5-B. | protected |
| R5-C Schedule Read Tool | `tests/agent/tool-planner-schedule-read-tool.test.ts`, `tests/agent/tool-planner-capability-answer-path.test.ts`, `tests/agent/tool-planner-no-heuristic-query-fallback.test.ts` | query_schedule read-only tool, capability answer path. Phase R5-C. | protected |
| R5-D Naming Boundary | `tests/agent/tool-planner-naming-boundary.test.ts` | query_schedule read-only contract, naming audit. Phase R5-D. | protected |
| R6-A Reachability Audit | `docs/phase-r6a-legacy-heuristic-reachability-audit.md` | Read-only audit: reachability, classification, deletion sequence. Phase R6-A. | reference |
| R6-C2-A Schedule/Planning Audit | `docs/phase-r6-c2-a-schedule-planning-deterministic-boundary-audit.md` | Read-only audit: safety vs legacy fallback in schedule/planning modules. Phase R6-C2-A. | reference |
| **R6-C2 Boundary Doc** | `docs/phase-r6-c2-schedule-planning-tool-planner-boundary.md` | Final R6-C2 schedule/planning Tool Planner boundary, gated/kept/deferred summary, replacement coverage. Phase R6-C2-Docs. | reference |
| **R6 Final Audit** | `docs/r6-final-heuristic-and-test-coverage-audit.md` | R6 post-mortem: heuristic residue, test validity, coverage matrix, protected tests status, risk register. Verdict: Pass with follow-up. | reference |
| Root workflow contracts | `tests/agent/root-workflow-contract.test.ts`, `tests/agent/root-router-contract.test.ts` | Root weekly/timeline workflow contracts and router/tool-plan handoff boundaries. | normal |
| **LangChain Foundation (L1-A)** | `tests/agent/llm/*.test.ts` (8 files) | Model config, factory, errors, structured output, Router/Orchestrator Zod schemas, message builder with untrusted context boundary. Pure unit tests — no API, no DB, no network. | normal |
| **LangChain Query Runtime (L1-C1-C1)** | `tests/agent/query-langchain-runtime.test.ts`, `tests/agent/query-qualitative-projection.test.ts` | Shared `QueryFacts` preserve Legacy aggregate/plan parity; eligible queries render canonical facts before an optional, enum-only Provider commentary call. Provider input is audited, output is fully buffered, and invalid/timeout/tool-call output is omitted while the canonical query still completes normally. Default runtime remains Legacy. | protected |
| **LangChain Query Evaluation (L1-C1-C1)** | `tests/agent/query-langchain-evaluation.test.ts`, `scripts/query-langchain-evaluation.mjs` | Fixed 24-case synthetic/sanitized evaluation reports input-boundary, canonical parity, accepted/omitted commentary, latency, and hard read-only safety gates. Deterministic tests use no API or DB. Live DeepSeek evaluation is explicit, DB-free, manual-only, and excluded from default CI. | protected |
| **Admin Query Adoption Gate (L1-C1-C2)** | `tests/agent/query-admin-adoption.test.ts` | Dynamic `legacy/off` defaults, server-authenticated admin derivation, exact aggregate/positive-plan-ID eligibility, pre-facts default denial, max-one facts/Provider calls, immutable Primary, sanitized bounded observations, and dual kill switches. Fake dependencies only; no API or DB. | protected |
| **Admin Query Adoption Evaluation (L1-C1-C2)** | `tests/agent/query-admin-adoption-evaluation.test.ts`, `scripts/query-admin-adoption-evaluation.mjs` | Aggregate-only PASS/FAIL metrics for 30 real-admin read observations, 10 negative controls, canonical/provider safety, latency, persistence expectations, and both kill switches. Deterministic tests use fake observations; the live runner is manual-only, reads existing workspace data, never writes reports or business collections, and is excluded from default CI. | protected |
| **Query Runtime v1 Closure Contracts (L1-C1-C3)** | `tests/agent/query-langchain-runtime.test.ts`, `tests/agent/query-qualitative-projection.test.ts`, `tests/agent/query-admin-adoption.test.ts`, `tests/agent/query-admin-adoption-evaluation.test.ts` | Protected candidates: QueryFacts parity, exact allowlist, trusted server actor, Provider enum-only input, canonical-first composition, no partial output, dual kill switches, no business mutation, no double-run or hidden post-Provider Legacy fallback, and normal conversation persistence. Do not weaken or consolidate away these independent safety contracts. | protected |
| **Orchestrator Shadow (L1-B-S2)** | `tests/agent/orchestration/safety-classifier.test.ts`, `tests/agent/orchestration/orchestrator-shadow.test.ts`, `tests/agent/orchestration/resource-readiness-guard.test.ts` | Safety classification, comparison, resource guard. Pure unit — no API, no DB. | normal |
| **Authoritative Orchestrator Protocol (L3-B)** | `tests/agent/orchestration/langchain-orchestrator.test.ts`, `tests/agent/orchestration/orchestrator-runtime-config.test.ts` | Orchestrator mode/role/intent prompt allowlists share the Zod schema constants; workspace values remain untrusted user-role data; execution artifacts and raw reasoning are forbidden. Pre-adoption unset/unknown/empty runtime remains Legacy. Fake/pure tests only; no API or DB. | protected |
| **Authoritative Replan Service (L3-B)** | `tests/agent/replan.test.ts`, `tests/agent/orchestration-observations.test.ts`, `tests/agent/langgraph-full-adapter.test.ts` | Incremental/global replan uses the selected/injected Orchestrator service rather than a direct Legacy import. Provider/schema/DAG/resource failures remain typed, preserve accepted observations/state, produce no fabricated plan or stale replacement proposal, and do not perform within-call Legacy fallback. | protected |
| **Role-based Model Call Budget (L3-B)** | `tests/agent/orchestration/model-call-budget.test.ts`, `tests/agent/run-specialized-agent.test.ts` | Counts model calls by logical role and scope, flags repeated responsibility as an unexpected duplicate, bypasses Specialist only for schema-valid intents with explicit deterministic requirements, and keeps open-ended or weakly constrained tasks on the existing Specialist path. Scope identifiers are not exposed in snapshots. | protected |
| **Router Shadow (L2-A)** | `tests/agent/router-shadow.test.ts` | Feature flag, comparison, prioritization, collector, Primary-unchanged. Pure unit — no API, no DB. Default off. | normal |
| **Router Structured Protocol (L2-B)** | `tests/agent/router-protocol.test.ts`, `tests/agent/router-shadow.test.ts`, `tests/agent/llm/invoke-structured.test.ts`, `tests/agent/llm/provider-capabilities.test.ts` | Schema-sourced prompt allowlists, strict structured output, clarify/resource safeguards, one Provider call per Shadow evaluation, typed failure isolation, sanitized collector, and Primary unchanged. Fake models only; no API or DB. Default off. | protected |
| **Read/Clarify Router Canary (L2-C0)** | `tests/agent/router-canary.test.ts`, `tests/agent/router-canary-hook.test.ts` | Admin-only clarify adoption plus agreement-only read adoption, exact Primary fallback for writes/compound/failures, bounded timeout and cancellation, typed-resource and injection safety, sanitized metadata, one shared Canary/Shadow model call, preflight coverage, and production-hook isolation. Fake models only; no API or DB. Default off. | protected |
| **Admin Router Canary Smoke (L2-C1)** | `tests/agent/router-canary-evaluation.test.ts`, `scripts/router-canary-evaluation.mjs` | Pure PASS/FAIL report contract, incomplete/unsafe failure gates, Primary identity, timeout/resource/provider classification, sanitized artifacts, and a 32-fixture explicit live harness. Deterministic tests use no API or DB; live execution is manual-only and excluded from default CI. | protected |
| **Router Canary Closure (L2-C1-C1)** | `tests/agent/router-canary-closure-evaluation.test.ts`, `scripts/router-canary-closure-evaluation.mjs` | Fixed 24-observation matrix for typed clarify adoption, three-run cmp-2/cmp-4 evidence, actual typed invalid-resource hits, sanitized timeout metadata, one-call Shadow reuse, exact Primary fallback, and hard PASS/FAIL gates. Fake model only in deterministic tests; Live execution is explicit, DB-free, and excluded from default CI. | protected |

## Planning

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Readiness | `tests/agent/planning/plan-readiness.test.ts`, `tests/agent/planning/planning-readiness-gate.test.ts` | Under-specified plans clarify before write proposals. | protected |
| PlanDraft | `tests/agent/planning/plan-draft.test.ts`, `tests/agent/planning/plan-draft-card*.test.tsx`, `tests/agent/planning/planning-draft-flow.test.ts` | Draft generation, draft-only UI, prepare actions. | protected for write boundary |
| Prepare plan | `tests/agent/planning/prepare-plan-creation.test.ts` | PlanDraft converts to pending-confirmable create args without direct execution. | protected |
| Create plan lifecycle | `tests/agent/planning/created-plan-id-lifecycle.test.ts`, `tests/agent/planning/planning-session-slots.test.ts` | Created plan id and session slots survive workflow transitions. | protected |
| ChecklistDraft | `tests/agent/planning/checklist-draft.test.ts`, `tests/agent/planning/checklist-draft-flow.test.ts`, `tests/agent/planning/checklist-draft-card*.test.tsx` | PlanDraft to ChecklistDraft conversion and draft-only UI. | protected for write boundary |
| Prepare checklist | `tests/agent/planning/prepare-checklist-creation.test.ts` | ChecklistDraft converts to create args and pending confirmation path. | protected |
| Create checklist | `tests/agent/planning/create-checklist-execute.test.ts`, `tests/agent/planning/create-checklist-idempotency.test.ts`, `tests/agent/planning/create-checklist-rollback.test.ts` | Confirmed checklist write, receipt replay, rollback. | protected |
| Plan linkage | `tests/agent/planning/checklist-plan-linkage*.test.ts`, `tests/agent/planning/plan-to-checklist-source-plan-id.test.ts` | Checklist links to real plan id and rollback restores links. | protected |
| Timeline semantics | `tests/agent/planning/timeline-event-semantics.test.ts`, `tests/agent/planning/timeline-event-rollback.test.ts`, `tests/agent/planning/complete-checklist-item-*.test.ts` | Checklist completion creates/restores the correct timeline event. | protected |
| Progress aggregation | `tests/agent/planning/plan-checklist-progress*.test.ts` | Progress is computed from linked checklists without writing `Plan.progress`. | protected |
| Product experience | `tests/agent/planning/planning-ui-state-contract.test.tsx`, `tests/agent/planning/pending-confirmation-ux.test.tsx`, `tests/agent/planning/action-result-card.test.tsx` | User-visible planning states and results. | normal |
| Full workflow | `tests/agent/planning/planning-full-workflow-e2e.test.ts` | Planning -> checklist -> timeline/progress closure. | protected |

## Schedule

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Schedule readiness | `tests/agent/schedule/schedule-readiness.test.ts`, `tests/agent/schedule/schedule-readiness-gate.test.ts`, `tests/agent/schedule/schedule-slots.test.ts` | Context completeness and slot merging. | protected |
| ScheduleDraft | `tests/agent/schedule/schedule-draft.test.ts`, `tests/agent/schedule/schedule-draft-card.test.tsx`, `tests/agent/schedule/schedule-draft-flow.test.ts`, `tests/agent/schedule/schedule-draft-message.test.tsx` | Draft generation and draft-only projection. | protected for write boundary |
| Revise draft | `tests/agent/schedule/schedule-draft-revise*.test.ts`, `tests/agent/schedule/schedule-local-suggestions-flow.test.ts` | Suggestions update drafts without writing. | protected |
| Prepare schedule | `tests/agent/schedule/prepare-schedule-creation.test.ts`, `tests/agent/schedule/schedule-pending-confirmation.test.ts` | Draft converts to pending confirmation path. | protected |
| Create schedule items | `tests/agent/schedule/create-schedule-items-*.test.ts` | Confirmed batch write, dry-run, idempotency, rollback. | protected |
| Conflict awareness | `tests/agent/schedule/schedule-conflict-*.test.ts`, `tests/agent/schedule/local-free-slots.test.ts` | Local conflict detection and suggestions without automatic rescheduling. | protected |
| Legacy schedule compatibility | `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts`, `tests/agent/schedule/schedule-conflict-detection.test.ts` | Legacy single-item schedule proposal/result helpers and conflict detector compatibility. | normal |
| Query schedule | `tests/agent/schedule/schedule-query-flow.test.ts` | Read-only schedule lookup does not enter creation workflow. | protected |
| ~~Schedule intent boundary (legacy)~~ | ~~`tests/agent/schedule/schedule-intent-boundary.test.ts`~~ | R6-C2-B: Deleted — pure keyword/regex boundary. Replaced by Tool Planner. | deleted |
| Product polish | `tests/agent/schedule/schedule-ui-state-contract.test.tsx`, `tests/agent/schedule/schedule-result-card.test.tsx`, `tests/agent/schedule/schedule-product-*.test.tsx` | Draft / confirmation / result / suggestion / query state separation. | normal |
| Full workflow | `tests/agent/schedule/schedule-workflow-e2e.test.ts`, `tests/agent/schedule/schedule-workflow-product-e2e.test.tsx` | End-to-end schedule workflow closure. | protected |

## Session

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Semantic coordinator | `tests/agent/session/coordinator.test.ts`, `tests/agent/session/pipeline-integration.test.ts` | Rule pre-check, feature flag, and coordinator pipeline behavior. | normal |
| Transition engine | `tests/agent/session/transition-engine.test.ts` | LLM transition output is schema-checked and cannot request execution. | protected |
| Reconcile and normalize | `tests/agent/session/normalize-session.test.ts`, `tests/agent/session/reconcile-session.test.ts`, `tests/agent/session/apply-patch.test.ts` | Session compatibility and safe state updates. | protected |
| Router context | `tests/agent/session/router-context.test.ts`, `tests/agent/session/rule-pre-check.test.ts` | Route hints and deterministic pre-checks. | normal |
| Golden scenarios | `tests/agent/session/golden-scenarios.test.ts` | Multi-turn session continuity. | normal |
| Perf trace | `tests/agent/session/perf-trace.test.ts` | Coordinator and trace summaries remain bounded. | normal |

These tests form the session state contract. They should not be mixed into write execution tests.

## Ops

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Agent Ops API | `tests/agent/ops/agent-ops-api.test.ts` | Snapshot is read-only, limited, and hides sensitive fields. | protected |
| AgentOpsPanel | `tests/agent/ops/agent-ops-panel.test.tsx` | Summary, empty states, and no raw JSON leak. | normal |
| Dashboard Ops tab | `tests/agent/ops/agent-ops-dashboard.test.tsx` | Ops entry does not break conversation UI. | normal |
| Agent Activity UI | `tests/agent/agent-activity-builder.test.ts`, `tests/agent/ops/agent-activity-ui.test.tsx` | Activity builder maps read/draft/confirmation/execute/error states, sanitizes details, timeline/trace UI avoids raw JSON and Chain-of-Thought, and the main timeline keeps lightweight running/waiting/success/failed/skipped motion semantics. | normal |
| M6-C2 Activity Runtime UX | `tests/agent/ops/agent-activity-ui.test.tsx` (M6-C2 additions) | Verifies loading text is suppressed when user-visible activity steps are present, developer-only steps trigger fallback, developer vocabulary (LangGraph, tool_call, api_call, policy_guard, raw JSON) is excluded from the main conversation area, and Draft / Confirmation / Result Cards are unaffected by the cleanup. | normal |
| Backend trace / activity streaming | `tests/agent/agent-backend-trace.test.ts`, `tests/agent/stream-events.test.ts`, `tests/agent/schedule/schedule-query-flow.test.ts` | Backend trace sanitizer redacts sensitive values, append failures are non-blocking, realtime SSE activity events route to the frontend, live backend phases map to user-facing labels, query_schedule remains read-only, and write-flow trace maps dry-run / Policy Guard / confirmation / execute / receipt. | normal |

Ops tests protect read-only observability. They must not introduce execute or rollback behavior.

## Dashboard

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Main shell | `tests/agent/dashboard.test.ts` | Dashboard opens as Agent Workspace rather than legacy stats. | protected |
| Sidebar contract | `tests/agent/dashboard.test.ts`, `tests/layout/phase-e*.test.ts` | Collapsed 56px, hover expand, pin lock, icon-first navigation. | protected |
| Inspector ownership | `tests/agent/dashboard.test.ts` | Right inspector stays separate from conversation rendering. | protected |
| Suggestions sync | `tests/agent/dashboard.test.ts` | Server-side suggestions and UI ownership stay stable. | protected |

`tests/layout` is outside the initial T1 scan but should be included in the next full map update.

## Content

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Public polish | `tests/content/public-site-polish.test.ts` | Home, Blog, Notes, Updates, and Checklist public presentation. | normal |
| Public metadata | `tests/content/public-route-metadata.test.ts` | Basic metadata and canonical article metadata. | protected |
| Prose | `tests/content/sunny-prose.test.ts` | Headings, links, blockquotes, code, tables, images, dark mode. | protected |
| Color tokens | `tests/content/color-tokens.test.ts`, `tests/content/ui-primitives.test.ts` | No literal colors and tokenized primitives. | protected |
| Rich content | `tests/content/rich-content*.test.ts` | Rich content schema utilities and renderer behavior. | normal |
| Writing workspace | `tests/content/writing-*.test.ts` | Autosave, categories, editor contract, helper validation, and a minimal writing architecture guard. | protected where data/edit contract is involved |
| CSS bundle split | `tests/content/css-bundle-split.test.ts` | Public, dashboard, and admin bundles remain separated. | protected |

## Command

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Floating command trigger | `tests/command/floating-trigger.test.ts` | Floating trigger hook and removed legacy composer wrapper. | normal |

## E2E

The explicit non-CI Query evaluation command is `env -u AGENT_DEBUG_LOG DATABASE_URL= AGENT_LIVE_LLM_EVAL=1 AGENT_QUERY_RUNTIME=langchain node --import dotenv/config --import tsx scripts/query-langchain-evaluation.mjs`. Setting `DATABASE_URL=` before dotenv loads prevents the local `.env` from restoring a database connection; the script also rejects every non-empty database URL.

The explicit non-CI Admin Query adoption command is `AGENT_LIVE_LLM_EVAL=1 AGENT_QUERY_RUNTIME=langchain AGENT_QUERY_ADOPTION=admin node --import dotenv/config --import tsx scripts/query-admin-adoption-evaluation.mjs`. It reads an existing trusted Payload user and existing plan IDs, performs no business or conversation writes, prints only sanitized category/progress counters plus the aggregate report, and restores the effective default through explicit rollback drills.

| Spec | Requires server | Requires DB | Requires auth | Contract |
| --- | --- | --- | --- | --- |
| `tests/e2e/dashboard-agent.spec.ts` | Yes | Yes | Usually yes | Dashboard Agent shell smoke. |
| `tests/e2e/dashboard-schedule-calendar.spec.ts` | Yes | Yes | Usually yes | Created schedule items appear in calendar view. |
| `tests/e2e/dashboard-thread-actions.spec.ts` | Yes | Yes | Usually yes | Thread hover menu, archive dialog, and cancellation. |
| `tests/e2e/dashboard-writing.spec.ts` | Yes | Yes | Usually yes | Writing workspace entry and preview switching. |
| `tests/e2e/public-site-smoke.spec.ts` | Yes | Yes | No | Public route and mobile smoke. |
| `tests/e2e/smoke.spec.ts` | Yes | Maybe | No/redirect | Basic home and dashboard access smoke. |
| `tests/e2e/helpers/dashboard-shell.ts` | Helper | Helper | Helper | Shared E2E setup. |

Use a non-production database for E2E. Do not connect browser or smoke tests to production data.

## Merge / Rewrite Candidates

| Candidate | Issue | Recommendation | Risk | T1-C allowed |
| --- | --- | --- | --- | --- |
| `tests/agent/root-workflow-contract.test.ts` | Completed in T1-C3; formerly `tests/agent/workflow.test.ts`. | Keep as a small root weekly/timeline workflow contract. | Low | Done |
| `tests/agent/schedule/schedule-conflict-detection.test.ts` | Completed in T1-C3; absorbed `tests/agent/schedule.test.ts`. | Keep legacy single-item conflict detector cases next to modern conflict awareness tests. | Low | Done |
| `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts` | Completed in T1-C3; formerly `tests/agent/schedule-pipeline-integration.test.ts`. | Keep compose_schedule_item legacy proposal, confirmation restore, result parsing, and UI wiring contracts. | Low | Done |
| `tests/agent/root-router-contract.test.ts` | Completed in T1-C4; formerly `tests/agent/router-workflow.test.ts`. | Keep as focused read/write, capability handoff, resolver block, confirmation boundary, and target-specific preview contract. | Low | Done |
| `tests/agent/langgraph-runtime.test.ts` + `tests/agent/langgraph-full-runtime.test.ts` + `tests/agent/langgraph-full-adapter.test.ts` | Runtime and adapter assertions are fragmented, but protect high-value checkpoint/resume and adapter finalizer behavior. | Do not merge during T1-C; keep as protected runtime contract group. | Medium | No |
| `tests/agent/planning/*card*.test.tsx` | UI card source/CSS assertions still overlap outside the consolidated state contract. | Keep for now; T1-C1 added `planning-ui-state-contract.test.tsx` and left source guards as targeted follow-up candidates. | Low | Later only. |
| `tests/agent/schedule/*product*.test.tsx` | Some conflict/product edge files remain after T1-C1 consolidation. | Keep unique conflict/result cases; duplicate state wording moved into `schedule-ui-state-contract.test.tsx`. | Low | Later only. |
| `tests/content/writing-contract.test.ts` | Completed in T1-C2; formerly a large source/CSS regex contract. | Keep as a smaller semantic writing contract plus named architecture guards. | Low | Done |

## Missing Coverage

- `npm run test:agent` does not include `tests/agent/planning`, `tests/agent/schedule`, or `tests/agent/session`; this must remain visible in documentation and CI configuration.
- Public E2E smoke requires a Next server and non-production Postgres setup.
- Several UI tests use source regex as the main assertion. Long term, replace them with rendered semantic UI tests where possible.
- `tests/layout`, `tests/writing`, `tests/primitives`, and `tests/performance` were outside the first T1 scan and need a later full-map pass.
- E2E auth/seed prerequisites should be standardized in one place before expanding browser coverage.
- There is no single `verify:ci` script yet; the current baseline is expressed as separate commands.

## Legacy Heuristic Quarantine (R6-B → R6-Final)

Tests in this section cover the pre-LLM Tool Planner heuristic business fallback path.
They are **not part of the `AGENT_REQUIRE_LLM=1` protected baseline**.
R6-Final-Audit verdict: each file now has a clear disposition.

See: `docs/phase-r6b-legacy-heuristic-test-quarantine.md`, `docs/r6-final-heuristic-and-test-coverage-audit.md`

### Quarantine: Legacy Heuristic Intent

| Module | Files | Contract | R6-Final Status |
| --- | --- | --- | --- |
| Heuristic intent parsing | `tests/agent/plan-source.test.ts`, `tests/agent/pipeline-trace.trace.ts` | Pre-LLM heuristic intent classification (retired stubs). | 🔷 keep-as-legacy-compat |

### Quarantine: Schedule Legacy

| Module | Files | Contract | R6-Final Status |
| --- | --- | --- | --- |
| Schedule readiness | `tests/agent/schedule/schedule-readiness.test.ts`, `tests/agent/schedule/schedule-readiness-gate.test.ts`, `tests/agent/schedule/schedule-slots.test.ts` | Readiness evaluation + slot merging — product behavior. | 🔷 **keep-as-legacy-compat** (readiness is safety, not heuristic) |
| Schedule draft | `tests/agent/schedule/schedule-draft.test.ts`, `tests/agent/schedule/schedule-draft-flow.test.ts`, `tests/agent/schedule/schedule-draft-revise.test.ts`, `tests/agent/schedule/schedule-session-draft.test.ts` | Draft generation + revision — product behavior. | 🔷 **keep-as-legacy-compat** (draft is product, not heuristic) |
| ~~Schedule query intent~~ | ~~`tests/agent/schedule/schedule-query-intent.test.ts`~~ | R6-C2-B Deleted. Replaced by query_schedule read tool. | ✅ deleted |
| Legacy pipeline | `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts` | Legacy pipeline + UI wiring contracts (mixed safety/legacy). | 🔷 **keep-as-legacy-compat** (tests safety/confirmation functions) |
| Schedule preparation | `tests/agent/schedule/prepare-schedule-creation.test.ts` | Draft → create args conversion. | 🔷 **keep-as-legacy-compat** (product behavior) |

### Quarantine: Planning Legacy

| Module | Files | Contract | R6-Final Status |
| --- | --- | --- | --- |
| Plan readiness | `tests/agent/planning/plan-readiness.test.ts`, `tests/agent/planning/planning-readiness-gate.test.ts`, `tests/agent/planning/planning-session-slots.test.ts` | Readiness evaluation + slot merging — product behavior. | 🔷 **keep-as-legacy-compat** (readiness is safety, not heuristic) |
| Plan draft | `tests/agent/planning/plan-draft.test.ts`, `tests/agent/planning/planning-draft-flow.test.ts`, `tests/agent/planning/revise-plan-draft.test.ts`, `tests/agent/planning/revise-plan-draft-flow.test.ts` | Draft generation + revision — product behavior. | 🔷 **keep-as-legacy-compat** (draft is product, not heuristic) |
| Checklist draft | `tests/agent/planning/checklist-draft.test.ts`, `tests/agent/planning/checklist-draft-flow.test.ts` | Checklist draft — product behavior. compose_checklist replacement exists (R5-E). | 🔷 **keep-as-legacy-compat** (migrate to compose_checklist later) |
| Plan preparation | `tests/agent/planning/prepare-plan-creation.test.ts`, `tests/agent/planning/prepare-checklist-creation.test.ts` | Draft → create args conversion. | 🔷 **keep-as-legacy-compat** (product behavior) |

### Quarantine: Session Rules (Business)

| Module | Files | Contract | R6-Final Status |
| --- | --- | --- | --- |
| Rule pre-check (business) | `tests/agent/session/rule-pre-check.test.ts` (deepen/schedule-query/schedule-create/writing-revision sub-tests) | Heuristic session business rules. Confirm/cancel sub-tests remain protected. | legacy-quarantine |

### Quarantine: Needs Replacement

| Module | Representative files | Missing Replacement | Protection |
| --- | --- | --- | --- |
| Checklist plan linkage | `tests/agent/planning/checklist-plan-linkage.test.ts`, `tests/agent/planning/plan-to-checklist-source-plan-id.test.ts` | compose_checklist draft tool (R5-E) | legacy-quarantine |

## R6-C1 Legacy Heuristic Removal Regression (COMPLETED)

Tests verifying heuristic modules were safely removed and replacement coverage exists.

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Modules removed | `tests/agent/tool-planner-no-heuristic-query-fallback.test.ts`, `tests/agent/llm-required-no-heuristic-business-path.test.ts` | Deleted heuristic modules NOT importable; parse-heuristic-intent.ts absent from filesystem. | protected |
| Aggregator retired | `tests/agent/chat-pipeline/legacy-heuristic-retired.test.ts` | resolveAgentIntent / parseHeuristicIntent no longer called. | protected |
| Import consumers retired | `tests/agent/chat-pipeline/legacy-heuristic-import-consumers-retired.test.ts` | intent-resolution / orchestrator / heuristic-intent-resolver no longer import heuristics. | protected |
| Query router retired | `tests/agent/chat-pipeline/legacy-query-router-imports-retired.test.ts` | capability-router / pre-router no longer import query.ts. | protected |
| Knowledge retired | `tests/agent/chat-pipeline/legacy-knowledge-imports-retired.test.ts` | knowledge.ts / shared-text.ts consumers migrated to retired-intent-response. | protected |

## R6-C2-B LOW-risk Legacy Test Retirement (COMPLETED)

Phase R6-C2-B classified and processed LOW-risk schedule/planning legacy-only tests.
No production code was modified. All deferred tests remain for R6-C2-C or later.

| Module | Representative files | Action | Replacement Coverage |
| --- | --- | --- | --- |
| Schedule intent boundary | ~~`tests/agent/schedule/schedule-intent-boundary.test.ts`~~ | Deleted — pure keyword/regex boundary. | `tool-planner-schedule-read-tool`, `tool-planner-no-heuristic-query-fallback`, `llm-required-no-heuristic-business-path` |
| Schedule query intent | ~~`tests/agent/schedule/schedule-query-intent.test.ts`~~ | Deleted — stub killed all assertions (3/3 fail). | `tool-planner-schedule-read-tool`, `tool-planner-no-heuristic-query-fallback`, `tool-planner-capability-answer-path` |

### Deferred (R6-C2-C or later)

| Category | Files | Reason |
| --- | --- | --- |
| Readiness | `schedule-readiness.test.ts`, `schedule-readiness-gate.test.ts`, `schedule-slots.test.ts`, `plan-readiness.test.ts`, `planning-readiness-gate.test.ts`, `planning-session-slots.test.ts` | Readiness evaluation is product behavior, not purely legacy |
| Draft builders | `schedule-draft*.test.ts`, `plan-draft.test.ts`, `planning-draft-flow.test.ts`, `checklist-draft*.test.ts` | Draft generation is product behavior |
| Draft revision | `schedule-draft-revise*.test.ts`, `revise-plan-draft*.test.ts` | Draft revision may be product behavior |
| Preparation | `prepare-schedule-creation.test.ts`, `prepare-plan-creation.test.ts`, `prepare-checklist-creation.test.ts` | Draft → create args conversion may be product behavior |
| Legacy pipeline | `schedule-legacy-pipeline-contract.test.ts` | Mixed content — tests safety/confirmation functions |
| Checkpoint linkage | `checklist-plan-linkage*.test.ts` | compose_checklist draft tool replacement pending |
| Session draft | `schedule-session-draft.test.ts` | Session state draft may be product behavior |
| Query flow | `schedule-query-flow.test.ts` | R6-B says keep for legacy-compat |

See: `docs/phase-r6-c2-a-schedule-planning-deterministic-boundary-audit.md`

## LLM Tool Planner Replacement Coverage

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| No heuristic fallback | `tests/agent/llm-required-no-heuristic-business-path.test.ts` | AGENT_REQUIRE_LLM=1 blocks all heuristic fallback paths. | protected |
| Capability answer | `tests/agent/tool-planner-capability-answer-path.test.ts` | Capability questions return controlled response, not regex router. | protected |
| Schedule read tool | `tests/agent/tool-planner-schedule-read-tool.test.ts` | query_schedule read-only tool exists and works via Tool Planner. | protected |
| No query fallback | `tests/agent/tool-planner-no-heuristic-query-fallback.test.ts` | Schedule/read queries do not fallback to heuristic parser. | protected |
| Read/draft parity | `tests/agent/tool-planner-read-draft-parity.test.ts` | Read/draft tools support dryRun preview. | protected |

## R6-C2-C Tool Planner Schedule/Planning Proposal Contract (COMPLETED)

Phase R6-C2-C strengthened Tool Planner contract tests for schedule/planning proposals.
No production code was modified. All tests use deterministic registry/metadata/readiness assertions.

| Module | Representative files | Contract | Protection |
| --- | --- | --- | --- |
| Schedule proposal contract | `tests/agent/tool-planner-schedule-proposal-contract.test.ts` | Write tool metadata, draft dryRun→proposed_action, no DB write before confirm, no execute before confirm, missing slots→insufficient, planner unavailable→controlled, invalid tool→null, write allowlist boundary. | protected |
| Planning proposal contract | `tests/agent/tool-planner-planning-proposal-contract.test.ts` | Write tool metadata, draft dryRun→proposed_action, no DB write before confirm, no execute before confirm, missing fields→insufficient, compose_checklist draft-only, mergePlanSlots safety, planner unavailable→controlled. | protected |

### R6-C2-C Coverage Matrix

| Scenario | Schedule | Planning |
|----------|----------|----------|
| Write tool metadata (capability, requiresConfirmation, supportsExecute/DryRun/Rollback) | ✅ | ✅ |
| Draft tool dryRun → proposed_action with requiresConfirmation | ✅ | ✅ |
| Draft tool dryRun snapshot: no DB write, no receipt, no execute | ✅ | ✅ |
| Missing slots/fields → readiness status=insufficient | ✅ | ✅ |
| Complete slots → draftable | ✅ | ✅ |
| Existing draft + explicit create → confirmable | ✅ | ✅ |
| Read-only tool dryRun → clarify (not proposed_action) | ✅ | — |
| compose_checklist: draft-only, no execute | — | ✅ |
| mergePlanSlots: non-mutating, preserves useful values | — | ✅ |
| Planner unavailable response: no pendingAction, no execute, no DB write | ✅ | ✅ |
| Planner unavailable response: user-facing message, no heuristic language | ✅ | ✅ |
| Invalid tool → null/safe rejection | ✅ | ✅ |
| Write allowlist boundary (3 write tools, no draft/read cross) | ✅ | ✅ |
| dryRun supported by ALL tools | ✅ | ✅ |
| Readiness is deterministic (no network, no side effects) | — | ✅ |

## R6-C2-D Gated Legacy Fallback Entrypoints (COMPLETED)

Phase R6-C2-D gated keyword/regex write-intent rules in `classifyScheduleIntentBoundary`
behind `AGENT_REQUIRE_LLM=0`. In LLM-required mode, the keyword regex patterns that
produce `schedule_creation` or `revise_schedule_draft` with `source: "rule"` are skipped.
The query guard (`hasQuerySignal` → `query_schedule`) and LLM classifier path remain active.

| Module | File | Action | Detail |
| --- | --- | --- | --- |
| intent-boundary gate | `src/lib/agent/schedule/intent-boundary.ts` | **Gated** | `hasExplicitCreateSignal` + `hasDraftRevisionSignal` keyword rules gated behind `!isAgentRequireLLMEnabled()` |
| intent-boundary safety guard | `src/lib/agent/schedule/intent-boundary.ts` | **Kept** | `hasQuerySignal` → `query_schedule` read-only guard still works in all modes |
| Gating tests | `tests/agent/llm-required-no-heuristic-business-path.test.ts` | **Added** | 4 new tests verify: write intent blocked in AGENT_REQUIRE_LLM=1, query guard preserved, legacy mode unchanged, no fallback to write from generic messages |

### Deferred (unchanged)

| Category | Files | Reason |
| --- | --- | --- |
| Readiness gates | `schedule/readiness-gate.ts`, `planning/readiness-gate.ts` | Readiness orchestration — product behavior |
| Readiness evaluation | `schedule/readiness.ts`, `planning/readiness.ts` | Slot validation — safety contract |
| Draft revision | `schedule/revise-draft*.ts`, `planning/revise-plan-draft.ts` | May be product behavior (0 production callers, but spec says defer) |
| Checklist draft flow | `planning/checklist-draft-flow.ts` | May be product behavior (0 production callers, but spec says defer) |

## Test Pruning Plan

### Keep

- All safety tests for dry-run, Policy Guard, confirmation, execute, receipt, rollback, and idempotency.
- Planning and schedule full workflow tests.
- Query schedule boundary regression tests.
- Timeline semantics and rollback tests.
- Dashboard layout contract tests.
- Public metadata, prose, token, and writing data-contract tests.
- E2E smoke tests with documented non-production prerequisites.

### Merge

| Files | Reason | Keep after merge | Risk |
| --- | --- | --- | --- |
| `tests/agent/langgraph-runtime.test.ts`, `tests/agent/langgraph-full-runtime.test.ts`, `tests/agent/langgraph-full-adapter.test.ts` | Same runtime family. | Runtime default, graph traversal, adapter finalization, checkpoint isolation. | Medium |
| `tests/agent/workflow.test.ts` with weekly/timeline tests | Root workflow file is broad and partly historical. | Weekly review payload and timeline proposal contracts. | Medium |

Completed in T1-C1:

- `tests/agent/planning/planning-product-experience.test.tsx` -> `tests/agent/planning/planning-ui-state-contract.test.tsx`.
- `tests/agent/schedule/schedule-product-polish.test.tsx`, `tests/agent/schedule/schedule-state-separation.test.tsx`, `tests/agent/schedule/schedule-conflict-suggestion-ui.test.tsx`, and `tests/agent/schedule/schedule-query-product.test.tsx` -> `tests/agent/schedule/schedule-ui-state-contract.test.tsx`.

Completed in T1-C2:

- `tests/content/writing-contract.test.ts` was rewritten in place from dense source/CSS regex checks into a smaller protected writing contract. Remaining source checks are named architecture guards and cover sidebar/provider wiring, document rail actions, stable writing tokens, Tiptap/slash command boundaries, upload helper routing, and publish visibility parsing.

Completed in T1-C3:

- `tests/agent/workflow.test.ts` -> `tests/agent/root-workflow-contract.test.ts`.
- `tests/agent/schedule.test.ts` -> merged into `tests/agent/schedule/schedule-conflict-detection.test.ts`.
- `tests/agent/schedule-pipeline-integration.test.ts` -> `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts`.

Completed in T1-C4:

- `tests/agent/router-workflow.test.ts` -> `tests/agent/root-router-contract.test.ts`.
- Numbered synthetic router cases were rewritten as explicit root contracts for schedule query read-only routing, schedule creation confirmation, destructive preview-only routing, update resolver handoff, follow-up expansion, resolver failure blocking, planned-vs-actual trace pairing, router schema fallback, and target-specific create preview routing.
- Repeated schedule synonym and low-confidence write boundary coverage remains in `tests/agent/schedule/schedule-intent-boundary.test.ts` and `tests/agent/schedule/schedule-query-flow.test.ts`.
- Detailed capability-gate coverage remains in `tests/agent/capability-*.test.ts`; root router keeps only the handoff contract.

### Rewrite

| File | Current problem | New contract | Risk |
| --- | --- | --- | --- |
| `tests/agent/root-router-contract.test.ts` | Completed in T1-C4; formerly too broad and overlapping with tool/capability contracts. | Focused query/write route boundary scenarios. | Low |

### Delete Candidate

No additional file is approved for direct deletion after T1-C4. `tests/agent/router-workflow.test.ts` was renamed and rewritten in place as `tests/agent/root-router-contract.test.ts`; no unique root router contract was deleted.

Future delete candidates must list:

- Deletion reason.
- Replacement coverage file.
- Whether any safety guarantee is lost.
- Whether a new test must be added first.

If any of those are unknown, the file stays in rewrite or merge status.
