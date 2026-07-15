# L3-B-R3-B Compound Semantic Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Do not
> dispatch subagents unless the user separately authorizes delegation.

**Goal:** Repair the compound draft versus missing-existing-target Prompt
boundary, then validate cmp-3/cmp-4 through the approved staged Provider Gates
without changing runtime authority or safety contracts.

**Architecture:** Keep the schema, evaluator, fixtures, Provider configuration,
Resource Guard, and runtime untouched. Add deterministic Prompt contract
markers, reorder classification so task decomposition precedes target-readiness
checks, and distinguish a new dependent draft from mutation of an existing
resource. Use `dependsOn` only for DAG ordering; never pass task results through
args or invent IDs.

**Tech Stack:** TypeScript, Node test runner, Zod, existing SunnyPanel Agent
Prompt builder and evaluation harness. No new dependency.

## Global constraints

- Candidate A only in the first round: minimal Prompt clarification.
- No fixture, schema, metric, Gate threshold, Provider config, timeout, retry,
  model, token, thinking, temperature, runtime, or protected business-module
  changes.
- No synthetic Prompt example or schema-example change in the first round.
- No task execution, database connection/mutation, adoption, default switch,
  Legacy deletion, push, or raw/secret retention.
- Provider work requires the exact phase authorization and is hard-capped at 27
  requests regardless of broader usage permission.
- Keep one implementation commit lineage; an allowed live repair amends it.

---

### Task 1: Freeze the approved design

**Files:**

- Create: `docs/design/phase-l3b-r3b-compound-semantic-boundary.md`
- Create: `docs/superpowers/plans/2026-07-15-l3b-r3b-compound-semantic-boundary.md`

- [ ] **Step 1: Review root cause and scope**

Confirm that target readiness currently precedes decomposition, the schema
already permits `dependsOn`, runtime output references in args remain
unsupported, and cmp-3/cmp-4 fixture contracts remain unchanged.

- [ ] **Step 2: Scan placeholders and whitespace**

```bash
rg -n 'T[B]D|T[O]DO|fill[ ]in|implement[ ]later' \
  docs/design/phase-l3b-r3b-compound-semantic-boundary.md \
  docs/superpowers/plans/2026-07-15-l3b-r3b-compound-semantic-boundary.md
git diff --check
```

- [ ] **Step 3: Commit the approved design**

```bash
git add \
  docs/design/phase-l3b-r3b-compound-semantic-boundary.md \
  docs/superpowers/plans/2026-07-15-l3b-r3b-compound-semantic-boundary.md
git diff --cached --check
git commit -m "docs(agent): design compound semantic boundary repair"
```

---

### Task 2: Add RED compound-boundary contracts

**Files:**

- Create: `tests/agent/orchestration/orchestrator-compound-boundary.test.ts`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`

- [ ] **Step 1: Freeze stable Prompt markers and decision order**

Assert the three `compound-boundary` markers and require decomposition plus
single/compound classification to precede the existing-target test.

- [ ] **Step 2: Freeze the two draft-capable compound cases**

Assert that the Prompt permits:

```text
compose_plan -> compose_checklist
query_progress -> compose_checklist
```

with the second task depending on the first, without clarifying only because a
new downstream resource lacks an existing ID.

- [ ] **Step 3: Preserve the real missing-target case**

Assert that appending to an ambiguously referenced existing plan still requires
a non-empty clarify question.

- [ ] **Step 4: Freeze safety and evaluation invariants**

Assert no new Prompt examples, unchanged fixture contracts, unchanged semantic
and usable-plan Gate thresholds, no runtime-output args, and unchanged Resource
Guard behavior.

- [ ] **Step 5: Run RED**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-compound-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/resource-readiness-guard.test.ts \
  tests/agent/orchestration/l3b-semantic-accounting.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts
```

Expected: FAIL because the new markers and ordering do not exist yet.

---

### Task 3: Implement Candidate A and reach focused GREEN

**Files:**

- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify: `tests/TEST_MAP.md`

- [ ] **Step 1: Reorder classification minimally**

Replace the five-step order with the approved seven-step semantic order. Keep
all schema-derived field lists, enums, task-ID protocol, and JSON example
unchanged.

- [ ] **Step 2: Add the three boundary markers**

Clarify existing-target mutation, new-resource dependency, and blocking-only
clarification. State that `dependsOn` expresses ordering only and task args may
not refer to another task result.

- [ ] **Step 3: Narrow the unfinished-item rule**

Retain clarification for direct mutation of an unidentified existing item;
permit organizing query results into a new draft checklist.

- [ ] **Step 4: Update the deterministic test map**

Record the new compound-boundary suite and its network-free safety scope.

- [ ] **Step 5: Run focused GREEN**

Run the same focused command from Task 2. Expected: PASS.

---

### Task 4: Run the full deterministic baseline and commit implementation

- [ ] **Step 1: Run all required verification**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
node --check scripts/agent-orchestrator-canary-eval.mjs
git diff --check
```

- [ ] **Step 2: Commit one implementation lineage**

```bash
git add \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-compound-boundary.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "fix/agent: distinguish compound drafts from missing targets"
```

- [ ] **Step 3: Freeze live-input hashes**

Record committed HEAD plus secret-free Prompt, schema, and evaluation-config
hashes. Confirm the worktree is clean and `DATABASE_URL` is absent from the live
process.

---

### Task 5: Obtain authorization and run Focused Gate 1

- [ ] **Step 1: Require the exact authorization**

Do not access Keychain or call DeepSeek until the user writes:

```text
我授权本阶段最多使用 27 次 DeepSeek Provider 请求。
```

- [ ] **Step 2: Load credentials safely**

Use only Keychain service `sunnypanel-deepseek-eval`, pass the credential only
through the child process environment, suppress it from commands and output,
and unset it afterward. Do not search other credential stores.

- [ ] **Step 3: Run cmp-3/cmp-4 for three rounds**

Maximum: six requests. Require 6/6 completed, Provider responses, parsed,
strict-schema-valid, comparable, semantic, usable, and exclusive `match`.
Require every mismatch and every execution, database, unsafe, and raw-retention
counter to be zero.

- [ ] **Step 4: Stop or choose the sole permitted repair**

Unsafe, read-to-write, Provider, protocol, or schema failure stops the phase.
Only an allowed compound-ordering or intent-family failure permits one minimal
repair and one amended implementation commit.

---

### Task 6: Conditionally run Focused Gate 2

- [ ] Freeze the amended HEAD and Prompt hash; schema/model/config must match.
- [ ] Run the same six requests once more.
- [ ] Require 6/6 with all safety and mismatch counters zero.
- [ ] Stop R3-B if this second focused Gate fails.

---

### Task 7: Run the one targeted 15-request Gate

Only after a focused 6/6 pass:

- [ ] Run `qry-1`, `qry-2`, `cmp-3`, `cmp-4`, and `mis-2`, three rounds each.
- [ ] Require 15/15 completion, strict schema, comparability, exclusive
  semantic match, and usable plan.
- [ ] Require zero timeout, mismatch, unsafe adoption, execution, database
  mutation, raw retention, and duplicate-call events.
- [ ] Do not run acceptance-33, diagnostic-six, stability-99, or adoption.

---

### Task 8: Produce the R3-B closure report and stop

- [ ] Report baseline, branch, design and implementation commits, frozen hashes,
  clean status, rollback commands, and no push.
- [ ] Report RED/GREEN evidence and every deterministic command.
- [ ] Report Focused and Targeted metrics, request counts, latency, usage/cost,
  mismatch distribution, and all safety counters using sanitized data only.
- [ ] State whether R3-B passed. If not, identify the failed Gate and stop.
- [ ] Confirm Legacy remains default and no adoption phase started.
