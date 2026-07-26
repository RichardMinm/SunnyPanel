# L3-B LangChain Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fast-forward the validated L3-B candidate into `main`, verify the integrated tree, and hand off an explicit environment-variable activation with immediate Legacy rollback.

**Architecture:** The repository keeps Legacy as the source-code default and does not change runtime behavior during integration. `main` fast-forwards to the fully validated candidate lineage; production activation happens only through `AGENT_ORCHESTRATOR_RUNTIME=langchain`, while Query adoption and Router Shadow remain disabled.

**Tech Stack:** Git worktrees, TypeScript, Node.js test runner, LangChain, LangGraph, Zod, ESLint.

## Global Constraints

- Work only in `/Users/richardluo/Documents/Develop/SunnyPanel/.worktrees/phase-l3b-authoritative-orchestrator`.
- Preserve `/Users/richardluo/Documents/Develop/SunnyPanel/outputs/` and the primary checkout's `phase/l3a-langchain-migration-audit` branch.
- Do not change the source-code default from Legacy.
- Do not enable Query Runtime adoption, Router Shadow, or Orchestrator Shadow.
- Do not delete Legacy or add automatic Legacy fallback inside a LangChain turn.
- Do not change Prompt, schema, fixtures, Provider configuration, timeout, retry, Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, Rollback, Payload schema, migration, checkpoint, or LangGraph topology.
- Do not connect to a database, call a Provider, execute tasks, or mutate business data.
- Do not push.
- The validated runtime commit is `18882408fdc11a36c65cf47adf79e289e979299b`.
- The operational activation value is `AGENT_ORCHESTRATOR_RUNTIME=langchain`.
- The operational rollback value is `AGENT_ORCHESTRATOR_RUNTIME=legacy`.

---

### Task 1: Freeze Runtime Evidence Before Integration

**Files:**
- Inspect: `src/lib/agent/orchestration/runtime-config.ts`
- Inspect: `src/lib/agent/query/runtime-config.ts`
- Inspect: `src/lib/agent/router/router-shadow-config.ts`
- Test: `tests/agent/orchestration/orchestrator-runtime-config.test.ts`
- Test: `tests/agent/orchestration/orchestrator-dispatcher.test.ts`

**Interfaces:**
- Consumes: `resolveOrchestratorRuntimeMode(): "langchain" | "legacy"`.
- Produces: evidence that unset and explicit `legacy` resolve to Legacy, explicit `langchain` resolves to LangChain, and no runtime source changed after the validated commit.

- [ ] **Step 1: Confirm the isolated worktree and clean branch**

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
```

Expected:

```text
/Users/richardluo/Documents/Develop/SunnyPanel/.worktrees/phase-l3b-authoritative-orchestrator
phase/l3b-r4a-query-boundary
## phase/l3b-r4a-query-boundary
```

- [ ] **Step 2: Prove post-Gate commits contain documentation only**

Run:

```bash
git diff --name-only 18882408fdc11a36c65cf47adf79e289e979299b..HEAD
git diff --quiet 18882408fdc11a36c65cf47adf79e289e979299b..HEAD -- src tests scripts package.json package-lock.json
```

Expected: the first command lists only the approved design and implementation-plan documents; the second command exits `0` with no output.

- [ ] **Step 3: Run the focused runtime selection tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-runtime-config.test.ts \
  tests/agent/orchestration/orchestrator-dispatcher.test.ts
```

Expected: all tests pass, including unset → Legacy, explicit `legacy` → Legacy, explicit `langchain` → LangChain, and unknown → Legacy.

### Task 2: Fast-Forward `main` to the Validated Candidate Lineage

**Files:**
- Modify: Git reference `refs/heads/main` only through `git merge --ff-only`.
- Preserve: `/Users/richardluo/Documents/Develop/SunnyPanel/outputs/`.

**Interfaces:**
- Consumes: clean `phase/l3b-r4a-query-boundary` whose runtime tree matches `18882408fdc11a36c65cf47adf79e289e979299b`.
- Produces: `main` pointing at the candidate lineage plus documentation-only activation commits.

- [ ] **Step 1: Verify fast-forward ancestry**

Run:

```bash
git merge-base --is-ancestor main phase/l3b-r4a-query-boundary
git rev-list --left-right --count main...phase/l3b-r4a-query-boundary
```

Expected: the ancestry command exits `0`; the count has `0` on the `main`-only side.

- [ ] **Step 2: Switch the isolated worktree to `main`**

Run:

```bash
git switch main
```

Expected: the isolated worktree is on `main`; the primary checkout remains on `phase/l3a-langchain-migration-audit`.

- [ ] **Step 3: Fast-forward `main`**

Run:

```bash
git merge --ff-only phase/l3b-r4a-query-boundary
```

Expected: fast-forward succeeds with no conflict and no synthesized merge commit.

- [ ] **Step 4: Prove integration identity and preserved user files**

Run:

```bash
git rev-parse main
git rev-parse phase/l3b-r4a-query-boundary
git merge-base --is-ancestor 18882408fdc11a36c65cf47adf79e289e979299b main
git -C /Users/richardluo/Documents/Develop/SunnyPanel status --short --branch
```

Expected: `main` and `phase/l3b-r4a-query-boundary` resolve to the same commit; the validated runtime commit is an ancestor of `main`; the primary checkout still reports its original branch and untracked `outputs/`.

### Task 3: Run the Full Deterministic Integration Baseline

**Files:**
- Verify: entire integrated repository.
- Modify: none.

**Interfaces:**
- Consumes: integrated `main`.
- Produces: fresh typecheck, behavior-test, lint, and whitespace evidence for the exact integrated tree.

- [ ] **Step 1: Run typecheck**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
```

Expected: exit `0`.

- [ ] **Step 2: Run Agent tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
```

Expected: exit `0` with no failing tests.

- [ ] **Step 3: Run planning tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
```

Expected: exit `0` with no failing tests.

- [ ] **Step 4: Run schedule tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
```

Expected: exit `0` with no failing tests.

- [ ] **Step 5: Run content tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
```

Expected: exit `0` with no failing tests.

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
```

Expected: both commands exit `0`; pre-existing warnings may remain, but no lint error is accepted.

- [ ] **Step 7: Verify repository integrity**

Run:

```bash
git diff --check
git status --short --branch
git rev-parse HEAD
```

Expected: no whitespace error, clean `main`, and `HEAD` equals the integrated candidate lineage.

### Task 4: Hand Off External Production Activation

**Files:**
- Modify: none in the repository.
- External configuration: production process environment, only after its target is identified and separately authorized.

**Interfaces:**
- Consumes: verified integrated `main`.
- Produces: exact activation and rollback values without silently mutating an unknown deployment target.

- [ ] **Step 1: Report the activation environment**

Set on the production target:

```text
AGENT_ORCHESTRATOR_RUNTIME=langchain
AGENT_GRAPH_RUNTIME=langgraph
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
AGENT_ROUTER_SHADOW=off
```

Keep `AGENT_ORCHESTRATOR_SHADOW` unset or set to a value other than `1`, then restart the application.

- [ ] **Step 2: Report the immediate rollback**

Set:

```text
AGENT_ORCHESTRATOR_RUNTIME=legacy
```

Then restart the application. No database rollback or business-data mutation is required.

- [ ] **Step 3: Stop before external mutation**

Do not change a deployment platform, restart production, or push until the user identifies the deployment target and authorizes that external action.
