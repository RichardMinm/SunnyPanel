# L3-B-R3-A Compound Semantic Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Do not
> dispatch subagents unless the user separately authorizes delegation.

**Goal:** Reconcile the L3-B Run 3 semantic metric contradiction and freeze the
cmp-3/cmp-4 contract using deterministic, network-free changes only.

**Architecture:** Keep the existing exclusive mismatch classifier as the
authoritative semantic result. Preserve broad decision-code agreement as a
separate diagnostic, derive semantic correctness from exclusive `match`, add
accounting invariants, distinguish successful invocation completion from usable
plan, and compare single versus compound intent contracts explicitly.

**Tech Stack:** TypeScript, Node test runner, Zod, existing SunnyPanel Agent
evaluation harness. No Provider, database, or new dependency.

## Global constraints

- Do not access DeepSeek, Keychain, API credentials, or any network endpoint.
- Do not change Prompt, examples, fixture expected decisions, schema enums,
  production routing, safety modules, thresholds, runtime defaults, or retries.
- Do not retain raw prompt, response, reasoning, tool arguments, secrets,
  workspace content, or resource identifiers.
- Do not commit `/tmp` evidence or generated Provider reports.
- Keep Legacy authoritative and do not push.

---

### Task 1: Freeze the forensic design

**Files:**

- Create: `docs/design/phase-l3b-r3a-compound-semantic-accounting.md`
- Create: `docs/superpowers/plans/2026-07-15-l3b-r3a-compound-semantic-accounting.md`

- [ ] **Step 1: Verify scope and placeholders**

```bash
rg -n 'T[B]D|T[O]DO|fill[ ]in|implement[ ]later' \
  docs/design/phase-l3b-r3a-compound-semantic-accounting.md \
  docs/superpowers/plans/2026-07-15-l3b-r3a-compound-semantic-accounting.md
git diff --check
```

Expected: no placeholder output and no whitespace errors.

- [ ] **Step 2: Commit the approved design**

```bash
git add \
  docs/design/phase-l3b-r3a-compound-semantic-accounting.md \
  docs/superpowers/plans/2026-07-15-l3b-r3a-compound-semantic-accounting.md
git diff --cached --check
git commit -m "docs(agent): define compound semantic accounting"
```

---

### Task 2: Add RED accounting contracts

**Files:**

- Create: `src/lib/agent/orchestration/l3b-semantic-accounting.ts`
- Create: `tests/agent/orchestration/l3b-semantic-accounting.test.ts`
- Modify: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `tests/agent/orchestration/orchestrator-live-gate-contract.test.ts`

**Interfaces:**

- Produces an exact single/compound intent-contract matcher.
- Produces a pure exclusive-accounting reconciliation function with invariant
  checks.
- Extends evaluation runs with `decisionCodeCorrect` and
  `orchestratorCompleted`.

- [ ] **Step 1: Test single and compound intent meanings**

Cover one-of alternatives for single decisions, exact ordered task equality for
compound decisions, missing/extra tasks, and reversed task order.

- [ ] **Step 2: Reconstruct the 15-row contradiction**

Create sanitized runs with 10 broad decision-code matches, 9 exclusive
`match` categories, 5 `read_write_mismatch`, and 1 `intent_mismatch`. Assert:

```text
decisionCodeCorrect = 10/15
semanticDecisionCorrect = 9/15
semantic incorrect = 6
exclusive category total = 15
```

- [ ] **Step 3: Test completion versus usability**

Add a completed but semantically unusable observation and require completion
to remain successful while usable-plan rate fails the unchanged 0.99 Gate.

- [ ] **Step 4: Test zero-comparable and sanitizer behavior**

Ensure schema-invalid observations do not enter the semantic denominator and
that no added report field permits raw payloads or secrets.

- [ ] **Step 5: Run RED**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/l3b-semantic-accounting.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts
```

Expected: FAIL because the new accounting fields, matcher, invariants, and
completion/usability split do not yet exist.

---

### Task 3: Implement the minimal accounting repair

**Files:**

- Modify: `src/lib/agent/orchestration/l3b-semantic-accounting.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation.ts`
- Modify: `scripts/agent-orchestrator-canary-eval.mjs`

- [ ] **Step 1: Implement pure intent-contract matching**

Single requires exactly one allowlisted intent. Compound requires an exact
ordered list equal to the fixture task contract.

- [ ] **Step 2: Implement exclusive accounting invariants**

Throw a deterministic error if category totals, comparable counts, or semantic
correct/incorrect totals do not reconcile.

- [ ] **Step 3: Rename the broad diagnostic**

The harness writes `decisionCodeCorrect`. The report derives
`semanticDecisionCorrect` exclusively from category `match`.

- [ ] **Step 4: Split completion and usability**

Set `orchestratorCompleted` when a typed decision returns successfully.
Continue to set `orchestratorUsable` only after all existing semantic and safety
conditions. Add a `usable_plan_rate` failure at the existing 0.99 threshold.

- [ ] **Step 5: Preserve all safety behavior**

Do not change mismatch priority, semantic fixture values, DAG checks, resource
guards, execution counters, or runtime selection.

- [ ] **Step 6: Run focused GREEN**

Run the same command from Task 2. Expected: PASS.

---

### Task 4: Update deterministic coverage map and verify the phase

**Files:**

- Modify: `tests/TEST_MAP.md`

- [ ] **Step 1: Record the R3-A contract**

Document the new semantic-accounting test suite, network-free constraint, and
cmp-3/cmp-4 fixture-boundary assertions.

- [ ] **Step 2: Run focused source tests**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/l3b-semantic-accounting.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/l3b-semantic-evidence.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts \
  tests/agent/orchestration/orchestrator-semantic-decision.test.ts
```

- [ ] **Step 3: Run the full network-free baseline**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

- [ ] **Step 4: Commit implementation and tests**

```bash
git add \
  scripts/agent-orchestrator-canary-eval.mjs \
  src/lib/agent/orchestration/l3b-evaluation.ts \
  src/lib/agent/orchestration/l3b-semantic-accounting.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/l3b-semantic-accounting.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "fix/agent-eval: reconcile semantic decision accounting"
```

---

### Task 5: Produce the R3-A closure report

- [ ] Report baseline, branch, commits, and clean status.
- [ ] Report the 15-row historical reconciliation without modifying `/tmp`.
- [ ] Distinguish broad code agreement, exclusive semantic correctness,
  overlapping mismatch flags, completion, and usable plan.
- [ ] Report cmp-3/cmp-4 ownership findings and evidence limits.
- [ ] Confirm zero Provider calls, zero database mutation, no runtime/default
  change, and no protected production-path modification.
- [ ] Propose R3-B only; require separate approval before up to 27 Provider
  requests.
- [ ] Stop without entering R3-B.
