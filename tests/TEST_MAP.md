# SunnyPanel test map

Updated: 2026-08-20

This map describes the current product test boundaries. Historical rollout
phases and one-time Provider Gates belong in Git history or evaluation docs,
not in the default unit-test contract.

## Quality bar

A retained test must exercise production behavior or a named contract and must
be capable of failing when that behavior regresses.

Accepted test targets:

- Production functions and typed schemas.
- State transitions and safety boundaries.
- Rendered components and user-visible output.
- API, database, checkpoint, and browser integration paths.
- Narrow source-level architecture guards when runtime observation cannot prove
  the boundary, such as preventing imports of an executor from an observation
  module.

Rejected test patterns:

- `assert.ok(true)` or assertions that accept every possible result.
- Local stubs that only verify the stub itself.
- Fixture files that validate only their own hand-written expectations.
- Phase-completion snapshots that match source strings, CSS fragments, import
  placement, hook counts, or file existence without exercising behavior.
- Tests that write reports or raw Provider responses into the repository.
- Live Provider calls hidden inside a deterministic/default test command.

## Commands

| Command | Scope | Provider | Database |
| --- | --- | --- | --- |
| `npm test` | Complete deterministic baseline below | No | No |
| `npm run test:agent` | Root Agent, LangGraph runtime, safety, Ops, Dashboard | No | No |
| `npm run test:agent:contracts` | Chat pipeline, LangChain schemas/protocol, orchestration, session | No | No |
| `npm run test:agent:planning` | Plan, checklist, timeline, confirmation, linkage, rollback | No | No |
| `npm run test:agent:schedule` | Schedule query, draft, conflict, execute, linkage, rollback | No | No |
| `npm run test:content` | Public content, writing, palette, typography, rich content | No | No |
| `npm run test:agent:checkpoint` | LangGraph PostgresSaver persistence and resume | No | Yes |
| `npm run test:agent:e2e` | Agent runtime integration | Config-dependent | Yes |
| `npm run test:e2e` | Browser product flows | Config-dependent | Yes |

`npm test` runs the five deterministic groups: Agent core, Agent contracts,
planning, schedule, and content. Database, browser, and live Provider checks
remain explicit.

GitHub Actions runs this baseline with `DATABASE_URL` removed from the test
process. After the isolated PostgreSQL migration step, it runs the checkpoint
integration and release-readiness verification separately, then builds the
standalone application and production container. Real Provider evaluations
remain manual and are never part of CI.

## Protected product contracts

### Agent core and safety

Representative paths:

- `tests/agent/action-receipts.test.ts`
- `tests/agent/confirmation.test.ts`
- `tests/agent/policy-guard.test.ts`
- `tests/agent/execute-and-persist-step.test.ts`
- `tests/agent/transactional-executor.test.ts`
- `tests/agent/rollback*.test.ts`
- `tests/agent/turn-finalizer.test.ts`

Required invariants:

- Reads never become writes.
- Draft and dry-run never execute.
- Writes require policy and confirmation.
- Execution, receipt, rollback, and replay remain idempotent and owner-bound.
- Failures do not fabricate success or silently continue into a write path.

### LangGraph runtime

Representative paths:

- `tests/agent/langgraph-*.test.ts`
- `tests/integration/langgraph-postgres-checkpointer.test.ts`

Required invariants:

- Node ordering and interrupt/resume semantics remain deterministic.
- The executable topology has one ownership entry for every Full and compound
  node; only named services own execution, resume, and turn persistence.
- Production mounts one compound subgraph; the decision step cannot execute
  domain actions, and no inline or imperative alternate runner remains.
- Checkpoint keys isolate users and threads. Conversation deletion removes the
  checkpoint first and fails closed before deleting the business thread.
- Cleanup ignores foreign namespaces, removes orphaned rows, applies a bounded
  30-day default only to closed/archived threads, preserves active threads, and
  never reinterprets an old graph version.
- Resume does not duplicate dry-run, execution, receipt, or persistence.
- Cancellation and typed failures terminate safely.

### LangChain and Orchestrator contracts

Representative paths:

- `tests/agent/llm/*.test.ts`
- `tests/agent/orchestration/langchain-orchestrator.test.ts`
- `tests/agent/orchestration/orchestrator-capability-manifest.test.ts`
- `tests/agent/orchestration/orchestrator-decision-consistency.test.ts`
- `tests/agent/orchestration/orchestrator-output-mapper.test.ts`
- `tests/agent/orchestration/resource-readiness-guard.test.ts`
- `tests/agent/orchestration/query-scope-*.test.ts`
- `tests/agent/orchestration/safe-execution-failure.test.ts`
- `tests/agent/orchestration/native-execution-error-boundary.test.ts`
- `tests/agent/planning/planning-specialist-model-seam.test.ts`
- `tests/agent/memory-learning-model-seam.test.ts`
- `tests/agent/memory-embedding-boundary.test.ts`

Required invariants:

- Structured schemas are the single contract source.
- Workspace context is untrusted data.
- Capability metadata does not expose execute functions.
- Query scope and resource provenance are deterministic.
- Invalid schema, DAG, intent, or resource output fails closed.
- Raw runtime, task, rollback, database, path, and credential errors never enter
  assistant text, observations, client-visible trace, serialized responses, or
  Provider replan messages; those boundaries use one phase-only typed safe
  failure projection.
- Planning and Checklist draft specialists use the shared structured boundary,
  retain their assigned intent, and reject execution or persistence fields.
- Learning extraction uses the shared strict structured boundary, treats turn
  and workspace data as untrusted, and gives the model candidate authority
  only; deterministic message evidence and policy retain save authority.
- Learning logical calls and Provider attempts are first-class turn accounting,
  while the retired generic Memory specialist cannot add a second model call.
- The production turn finalizer commits its terminal event before optional
  learning, wires learning through the same turn accounting recorder, and never
  lets a later learning failure revoke or rewrite the terminal result.
- Model reasoning cannot authorize a workflow-rule archive; only deterministic
  evidence of an explicit user preference may do so.
- Learning candidates containing credentials, cookies, tokens, or database URLs
  are ignored before memory, embedding, or suggestion persistence, and write
  failures cannot place raw secrets in trace output.
- Embeddings are independently configured, explicitly opt-in, fail null, and
  never inherit the Agent chat Provider tuple or block deterministic retrieval.
- Active Memory/Learning model seams contain no legacy structured helper,
  direct chat transport, or manual JSON parsing.
- Prompt-JSON schema retries contain only sanitized schema paths and static
  field allowlists, never Provider values or raw responses.
- DeepSeek Responses JSON Schema and terminal-status envelopes fail closed.
- Streaming remains on a protocol with observable complete/partial terminals.
- No raw prompt, response, secret, or reasoning is retained.

Historical evaluation/harness snapshots are not runtime contracts and are not
part of the deterministic suite. Live Gate scripts remain explicit, manually
authorized observations and must not be interpreted as unit-test evidence.

### Conversation and Dashboard

Representative paths:

- `tests/agent/conversation-continuity.test.ts`
- `tests/agent/conversation-follow-up.test.ts`
- `tests/agent/dashboard.test.ts`
- `tests/agent/ops/agent-ops-api.test.ts`
- `tests/agent/ops/*.test.tsx`

Required invariants:

- Recent conversation state and trusted workspace context reach the
  authoritative Orchestrator.
- New conversations have an empty welcome state rather than a fake completed
  turn.
- IME composition cannot submit or cancel a turn accidentally.
- Product UI hides raw tool names, IDs, Provider details, and internal traces.
- Browser streams consume one SunnyPanel terminal (`complete`, `partial`,
  `unavailable`, or `cancelled`) rather than Provider-specific event names.
- Partial, unavailable, and cancelled output is visibly retryable but never
  promoted to a persisted completed assistant message.
- Production Agent E2E and smoke require exactly one final successful terminal;
  `done` must precede it and `persist` must be true.
- The production-container Gate leaves the Query variables unset, exercises the
  narrow default admin LangChain Query seam, and proves aggregate commentary
  appears exactly once; its deterministic
  Provider accepts streaming only for the enum-only qualitative protocol.
- Thread metadata displays product state/tags without internal thread IDs.
- Ordinary answers stay lightweight while structured artifacts use cards.
- Agent Ops reports execute and rollback reliability separately over an explicit
  recent Receipt sample; pending and indeterminate states are never hidden in a
  success rate.

### Release readiness

Representative paths:

- `tests/content/release-readiness.test.ts`
- `tests/integration/langgraph-postgres-checkpointer.test.ts`

Required invariants:

- Application startup never applies Payload migrations implicitly.
- Release preparation applies migrations, initializes checkpoint tables, and
  then performs a read-only migration-state verification.
- Readiness requires every registered Payload migration, no development marker,
  and every LangGraph checkpoint table.
- Missing database state returns a safe 503 response before traffic is accepted.
- Production builds do not connect to or mutate PostgreSQL.

### Planning, checklist, schedule, and timeline

Representative paths:

- `tests/agent/planning/*.test.ts`
- `tests/agent/planning/*.test.tsx`
- `tests/agent/schedule/*.test.ts`
- `tests/agent/schedule/*.test.tsx`
- `tests/agent/schedule/schedule-specialist-model-seam.test.ts`
- `tests/agent/schedule/schedule-generic-specialist-retirement.test.ts`
- `tests/agent/schedule/schedule-plan-frozen-proposal.test.ts`
- `tests/agent/review/*.test.ts`
- `tests/agent/writing/*.test.ts`
- `tests/agent/content/*.test.ts`
- `tests/agent/suggestions-deterministic-sync.test.ts`
- `tests/agent/active-legacy-model-seams.test.ts`

Required invariants:

- Draft -> dry-run -> confirmation -> execution boundaries remain explicit.
- Existing typed plan decomposition is reused without a duplicate model call;
  otherwise schema/provider failure falls back to deterministic decomposition.
- Complete plan/create-checklist work bypasses specialist calls; only an
  incomplete compose-checklist draft may request typed Checklist facts.
- Created plans, checklists, schedule items, and timeline events retain their
  cross-feature links.
- Progress facts are deterministic.
- Conflict handling, completion, rollback, and idempotency remain covered.
- Schedule model enrichment uses strict shared schemas, isolates untrusted
  context, accounts for every logical call and Provider attempt, and falls
  back without writing when the Provider or schema fails.
- Schedule intents bypass the retired generic Specialist completely; an
  ambiguous date still clarifies deterministically before any time-model call.
- Plan scheduling lets the model assign only trusted task keys and temporal
  fields; deterministic code rejects unknown/duplicate keys, invalid dates or
  times, and conflicts before a complete proposal can be frozen.
- Frozen plan scheduling commits atomically, rolls back create or commit
  failures, and reports rollback failure as an indeterminate transaction.
- Review facts, hard risks, resources, and state remain deterministic; Review
  model calls can only add bounded prose through strict shared schemas.
- A saved Weekly Review freezes the complete fingerprinted proposal before
  confirmation and executes it without recomputation; its review, newly created
  suggestions, and audit record commit or roll back as one transaction. Plan
  evaluation remains a read-only operation with no review, run, or Plan mutation.
- The Weekly Review confirmation card renders the exact frozen completion,
  risk, gap, and recommendation facts in user-facing language without exposing
  internal fingerprints or model provenance.
- Writing Assist uses action-specific strict schemas, isolates all user, style,
  and related-content text as untrusted data, accounts its specialist call, and
  never exposes Provider errors or secrets through chat or trace.
- Agent Inbox sync persists the deterministic rule drafts without a model
  rewrite, performs no Payload access for an empty candidate set, and never
  reopens accepted, completed, or cooling-down dismissed suggestions.
- Production contains no `completeStructured` file or reference. Retired
  generic agent prompts, suggestion enhancer, Cognitive model variant, and
  Tool Planner model/runtime/shadow/flag files remain absent; the retained
  Tool Planner facade exposes deterministic catalog, validator, types, and
  fail-closed response contracts only.
- The retired direct intent-model, ReAct, function-calling Router V2, static
  Router chain, and legacy ToolPlan/workflow bridge remain absent. Production
  chat dependencies contain no second intent resolver, and the authoritative
  Capability Manifest reads argument metadata from a neutral contract module.
- Timeline composition and completion notes remain deterministic: complete or
  incomplete Content tasks use zero specialist model calls, ambiguous sources
  clarify before a proposal, and resource, visibility, and persistence choices
  cannot be supplied by a model.
- User-visible status and priority values are localized and formatted.

### Content and palette

Representative paths:

- `tests/content/*.test.ts`
- `tests/markdown/*.test.ts`

Required invariants:

- Public metadata, rich content, writing persistence, and taxonomy remain
  stable.
- Writing versions restore non-destructively; document-set hierarchy rejects
  cycles; outlines, internal document links, and backlinks stay connected.
- Rich text validation and public rendering share the same marks and block
  contract, including underline, highlight, media, math, details, and page breaks.
- Palette tokens preserve the Forest default, saved user selection, semantic
  hues, and accessible contrast.
- Public, Dashboard, and admin CSS bundles remain separated.

### Integration and E2E

- `tests/integration` requires a non-production PostgreSQL database.
- `tests/e2e` requires a running application and isolated test credentials/data.
- `tests/e2e/dashboard-writing.spec.ts` verifies that stale version restores
  return `409` and preserve the newer document saved by another window.
- Provider-backed evaluations require separate user approval, disclosure,
  request budgets, and sanitized reports. They are observations, not unit tests.

## Removed invalid coverage

The 2026-08-05 cleanup removed tests that could not meet the quality bar:

- The 60-case `agent-test-cases.json` suite and its 75 passing checks. It only
  validated hand-written expected fields and never called the Agent.
- Generated/raw result files and the shell runner that stored raw streamed
  responses in the test tree.
- Retired heuristic fixture loops, local parser stubs, and permissive
  "any intent/engine is acceptable" assertions.
- One-time `phase-e*`, `phase-p*`, `phase-w*`, and `phase-c*` source snapshots.
  They verified migration implementation details rather than current behavior
  and were not connected to any test command.
- The standalone floating-trigger source snapshot. User-facing Dashboard
  behavior remains covered by the Dashboard and browser suites.
- Historical L3-B and hybrid Provider Gate tests that pinned rollout budgets,
  observation matrices, report retention, and old fixture decisions. Current
  production branch, schema, safety, resource, and query-boundary contracts are
  covered directly instead.
- Tests for the retired generic suggestion enhancer, Cognitive model wrapper,
  and Tool Planner flags/runtime/shadow graph. Deterministic Cognitive
  Advisory, Capability Catalog, validator, confirmation, Policy, Receipt, and
  rollback behavior remains covered through active contracts.
- Tests for the retired direct function-tool parser, ReAct loop, Router V2
  retry/parser, static root Router chain, and injected model-resolver facade.
  Active LangChain Orchestrator, confirmation, query, and execution contracts
  remain covered by production-path tests and the legacy-seam architecture
  guard.

The product-facing thread metadata requirement from the deleted sidebar phase
snapshot was moved into an executable `formatThreadMeta` test in
`tests/agent/dashboard.test.ts`.

## Remaining follow-up

- Some older Dashboard and card tests still use source inspection. Keep only
  named architecture guards and replace user-facing assertions with rendered or
  browser tests when those areas next change.
- Browser tests must continue using disposable/non-production data.
