# Agent System Bug Fixes (P1/P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 agent system bugs: capability gate target narrowing, LLM Router V2 output propagation, router chain mismatch, LangGraph duplicate dry-run, router JSON retry, and debug log gating.

**Architecture:** All 6 bugs are independent surgical fixes in the agent pipeline (`capabilities/`, `router/`, `plan/`, `langgraph/`, `chat-pipeline/`, `client.ts`). Each bug has a clear root cause and a 1-5 line fix. Bugs 1-5 get regression tests; Bug 4's test already exists and is red.

**Tech Stack:** TypeScript, Node.js test runner (`node:test` + `node:assert/strict`), LangGraph

## Global Constraints

- All tests use `node:test` + `node:assert/strict` (follow existing patterns in `tests/agent/`)
- Debug logging gates use `process.env.AGENT_DEBUG_LOG` env var
- No changes to public API surfaces; only internal pipeline fixes
- Bug 4 fix must make the existing red test green (`dryRunCount` expected: 2)

---

### Task 1: Bug 1A — Add target extraction for missing intents in `normalize-router-output.ts`

**Files:**
- Modify: `src/lib/agent/router/types.ts:17` (add `"writing"` to `entityType` union)
- Modify: `src/lib/agent/router/normalize-router-output.ts:59-98`
- Create: `tests/agent/normalize-router-target.test.ts` (new file)

**Interfaces:**
- Consumes: `AgentIntent` type, `AgentTargetRef` type
- Produces: `extractTarget` returns `AgentTargetRef` with `entityType` set for `create_plan` (`"plan"`), `compose_schedule_item` (`"schedule"`), `compose_timeline_event` (`"timeline"`), `draft_writing_outline` (`"writing"`), `draft_checklist` (`"checklist"`)
- **Type prerequisite**: `AgentTargetRef.entityType` must include `"writing"` in its union

- [ ] **Step 0: Add `"writing"` to `AgentTargetRef.entityType` union**

In `src/lib/agent/router/types.ts`, change line 17 from:

```ts
  entityType?: "checklist" | "plan" | "schedule" | "timeline" | null;
```

To:

```ts
  entityType?: "checklist" | "plan" | "schedule" | "timeline" | "writing" | null;
```

- [ ] **Step 1: Write the failing test**

Create `tests/agent/normalize-router-target.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import type { AgentIntent } from "../../src/lib/agent/schemas";

test("extractTarget returns entityType plan for create_plan", () => {
  const intent: AgentIntent = {
    args: { title: "新计划" },
    intent: "create_plan",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "plan");
});

test("extractTarget returns entityType schedule for compose_schedule_item", () => {
  const intent: AgentIntent = {
    args: { date: "2026-07-01", title: "新日程" },
    intent: "compose_schedule_item",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "schedule");
});

test("extractTarget returns entityType timeline for compose_timeline_event", () => {
  const intent: AgentIntent = {
    args: { title: "新事件" },
    intent: "compose_timeline_event",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "timeline");
});

test("extractTarget returns entityType writing for draft_writing_outline", () => {
  const intent: AgentIntent = {
    args: { title: "新文章" },
    intent: "draft_writing_outline",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "writing");
});

test("extractTarget returns entityType checklist for draft_checklist", () => {
  const intent: AgentIntent = {
    args: { title: "新清单" },
    intent: "draft_checklist",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "checklist");
});

test("extractTarget still returns entityType for delete_record", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划A", entityType: "plan" },
    intent: "delete_record",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "plan");
  assert.equal(output.target.entityName, "计划A");
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
npx tsx --test tests/agent/normalize-router-target.test.ts
```

Expected: Tests for `create_plan`, `compose_schedule_item`, `compose_timeline_event`, `draft_writing_outline`, `draft_checklist` FAIL because `extractTarget` returns `{}` (no `entityType`). `delete_record` test should PASS.

- [ ] **Step 3: Add target extraction cases**

In `src/lib/agent/router/normalize-router-output.ts`, add cases to `extractTarget` after the `delete_record`/`modify_record` block (after line 73) and before `return {}`:

```ts
if (intent.intent === "create_plan") {
  return { entityType: "plan" };
}

if (intent.intent === "compose_schedule_item" || intent.intent === "reschedule_item" || intent.intent === "cancel_schedule_item") {
  return { entityType: "schedule" };
}

if (intent.intent === "compose_timeline_event") {
  return { entityType: "timeline" };
}

if (intent.intent === "draft_writing_outline") {
  return { entityType: "writing" };
}

if (intent.intent === "draft_checklist") {
  return { entityType: "checklist" };
}
```

- [ ] **Step 4: Run tests to verify passes**

```bash
npx tsx --test tests/agent/normalize-router-target.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/router/types.ts src/lib/agent/router/normalize-router-output.ts tests/agent/normalize-router-target.test.ts
git commit -m "fix: extract target entityType for create/delete/schedule/timeline/writing/checklist intents

Add entityType extraction in normalizeRouterOutput for create_plan,
compose_schedule_item, compose_timeline_event, draft_writing_outline,
and draft_checklist intents. Previously these all returned {} for target,
causing the capability gate to skip target-based narrowing.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Bug 1B — Add target-aware filtering in `tool-gate.ts:actionAllows`

**Files:**
- Modify: `src/lib/agent/capabilities/tool-gate.ts:16-44`
- Modify: `tests/agent/capability-tool-gate.test.ts` (add tests)

**Interfaces:**
- Consumes: `AgentRouterAction`, `AgentRouterOutput.target` (with `entityType` now populated by Task 1), `CapabilityTarget` from `AgentCapability`
- Produces: `actionAllows` now additionally checks `cap.target` against `router.target.entityType`

- [ ] **Step 1: Write the failing test**

Add to `tests/agent/capability-tool-gate.test.ts`:

```ts
import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";

test("create action with schedule target only allows schedule capabilities", () => {
  const intent: AgentIntent = {
    args: { date: "2026-07-01", title: "日程" },
    intent: "compose_schedule_item",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  // schedule capabilities should be allowed
  assert.ok(gate.allowed.includes("search_schedules"));
  assert.ok(gate.allowed.includes("preview_create_schedule"));

  // plan capabilities should NOT be allowed (wrong target)
  assert.ok(!gate.allowed.includes("preview_create_plan"));
  assert.ok(!gate.allowed.includes("draft_plan"));

  // writing capabilities should NOT be allowed (wrong target)
  assert.ok(!gate.allowed.includes("draft_writing_outline"));
});

test("create action with timeline target only allows timeline capabilities", () => {
  const intent: AgentIntent = {
    args: { title: "事件" },
    intent: "compose_timeline_event",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  assert.ok(gate.allowed.includes("search_timeline"));
  assert.ok(gate.allowed.includes("preview_create_timeline"));
  assert.ok(!gate.allowed.includes("preview_create_plan"));
  assert.ok(!gate.allowed.includes("preview_create_schedule"));
});

test("create action with plan target still allows plan capabilities (regression)", () => {
  const intent: AgentIntent = {
    args: { title: "新计划" },
    intent: "create_plan",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  assert.ok(gate.allowed.includes("search_plans"));
  assert.ok(gate.allowed.includes("draft_plan"));
  assert.ok(gate.allowed.includes("preview_create_plan"));
});

test("answer action skips target check (no entityType in target)", () => {
  const intent: AgentIntent = {
    args: { message: "你好" },
    intent: "casual_chat",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  // answer action should still have search capabilities
  assert.ok(gate.allowed.includes("search_plans"));
  assert.ok(gate.allowed.includes("search_schedules"));
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
npx tsx --test tests/agent/capability-tool-gate.test.ts
```

Expected: The new "create action with schedule target" and "create action with timeline target" tests FAIL because `actionAllows` doesn't check `cap.target` — `preview_create_plan` and `draft_plan` are incorrectly allowed for schedule/timeline intents.

- [ ] **Step 3: Add target-aware filtering in `actionAllows`**

In `src/lib/agent/capabilities/tool-gate.ts`, add a helper to map `router.target.entityType` to `cap.target`, and add the check in `actionAllows`:

Add after the `matchesPrefix` function (after line 14):

```ts
const entityTypeToCapTarget = (entityType: string | null | undefined): AgentCapability["target"] | null => {
  switch (entityType) {
    case "plan":
      return "plan";
    case "schedule":
      return "schedule";
    case "checklist":
      return "checklist";
    case "timeline":
      return "timeline";
    case "writing":
      return "writing";
    default:
      return null;
  }
};
```

Modify `actionAllows` to add target checking after the existing prefix check. The function should become:

```ts
const actionAllows = (action: AgentRouterAction, name: string, target?: AgentRouterOutput["target"]): boolean => {
  const cap = getCapability(name);

  if (!cap) {
    return false;
  }

  let actionOk = false;

  switch (action) {
    case "query":
      actionOk = matchesPrefix(name, "search_");
      break;
    case "answer":
    case "capability":
    case "clarify":
    case "expand":
      actionOk = !cap.sideEffect && cap.risk === "read";
      break;
    case "create":
      actionOk =
        matchesPrefix(name, "search_") ||
        matchesPrefix(name, "draft_") ||
        matchesPrefix(name, "preview_create_");
      break;
    case "update":
      actionOk = matchesPrefix(name, "search_") || matchesPrefix(name, "preview_update_");
      break;
    case "delete":
      actionOk = matchesPrefix(name, "search_") || matchesPrefix(name, "preview_delete_");
      break;
    default:
      return false;
  }

  if (!actionOk) {
    return false;
  }

  // Target narrowing: if router has an entityType, verify cap.target matches.
  // Skip for answer/clarify/capability/expand actions (no well-defined target).
  if (
    action !== "answer" &&
    action !== "clarify" &&
    action !== "capability" &&
    action !== "expand"
  ) {
    const expectedTarget = entityTypeToCapTarget(target?.entityType);
    if (expectedTarget && cap.target !== expectedTarget && cap.target !== "global") {
      return false;
    }
  }

  return true;
};
```

Update the call site in `getAllowedCapabilities` (line 95) to pass `router.target`:

```ts
// Change:
if (!actionAllows(router.action, name)) {
// To:
if (!actionAllows(router.action, name, router.target)) {
```

- [ ] **Step 4: Run tests to verify passes**

```bash
npx tsx --test tests/agent/capability-tool-gate.test.ts
```

Expected: All tests PASS including the new target-narrowing tests.

- [ ] **Step 5: Run the full agent test suite to check for regressions**

```bash
npm run test:agent
```

Expected: All previously passing tests still pass. (Bug 4's test is the only red one, and it's unrelated.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/capabilities/tool-gate.ts tests/agent/capability-tool-gate.test.ts
git commit -m "fix: add target-aware filtering to capability gate actionAllows

actionAllows now checks cap.target against router.target.entityType
for create/update/delete/query actions. This prevents capabilities
for the wrong target (e.g., plan capabilities for a schedule intent)
from being exposed to the LLM.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Bug 1C — Add explicit target cases in `tool-plan.ts:previewForTarget`

**Files:**
- Modify: `src/lib/agent/plan/tool-plan.ts:48-58`
- Modify: `tests/agent/router-workflow.test.ts` (add tests)

**Interfaces:**
- Consumes: `LLMRouterOutput.action`, `LLMRouterOutput.target`
- Produces: `previewForTarget` now returns correct capabilities for all known targets, not just the plan default

- [ ] **Step 1: Write the failing test**

Add to `tests/agent/router-workflow.test.ts`:

```ts
test("create schedule: previewForTarget returns schedule caps not plan caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "明天下午3点开会", title: "会议" },
    target: "schedule",
    userVisibleReason: "创建日程",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_schedules"));
  assert.ok(plan.plannedCapabilities.includes("preview_create_schedule"));
  assert.ok(!plan.plannedCapabilities.includes("preview_create_plan"));
  assert.ok(!plan.plannedCapabilities.includes("draft_plan"));
});

test("create timeline: previewForTarget returns timeline caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "添加一个事件", title: "事件" },
    target: "timeline",
    userVisibleReason: "创建事件",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_timeline"));
  assert.ok(plan.plannedCapabilities.includes("preview_create_timeline"));
  assert.ok(!plan.plannedCapabilities.includes("preview_create_plan"));
});

test("create checklist: previewForTarget returns checklist caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "创建一个清单", title: "清单" },
    target: "checklist",
    userVisibleReason: "创建清单",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_checklists"));
  assert.ok(plan.plannedCapabilities.includes("draft_checklist"));
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
npx tsx --test tests/agent/router-workflow.test.ts
```

Expected: New schedule/timeline/checklist create tests FAIL because `previewForTarget` falls through to the plan default (`search_plans`, `draft_plan`, `preview_create_plan`).

- [ ] **Step 3: Add explicit cases in `previewForTarget`**

In `src/lib/agent/plan/tool-plan.ts`, modify the `create` case in `previewForTarget` (lines 48-58) to add explicit cases for `checklist` and `writing`:

```ts
if (action === "create") {
  if (target === "schedule") {
    return ["search_schedules", "preview_create_schedule"];
  }

  if (target === "timeline") {
    return ["search_timeline", "preview_create_timeline"];
  }

  if (target === "checklist") {
    return ["search_checklists", "draft_checklist"];
  }

  if (target === "writing") {
    return ["draft_writing_outline"];
  }

  if (target === "memory") {
    return ["search_memory"];
  }

  return ["search_plans", "draft_plan", "preview_create_plan"];
}
```

- [ ] **Step 4: Run tests to verify passes**

```bash
npx tsx --test tests/agent/router-workflow.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full agent test suite**

```bash
npm run test:agent
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/plan/tool-plan.ts tests/agent/router-workflow.test.ts
git commit -m "fix: add explicit target cases in previewForTarget for checklist/writing/memory

Previously create actions for checklist/writing/memory targets fell
through to the plan default, exposing wrong capabilities. Now each
target has explicit capability lists.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Bug 2 — Propagate `llmRouterOutput` through `generateIntentWithAgentModel` return sites

**Files:**
- Modify: `src/lib/agent/client.ts:238-253` (return type), `:449-454` (React-loop branch), `:490-494` (non-loop branch)

**Interfaces:**
- Consumes: `LLMRouterOutput` from `parseFinalContent`
- Produces: `generateIntentWithAgentModel` return type gains `llmRouterOutput?: LLMRouterOutput`; both return sites include it when available

- [ ] **Step 1: Write the failing test**

Check if there are existing tests for `generateIntentWithAgentModel`. If not, the fix is small enough to rely on the existing `npm run test:agent` suite as a regression catch.

```bash
grep -rn "generateIntentWithAgentModel\|generateIntent" tests/ --include="*.test.ts" -l
```

If no existing tests directly test this function, the integration tests in `test:agent` will catch regressions. The bug manifests as `llmRouterOutput` being `undefined` downstream even when the LLM returned valid router JSON.

- [ ] **Step 2: Update return type**

In `src/lib/agent/client.ts`, add `llmRouterOutput` to the return type (lines 248-253):

```ts
}): Promise<null | {
  arbitration?: AgentArbitrationDecision;
  intent: AgentIntent;
  llmRouterOutput?: import("./router/llm-router-schema").LLMRouterOutput;
  reactSteps?: import("./react-loop").ReactStepTrace[];
  tokenUsage: ReturnType<typeof createTokenUsageSnapshot>;
}> => {
```

- [ ] **Step 3: Add `llmRouterOutput` to React-loop `final_answer` return (line 449-454)**

Change:

```ts
if (parsed) {
  return {
    intent: parsed.intent,
    ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
    reactSteps: loopResult.steps,
    tokenUsage: finalizeUsage(loopResult.content),
  };
}
```

To:

```ts
if (parsed) {
  return {
    intent: parsed.intent,
    ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
    ...(parsed.llmRouterOutput ? { llmRouterOutput: parsed.llmRouterOutput } : {}),
    reactSteps: loopResult.steps,
    tokenUsage: finalizeUsage(loopResult.content),
  };
}
```

- [ ] **Step 4: Add `llmRouterOutput` to non-loop path return (line 490-494)**

Change:

```ts
return {
  intent: parsed.intent,
  ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
  tokenUsage: finalizeUsage(result.turn.content),
};
```

To:

```ts
return {
  intent: parsed.intent,
  ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
  ...(parsed.llmRouterOutput ? { llmRouterOutput: parsed.llmRouterOutput } : {}),
  tokenUsage: finalizeUsage(result.turn.content),
};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new type errors.

- [ ] **Step 6: Run tests**

```bash
npm run test:agent
```

Expected: All previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/client.ts
git commit -m "fix: propagate llmRouterOutput through generateIntentWithAgentModel return

Previously parseFinalContent parsed the router JSON into llmRouterOutput
but both the React-loop final_answer branch and the non-loop path dropped
it from the return value. Now it's propagated so downstream consumers
like the capability gate and tool planner can use the LLM's target.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Bug 3 — Only attach router chain when intent matches

**Files:**
- Modify: `src/lib/agent/intent-resolution.ts:694-705`

**Interfaces:**
- Consumes: `AgentIntentResolutionResult`, `RouterChainResult`
- Produces: `withRouterChain` now only attaches router data when `routerChain.intent.intent === result.intent.intent`

- [ ] **Step 1: Write the test**

Add to existing intent-resolution tests or create a minimal test. Since this function `withRouterChain` is a pure helper, test it directly.

Create `tests/agent/intent-router-mismatch.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentIntentResolutionResult } from "../../src/lib/agent/intent-resolution";
import type { RouterChainResult } from "../../src/lib/agent/router/resolve-router-chain";
import type { LLMRouterOutput } from "../../src/lib/agent/router/llm-router-schema";
import type { AgentRouterOutput } from "../../src/lib/agent/router/types";

// Replicate the withRouterChain logic for testing
const withRouterChain = (
  result: AgentIntentResolutionResult,
  routerChain: RouterChainResult | null,
): AgentIntentResolutionResult =>
  routerChain && routerChain.intent.intent === result.intent.intent
    ? {
        ...result,
        llmRouterOutput: routerChain.llmRouterOutput,
        routerOutput: routerChain.routerOutput,
        routerSource: routerChain.source,
      }
    : result;

const makeResolution = (intent: string): AgentIntentResolutionResult => ({
  engine: "heuristic",
  intent: {
    args: {},
    confidence: 1,
    intent: intent as AgentIntentResolutionResult["intent"]["intent"],
  },
});

const makeRouterChain = (intent: string): RouterChainResult => ({
  intent: {
    args: {},
    confidence: 1,
    intent: intent as RouterChainResult["intent"]["intent"],
  },
  llmRouterOutput: {
    action: "capability" as LLMRouterOutput["action"],
    confidence: 0.8,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: {},
    target: "unknown" as LLMRouterOutput["target"],
    userVisibleReason: "capability query",
    writeRequired: false,
  },
  routerOutput: {
    action: "capability",
    confidence: 0.8,
    intent: {
      args: {},
      confidence: 0.8,
      intent: intent as AgentRouterOutput["intent"]["intent"],
    },
    reason: "capability query",
    requiresWrite: false,
    target: {},
  },
  source: "capability",
});

test("withRouterChain attaches when intents match", () => {
  const resolution = makeResolution("capability_query");
  const chain = makeRouterChain("capability_query");
  const result = withRouterChain(resolution, chain);

  assert.ok(result.llmRouterOutput);
  assert.ok(result.routerOutput);
  assert.equal(result.routerSource, "capability");
});

test("withRouterChain skips attachment when intents mismatch", () => {
  // Simulates: router said capability_query but LLM+arbitration resolved to clarify
  const resolution = makeResolution("clarify");
  const chain = makeRouterChain("capability_query");
  const result = withRouterChain(resolution, chain);

  assert.equal(result.llmRouterOutput, undefined);
  assert.equal(result.routerOutput, undefined);
  assert.equal(result.routerSource, undefined);
});

test("withRouterChain skips when routerChain is null", () => {
  const resolution = makeResolution("create_plan");
  const result = withRouterChain(resolution, null);

  assert.equal(result.llmRouterOutput, undefined);
  assert.equal(result.routerOutput, undefined);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx tsx --test tests/agent/intent-router-mismatch.test.ts
```

Expected: "withRouterChain skips attachment when intents mismatch" FAILS because the current code unconditionally attaches.

- [ ] **Step 3: Fix `withRouterChain` in `intent-resolution.ts`**

In `src/lib/agent/intent-resolution.ts`, change `withRouterChain` (lines 694-705):

```ts
const withRouterChain = (
  result: AgentIntentResolutionResult,
  routerChain: import("./router/resolve-router-chain").RouterChainResult | null,
): AgentIntentResolutionResult =>
  routerChain && routerChain.intent.intent === result.intent.intent
    ? {
        ...result,
        llmRouterOutput: routerChain.llmRouterOutput,
        routerOutput: routerChain.routerOutput,
        routerSource: routerChain.source,
      }
    : result;
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx tsx --test tests/agent/intent-router-mismatch.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm run test:agent
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/intent-resolution.ts tests/agent/intent-router-mismatch.test.ts
git commit -m "fix: only attach router chain to resolution when intents match

Previously withRouterChain unconditionally attached the deterministic
router's output to the final resolution, even when the LLM+arbitration
overrode the intent (e.g., clarify vs capability_query). This could
cause downstream gate/trace to use wrong router data.

Now attachment only happens when routerChain.intent.intent matches
result.intent.intent.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Bug 4 — Fix stale resume response detection to prevent duplicate dry-run

**Files:**
- Modify: `src/lib/agent/langgraph/full-adapter.ts:924`

**Interfaces:**
- Consumes: `AgentChatResponse`, `turnId` from current turn
- Produces: `isStaleResumeResponse` now returns `false` when `turnId` is missing (fresh resume response), only `true` when `turnId` is present AND mismatched

- [ ] **Step 1: Understand the failing test**

The test `full adapter resumes a checkpointed confirmation without duplicate writes` (in `tests/agent/langgraph-full-adapter.test.ts:285`) expects `dryRunCount === 2` but gets `3`.

The flow:
1. Run 1: Creates a plan → interrupt for confirmation → `dryRunCount = 1`
2. Run 2 (resume with confirm): The graph resumes, produces a response WITHOUT `turnId` set (turnId is set later during `persistAgentTurn`). `isStaleResumeResponse` sees `value.turnId !== turnId` (undefined !== "some-id" = true) and marks it stale. Then falls back to `initialInput` which triggers a full re-run with another dry-run → `dryRunCount = 3` instead of `2`.

- [ ] **Step 2: Fix `isStaleResumeResponse`**

In `src/lib/agent/langgraph/full-adapter.ts`, change line 924-925 from:

```ts
const isStaleResumeResponse = (value: AgentChatResponse | null | undefined) =>
  hasUsableGraphResponse(value) && value.turnId !== turnId;
```

To:

```ts
const isStaleResumeResponse = (value: AgentChatResponse | null | undefined) =>
  hasUsableGraphResponse(value) && value.turnId != null && value.turnId !== turnId;
```

The key change: add `value.turnId != null &&` — a fresh resume response without a `turnId` yet is NOT stale. Only flag as stale when `turnId` is present AND doesn't match the expected `turnId`.

- [ ] **Step 3: Run the failing test in isolation**

```bash
npx tsx --test --test-name-pattern="resumes a checkpointed confirmation" tests/agent/langgraph-full-adapter.test.ts
```

Expected: PASS with `dryRunCount === 2`.

- [ ] **Step 4: Run full agent test suite**

```bash
npm run test:agent
```

Expected: **543 pass / 0 fail** (previously 542 pass / 1 fail).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/langgraph/full-adapter.ts
git commit -m "fix: prevent duplicate dry-run on LangGraph checkpoint resume

isStaleResumeResponse was marking fresh resume responses as stale
because they don't have turnId set yet (turnId is assigned later in
persistAgentTurn). Now only flags as stale when turnId is present
AND mismatched. This prevents the fallback to initial invoke which
caused an extra dry-run cycle.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Bug 5 — Move `JSON.parse(first)` into try-catch for router retry

**Files:**
- Modify: `src/lib/agent/router/llm-router-schema.ts:182-198`

**Interfaces:**
- Consumes: `parseContent: () => string | null`, `retry: () => Promise<string | null>`
- Produces: `parseLLMRouterOutputWithRetry` now retries on first invalid JSON instead of throwing

- [ ] **Step 1: Write the failing test**

Add a test for `parseLLMRouterOutputWithRetry`. Check if there's an existing test file for `llm-router-schema`:

```bash
grep -rn "parseLLMRouterOutputWithRetry" tests/ --include="*.test.ts" -l
```

If no tests exist, create `tests/agent/llm-router-retry.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

const { parseLLMRouterOutputWithRetry } = await import(
  "../../src/lib/agent/router/llm-router-schema"
);

test("retries on first invalid JSON instead of throwing", async () => {
  let parseCalls = 0;
  let retryCalls = 0;

  const result = await parseLLMRouterOutputWithRetry(
    () => {
      parseCalls += 1;
      return "{not valid json";
    },
    async () => {
      retryCalls += 1;
      return JSON.stringify({
        action: "clarify",
        confidence: 0.5,
        needsClarification: true,
        requiresConfirmation: false,
        riskLevel: "none",
        target: "unknown",
        userVisibleReason: "fallback after retry",
        writeRequired: false,
      });
    },
  );

  assert.equal(parseCalls, 1);
  assert.equal(retryCalls, 1);
  assert.equal(result.retried, true);
  assert.equal(result.output.action, "clarify");
});

test("does not retry when first parse succeeds", async () => {
  let parseCalls = 0;
  let retryCalls = 0;

  const result = await parseLLMRouterOutputWithRetry(
    () => {
      parseCalls += 1;
      return JSON.stringify({
        action: "query",
        confidence: 0.9,
        needsClarification: false,
        requiresConfirmation: false,
        riskLevel: "none",
        target: "schedule",
        userVisibleReason: "query schedule",
        writeRequired: false,
      });
    },
    async () => {
      retryCalls += 1;
      return null;
    },
  );

  assert.equal(parseCalls, 1);
  assert.equal(retryCalls, 0);
  assert.equal(result.retried, false);
  assert.equal(result.output.action, "query");
});

test("falls back to clarify when both attempts fail", async () => {
  const result = await parseLLMRouterOutputWithRetry(
    () => "{also not json",
    async () => "{still not json",
  );

  assert.equal(result.retried, true);
  assert.equal(result.output.action, "clarify");
  assert.equal(result.output.needsClarification, true);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx tsx --test tests/agent/llm-router-retry.test.ts
```

Expected: "retries on first invalid JSON instead of throwing" FAILS — `JSON.parse("{not valid json")` throws before reaching retry.

- [ ] **Step 3: Move `JSON.parse(first)` into try-catch**

In `src/lib/agent/router/llm-router-schema.ts`, change `parseLLMRouterOutputWithRetry` (lines 178-199) from:

```ts
export const parseLLMRouterOutputWithRetry = async (
  parseContent: () => string | null,
  retry: () => Promise<string | null>,
): Promise<{ output: LLMRouterOutput; retried: boolean }> => {
  const first = parseContent();
  const firstParsed = first ? parseLLMRouterOutput(JSON.parse(first)) : null;

  if (firstParsed) {
    return { output: firstParsed, retried: false };
  }

  try {
    const secondContent = await retry();
    const secondParsed = secondContent ? parseLLMRouterOutput(JSON.parse(secondContent)) : null;

    if (secondParsed) {
      return { output: secondParsed, retried: true };
    }
  } catch {
    // fall through to clarify
  }
  // ...
```

To:

```ts
export const parseLLMRouterOutputWithRetry = async (
  parseContent: () => string | null,
  retry: () => Promise<string | null>,
): Promise<{ output: LLMRouterOutput; retried: boolean }> => {
  const first = parseContent();
  let firstParsed: LLMRouterOutput | null = null;

  try {
    firstParsed = first ? parseLLMRouterOutput(JSON.parse(first)) : null;
  } catch {
    // first parse failed, will retry below
  }

  if (firstParsed) {
    return { output: firstParsed, retried: false };
  }

  try {
    const secondContent = await retry();
    const secondParsed = secondContent ? parseLLMRouterOutput(JSON.parse(secondContent)) : null;

    if (secondParsed) {
      return { output: secondParsed, retried: true };
    }
  } catch {
    // fall through to clarify
  }
  // ...
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx tsx --test tests/agent/llm-router-retry.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Run full agent test suite**

```bash
npm run test:agent
```

Expected: All previously passing tests plus the new test pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/router/llm-router-schema.ts tests/agent/llm-router-retry.test.ts
git commit -m "fix: retry on first invalid JSON in parseLLMRouterOutputWithRetry

Previously JSON.parse(first) was outside the try-catch, so invalid
JSON on the first attempt would throw immediately instead of triggering
the retry callback. Now both parse attempts are inside try-catch blocks,
and the first failure correctly triggers a retry before falling back
to clarify.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Bug 6 — Gate debug logging behind `AGENT_DEBUG_LOG` env var

**Files:**
- Modify: `src/lib/agent/chat-pipeline/resolve-intent-step.ts:935-937`
- Modify: `src/lib/agent/chat-pipeline/execute-and-persist-step.ts:98-109`
- Modify: `src/lib/agent/langgraph/full-adapter.ts:525-534`, `:945-971`, `:984-999`
- Modify: `src/lib/agent/intent-resolution.ts:823-846`

**Interfaces:**
- No functional change. Each debug block is wrapped in `if (process.env.AGENT_DEBUG_LOG)`.

- [ ] **Step 1: Gate `resolve-intent-step.ts:935-937` (fetch POST)**

Wrap the `fetch(...)` call:

```ts
// #region agent log
if (process.env.AGENT_DEBUG_LOG) {
  fetch('http://127.0.0.1:7553/ingest/92e11e20-4501-4445-b574-f99e05456c16',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'961715'},body:JSON.stringify({sessionId:'961715',location:'resolve-intent-step.ts:reply-gen',message:'conversational reply generation',data:{intent:intent.intent,openDomainTopic: intent.intent==='answer_question'?intent.args.openDomainTopic:null,groundedAnswerLen:typeof groundedAnswer==='string'?groundedAnswer.length:null,replyResultLen:replyResult?.text?.length??null,replyResultNull:replyResult===null,streamedReplyLen:streamedReply.length},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
}
// #endregion
```

- [ ] **Step 2: Gate `execute-and-persist-step.ts:98-109` (appendFileSync)**

Wrap the entire `try { appendFileSync(...) } catch {}` block (lines 98-109):

```ts
// #region agent log
if (process.env.AGENT_DEBUG_LOG) {
  try {
    appendFileSync(
      "/Users/richardluo/Documents/Develop/SunnyPanel/.cursor/debug-961715.log",
      // ... existing JSON content ...
    );
  } catch {
    // ignore debug log failures
  }
}
// #endregion
```

- [ ] **Step 3: Gate `full-adapter.ts` (3 locations)**

At line 525-534 (`persistTurn`), line 945-971 (`resume-invoke`), and line 984-999 (`fresh-invoke`): wrap each `try { appendFileSync(...) } catch {}` block in `if (process.env.AGENT_DEBUG_LOG)`.

- [ ] **Step 4: Gate `intent-resolution.ts:823-846` (appendFileSync)**

Wrap the `try { appendFileSync(...) } catch {}` block in `if (process.env.AGENT_DEBUG_LOG)`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new type errors.

- [ ] **Step 6: Run tests**

```bash
npm run test:agent
```

Expected: All tests still pass (debug logging has no effect on behavior).

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/chat-pipeline/resolve-intent-step.ts \
        src/lib/agent/chat-pipeline/execute-and-persist-step.ts \
        src/lib/agent/langgraph/full-adapter.ts \
        src/lib/agent/intent-resolution.ts
git commit -m "fix: gate debug logging behind AGENT_DEBUG_LOG env var

Wrap all hardcoded debug fetch/appendFileSync calls in hot paths behind
process.env.AGENT_DEBUG_LOG to prevent production-side effects (file I/O,
network calls to localhost:7553) and privacy/performance risks.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Final integration — run full test suite and verify all fixes

- [ ] **Step 1: Run the full agent test suite**

```bash
npm run test:agent
```

Expected: **543 pass / 0 fail** — the previously-red Bug 4 test is now green, all other tests still pass.

- [ ] **Step 2: Verify all new test files pass individually**

```bash
npx tsx --test tests/agent/normalize-router-target.test.ts
npx tsx --test tests/agent/llm-router-retry.test.ts
npx tsx --test tests/agent/intent-router-mismatch.test.ts
npx tsx --test tests/agent/capability-tool-gate.test.ts
npx tsx --test tests/agent/router-workflow.test.ts
```

Expected: All PASS.

- [ ] **Step 3: Verify no debug logs are written without the env var**

```bash
# Run a quick agent test without AGENT_DEBUG_LOG set
npm run test:agent 2>&1 | head -5
```

Confirm no `.cursor/debug-961715.log` is created/modified during the test run.

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git status
# Should show clean working tree with all fixes committed
```
