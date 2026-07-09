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

### 2. Workflow Flow Tests
Test multi-step workflows with stubbed/mocked Payload.
- Planning: readiness → draft → dry-run → execute → receipt → rollback
- Schedule: readiness → draft → conflict detection → execute → rollback
- Checklist: create → complete → progress sync → timeline sync
- Session: coordinator, transition engine, reconcile

### 3. Safety / Contract Tests
Test invariants that must not be broken.
- Policy Guard blocks unsafe actions
- Action receipts prevent duplicate execution
- Rollback strategies restore consistent state
- Dry-run never writes to database
- Execute-and-persist writes only after confirmation

### 4. Product / UI Tests
Test user-visible behavior and UI contracts.
- Dashboard layout and sidebar
- Agent conversation cards (draft, confirmation, result)
- Public site rendering (Home, Blog, Notes, Timeline)
- Writing editor and metadata panel
- Agent Activity timeline (no raw CoT leakage)

### 5. E2E / Smoke Tests
Test with real browser + server + database.
- Public site route smoke
- Dashboard agent shell smoke
- Dashboard schedule calendar
- Dashboard writing workspace

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
