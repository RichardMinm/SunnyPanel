import assert from "node:assert/strict";
import test from "node:test";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { ResidualPlannerModule } from "./fixtures/hybrid-query-boundary-contract";
import {
  residualInput,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import {
  ORCHESTRATOR_INTENT_FAMILY_PROTOCOL,
  RESIDUAL_INTENT_FAMILY_PROTOCOL,
} from "../../../src/lib/agent/orchestration/orchestrator-intent-family-protocol";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";

const loadResidualPlanner = (contract: string) => loadR4AGreenModule<ResidualPlannerModule>(
  R4A_GREEN_MODULES.residual,
  contract,
);

const residualEnvelope = (intent: string): unknown => ({
  routingSummary: "整理查询结果",
  tasks: [{
    agentRole: "plan",
    args: { title: "未完成任务" },
    dependsOn: [],
    id: "t1",
    intent,
    label: "整理未完成任务",
  }],
  version: 2,
});

const promptJsonModelFactory = (
  invoke: () => unknown | Promise<unknown>,
): ModelFactory => () => ({
  withConfig: () => ({
    invoke: async () => ({ content: JSON.stringify(await invoke()) }),
  }),
}) as unknown as BaseChatModel;

const fakeDeepSeekConfig = {
  apiKey: "test-only",
  baseURL: "https://example.invalid",
  maxRetries: 0,
  model: "fake",
  provider: "deepseek",
  structuredOutputMode: "provider_default",
  temperature: 0,
  timeoutMs: 100,
} as const;

test("ResidualPlanningInput preserves the complete original request and has no remainingRequest", async () => {
  const { buildResidualPlanningInput } = await loadResidualPlanner("residual_full_original_request");
  const originalRequest = "检查项目进度，记录未完成的作为新任务";
  const input = buildResidualPlanningInput(residualInput(originalRequest));
  assert.equal(input.originalRequest, originalRequest);
  assert.equal("remainingRequest" in input, false);
  assert.deepEqual(input.fixedTasks, [{
    family: "query",
    intent: "query_progress",
    taskId: "query-original",
  }]);
});

test("a satisfied fixed Query family is also forbidden to the Residual Planner", async () => {
  const { buildResidualPlanningInput } = await loadResidualPlanner("residual_query_family_forbidden");
  const input = buildResidualPlanningInput(residualInput());
  assert.ok(input.satisfiedIntentFamilies.includes("query"));
  assert.ok(input.forbiddenIntentFamilies.includes("query"));
  assert.equal(input.allowedIntentFamilies.includes("query"), false);
});

test("a policy intent must remain in an allowed and unsatisfied family", async () => {
  const { buildResidualPlanningInput } = await loadResidualPlanner(
    "residual_policy_family_consistency",
  );
  const input = residualInput();
  assert.throws(() =>
    buildResidualPlanningInput({
      ...input,
      allowedIntentFamilies: [],
      forbiddenIntentFamilies: ["query", "write_candidate"],
    })
  );
  assert.throws(() =>
    buildResidualPlanningInput({
      ...input,
      satisfiedIntentFamilies: ["query", "write_candidate"],
    })
  );
});

test("Residual Prompt explicitly requests one JSON object for DeepSeek JSON mode", async () => {
  const { buildResidualPlannerSystemPrompt } = await loadResidualPlanner(
    "residual_deepseek_json_mode_prompt",
  );
  const prompt = buildResidualPlannerSystemPrompt(residualInput());

  assert.match(prompt, /只输出一个 JSON object/u);
});

test("Residual Prompt narrows its schema-derived intent enum to the current allowlist", async () => {
  const {
    buildResidualPlannerSchemas,
    buildResidualPlannerSystemPrompt,
    serializeResidualPlannerJsonSchema,
    serializeResidualPlannerPromptJsonSchema,
  } = await loadResidualPlanner("residual_allowlist_narrowed_schema_contract");
  const input = residualInput();
  const prompt = buildResidualPlannerSystemPrompt(input);
  const structuralSchema = JSON.parse(
    serializeResidualPlannerJsonSchema(input),
  ) as {
    additionalProperties?: unknown;
    properties?: {
      tasks?: {
        items?: {
          properties?: {
            agentRole?: { enum?: unknown[] };
            intent?: { enum?: unknown[] };
          };
          required?: unknown;
        };
      };
    };
  };
  const serializedPromptSchema =
    serializeResidualPlannerPromptJsonSchema(input);
  const promptSchema = JSON.parse(
    serializedPromptSchema,
  ) as typeof structuralSchema;
  const promptIntentEnum =
    promptSchema.properties?.tasks?.items?.properties?.intent?.enum;
  const structuralIntentEnum =
    structuralSchema.properties?.tasks?.items?.properties?.intent?.enum;
  const renderedAllowlist = prompt.match(
    /intent 必须来自当前合同允许列表：([^\n]+)。/u,
  )?.[1]?.split(", ");

  assert.ok(prompt.includes(serializedPromptSchema));
  assert.equal(serializedPromptSchema, serializeResidualPlannerJsonSchema(input));
  assert.equal(promptSchema.additionalProperties, false);
  assert.deepEqual(
    promptSchema.properties?.tasks?.items?.properties?.agentRole?.enum,
    ["content", "memory", "plan", "query", "review", "schedule"],
  );
  assert.deepEqual(
    promptSchema.properties?.tasks?.items?.required,
    ["id", "label", "intent", "args", "dependsOn", "agentRole"],
  );
  assert.deepEqual(promptIntentEnum, renderedAllowlist);
  assert.deepEqual(promptIntentEnum, ["compose_checklist"]);
  assert.ok(
    promptIntentEnum?.every((intent) =>
      structuralIntentEnum?.includes(intent)
    ),
  );

  const schemas = buildResidualPlannerSchemas(input);
  assert.equal(schemas.base.safeParse(residualEnvelope("compose_checklist")).success, true);
  assert.equal(schemas.strict.safeParse(residualEnvelope("compose_checklist")).success, true);
  for (const forbiddenIntent of [
    "answer_question",
    "save_memory",
    "query_progress",
    "clarify",
  ]) {
    assert.equal(
      schemas.base.safeParse(residualEnvelope(forbiddenIntent)).success,
      false,
      `${forbiddenIntent} must fail the model-facing schema`,
    );
    assert.equal(
      schemas.strict.safeParse(residualEnvelope(forbiddenIntent)).success,
      false,
      `${forbiddenIntent} must fail the strict schema`,
    );
  }
});

test("real structured invocation retries one request-invalid intent and accepts the second valid envelope", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_request_invalid_schema_retry",
  );
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    maxTransportRetries: 0,
    modelConfig: fakeDeepSeekConfig,
    modelFactory: promptJsonModelFactory(() => {
      calls += 1;
      return residualEnvelope(
        calls === 1 ? "answer_question" : "compose_checklist",
      );
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.logicalCalls, 1);
  assert.equal(result.providerAttempts, 2);
  assert.equal(calls, 2);
});

test("real structured Residual emits one passing semantic event", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_real_semantic_observation_pass",
  );
  const semanticEvents: boolean[] = [];
  const result = await runResidualPlanner({
    input: residualInput(),
    maxTransportRetries: 0,
    modelConfig: fakeDeepSeekConfig,
    modelFactory: promptJsonModelFactory(() =>
      residualEnvelope("compose_checklist")
    ),
    providerAttemptObserver: (event) => {
      if (event.phase === "semanticValidationCompleted") {
        semanticEvents.push(event.passed);
      }
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(semanticEvents, [true]);
});

test("real structured Residual emits one failing semantic event after strict schema", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_real_semantic_observation_fail",
  );
  const semanticEvents: boolean[] = [];
  const result = await runResidualPlanner({
    input: residualInput(),
    maxTransportRetries: 0,
    modelConfig: fakeDeepSeekConfig,
    modelFactory: promptJsonModelFactory(() => ({
      ...(residualEnvelope("compose_checklist") as Record<string, unknown>),
      tasks: [{
        ...(residualEnvelope("compose_checklist") as {
          tasks: Array<Record<string, unknown>>;
        }).tasks[0],
        dependsOn: ["t1"],
      }],
    })),
    providerAttemptObserver: (event) => {
      if (event.phase === "semanticValidationCompleted") {
        semanticEvents.push(event.passed);
      }
    },
  });

  assert.deepEqual(result, {
    code: "schema_failure",
    logicalCalls: 1,
    providerAttempts: 1,
    rejectionReason: "dag_invalid",
    status: "unavailable",
  });
  assert.deepEqual(semanticEvents, [false]);
});

test("repeated request-invalid intents exhaust schema retry without becoming forbidden_intent", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_request_invalid_schema_exhaustion",
  );
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    maxTransportRetries: 0,
    modelConfig: fakeDeepSeekConfig,
    modelFactory: promptJsonModelFactory(() => {
      calls += 1;
      return residualEnvelope("answer_question");
    }),
  });

  assert.deepEqual(result, {
    code: "schema_failure",
    logicalCalls: 1,
    providerAttempts: 2,
    status: "unavailable",
  });
  assert.equal(calls, 2);
});

test("Residual Prompt distinguishes task drafts from memory and forbids fixed-query bridge tasks", async () => {
  const { buildResidualPlannerSystemPrompt } = await loadResidualPlanner(
    "residual_task_draft_semantic_boundary",
  );
  const prompt = buildResidualPlannerSystemPrompt(residualInput());

  assert.equal(
    /save_memory.*长期记忆.*不得用于记录新任务/u.test(prompt),
    true,
    "task recording must not map to save_memory",
  );
  assert.equal(
    /新任务.*清单草案.*compose_checklist/u.test(prompt),
    true,
    "derived task drafts must map to compose_checklist",
  );
  assert.equal(
    /fixedTasks.*不得改写为 answer_question.*中间桥接 task/u.test(prompt),
    true,
    "fixed queries must not be rewritten as consultation bridges",
  );
  assert.equal(
    /Composer.*根任务.*fixed Query/u.test(prompt),
    true,
    "the deterministic Composer must own the fixed-query dependency",
  );
});

test("keeps the full live-gate protocol out of the Residual Prompt", async () => {
  const { buildResidualPlannerSystemPrompt } = await loadResidualPlanner(
    "residual_full_live_gate_protocol_excluded",
  );
  const prompt = buildResidualPlannerSystemPrompt(residualInput());

  assert.doesNotMatch(prompt, /\[orchestrator-boundary:live-gate\]/);
});

test("keeps semantic contrasts out of the Residual Prompt", async () => {
  const { buildResidualPlannerSystemPrompt } = await loadResidualPlanner(
    "residual_semantic_contrasts_excluded",
  );
  const prompt = buildResidualPlannerSystemPrompt(residualInput());

  assert.doesNotMatch(
    prompt,
    /\[orchestrator-boundary:semantic-contrasts\]/,
  );
});

test("Full and Residual planners render the same ordered intent-family rule body", () => {
  const ruleBody = (protocol: string): string =>
    protocol.split("\n").slice(1).join("\n");

  assert.equal(
    ruleBody(RESIDUAL_INTENT_FAMILY_PROTOCOL),
    ruleBody(ORCHESTRATOR_INTENT_FAMILY_PROTOCOL),
  );
});

test("the fake planner receives the full request and can retain the write intent", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_write_semantics_preserved");
  const input = residualInput();
  let calls = 0;
  const result = await runResidualPlanner({
    input,
    invoke: async (received) => {
      calls += 1;
      assert.equal(received.originalRequest, input.originalRequest);
      assert.ok(received.fixedTasks.some(({ intent }) => intent === "query_progress"));
      return [residualWriteTask()];
    },
  });
  assert.equal(result.status, "success");
  assert.equal(calls, 1);
  if (result.status !== "success") return;
  assert.deepEqual(result.tasks.map(({ intent }) => intent), ["compose_checklist"]);
  assert.equal(result.logicalCalls, 1);
});

test("injected Residual invokes never fabricate structured semantic events", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_injected_semantic_observation_absent",
  );
  const semanticEvents: boolean[] = [];
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => [residualWriteTask()],
    providerAttemptObserver: (event) => {
      if (event.phase === "semanticValidationCompleted") {
        semanticEvents.push(event.passed);
      }
    },
  });

  assert.equal(result.status, "success");
  assert.deepEqual(semanticEvents, []);
});

test("a consultation bridge from the fixed Query to a write fails closed without a second call", async () => {
  const { runResidualPlanner } = await loadResidualPlanner(
    "residual_consultation_bridge_terminal",
  );
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => {
      calls += 1;
      return [
        {
          agentRole: "content",
          args: {},
          dependsOn: [],
          id: "bridge-answer",
          intent: "answer_question",
          label: "重复解释查询结果",
        },
        {
          agentRole: "memory",
          args: { content: "未完成任务" },
          dependsOn: ["bridge-answer"],
          id: "incorrect-memory",
          intent: "save_memory",
          label: "错误记录为记忆",
        },
      ];
    },
  });

  assert.deepEqual(result, {
    code: "forbidden_intent",
    logicalCalls: 1,
    providerAttempts: 1,
    rejectionReason: "consultation_write_bridge",
    status: "unavailable",
  });
  assert.equal(calls, 1);
});

test("a residual Query intent makes the entire plan unavailable without a second call", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_forbidden_intent_terminal");
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => {
      calls += 1;
      return [{
        agentRole: "query",
        args: {},
        dependsOn: [],
        id: "provider-query",
        intent: "query_progress",
        label: "重复读取进度",
      }];
    },
  });
  assert.deepEqual(result, {
    code: "forbidden_intent",
    logicalCalls: 1,
    providerAttempts: 1,
    rejectionReason: "intent_not_in_policy",
    status: "unavailable",
  });
  assert.equal(calls, 1);
});

test("transport retry increments attempts but not residual logical calls", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_transport_retry_accounting");
  const recorder = createModelCallBudgetRecorder();
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => {
      calls += 1;
      if (calls === 1) throw new Error("synthetic transport failure");
      return [residualWriteTask()];
    },
    maxTransportRetries: 1,
    modelCallRecorder: recorder,
  });
  assert.equal(result.status, "success");
  assert.equal(result.logicalCalls, 1);
  assert.equal(result.providerAttempts, 2);
  assert.equal(calls, 2);
  assert.equal(recorder.snapshot().residualPlannerLogicalCalls, 1);
  assert.equal(recorder.snapshot().residualPlannerProviderAttempts, 2);
});

test("keeps query scope precedence out of the Residual Prompt", async () => {
  const { buildResidualPlannerSystemPrompt } = await loadResidualPlanner(
    "residual_query_scope_precedence_excluded",
  );
  const prompt = buildResidualPlannerSystemPrompt(residualInput());

  assert.doesNotMatch(
    prompt,
    /\[orchestrator-boundary:query-scope-precedence\]/,
  );
});
