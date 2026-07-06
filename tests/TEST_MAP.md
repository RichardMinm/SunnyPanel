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
| Root workflow contracts | `tests/agent/root-workflow-contract.test.ts`, `tests/agent/root-router-contract.test.ts` | Root weekly/timeline workflow contracts and router/tool-plan handoff boundaries. | normal |

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
| Query schedule | `tests/agent/schedule/schedule-query-*.test.ts`, `tests/agent/schedule/schedule-intent-boundary.test.ts` | Read-only schedule lookup does not enter creation workflow. | protected |
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
