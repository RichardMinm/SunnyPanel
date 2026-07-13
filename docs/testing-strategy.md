# Testing Strategy

SunnyPanel tests are organized into layers, from pure unit to end-to-end.

Full test map: `tests/TEST_MAP.md`

---

## Test Layers

### 1. Pure Unit Tests
Test individual functions in isolation.
- `calculatePlanChecklistProgress` — progress computation
- `normalizeTag` / `slugify` — taxonomy matching helpers
- Rich content validators and schema checks
- Color token and CSS bundle guards
- Query runtime config and adoption parsing
- Exact intent/argument eligibility
- Deterministic `QueryFacts` and canonical rendering parity
- Enum-only qualitative projection and commentary validation
- Canonical-first composition

### 2. Workflow Flow Tests
Test multi-step workflows with stubbed/mocked Payload.
- Planning: readiness → draft → dry-run → execute → receipt → rollback
- Schedule: readiness → draft → conflict detection → execute → rollback
- Checklist: create → complete → progress sync → timeline sync
- Session: coordinator, transition engine, reconcile
- Guarded Query production dispatch, single facts load, Provider omission, normal persistence, and kill switches

### 3. Safety / Contract Tests
Test invariants that must not be broken.
- Policy Guard blocks unsafe actions
- Action receipts prevent duplicate execution
- Rollback strategies restore consistent state
- Dry-run never writes to database
- Execute-and-persist writes only after confirmation
- Query Provider input contains only the static protocol and enum projection
- Query actor status cannot be forged by client content
- Query path has no business mutation, duplicate model call, hidden post-Provider Legacy fallback, or partial commentary
- Query exact allowlist and canonical fact parity remain locked

### 4. Product / UI Tests
Test user-visible behavior and UI contracts.
- Dashboard layout and sidebar
- Agent conversation cards (draft, confirmation, result)
- Public site rendering (Home, Blog, Notes, Timeline)
- Writing editor and metadata panel
- Agent Activity timeline (no raw CoT leakage)
- Existing Query SSE completion and chat persistence remain unchanged; no technical Provider copy is added to user-visible UI

### 5. E2E / Smoke Tests
Test with real browser + server + database.
- Public site route smoke
- Dashboard agent shell smoke
- Dashboard schedule calendar
- Dashboard writing workspace
- Manual Admin Chat API limited-adoption evaluation, negative controls, and dual rollback drills

---

## Protected Tests

These test files must not be weakened or deleted without explicit
replacement coverage and approval:

| Protected Group | Files |
|----------------|-------|
| Policy Guard | `tests/agent/policy-guard.test.ts` |
| Action Receipts | `tests/agent/action-receipts.test.ts` |
| Rollback | `tests/agent/rollback*.test.ts` (12 files) |
| Tool Dry-run | `tests/agent/tool-dry-run.test.ts` |
| Execute and Persist | `tests/agent/execute-and-persist-step.test.ts` |
| Create Checklist | `tests/agent/planning/create-checklist-*.test.ts` (3 files) |
| Create Schedule Items | `tests/agent/schedule/create-schedule-items-*.test.ts` (4 files) |
| Planning Full Workflow | `tests/agent/planning/planning-full-workflow-e2e.test.ts` |
| Schedule Full Workflow | `tests/agent/schedule/schedule-workflow-e2e.test.ts` |
| Schedule Query | `tests/agent/schedule/schedule-query-flow.test.ts` |
| QueryFacts parity and exact allowlist | `tests/agent/query-langchain-runtime.test.ts` |
| Provider input, canonical-first, no-partial | `tests/agent/query-qualitative-projection.test.ts` |
| Query evaluation safety metrics | `tests/agent/query-langchain-evaluation.test.ts` |
| Admin adoption, trusted actor, dual kill switch, no mutation/double-run | `tests/agent/query-admin-adoption.test.ts` |
| Admin limited-adoption report | `tests/agent/query-admin-adoption-evaluation.test.ts` |

The Query groups above are protected candidates. Do not delete, merge away, or weaken QueryFacts parity, Provider input boundary, canonical-first, no-partial, exact allowlist, trusted actor, dual kill switch, no-business-mutation, no-double-run, or conversation-persistence parity without explicit replacement coverage and approval.

Manual live Query evaluation is separate from default CI. It requires explicit environment opt-in and must use a non-production evaluation environment. Provider usage and cost stay `N/A` when usable metadata is unavailable; observed latency is evaluation evidence, not an SLA.

## Verify Commands

```bash
npm run typecheck
npm run lint
npm run test:content
npm run test:agent:planning
npm run test:agent:schedule
npm run test:agent
npm run test:e2e          # requires server + database
git diff --check
```
