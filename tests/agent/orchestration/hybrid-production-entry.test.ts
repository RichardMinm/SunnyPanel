import assert from "node:assert/strict";
import { test } from "node:test";

import type { Payload } from "payload";

import {
  runOrchestrationStep,
  type OrchestrationStepParams,
} from "../../../src/lib/agent/chat-pipeline/orchestration-step";
import type { AgentChatResponse } from "../../../src/lib/agent/schemas";
import type { AgentThread } from "../../../src/payload-types";
import { residualWriteTask } from "./fixtures/hybrid-query-boundary-contract";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const withEnv = async <T>(
  name: string,
  value: string,
  run: () => Promise<T>,
): Promise<T> => {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
};

test("production compound path validates the candidate before Mapper", async () => {
  let validatorCalls = 0;
  let mapperCalls = 0;
  const params: OrchestrationStepParams & Record<string, unknown> = {
    context: {
      checklists: [],
      now: "2026-07-17T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{
        id: 101,
        priority: "medium",
        state: "active",
        title: "考研数学复习计划",
      }],
    },
    deferCompoundExecution: true,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    mapStructuredOutputToPlanFn: () => {
      mapperCalls += 1;
      throw new Error("Mapper must not run after candidate rejection");
    },
    message: "检查项目进度，记录未完成的作为新任务",
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
    pushTrace: () => undefined,
    runResidualPlannerFn: async () => ({
      logicalCalls: 1,
      providerAttempts: 1,
      status: "success" as const,
      tasks: [residualWriteTask()],
    }),
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
    validateHybridCandidateFn: () => {
      validatorCalls += 1;
      return {
        code: "invalid_fixed_task_provenance" as const,
        status: "rejected" as const,
      };
    },
  };

  const result = await withEnv(
    "AGENT_ORCHESTRATOR_RUNTIME",
    "langchain",
    () => runOrchestrationStep(params),
  );

  assert.equal(validatorCalls, 1);
  assert.equal(mapperCalls, 0);
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
  }
});
