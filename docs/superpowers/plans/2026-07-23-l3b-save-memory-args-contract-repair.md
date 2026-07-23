# L3-B Save Memory Args Contract Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `save_memory` reliably produce parser-valid non-empty `args.content`, allow one safe schema-repair attempt, and keep every invalid attempt observable and fail-closed.

**Architecture:** A new small argument-contract module owns the `save_memory.content` requirement, renders it into the Full Orchestrator protocol, refines the existing Structured Output schema, and builds value-free repair guidance. `invokeStructured()` gains an opt-in sanitized schema-repair callback while retaining one logical call and bounded Provider-attempt accounting. The production Gate enables one schema retry and records repair attempts without lowering any threshold.

**Tech Stack:** TypeScript, Zod, LangChain `BaseChatModel`, existing `invokeStructured()`, Node test runner, DeepSeek `prompt_json/jsonMode`, and the existing L3-B production Gate.

## Global Constraints

- Do not infer, synthesize, regex-extract, or substring-extract missing memory content from the user message.
- Do not convert invalid task arguments into a write candidate or deterministic write.
- Do not add a second logical model role or call Legacy after failure.
- Do not change decision codes, intent allowlists, fixtures, fixture expectations, model, temperature, timeout, transport retries, or Gate thresholds.
- Do not modify Mapper, Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, Rollback, Payload schema, migrations, LangGraph topology, Router adoption, Query adoption, or Specialist behavior.
- Do not retain raw Provider output, raw arguments, user/workspace values, hidden reasoning, errors, stacks, or secrets.
- The repair callback may receive only sanitized issue code, path, and missing status.
- At most one schema-repair retry is allowed by the L3-B live profile.
- Every retry remains one Orchestrator logical call but a separate counted Provider attempt.
- Invalid task arguments must fail before decision consistency, Query Scope, Resource Readiness, Mapper, database, execution, or persistence.
- Legacy remains the default Orchestrator Runtime.
- Do not call a real Provider or connect to a database during implementation and deterministic verification.
- Previous `/tmp` Acceptance and Stability reports are immutable evidence and must never be overwritten.

---

## File Structure

### New production module

- `src/lib/agent/orchestration/orchestrator-task-args-contract.ts`
  owns the frozen `save_memory.content` requirement, deterministic validation,
  Zod runtime refinement, Prompt rendering, and sanitized repair instruction.

### Modified production modules

- `src/lib/agent/orchestration/langchain-orchestrator.ts`
  renders the shared protocol and invokes `invokeStructured()` with the refined
  runtime schema and repair callback.
- `src/lib/agent/llm/invoke-structured.ts`
  supports an opt-in value-free system instruction on the next schema attempt.
- `src/lib/agent/orchestration/l3b-evaluation-config.ts`
  bumps the Prompt/evaluation protocol versions and enables one schema retry.
- `src/lib/agent/orchestration/l3b-production-gate.ts`
  exposes `schemaRepairAttempts` as a non-exempting Provider diagnostic.

### New and modified tests

- Create:
  `tests/agent/orchestration/orchestrator-task-args-contract.test.ts`
- Modify:
  `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify:
  `tests/agent/llm/invoke-structured.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify:
  `tests/TEST_MAP.md`

### Explicitly unchanged

- `src/lib/agent/llm/schemas/orchestrator-output.ts`
- `src/lib/agent/schemas.ts`
- `src/lib/agent/orchestration/orchestrator-plan-to-intent.ts`
- `src/lib/agent/orchestration/orchestrator-decision-consistency.ts`
- `src/lib/agent/orchestration/query-scope-contract.ts`
- `src/lib/agent/orchestration/resource-readiness-guard.ts`
- `src/lib/agent/orchestration/orchestrator-mapper.ts`
- `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts`
- `scripts/agent-production-seam-gate-eval.mjs`
- every database, execution, Payload, LangGraph, Runtime-default, Router,
  Query-adoption, and Specialist file.

---

### Task 1: Shared Save-Memory Argument Contract and Runtime Schema

**Files:**
- Create:
  `src/lib/agent/orchestration/orchestrator-task-args-contract.ts`
- Create:
  `tests/agent/orchestration/orchestrator-task-args-contract.test.ts`
- Modify:
  `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify:
  `tests/agent/orchestration/langchain-orchestrator.test.ts`

**Interfaces:**
- Consumes:
  `OrchestratorOutput` and `orchestratorOutputSchema`.
- Produces:

```ts
export const SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT: Readonly<{
  intent: "save_memory";
  requiredNonEmptyStringFields: readonly ["content"];
}>;

export type OrchestratorTaskArgsIssue = Readonly<{
  code: "required_non_empty_string";
  field: "content";
  intent: "save_memory";
  taskIndex: number;
}>;

export const validateOrchestratorTaskArgs: (
  output: OrchestratorOutput,
) => Readonly<{
  issues: readonly OrchestratorTaskArgsIssue[];
  valid: boolean;
}>;

export const orchestratorOutputWithTaskArgsSchema: ReturnType<
  typeof orchestratorOutputSchema.superRefine
>;

export const renderOrchestratorTaskArgsProtocol: () => string;
```

- [ ] **Step 1: Write failing contract tests**

Create
`tests/agent/orchestration/orchestrator-task-args-contract.test.ts`.
Build one valid `OrchestratorOutput` helper:

```ts
const output = (intent: OrchestratorOutput["tasks"][number]["intent"], args: Record<string, unknown>): OrchestratorOutput => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: "保存长期记忆",
  tasks: [{
    agentRole: "memory",
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label: "保存长期记忆",
  }],
  version: 2,
});
```

Assert:

```ts
assert.deepEqual(
  SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields,
  ["content"],
);
assert.equal(Object.isFrozen(SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT), true);
assert.equal(
  Object.isFrozen(
    SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields,
  ),
  true,
);
assert.equal(
  validateOrchestratorTaskArgs(
    output("save_memory", { content: "每周五复盘" }),
  ).valid,
  true,
);
```

For `undefined`, `""`, `"   "`, `null`, and `42`, assert one issue with:

```ts
{
  code: "required_non_empty_string",
  field: "content",
  intent: "save_memory",
  taskIndex: 0,
}
```

Assert `orchestratorOutputWithTaskArgsSchema.safeParse()` fails at the exact
path:

```ts
["tasks", 0, "args", "content"]
```

Assert `query_progress` with `{}` remains valid. Assert the rendered protocol
contains `save_memory`, `args.content`, `required`, `non-empty string`, and
contains neither user data nor a second hand-written field name.

- [ ] **Step 2: Add failing Full-Orchestrator protocol tests**

In `tests/agent/orchestration/langchain-orchestrator.test.ts`, add:

```ts
it("renders the shared save_memory args contract into the trusted protocol", () => {
  const system = buildLangChainSystemPrompt();
  assert.match(system, /save_memory.*args\.content.*required.*non-empty string/u);
  assert.equal(
    system.includes(
      SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT
        .requiredNonEmptyStringFields[0],
    ),
    true,
  );
});
```

Add a fake-model test whose response is schema-valid under the old generic
schema but has `intent: "save_memory"` and `args: { title: "复盘偏好" }`.
Invoke with `structuredRetryBudget: { schema: 0, transport: 0 }` and assert:

```ts
assert.equal(result.status, "unavailable");
assert.equal(result.reason, "schema_failure");
```

The production-evaluation test in Task 3 proves that this typed failure reaches
no downstream business boundary.

- [ ] **Step 3: Run tests and verify RED**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/orchestrator-task-args-contract.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts
```

Expected: FAIL because the shared contract, refined schema, and Prompt section
do not exist and missing `content` is still accepted by the old schema.

- [ ] **Step 4: Implement the shared contract**

Create
`src/lib/agent/orchestration/orchestrator-task-args-contract.ts`:

```ts
import { z } from "zod";

import {
  orchestratorOutputSchema,
  type OrchestratorOutput,
} from "../llm/schemas/orchestrator-output";

const requiredNonEmptyStringFields = Object.freeze(["content"] as const);

export const SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT = Object.freeze({
  intent: "save_memory" as const,
  requiredNonEmptyStringFields,
});

export type OrchestratorTaskArgsIssue = Readonly<{
  code: "required_non_empty_string";
  field: "content";
  intent: "save_memory";
  taskIndex: number;
}>;

export const validateOrchestratorTaskArgs = (
  output: OrchestratorOutput,
) => {
  const issues: OrchestratorTaskArgsIssue[] = [];

  output.tasks.forEach((task, taskIndex) => {
    if (task.intent !== SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.intent) return;
    const field =
      SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT
        .requiredNonEmptyStringFields[0];
    const value = task.args[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(Object.freeze({
        code: "required_non_empty_string",
        field,
        intent: "save_memory",
        taskIndex,
      }));
    }
  });

  return Object.freeze({
    issues: Object.freeze(issues),
    valid: issues.length === 0,
  });
};

export const orchestratorOutputWithTaskArgsSchema =
  orchestratorOutputSchema.superRefine((output, context) => {
    for (const issue of validateOrchestratorTaskArgs(output).issues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required intent argument is invalid.",
        path: ["tasks", issue.taskIndex, "args", issue.field],
      });
    }
  });

export const renderOrchestratorTaskArgsProtocol = (): string => {
  const field =
    SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields[0];
  return [
    "[orchestrator-task-args-contract:v1]",
    `- ${SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.intent}: args.${field} is required and must be a non-empty string.`,
  ].join("\n");
};
```

Do not accept the user message, workspace context, or Provider response as an
argument to this module.

- [ ] **Step 5: Wire the refined schema and generated Prompt**

In `langchain-orchestrator.ts`:

```ts
import {
  orchestratorOutputWithTaskArgsSchema,
  renderOrchestratorTaskArgsProtocol,
} from "./orchestrator-task-args-contract";
```

Insert the generated protocol after the existing intent-family protocol:

```ts
${renderOrchestratorTaskArgsProtocol()}
```

Change only the final schema passed to `invokeStructured()`:

```ts
schema: orchestratorOutputWithTaskArgsSchema,
modelSchema: orchestratorOutputBaseSchema,
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: all tests pass; missing/empty/wrong-type `content` is a typed schema
failure and valid `content` remains accepted.

- [ ] **Step 7: Commit Task 1**

```bash
git add \
  src/lib/agent/orchestration/orchestrator-task-args-contract.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  tests/agent/orchestration/orchestrator-task-args-contract.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts
git diff --cached --check
git commit -m "fix(agent): validate save memory task arguments"
```

---

### Task 2: Sanitized Schema-Repair Instruction in `invokeStructured`

**Files:**
- Modify: `src/lib/agent/llm/invoke-structured.ts`
- Modify: `tests/agent/llm/invoke-structured.test.ts`
- Modify: `tests/agent/llm/invoke-structured-envelope.test.ts`

**Interfaces:**
- Adds to `InvokeStructuredOptions<TSchema>`:

```ts
schemaRepairInstruction?: (
  issues: StructuredOutputDiagnostics["issues"],
) => null | string;
```

- The callback receives no raw output or parsed field values.

- [ ] **Step 1: Write a failing native-structured retry test**

In `tests/agent/llm/invoke-structured.test.ts`, create a fake model that returns
an invalid object and then a valid object while capturing the LangChain
messages passed to each `invoke()`.

Use this task-local factory:

```ts
const sequentialFactory = (
  outputs: readonly unknown[],
  capturedMessages: unknown[][],
): ModelFactory => () => {
  let index = 0;
  return {
    withStructuredOutput: () => ({
      invoke: async (messages: unknown[]) => {
        capturedMessages.push([...messages]);
        const output = outputs[index];
        index += 1;
        return output;
      },
    }),
  } as unknown as BaseChatModel;
};
```

Use:

```ts
const runtimeSchema = z.object({
  args: z.object({ content: z.string().trim().min(1) }),
});
```

Call:

```ts
const result = await invokeStructured({
  maxSchemaRetries: 1,
  messages: testMessages,
  modelConfig: makeConfig(),
  modelFactory: factory,
  schema: runtimeSchema,
  schemaName: "RepairOutput",
  schemaRepairInstruction: (issues) =>
    `Repair only: ${issues.map(({ path }) => path.join(".")).join(",")}`,
});
```

Assert:

```ts
assert.equal(result.ok, true);
assert.equal(callCount.value, 2);
assert.equal(capturedMessages[0].length, testMessages.length);
assert.equal(capturedMessages[1].length, testMessages.length + 1);
assert.match(lastMessageText(capturedMessages[1]), /args\.content/u);
assert.doesNotMatch(lastMessageText(capturedMessages[1]), /RAW_SENTINEL/u);
```

Make the invalid fake result contain `RAW_SENTINEL` as its field value. The
repair callback receives only issue paths, so the sentinel must be absent from
the second attempt's messages.

- [ ] **Step 2: Write failing bounds and callback-failure tests**

Add tests proving:

- `maxSchemaRetries: 0` makes exactly one Provider attempt and never invokes the
  callback;
- two invalid responses with `maxSchemaRetries: 1` make exactly two attempts and
  return `STRUCTURED_OUTPUT_RETRY_EXHAUSTED`;
- a callback that throws is swallowed and the retry proceeds with the original
  messages only;
- the Provider attempt observer receives attempts `1` and `2`, with attempt `1`
  reported as `provider_protocol` and `retryScheduled: true`.

- [ ] **Step 3: Run the focused test and verify RED**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test tests/agent/llm/invoke-structured.test.ts
```

Expected: FAIL because `schemaRepairInstruction` is not a supported option and
the second attempt receives no repair message.

- [ ] **Step 4: Write a failing DeepSeek prompt-JSON repair test**

In `tests/agent/llm/invoke-structured-envelope.test.ts`, use the existing
synthetic-fetch helper with two DeepSeek-compatible envelopes:

1. a complete `save_memory` Orchestrator object missing `args.content`;
2. a complete `save_memory` Orchestrator object with non-empty
   `args.content`.

Import the actual Task 1 runtime schema:

```ts
import {
  orchestratorOutputWithTaskArgsSchema,
} from "../../../src/lib/agent/orchestration/orchestrator-task-args-contract";
```

Capture both HTTP request bodies. Invoke `invokeStructured()` with:

```ts
maxSchemaRetries: 1,
modelConfig: makeConfig(),
modelSchema: orchestratorOutputBaseSchema,
schema: orchestratorOutputWithTaskArgsSchema,
schemaName: "OrchestratorOutput",
schemaRepairInstruction: (issues) =>
  `Repair only: ${issues.map(({ path }) => path.join(".")).join(",")}`,
```

Assert two Provider requests were made, both retain
`response_format.type === "json_object"`, and only the second request contains
the bounded `args.content` repair instruction. Place `RAW_SENTINEL` in the
first response value and assert it does not appear in the second request body.

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/llm/invoke-structured-envelope.test.ts
```

Expected: FAIL because prompt-JSON retries currently reuse the original
messages without repair guidance.

- [ ] **Step 5: Implement opt-in repair messages**

In `invoke-structured.ts`:

1. add the optional callback to `InvokeStructuredOptions`;
2. destructure it from options;
3. keep:

```ts
let schemaRepairMessage: string | null = null;
```

4. at the start of each schema attempt build:

```ts
const attemptMessages = schemaRepairMessage
  ? [...lcMessages, new SystemMessage(schemaRepairMessage)]
  : lcMessages;
```

5. pass `attemptMessages` to both `jsonModel.invoke()` and
   `structuredRunnable.invoke()`;
6. before `continue` on a retryable Zod/protocol schema failure, call a helper:

```ts
const scheduleRepairMessage = (
  issues: StructuredOutputDiagnostics["issues"],
): void => {
  if (!schemaRepairInstruction) return;
  try {
    const candidate = schemaRepairInstruction(issues)?.trim() ?? "";
    schemaRepairMessage = candidate.length > 0 ? candidate : null;
  } catch {
    schemaRepairMessage = null;
  }
};
```

Never pass the error object, raw result, parsed object, or raw Provider content
to the callback.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 3 and Step 4 commands.

Expected: all `invokeStructured` tests pass and the sentinel never appears in a
repair message.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  src/lib/agent/llm/invoke-structured.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/invoke-structured-envelope.test.ts
git diff --cached --check
git commit -m "fix(agent): add bounded structured repair guidance"
```

---

### Task 3: Orchestrator Repair Wiring and Gate Diagnostics

**Files:**
- Modify:
  `src/lib/agent/orchestration/orchestrator-task-args-contract.ts`
- Modify:
  `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify:
  `src/lib/agent/orchestration/l3b-evaluation-config.ts`
- Modify:
  `src/lib/agent/orchestration/l3b-production-gate.ts`
- Modify:
  `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Modify:
  `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Adds:

```ts
export const buildOrchestratorTaskArgsRepairInstruction: (
  issues: StructuredOutputDiagnostics["issues"],
) => null | string;
```

- Adds to `ProductionGateProviderMetrics`:

```ts
schemaRepairAttempts: number;
```

- [ ] **Step 1: Write failing repair-instruction tests**

In the task-args contract test, call:

```ts
buildOrchestratorTaskArgsRepairInstruction([{
  code: "custom",
  missing: true,
  path: ["tasks", 0, "args", "content"],
}]);
```

Assert it returns a complete-JSON repair instruction containing only:

- the protocol marker;
- `tasks.0.args.content`;
- the requirement for a non-empty string;
- the instruction to return the complete JSON object.

Assert it contains none of:

```text
RAW_SENTINEL
workspace
reasoning
execute
receipt
rollback
```

For an empty issue list or a path outside the allowlist, assert it returns a
generic value-free schema instruction or `null`; choose the generic
value-free instruction and lock it in the test.

- [ ] **Step 2: Write failing Orchestrator retry tests**

In `langchain-orchestrator.test.ts`, inject sequential fake responses:

1. `save_memory` with `args: { title: "复盘偏好" }`;
2. `save_memory` with
   `args: { content: "每周五复盘", title: "复盘偏好" }`.

Invoke with:

```ts
structuredRetryBudget: { schema: 1, transport: 0 }
```

Assert:

```ts
assert.equal(result.status, "success");
assert.equal(result.plan.tasks[0]?.intent, "save_memory");
assert.equal(result.plan.tasks[0]?.args.content, "每周五复盘");
assert.equal(providerAttempts, 2);
assert.equal(logicalCalls, 1);
```

Capture the second attempt's messages and assert they contain the bounded path
but not the first response's title or any raw JSON.

Add a two-invalid-response test that returns typed `schema_failure`, with no
Legacy fallback and no successful plan.

- [ ] **Step 3: Write failing evaluation-config tests**

In `tests/agent/orchestration/l3b-evaluation.test.ts`, update the existing
configuration/fingerprint test with:

```ts
assert.equal(L3B_EVALUATION_CONFIG.schemaRetries, 1);
assert.equal(
  L3B_EVALUATION_CONFIG_VERSION,
  "l3b-save-memory-args-repair-v1",
);
assert.equal(
  L3B_PROMPT_PROTOCOL_VERSION,
  "l3b-save-memory-args-contract-v1",
);
```

Assert the new hash is deterministic and differs from
`4d50c829aa5dc290acfdbed050a8be36359a83ff7c299b8da9754e657a651405`.
Do not hard-code the new hash until it is produced by the final implementation.

- [ ] **Step 4: Write failing Gate diagnostic tests**

In `l3b-production-gate-metrics.test.ts`, construct one sanitized event:

```ts
{
  attempt: 1,
  failureReason: "provider_protocol",
  phase: "failed",
  retryScheduled: true,
  role: "full_orchestrator",
  schemaIssues: [{
    code: "custom",
    missing: true,
    path: ["tasks", 0, "args", "content"],
  }],
  // existing safeProtocol/token fields from the local helper
}
```

Assert:

```ts
assert.equal(metrics.provider.schemaRepairAttempts, 1);
```

Provide two completed responses with one strict-schema pass and assert:

```ts
assert.equal(metrics.provider.strictSchema.rendered, "1/2");
```

This proves final business recovery cannot erase the first strict-schema
violation.

- [ ] **Step 5: Run focused tests and verify RED**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/orchestrator-task-args-contract.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts
```

Expected: FAIL because repair guidance, retry wiring, configuration version,
and `schemaRepairAttempts` do not exist.

- [ ] **Step 6: Implement bounded Orchestrator repair guidance**

In `orchestrator-task-args-contract.ts`, import
`StructuredOutputDiagnostics` as a type and implement:

```ts
const isSaveMemoryContentPath = (
  path: readonly (number | string)[],
): path is readonly ["tasks", number, "args", "content"] =>
  path.length === 4
  && path[0] === "tasks"
  && typeof path[1] === "number"
  && path[2] === "args"
  && path[3]
    === SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT
      .requiredNonEmptyStringFields[0];

export const buildOrchestratorTaskArgsRepairInstruction = (
  issues: StructuredOutputDiagnostics["issues"],
): string => {
  const paths = issues
    .map(({ path }) => path)
    .filter(isSaveMemoryContentPath)
    .map((path) => path.join("."));
  const uniquePaths = [...new Set(paths)];
  const detail = uniquePaths.length > 0
    ? `Required non-empty string fields: ${uniquePaths.join(", ")}.`
    : "The previous object violated the Structured Output schema.";
  return [
    "[orchestrator-task-args-repair:v1]",
    detail,
    "Return the complete Orchestrator JSON object again.",
    "Do not add Markdown, explanation, reasoning, execute, receipt, or rollback.",
  ].join("\n");
};
```

The function must not accept any other input.

- [ ] **Step 7: Wire repair and update evaluation identity**

In `langchain-orchestrator.ts`, pass:

```ts
schemaRepairInstruction: buildOrchestratorTaskArgsRepairInstruction,
```

In `l3b-evaluation-config.ts`, set:

```ts
export const L3B_EVALUATION_CONFIG_VERSION =
  "l3b-save-memory-args-repair-v1";
export const L3B_PROMPT_PROTOCOL_VERSION =
  "l3b-save-memory-args-contract-v1";
// ...
schemaRetries: 1,
```

Do not change the remaining configuration values.

- [ ] **Step 8: Implement non-exempting Gate diagnostics**

In `l3b-production-gate.ts`, add
`schemaRepairAttempts` to `ProductionGateProviderMetrics` and calculate it from
`input.providerEvents`:

```ts
schemaRepairAttempts: input.providerEvents.filter((event) =>
  event.phase === "failed"
  && event.failureReason === "provider_protocol"
  && event.retryScheduled === true
).length,
```

Do not add this diagnostic to a threshold exemption. Do not change
`strictSchema`, `semanticValidity`, `transportAvailability`, or any
zero-tolerance calculation.

- [ ] **Step 9: Update the deterministic test map**

Add a protected row to `tests/TEST_MAP.md` listing:

- `orchestrator-task-args-contract.test.ts`;
- `invoke-structured.test.ts`;
- `langchain-orchestrator.test.ts`;
- `l3b-production-gate-evaluation.test.ts`;
- `l3b-production-gate-metrics.test.ts`.

The row must state that missing memory content cannot reach business paths,
one retry remains one logical call and multiple Provider attempts, and the
first violation remains visible in strict-schema metrics.

- [ ] **Step 10: Run focused tests and verify GREEN**

Run the Step 5 command plus:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test tests/agent/llm/invoke-structured.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 11: Commit Task 3**

```bash
git add \
  src/lib/agent/orchestration/orchestrator-task-args-contract.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-evaluation-config.ts \
  src/lib/agent/orchestration/l3b-production-gate.ts \
  tests/agent/orchestration/orchestrator-task-args-contract.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "fix(agent): repair invalid save memory arguments"
```

---

### Task 4: Deterministic Closure and New Live-Gate Preflight

**Files:**
- Verify only. Modify only Task 1–3 scoped files if a deterministic regression
  exposes a direct contract defect.

**Interfaces:**
- Consumes all Task 1–3 commits.
- Produces a clean implementation HEAD, new evaluation config hash, archived
  old reports, and zero-network readiness evidence.

- [ ] **Step 1: Run focused contract suites**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/orchestrator-task-args-contract.test.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/invoke-structured-envelope.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-write-contract-parity.test.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: all focused tests pass with no network or database.

- [ ] **Step 2: Run TypeScript and Agent baselines**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
```

Expected: every command exits zero.

- [ ] **Step 3: Run lint and whitespace checks**

```bash
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Expected: zero errors. Existing repository warnings may remain.

- [ ] **Step 4: Verify file boundaries and default Runtime**

```bash
git diff --name-only a04a9a08674f54dedadc10a1f69326b49689905c..HEAD
git diff -- src/lib/agent/orchestration/runtime-config.ts
git status --short --branch
```

Expected: only the files listed in Tasks 1–3 plus this implementation plan
appear. `runtime-config.ts` has no diff and the worktree is clean.

- [ ] **Step 5: Archive old fixed-path reports without reading them**

Guard every move:

```bash
test -e /tmp/l3b-r8-production-acceptance.json
test ! -e /tmp/l3b-r8-production-acceptance-be1cb76d880f843a.json
mv \
  /tmp/l3b-r8-production-acceptance.json \
  /tmp/l3b-r8-production-acceptance-be1cb76d880f843a.json
chmod 600 /tmp/l3b-r8-production-acceptance-be1cb76d880f843a.json

test -e /tmp/l3b-r8-production-stability.json
test ! -e /tmp/l3b-r8-production-stability-be1cb76d880f843a.json
mv \
  /tmp/l3b-r8-production-stability.json \
  /tmp/l3b-r8-production-stability-be1cb76d880f843a.json
chmod 600 /tmp/l3b-r8-production-stability-be1cb76d880f843a.json
```

If an archive target already exists, stop instead of overwriting or deleting
anything.

- [ ] **Step 6: Capture the new config hash**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-preflight-only-secret-2026 \
AGENT_DISABLE_LLM=1 \
node --import tsx -e \
  'import { L3B_EVALUATION_CONFIG_HASH } from "./src/lib/agent/orchestration/l3b-evaluation-config.ts"; console.log(L3B_EVALUATION_CONFIG_HASH);'
```

Record the exact hash in the Task 4 verification report. Do not hard-code an
unverified value into source or documentation.

- [ ] **Step 7: Run no-network Acceptance preflight**

```bash
IMPLEMENTATION_HEAD="$(git rev-parse HEAD)"
CONFIG_HASH="$(
  PAYLOAD_SECRET=sunnypanel-agent-preflight-only-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx -e \
    'import { L3B_EVALUATION_CONFIG_HASH } from "./src/lib/agent/orchestration/l3b-evaluation-config.ts"; process.stdout.write(L3B_EVALUATION_CONFIG_HASH);'
)"

env \
  -u DATABASE_URL \
  -u AGENT_DISABLE_LLM \
  AGENT_PRODUCTION_SEAM_EVAL=1 \
  AGENT_LIVE_LLM_EVAL=1 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_STAGE=acceptance \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$IMPLEMENTATION_HEAD" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH="$CONFIG_HASH" \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  PAYLOAD_SECRET=sunnypanel-agent-preflight-only-secret-2026 \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs
```

Expected:

- status `ready`;
- 33 observations;
- the exact new implementation HEAD and config hash;
- retry limits report `fullSchemaRetries: 1`;
- actual Provider attempts `0`;
- no Keychain, Provider, database, execution, or persistence access;
- no fixed-path report is written.

- [ ] **Step 8: Stop for new live disclosure approval**

Report:

- implementation commits and clean HEAD;
- RED/GREEN evidence;
- focused and full deterministic results;
- unchanged default Runtime;
- the new config hash and preflight budgets;
- actual Provider attempts `0`;
- archived old Acceptance and Stability evidence paths;
- the exact data disclosed by a future focused `wrt-3` run.

Do not run DeepSeek. A separately approved focused run must be bound to the new
HEAD, config hash, fixture count, logical-call limit, and Provider-attempt
limit. Do not run Acceptance 33 or Stability 99 until their preceding Gates
pass.
