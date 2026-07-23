# L3-B Known-ID Production Gate Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing six-case `known_id` contract reachable through the production-seam Gate without changing any Provider, Prompt, schema, fixture, threshold, Runtime, or business behavior.

**Architecture:** Keep `l3b-production-gate-contract.ts` as the source of stage cases and derived budgets. Add only the missing fixed report-path entry to the existing CLI registry, then exercise the real CLI in preflight-only mode so a future omission fails before any live evaluation.

**Tech Stack:** Node.js, TypeScript, existing Node test runner, `tsx`, existing L3-B production Gate modules, and Git preflight checks.

## Global Constraints

- Do not call DeepSeek or any other Provider.
- Do not set or read a Provider API key.
- Do not connect to a database.
- Do not change the six Known-ID diagnostics, their order, contexts, or expectations.
- Do not change Full or Residual system rules, Structured Output schemas, retry policy, timeout, model, or Gate thresholds.
- Do not change LangChain or LangGraph business runtime behavior or any default Runtime.
- Do not enter Draft, Dry-run, Policy, Confirmation, Executor, Receipt, or Rollback.
- Do not retain raw prompts, responses, arguments, reasoning, workspace values, errors, stacks, or secrets.
- Do not overwrite prior Acceptance, Focused, Stability, or Known-ID report evidence.
- Do not push.

---

## File Structure

### Modified production harness

- `scripts/agent-production-seam-gate-eval.mjs`
  remains the only explicit production-seam live entry point and gains the
  missing fixed `known_id` report path.

### Modified deterministic coverage

- `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
  spawns the real CLI in preflight-only mode with no API key and validates the
  canonical six-case projection, exact budget, fixed path, and zero attempts.
- `tests/TEST_MAP.md`
  records the CLI-level Known-ID Gate regression.

### Explicitly unchanged

- `src/lib/agent/orchestration/l3b-production-gate-contract.ts`
- `src/lib/agent/orchestration/l3b-production-gate-budget.ts`
- `src/lib/agent/orchestration/l3b-production-gate.ts`
- `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts`
- every Prompt, schema, Provider, retry, threshold, Runtime-default,
  LangGraph, database, and business execution file.

---

### Task 1: Reachable Known-ID Production Preflight

**Files:**
- Modify: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Modify: `scripts/agent-production-seam-gate-eval.mjs`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes:
  `getL3BProductionStageCases("known_id")`,
  `calculateProductionStageAuthorizedBudget(...)`, and
  `L3B_EVALUATION_CONFIG_HASH`.
- Produces:
  a production-seam preflight whose stage is `known_id`, whose fixed report
  path is `/tmp/l3b-r8-production-known-id.json`, whose observation count is
  `6`, and whose current authorization ceiling is `6` logical calls and `24`
  Provider attempts.

- [ ] **Step 1: Write the failing real-CLI regression test**

Add imports to
`tests/agent/orchestration/l3b-production-gate-contract.test.ts`:

```ts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

import {
  L3B_EVALUATION_CONFIG_HASH,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-config";
```

Add a JSON-line parser that ignores non-JSON framework warnings:

```ts
const jsonLines = (value: string): unknown[] =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
```

Add one test that:

1. records whether `/tmp/l3b-r8-production-known-id.json` exists and, when it
   exists, its `mtimeMs` and size;
2. reads the current HEAD with
   `execFileSync("git", ["rev-parse", "HEAD"], ...)`;
3. spawns `scripts/agent-production-seam-gate-eval.mjs` with:

```ts
{
  AGENT_LIVE_LLM_EVAL: "1",
  AGENT_PRODUCTION_SEAM_EVAL: "1",
  HOME: process.env.HOME ?? "",
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH: L3B_EVALUATION_CONFIG_HASH,
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD: head,
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY: "1",
  L3B_PRODUCTION_GATE_STAGE: "known_id",
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED: "1",
  NODE_ENV: "test",
  PATH: process.env.PATH ?? "",
  PAYLOAD_SECRET: "sunnypanel-agent-test-secret-2026",
  TMPDIR: process.env.TMPDIR ?? "/tmp",
}
```

Do not copy `DATABASE_URL`, `AGENT_DISABLE_LLM`, or `DEEPSEEK_API_KEY` into the
child environment.

Accept the existing preflight terminal state appropriate to repository state:

- clean worktree and unused path: exit `0`, `preflight.status === "ready"`;
- dirty worktree: typed `WORKTREE_NOT_CLEAN` with a populated blocked
  preflight;
- pre-existing immutable evidence: typed `REPORT_PATH_EXISTS` with a populated
  blocked preflight.

For every accepted terminal state, assert:

```ts
assert.equal(preflight.stage, "known_id");
assert.equal(preflight.observationCount, 6);
assert.deepEqual(preflight.fixtureIds, L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id));
assert.deepEqual(preflight.rounds, [1]);
assert.equal(preflight.reportPath, "/tmp/l3b-r8-production-known-id.json");
assert.equal(preflight.providerAttempts, 0);
assert.equal(preflight.budget.businessObservations, 6);
assert.equal(preflight.budget.authorizedLogicalCallMaximum, 6);
assert.equal(preflight.budget.authorizedMaximum, 24);
assert.equal(preflight.budget.actualProviderAttempts, 0);
```

Finally assert that the report path remains absent when it was absent before,
or retains the exact same `mtimeMs` and size when immutable evidence existed.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: FAIL because the real CLI returns `INVALID_STAGE`, supplies no
preflight object, and performs zero Provider attempts.

- [ ] **Step 3: Implement the minimal stage-registry fix**

Modify only `REPORT_PATHS` in
`scripts/agent-production-seam-gate-eval.mjs`:

```js
const REPORT_PATHS = Object.freeze({
  acceptance: "/tmp/l3b-r8-production-acceptance.json",
  focused: "/tmp/l3b-r8-production-focused.json",
  known_id: "/tmp/l3b-r8-production-known-id.json",
  stability: "/tmp/l3b-r8-production-stability.json",
});
```

Keep `STAGES` derived from `Object.keys(REPORT_PATHS)` and leave the rest of
the harness unchanged.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same focused command from Step 2.

Expected: PASS. In the uncommitted worktree the child may terminate typed
`WORKTREE_NOT_CLEAN`, but the populated preflight must expose all six canonical
cases, the exact `6/24` ceiling, fixed path, and zero Provider attempts.

- [ ] **Step 5: Update the deterministic test map**

Add one `L3-B Production Seam` row to `tests/TEST_MAP.md` stating that
`l3b-production-gate-contract.test.ts` verifies:

```text
known_id CLI preflight → 6 canonical cases → 6 logical / 24 Provider maximum
→ fixed exclusive /tmp path → zero preflight Provider attempts
```

- [ ] **Step 6: Run focused and project verification**

Run:

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts

env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck

npx eslint \
  scripts/agent-production-seam-gate-eval.mjs \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts

git diff --check
```

Expected: all tests and checks pass with no Provider call and no database
connection.

- [ ] **Step 7: Commit the implementation**

```bash
git add \
  scripts/agent-production-seam-gate-eval.mjs \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/TEST_MAP.md

git diff --cached --check
git commit -m "test(agent): enable known-id production gate"
```

- [ ] **Step 8: Run the clean, no-network preflight**

With the committed HEAD and repository-owned config hash, run the same CLI with
`L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1`, no `DATABASE_URL`, no
`AGENT_DISABLE_LLM`, and no `DEEPSEEK_API_KEY`.

Expected:

```text
stage = known_id
status = ready
observationCount = 6
authorizedLogicalCallMaximum = 6
authorizedMaximum = 24
providerAttempts = 0
reportPath = /tmp/l3b-r8-production-known-id.json
```

Stop after reporting the final HEAD, config hash, six diagnostic identifiers,
sanitized data categories, exact `6/24` budget, and zero calls. Do not run the
live Gate until the user provides a new explicit disclosure authorization.
