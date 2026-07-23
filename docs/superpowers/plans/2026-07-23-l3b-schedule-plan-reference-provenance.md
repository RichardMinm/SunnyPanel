# L3-B Schedule-Plan Reference Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, original-message-aware provenance boundary that rejects unsafe single-task `schedule_plan` references before Resource Readiness and Mapper.

**Architecture:** Extract the existing explicit-plan-ID and exact-authorized-title analysis into one shared pure module, then place a schedule-specific validator after Query Scope and before Resource Readiness. Typed failures project to the existing deterministic clarification shape, while production evaluation records only bounded source/error labels and the corrected six-case Known-ID Gate uses a genuine two-plan title conflict.

**Tech Stack:** TypeScript, Node.js test runner, Zod-backed Orchestrator output, LangChain structured output, existing SunnyPanel deterministic clarification and production-seam evaluation modules.

## Global Constraints

- Baseline is `b156025e888c6e6ec931cd32f38e6305cb363b87` on `phase/l3b-r4a-query-boundary`.
- Do not modify Full or Residual Prompt text, contrastive examples, or structured schemas.
- Do not modify `SchedulePlanArgs`, Payload schema, migrations, LangGraph topology, checkpointing, Provider configuration, timeout, retry, or Gate thresholds.
- Do not expand title-only scheduling, compound scheduling, Query adoption, Router adoption, or default Orchestrator adoption.
- Do not enter Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback, task execution, database access, or business mutation.
- Do not call a Provider or connect to a database during implementation.
- Do not retain raw prompts, responses, messages, workspace titles, resource IDs, hidden reasoning, stack traces, or secrets in evaluation reports.
- Preserve `/tmp/l3b-r8-production-known-id.json` and `/tmp/l3b-r8-production-known-id-v2.json`.
- Reserve `/tmp/l3b-r8-production-known-id-v3.json` for the next separately authorized live Gate; deterministic preflight must not create it.
- Keep the Known-ID stage at six observations, one round, six logical calls maximum, and 24 Provider attempts maximum.
- Keep Primary/Legacy/default behavior unchanged and do not push.

---

## File Structure

**Create**

- `src/lib/agent/orchestration/plan-reference-evidence.ts` — shared pure extraction of explicit positive plan IDs and exact actor-authorized title matches.
- `src/lib/agent/orchestration/schedule-plan-reference-contract.ts` — validates the supported single-task `schedule_plan` output and produces internal provenance or a bounded error code.
- `src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts` — maps every bounded schedule-reference error to one deterministic clarify plan.
- `tests/agent/orchestration/plan-reference-evidence.test.ts` — extraction and exact-title regression tests.
- `tests/agent/orchestration/schedule-plan-reference-contract.test.ts` — schedule-reference contract unit tests.
- `tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts` — exhaustive safe projection tests.

**Modify**

- `src/lib/agent/orchestration/query-scope-contract.ts` — consume the shared evidence module without changing Query behavior.
- `src/lib/agent/orchestration/langchain-orchestrator.ts` — insert schedule provenance after Query Scope and before Resource Readiness.
- `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts` — project bounded schedule-reference evidence.
- `src/lib/agent/orchestration/hybrid-production-evaluation.ts` — classify deterministic schedule-reference rejection as a Known-ID safe rejection.
- `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts` — replace the synthetic pseudo-conflict with a genuine two-plan exact-title conflict while preserving six IDs and order.
- `scripts/agent-production-seam-gate-eval.mjs` — use the unused versioned v3 Known-ID report path.
- `tests/agent/orchestration/query-scope-contract.test.ts` — prove the extraction refactor preserves Query Scope.
- `tests/agent/orchestration/langchain-orchestrator.test.ts` — prove integration order, typed clarification, and sanitized output.
- `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts` — prove Known-ID business semantics and bounded rejection source.
- `tests/agent/orchestration/l3b-production-gate-metrics.test.ts` — keep six-case aggregation and zero-tolerance behavior exact.
- `tests/agent/orchestration/l3b-production-gate-contract.test.ts` — lock corrected fixture identity/order, 6/24 budget, v3 path, and no-network preflight.
- `tests/TEST_MAP.md` — document the schedule-reference provenance boundary.

---

### Task 1: Share deterministic plan-reference evidence

**Files:**

- Create: `src/lib/agent/orchestration/plan-reference-evidence.ts`
- Create: `tests/agent/orchestration/plan-reference-evidence.test.ts`
- Modify: `src/lib/agent/orchestration/query-scope-contract.ts`
- Test: `tests/agent/orchestration/query-scope-contract.test.ts`

**Interfaces:**

- Consumes: `AgentPromptContext`, `normalizePlanTitle()`.
- Produces:

```ts
export type TrustedContextPlan = Readonly<{
  id: number;
  title: string;
}>;

export type PlanReferenceEvidence = Readonly<{
  exactTitlePlans: readonly TrustedContextPlan[];
  explicitPlanIds: readonly number[];
  trustedPlans: readonly TrustedContextPlan[];
}>;

export const isPositivePlanId = (value: unknown): value is number;

export const analyzePlanReferenceEvidence = (input: Readonly<{
  context: AgentPromptContext;
  message: string;
}>): PlanReferenceEvidence;
```

- Later tasks must import `analyzePlanReferenceEvidence()` rather than add another ID regex or title resolver.

- [ ] **Step 1: Write the failing extraction tests**

Create `tests/agent/orchestration/plan-reference-evidence.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  analyzePlanReferenceEvidence,
} from "../../../src/lib/agent/orchestration/plan-reference-evidence";

const context = (plans: AgentPromptContext["plans"]): AgentPromptContext => ({
  checklists: [],
  contentItems: [],
  memories: [],
  now: "2026-07-23T12:00:00.000+08:00",
  pendingAction: null,
  plans,
  schedules: [],
});

const plans = context([
  {
    id: 101,
    priority: "medium",
    state: "active",
    title: "考研数学复习计划",
    visibility: "private",
  },
  {
    id: 102,
    priority: "medium",
    state: "active",
    title: "英语复习计划",
    visibility: "private",
  },
]);

test("collects explicit positive plan IDs without treating generic labels as titles", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: plans,
    message: "把另一个计划 101 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(evidence.exactTitlePlans, []);
});

test("collects complete actor-authorized plan titles only", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: plans,
    message: "把英语复习计划 101 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(
    evidence.exactTitlePlans.map(({ id }) => id),
    [102],
  );
});

test("normalizes full-width explicit IDs and excludes title-only plans without IDs", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: context([
      {
        id: null,
        priority: "medium",
        state: "active",
        title: "无编号计划",
        visibility: "private",
      },
    ]),
    message: "把计划 １０１ 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(evidence.trustedPlans, []);
  assert.deepEqual(evidence.exactTitlePlans, []);
});
```

- [ ] **Step 2: Run the new test and witness RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-plan-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/plan-reference-evidence.test.ts
```

Expected: FAIL because
`src/lib/agent/orchestration/plan-reference-evidence.ts` does not exist.

- [ ] **Step 3: Implement the shared evidence module**

Create `src/lib/agent/orchestration/plan-reference-evidence.ts`:

```ts
import type { AgentPromptContext } from "../prompts";
import { normalizePlanTitle } from "../query/plan-title";

export type TrustedContextPlan = Readonly<{
  id: number;
  title: string;
}>;

export type PlanReferenceEvidence = Readonly<{
  exactTitlePlans: readonly TrustedContextPlan[];
  explicitPlanIds: readonly number[];
  trustedPlans: readonly TrustedContextPlan[];
}>;

export const isPositivePlanId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const collectExplicitPlanIds = (message: string): readonly number[] => {
  const normalized = message.normalize("NFKC");
  const ids = new Set<number>();
  const patterns = [
    /(?:plan\s*id|planid)\s*[:=#]?\s*(\d+)/giu,
    /计划\s*(?:id|编号|#)\s*[:=#：]?\s*(\d+)/giu,
    /计划\s*[:：#]?\s+(\d+)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1]);
      if (isPositivePlanId(value)) ids.add(value);
    }
  }

  return Object.freeze([...ids]);
};

const trustedPlans = (
  context: AgentPromptContext,
): readonly TrustedContextPlan[] => Object.freeze(
  context.plans
    .filter(
      (plan): plan is typeof plan & { id: number } =>
        isPositivePlanId(plan.id),
    )
    .map(({ id, title }) => Object.freeze({ id, title })),
);

export const analyzePlanReferenceEvidence = (
  input: Readonly<{
    context: AgentPromptContext;
    message: string;
  }>,
): PlanReferenceEvidence => {
  const trusted = trustedPlans(input.context);
  const normalizedMessage = normalizePlanTitle(input.message);
  const exactTitlePlans = trusted.filter(({ title }) => {
    const normalizedTitle = normalizePlanTitle(title);
    return normalizedTitle.length > 0
      && normalizedMessage.includes(normalizedTitle);
  });

  return Object.freeze({
    exactTitlePlans: Object.freeze([...exactTitlePlans]),
    explicitPlanIds: collectExplicitPlanIds(input.message),
    trustedPlans: trusted,
  });
};
```

- [ ] **Step 4: Refactor Query Scope to consume the shared evidence**

In `src/lib/agent/orchestration/query-scope-contract.ts`:

```ts
import {
  analyzePlanReferenceEvidence,
  isPositivePlanId,
} from "./plan-reference-evidence";
```

Delete the local `isPositiveInteger`, `collectExplicitPlanIds`,
`trustedContextPlans`, and `explicitTitlePlans` implementations. At the start
of `validateTasks()` derive:

```ts
const evidence = analyzePlanReferenceEvidence({
  context: params.context,
  message: params.message,
});
const explicitIds = evidence.explicitPlanIds;
const selectedTitles = evidence.exactTitlePlans;
```

Use `isPositivePlanId()` in every location that previously called
`isPositiveInteger()`. Where `resolveExactTitle()` needs trusted plans, use:

```ts
const matches = analyzePlanReferenceEvidence({
  context: params.context,
  message: params.message,
}).trustedPlans.filter(
  (plan) => normalizePlanTitle(plan.title) === normalizedTitle,
);
```

Do not change Query Scope error codes, provenance values, normalization, or
clarification behavior.

- [ ] **Step 5: Run shared and Query Scope tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-plan-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/plan-reference-evidence.test.ts \
  tests/agent/orchestration/query-scope-contract.test.ts
```

Expected: all tests PASS, including every pre-existing Query Scope test.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  src/lib/agent/orchestration/plan-reference-evidence.ts \
  src/lib/agent/orchestration/query-scope-contract.ts \
  tests/agent/orchestration/plan-reference-evidence.test.ts \
  tests/agent/orchestration/query-scope-contract.test.ts
git diff --cached --check
git commit -m "refactor(agent): share plan reference evidence"
```

---

### Task 2: Add the schedule-plan reference contract and projector

**Files:**

- Create: `src/lib/agent/orchestration/schedule-plan-reference-contract.ts`
- Create: `src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts`
- Create: `tests/agent/orchestration/schedule-plan-reference-contract.test.ts`
- Create: `tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts`

**Interfaces:**

- Consumes: `analyzePlanReferenceEvidence()`, `AgentPromptContext`,
  `OrchestratorOutput`.
- Produces:

```ts
export type SchedulePlanReferenceErrorCode =
  | "explicit_plan_id_required"
  | "multiple_explicit_plan_ids"
  | "provider_plan_id_mismatch"
  | "explicit_plan_id_not_in_context"
  | "multiple_exact_plan_titles"
  | "plan_id_title_conflict";

export type SchedulePlanReferenceProvenance = Readonly<{
  planId: number;
  source:
    | "explicit_plan_id"
    | "explicit_plan_id_and_exact_title";
  taskId: string;
}>;

export const validateSchedulePlanReferences = (input: Readonly<{
  context: AgentPromptContext;
  message: string;
  output: OrchestratorOutput;
}>): SchedulePlanReferenceValidationResult;

export const projectSchedulePlanReferenceErrorToClarification = (
  code: SchedulePlanReferenceErrorCode,
): SchedulePlanReferenceClarificationProjection;
```

- [ ] **Step 1: Write contract RED tests**

Create `tests/agent/orchestration/schedule-plan-reference-contract.test.ts`
with a two-plan Context and this output helper:

```ts
const output = (planId: number): OrchestratorOutput => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: "schedule an existing plan",
  tasks: [{
    agentRole: "schedule",
    args: { planId },
    dependsOn: [],
    id: "t1",
    intent: "schedule_plan",
    label: "schedule plan",
  }],
  version: 2,
});
```

Add exact assertions:

```ts
test("accepts explicit ID-only provenance including generic labels", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把另一个计划 101 安排到下周",
    output: output(101),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
});

test("accepts matching exact title and ID provenance", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把考研数学复习计划 101 安排到下周",
    output: output(101),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(
    result.provenances[0]?.source,
    "explicit_plan_id_and_exact_title",
  );
});

test("rejects a genuine exact title and ID conflict", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把英语复习计划 101 安排到下周",
    output: output(101),
  });

  assert.deepEqual(result, {
    code: "plan_id_title_conflict",
    safeMessage: "计划 ID 与标题指向不同资源，请确认要安排的计划。",
    valid: false,
  });
});
```

Also add table-driven cases for:

```ts
[
  ["安排这个计划", output(101), "explicit_plan_id_required"],
  ["把计划 101 和计划 102 安排到下周", output(101), "multiple_explicit_plan_ids"],
  ["把计划 101 安排到下周", output(102), "provider_plan_id_mismatch"],
  ["把计划 999 安排到下周", output(999), "explicit_plan_id_not_in_context"],
  [
    "把考研数学复习计划和英语复习计划 101 安排到下周",
    output(101),
    "multiple_exact_plan_titles",
  ],
] as const
```

Add one test proving a non-`schedule_plan` output returns unchanged with an
empty provenance list, and one test proving a compound output is left to the
existing compound/resource contracts.

- [ ] **Step 2: Run contract tests and witness RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the schedule reference contract**

Create
`src/lib/agent/orchestration/schedule-plan-reference-contract.ts`:

```ts
import type { AgentPromptContext } from "../prompts";
import type {
  OrchestratorOutput,
} from "../llm/schemas/orchestrator-output";
import {
  analyzePlanReferenceEvidence,
} from "./plan-reference-evidence";

export type SchedulePlanReferenceErrorCode =
  | "explicit_plan_id_required"
  | "multiple_explicit_plan_ids"
  | "provider_plan_id_mismatch"
  | "explicit_plan_id_not_in_context"
  | "multiple_exact_plan_titles"
  | "plan_id_title_conflict";

export type SchedulePlanReferenceProvenance = Readonly<{
  planId: number;
  source:
    | "explicit_plan_id"
    | "explicit_plan_id_and_exact_title";
  taskId: string;
}>;

export type SchedulePlanReferenceValidationResult =
  | Readonly<{
      output: OrchestratorOutput;
      provenances: readonly SchedulePlanReferenceProvenance[];
      valid: true;
    }>
  | Readonly<{
      code: SchedulePlanReferenceErrorCode;
      safeMessage: string;
      valid: false;
    }>;

const safeMessageByCode = Object.freeze({
  explicit_plan_id_not_in_context:
    "没有找到用户明确提供的计划 ID，请确认要安排的计划。",
  explicit_plan_id_required:
    "安排已有计划需要用户明确提供一个计划 ID。",
  multiple_exact_plan_titles:
    "请求同时提到了多个计划标题，请确认要安排的计划。",
  multiple_explicit_plan_ids:
    "请求同时提到了多个计划 ID，请确认要安排的计划。",
  plan_id_title_conflict:
    "计划 ID 与标题指向不同资源，请确认要安排的计划。",
  provider_plan_id_mismatch:
    "模型选择的计划 ID 与用户提供的 ID 不一致，请确认要安排的计划。",
} satisfies Record<SchedulePlanReferenceErrorCode, string>);

const invalid = (
  code: SchedulePlanReferenceErrorCode,
): SchedulePlanReferenceValidationResult => Object.freeze({
  code,
  safeMessage: safeMessageByCode[code],
  valid: false,
});

export const validateSchedulePlanReferences = (
  input: Readonly<{
    context: AgentPromptContext;
    message: string;
    output: OrchestratorOutput;
  }>,
): SchedulePlanReferenceValidationResult => {
  const scheduleTasks = input.output.tasks.filter(
    ({ intent }) => intent === "schedule_plan",
  );
  if (scheduleTasks.length === 0) {
    return Object.freeze({
      output: input.output,
      provenances: Object.freeze([]),
      valid: true,
    });
  }
  if (
    input.output.mode !== "single"
    || input.output.tasks.length !== 1
    || scheduleTasks.length !== 1
  ) {
    return Object.freeze({
      output: input.output,
      provenances: Object.freeze([]),
      valid: true,
    });
  }

  const task = scheduleTasks[0]!;
  const evidence = analyzePlanReferenceEvidence({
    context: input.context,
    message: input.message,
  });
  if (evidence.explicitPlanIds.length === 0) {
    return invalid("explicit_plan_id_required");
  }
  if (evidence.explicitPlanIds.length > 1) {
    return invalid("multiple_explicit_plan_ids");
  }

  const explicitPlanId = evidence.explicitPlanIds[0]!;
  if (task.args.planId !== explicitPlanId) {
    return invalid("provider_plan_id_mismatch");
  }
  if (!evidence.trustedPlans.some(({ id }) => id === explicitPlanId)) {
    return invalid("explicit_plan_id_not_in_context");
  }

  const exactTitlePlanIds = new Set(
    evidence.exactTitlePlans.map(({ id }) => id),
  );
  if (exactTitlePlanIds.size > 1) {
    return invalid("multiple_exact_plan_titles");
  }
  if (
    exactTitlePlanIds.size === 1
    && !exactTitlePlanIds.has(explicitPlanId)
  ) {
    return invalid("plan_id_title_conflict");
  }

  const provenance = Object.freeze({
    planId: explicitPlanId,
    source: exactTitlePlanIds.size === 1
      ? "explicit_plan_id_and_exact_title" as const
      : "explicit_plan_id" as const,
    taskId: task.id,
  });
  return Object.freeze({
    output: input.output,
    provenances: Object.freeze([provenance]),
    valid: true,
  });
};
```

- [ ] **Step 4: Write projector RED tests**

Create
`tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectSchedulePlanReferenceErrorToClarification,
} from "../../../src/lib/agent/orchestration/schedule-plan-reference-clarification-projector";
import type {
  SchedulePlanReferenceErrorCode,
} from "../../../src/lib/agent/orchestration/schedule-plan-reference-contract";

const codes: SchedulePlanReferenceErrorCode[] = [
  "explicit_plan_id_required",
  "multiple_explicit_plan_ids",
  "provider_plan_id_mismatch",
  "explicit_plan_id_not_in_context",
  "multiple_exact_plan_titles",
  "plan_id_title_conflict",
];

test("every schedule reference error becomes one sanitized clarify plan", () => {
  for (const code of codes) {
    const projection =
      projectSchedulePlanReferenceErrorToClarification(code);

    assert.equal(projection.schedulePlanReferenceErrorCode, code);
    assert.equal(projection.plan.mode, "single");
    assert.deepEqual(
      projection.plan.tasks.map(({ intent }) => intent),
      ["clarify"],
    );
    assert.equal(
      String(projection.plan.tasks[0]?.args.question).trim().length > 0,
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(projection),
      /101|102|999|考研|英语|planId/u,
    );
  }
});
```

- [ ] **Step 5: Run projector tests and witness RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts
```

Expected: FAIL because the projector module does not exist.

- [ ] **Step 6: Implement the deterministic projector**

Create
`src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts`:

```ts
import type {
  SchedulePlanReferenceErrorCode,
} from "./schedule-plan-reference-contract";
import type { OrchestratorPlan } from "./types";

export type SchedulePlanReferenceClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  schedulePlanReferenceErrorCode: SchedulePlanReferenceErrorCode;
}>;

export const projectSchedulePlanReferenceErrorToClarification = (
  code: SchedulePlanReferenceErrorCode,
): SchedulePlanReferenceClarificationProjection => {
  const dependsOn: string[] = [];
  Object.freeze(dependsOn);
  const task = Object.freeze({
    agentRole: "query" as const,
    args: Object.freeze({
      question:
        "我无法安全确认要安排的已有计划。请提供一个准确的计划 ID。",
    }),
    dependsOn,
    id: "t1",
    intent: "clarify" as const,
    label: "确认排期计划",
  });
  const tasks = [task];
  Object.freeze(tasks);
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning:
      "确定性计划引用澄清：排期目标未通过来源一致性校验。",
    source: "llm",
    tasks,
  };
  Object.freeze(plan);

  return Object.freeze({
    plan,
    schedulePlanReferenceErrorCode: code,
  });
};
```

- [ ] **Step 7: Run Task 2 tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/plan-reference-evidence.test.ts \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/lib/agent/orchestration/schedule-plan-reference-contract.ts \
  src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts
git diff --cached --check
git commit -m "feat(agent): validate schedule plan references"
```

---

### Task 3: Insert the deterministic boundary into the authoritative runtime

**Files:**

- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`

**Interfaces:**

- Consumes: `validateSchedulePlanReferences()` and
  `projectSchedulePlanReferenceErrorToClarification()`.
- Extends `OrchestratorInvocationResult` with:

```ts
{
  clarificationSource: "schedule_plan_reference";
  plan: OrchestratorPlan;
  schedulePlanReferenceErrorCode: SchedulePlanReferenceErrorCode;
  schemaValidDecision: OrchestratorDecisionProjection;
  status: "clarified";
}
```

- The rejected write task must not reach Resource Readiness or Mapper.

- [ ] **Step 1: Write runtime integration RED tests**

In `tests/agent/orchestration/langchain-orchestrator.test.ts`, add a Context
with plans 101 and 102, then add:

```ts
it("clarifies a genuine schedule plan ID/title conflict before mapping", async () => {
  const result = await runLangChainOrchestratorResult({
    context: {
      checklists: [],
      now: "2026-07-23T12:00:00.000+08:00",
      pendingAction: null,
      plans: [
        {
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        },
        {
          id: 102,
          priority: "medium",
          state: "active",
          title: "英语复习计划",
        },
      ],
    },
    message: "把英语复习计划 101 安排到下周",
    modelConfig: {
      apiKey: "test-only",
      baseURL: "https://example.invalid",
      maxRetries: 0,
      model: "fake",
      provider: "deepseek",
      structuredOutputMode: "provider_default",
      temperature: 0,
      timeoutMs: 100,
    },
    modelFactory: promptJsonModelFactory(() => ({
      decisionCode: "explicit_write_ready",
      mode: "single",
      routingSummary: "schedule selected plan",
      tasks: [{
        agentRole: "schedule",
        args: { planId: 101 },
        dependsOn: [],
        id: "t1",
        intent: "schedule_plan",
        label: "schedule selected plan",
      }],
      version: 2,
    })),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(
    result.clarificationSource,
    "schedule_plan_reference",
  );
  assert.equal(
    result.schedulePlanReferenceErrorCode,
    "plan_id_title_conflict",
  );
  assert.deepEqual(
    result.plan.tasks.map(({ intent }) => intent),
    ["clarify"],
  );
  assert.deepEqual(result.schemaValidDecision, {
    decisionCode: "explicit_write_ready",
    intents: ["schedule_plan"],
    mode: "single",
    taskCount: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /101|102|考研|英语|planId/u,
  );
});

it("keeps a generic descriptor plus exact authorized ID as schedule_plan", async () => {
  const result = await runLangChainOrchestratorResult({
    context: {
      checklists: [],
      now: "2026-07-23T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{
        id: 101,
        priority: "medium",
        state: "active",
        title: "考研数学复习计划",
      }],
    },
    message: "把另一个计划 101 安排到下周",
    modelConfig: {
      apiKey: "test-only",
      baseURL: "https://example.invalid",
      maxRetries: 0,
      model: "fake",
      provider: "deepseek",
      structuredOutputMode: "provider_default",
      temperature: 0,
      timeoutMs: 100,
    },
    modelFactory: promptJsonModelFactory(() => ({
      decisionCode: "explicit_write_ready",
      mode: "single",
      routingSummary: "schedule selected plan",
      tasks: [{
        agentRole: "schedule",
        args: { planId: 101 },
        dependsOn: [],
        id: "t1",
        intent: "schedule_plan",
        label: "schedule selected plan",
      }],
      version: 2,
    })),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(
    result.plan.tasks.map(({ intent }) => intent),
    ["schedule_plan"],
  );
});
```

Update the existing `"安排计划"` Provider-selected-ID test to expect:

```ts
assert.equal(result.clarificationSource, "schedule_plan_reference");
assert.equal(
  result.schedulePlanReferenceErrorCode,
  "explicit_plan_id_required",
);
```

- [ ] **Step 2: Run runtime tests and witness RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/langchain-orchestrator.test.ts
```

Expected: the new tests FAIL because the runtime still reaches Resource
Readiness/Mapper and the invocation result lacks schedule-reference evidence.

- [ ] **Step 3: Extend the invocation result**

In `src/lib/agent/orchestration/langchain-orchestrator.ts`, import:

```ts
import {
  validateSchedulePlanReferences,
  type SchedulePlanReferenceErrorCode,
} from "./schedule-plan-reference-contract";
import {
  projectSchedulePlanReferenceErrorToClarification,
} from "./schedule-plan-reference-clarification-projector";
```

Add this `OrchestratorInvocationResult` member:

```ts
| {
    clarificationSource: "schedule_plan_reference";
    plan: OrchestratorPlan;
    schedulePlanReferenceErrorCode: SchedulePlanReferenceErrorCode;
    schemaValidDecision: OrchestratorDecisionProjection;
    status: "clarified";
  }
```

- [ ] **Step 4: Insert validation before Resource Readiness**

Immediately after:

```ts
const queryScopeValidatedOutput = queryScopeResult.output;
```

insert:

```ts
const scheduleReferenceResult = validateSchedulePlanReferences({
  context,
  message,
  output: queryScopeValidatedOutput,
});

if (!scheduleReferenceResult.valid) {
  logAgentEvent(
    "warn",
    "orchestrator.langchain.invalid_schedule_plan_reference",
    { code: scheduleReferenceResult.code },
  );

  const clarification =
    projectSchedulePlanReferenceErrorToClarification(
      scheduleReferenceResult.code,
    );
  return {
    clarificationSource: "schedule_plan_reference",
    plan: clarification.plan,
    schedulePlanReferenceErrorCode:
      clarification.schedulePlanReferenceErrorCode,
    schemaValidDecision,
    status: "clarified",
  };
}

const scheduleReferenceValidatedOutput =
  scheduleReferenceResult.output;
```

Pass `scheduleReferenceValidatedOutput.tasks` to Resource Readiness and pass
`scheduleReferenceValidatedOutput` to `mapStructuredOutputToPlan()`. Do not
map, mutate, or reuse the rejected Provider task.

- [ ] **Step 5: Run runtime and boundary regression tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/query-scope-contract.test.ts \
  tests/agent/orchestration/resource-readiness-guard.test.ts
```

Expected: all tests PASS. Existing Query Scope and pure Resource Readiness
behavior remains unchanged.

- [ ] **Step 6: Commit Task 3**

```bash
git add \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts
git diff --cached --check
git commit -m "fix(agent): enforce schedule plan provenance"
```

---

### Task 4: Align Known-ID evidence, corrected fixture, and v3 Gate

**Files:**

- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`
- Modify: `src/lib/agent/orchestration/hybrid-production-evaluation.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts`
- Modify: `scripts/agent-production-seam-gate-eval.mjs`
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Modify: `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**

- `ProductionFullRoleEvidence.clarificationSource` adds
  `"schedule_plan_reference"`.
- `ProductionFullRoleEvidence.schedulePlanReferenceErrorCode` adds the bounded
  error or `null`.
- `ProductionKnownIdRejectionSource` adds
  `"schedule_plan_reference_contract"`.
- The six canonical IDs and their order do not change.
- The sixth diagnostic becomes a genuine two-plan exact-title conflict.
- The Known-ID report path becomes
  `/tmp/l3b-r8-production-known-id-v3.json`.

- [ ] **Step 1: Write adapter/evaluator RED assertions**

In `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`, add an
evaluation where Full returns:

```ts
fullOutput(
  "explicit_write_ready",
  "schedule_plan",
  { planId: 101 },
)
```

for `diag-plan-title-conflicting-id`, then assert:

```ts
assert.equal(observation.knownIdOutcome, "safe_rejection");
assert.equal(
  observation.knownIdRejectionSource,
  "schedule_plan_reference_contract",
);
assert.equal(observation.semanticMatch, true);
assert.equal(observation.usable, true);
assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
assert.equal(
  observation.roleEvidence.fullOrchestrator.clarificationSource,
  "schedule_plan_reference",
);
assert.equal(
  observation.roleEvidence.fullOrchestrator
    .schedulePlanReferenceErrorCode,
  "plan_id_title_conflict",
);
assert.equal(
  observation.roleEvidence.fullOrchestrator
    .semanticProjection?.intents[0],
  "schedule_plan",
);
assertSafeKnownIdObservation(
  observation,
  "diag-plan-title-conflicting-id",
);
```

Add assertions that the serialized observation excludes:

```ts
/planId|考研数学复习计划|英语复习计划|把英语/u
```

- [ ] **Step 2: Correct the sixth diagnostic and lock six-case identity**

In `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts`, add:

```ts
const knownIdTitleConflictContext = (): AgentPromptContext => {
  const base = context({ plan: true });
  return {
    ...base,
    plans: [
      ...base.plans,
      {
        id: 102,
        priority: "medium",
        state: "active",
        title: "英语复习计划",
        visibility: "private",
      },
    ],
  };
};

const diagnosticWithContext = (
  id: string,
  message: string,
  fixtureContext: AgentPromptContext,
  expected: L3BKnownIdDiagnostic["expected"],
): L3BKnownIdDiagnostic => Object.freeze({
  context: fixtureContext,
  expected,
  gating: false,
  id,
  message,
  resourceKind: "plan",
});
```

Replace only the sixth diagnostic construction with:

```ts
diagnosticWithContext(
  "diag-plan-title-conflicting-id",
  "把英语复习计划 101 安排到下周",
  knownIdTitleConflictContext(),
  "reject_invalid_reference",
)
```

In `tests/agent/orchestration/l3b-production-gate-contract.test.ts`, assert:

```ts
assert.equal(L3B_KNOWN_ID_DIAGNOSTICS.length, 6);
const conflict = L3B_KNOWN_ID_DIAGNOSTICS.at(-1);
assert.equal(conflict?.id, "diag-plan-title-conflicting-id");
assert.equal(conflict?.message, "把英语复习计划 101 安排到下周");
assert.deepEqual(
  conflict?.context.plans.map(({ id }) => id),
  [101, 102],
);
```

Keep the existing neutral-Prompt test over all Known-ID messages so the
corrected message cannot be copied into Prompt text.

- [ ] **Step 3: Run evaluation tests and witness RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: FAIL because Full evidence lacks schedule-reference fields, the
evaluator lacks the new rejection source, and the script still points at v2.

- [ ] **Step 4: Project bounded Full evidence**

In `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`, import
`SchedulePlanReferenceErrorCode` and change:

```ts
clarificationSource:
  | "query_scope"
  | "resource_readiness"
  | "schedule_plan_reference"
  | null;

schedulePlanReferenceErrorCode:
  | SchedulePlanReferenceErrorCode
  | null;
```

Set the empty value to `null`. In the final evidence projection:

```ts
schedulePlanReferenceErrorCode:
  "schedulePlanReferenceErrorCode" in result
    ? result.schedulePlanReferenceErrorCode ?? null
    : null,
```

Do not retain provenance objects, plan IDs, titles, messages, Provider output,
or model reasoning.

- [ ] **Step 5: Classify the deterministic rejection**

In `src/lib/agent/orchestration/hybrid-production-evaluation.ts`, extend:

```ts
export type ProductionKnownIdRejectionSource =
  | "provider_missing_resource"
  | "resource_readiness_guard"
  | "schedule_plan_reference_contract";
```

Before Provider-direct missing-resource classification, add:

```ts
const typedScheduleReferenceRejection =
  input.fullEvidence.status === "clarified"
  && input.fullEvidence.clarificationSource
    === "schedule_plan_reference"
  && input.fullEvidence.schedulePlanReferenceErrorCode !== null;

if (typedScheduleReferenceRejection && !acceptedWrite) {
  return classified(
    "safe_rejection",
    "schedule_plan_reference_contract",
  );
}
```

Exact-reference diagnostics still require a final `schedule_plan`; a
clarification cannot pass them. Reject-invalid diagnostics still fail on any
accepted write candidate.

- [ ] **Step 6: Version the report path and lock preflight**

In `scripts/agent-production-seam-gate-eval.mjs`, change only:

```js
known_id: "/tmp/l3b-r8-production-known-id-v3.json",
```

In `tests/agent/orchestration/l3b-production-gate-contract.test.ts`, change the
expected path to v3 and retain assertions for:

```ts
assert.equal(preflight.observationCount, 6);
assert.equal(preflight.budget.authorizedLogicalCallMaximum, 6);
assert.equal(preflight.budget.authorizedMaximum, 24);
assert.equal(preflight.providerAttempts, 0);
assert.equal(existsSync(reportPath), reportExistedBefore);
```

The test must not delete, overwrite, or inspect raw contents of v1/v2 reports.

- [ ] **Step 7: Update metric fixtures and TEST_MAP**

In `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`, give the
corrected conflict's passing synthetic observation:

```ts
knownIdOutcome: "safe_rejection",
knownIdRejectionSource: "schedule_plan_reference_contract",
roleEvidence: {
  ...base.roleEvidence,
  fullOrchestrator: {
    ...base.roleEvidence.fullOrchestrator,
    clarificationSource: "schedule_plan_reference",
    schedulePlanReferenceErrorCode: "plan_id_title_conflict",
    status: "clarified",
  },
},
```

Keep the existing `6/6` passing Gate assertion and the independent unsafe
acceptance zero-tolerance test.

Update the Production Seam Gate row in `tests/TEST_MAP.md` to state:

```text
Single-task schedule_plan candidates are admitted only after deterministic
original-message/actor-authorized-context provenance validation. Genuine
ID/title conflict projects to a typed clarification before Resource Readiness
or Mapper. Known-ID retains six ordered observations and uses the exclusive
v3 report path; v1/v2 evidence remains immutable.
```

- [ ] **Step 8: Run Task 4 focused tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: all tests PASS; Known-ID remains exactly six observations and the
new preflight reports zero Provider attempts.

- [ ] **Step 9: Commit Task 4**

```bash
git add \
  scripts/agent-production-seam-gate-eval.mjs \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  src/lib/agent/orchestration/hybrid-production-evaluation.ts \
  src/lib/agent/orchestration/l3b-evaluation-fixtures.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "test(agent): close schedule reference known-id gate"
```

---

### Task 5: Full deterministic verification and no-network handoff

**Files:**

- Verify only; do not modify production behavior.
- If verification exposes a defect, return to the owning task's RED test,
  implement only that root-cause fix, and amend that task's commit before
  continuing.

**Interfaces:**

- Produces a clean implementation HEAD suitable for an exact six-observation
  Provider disclosure request.
- Does not produce a live report or Provider call.

- [ ] **Step 1: Run the complete focused provenance suite**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  AGENT_DISABLE_LLM=1 \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  node --import tsx --test \
  tests/agent/orchestration/plan-reference-evidence.test.ts \
  tests/agent/orchestration/query-scope-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/resource-readiness-guard.test.ts \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: all tests PASS with no network or database access.

- [ ] **Step 2: Run typecheck and full deterministic Agent tests**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  AGENT_DISABLE_LLM=1 \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  npm run typecheck

env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  AGENT_DISABLE_LLM=1 \
  PAYLOAD_SECRET='l3b-schedule-reference-test-only-2026' \
  npm test
```

Expected: typecheck PASS; all Agent and intelligent-case suites PASS with only
the repository's already-declared skips.

- [ ] **Step 3: Run lint and whitespace validation**

```bash
npx eslint \
  scripts/agent-production-seam-gate-eval.mjs \
  src/lib/agent/orchestration/plan-reference-evidence.ts \
  src/lib/agent/orchestration/query-scope-contract.ts \
  src/lib/agent/orchestration/schedule-plan-reference-contract.ts \
  src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  src/lib/agent/orchestration/hybrid-production-evaluation.ts \
  src/lib/agent/orchestration/l3b-evaluation-fixtures.ts \
  tests/agent/orchestration/plan-reference-evidence.test.ts \
  tests/agent/orchestration/query-scope-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts

git diff --check
```

Expected: ESLint exits zero and `git diff --check` prints nothing.

- [ ] **Step 4: Verify immutable reports and unused v3 path**

```bash
stat -f 'V1 mode=%Lp size=%z' \
  /tmp/l3b-r8-production-known-id.json
stat -f 'V2 mode=%Lp size=%z' \
  /tmp/l3b-r8-production-known-id-v2.json
test ! -e /tmp/l3b-r8-production-known-id-v3.json
```

Expected: v1 and v2 both exist with mode `600`; v3 does not exist.

- [ ] **Step 5: Run the real CLI in no-network preflight-only mode**

First obtain the exact implementation HEAD:

```bash
git rev-parse HEAD
git status --short --branch
```

Capture that exact 40-character SHA and use it directly in the preflight
environment:

```bash
IMPLEMENTATION_HEAD="$(git rev-parse HEAD)"

env \
  -u DATABASE_URL \
  -u DEEPSEEK_API_KEY \
  -u AGENT_DISABLE_LLM \
  AGENT_PRODUCTION_SEAM_EVAL=1 \
  AGENT_LIVE_LLM_EVAL=1 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_STAGE=known_id \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$IMPLEMENTATION_HEAD" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH=e8b1bc6ca6580f446b3d8cdaa886c5143f72dc17067cf9733ca702e19121f108 \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  PAYLOAD_SECRET='l3b-schedule-reference-preflight-only-2026' \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs

unset IMPLEMENTATION_HEAD
```

Expected sanitized terminal result:

```json
{
  "preflight": {
    "status": "ready",
    "stage": "known_id",
    "observationCount": 6,
    "providerAttempts": 0,
    "reportPath": "/tmp/l3b-r8-production-known-id-v3.json"
  }
}
```

The exact output also reports six authorized logical calls and 24 authorized
Provider attempts. Preflight must not create v3.

- [ ] **Step 6: Confirm clean handoff and stop before Provider**

```bash
git status --short --branch
git log -5 --oneline
test ! -e /tmp/l3b-r8-production-known-id-v3.json
```

Expected: clean worktree, the Task 1-4 commits visible, and v3 absent.

Report:

- exact implementation HEAD;
- focused and full deterministic test totals;
- typecheck/lint/whitespace results;
- no database or Provider calls;
- v1/v2 report preservation;
- v3 preflight status and exact 6/24 budget;
- unchanged default Orchestrator/Legacy behavior.

Request a new explicit disclosure approval for the corrected six synthetic
Known-ID messages and Contexts. Do not read a Keychain credential or call
DeepSeek until that exact-HEAD authorization is received.
