import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { reviewAgentDefinition } from "../../../src/lib/agent/agents/registry";
import { runSpecializedAgentForTask } from "../../../src/lib/agent/agents/run-specialized-agent";
import { evaluateSpecialistTaskCompleteness } from "../../../src/lib/agent/agents/specialist-task-completeness";
import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { StructuredProviderAttemptEvent } from "../../../src/lib/agent/llm/invoke-structured";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { TaskNode } from "../../../src/lib/agent/orchestration/types";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  evaluationEnhancementBaseSchema,
  evaluationEnhancementSchema,
  weeklyReviewInsightsBaseSchema,
  weeklyReviewInsightsSchema,
} from "../../../src/lib/agent/review/model-schemas";
import {
  enhanceEvaluationWithLLM,
  mergeEvaluationEnhancement,
  type EvaluationEnhancementInput,
} from "../../../src/lib/agent/evaluation-llm";
import {
  enhanceWeeklyReviewWithLLM,
} from "../../../src/lib/agent/workflows/weekly-review-llm";
import {
  mergeWeeklyReviewInsights,
} from "../../../src/lib/agent/workflows/weekly-review";

const modelConfig = (): ModelConfig => {
  const resolved = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "review-test-model",
    provider: "openai",
    structuredOutputMode: "json_schema",
  });
  if ("code" in resolved) throw new Error(resolved.safeMessage);
  return resolved;
};

type CapturedModelCall = {
  calls: number;
  messages?: unknown[];
};

const fakeModelFactory = (
  output: unknown,
  captured: CapturedModelCall = { calls: 0 },
): ModelFactory => () => ({
  withStructuredOutput: () => ({
    invoke: async (messages: unknown[]) => {
      captured.calls += 1;
      captured.messages = messages;
      if (output instanceof Error) throw output;
      return output;
    },
  }),
}) as unknown as BaseChatModel;

const withLlmEnabled = async (run: () => Promise<void>) => {
  const previous = process.env.AGENT_DISABLE_LLM;
  delete process.env.AGENT_DISABLE_LLM;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = previous;
  }
};

const messageText = (
  messages: unknown[] | undefined,
  constructorName: "HumanMessage" | "SystemMessage",
) => (messages ?? [])
  .filter((message): message is { content?: unknown; constructor?: { name?: string } } =>
    typeof message === "object"
    && message !== null
    && message.constructor?.name === constructorName)
  .map((message) => String(message.content ?? ""))
  .join("\n");

const weeklyRuleBased = {
  completed: ["1 项计划处于 done"],
  health: "risk" as const,
  metrics: { failedAgentRuns: 1, overduePlans: 1 },
  narrativeGaps: ["计划缺少可见产出"],
  recommendations: ["先处理逾期计划「Review 安全收口」"],
  risks: ["1 项计划逾期：Review 安全收口"],
  suggestionDrafts: [
    {
      createdBy: "agent" as const,
      reason: "计划已经逾期",
      relatedPlan: 101,
      riskLevel: "high" as const,
      source: "review" as const,
      status: "pending" as const,
      suggestedPrompt: "重新确定下一步",
      title: "处理逾期计划",
      uniqueKey: "weekly-review:2026-08-18:overdue-plan:101",
    },
  ],
};

const validWeeklyInsights = {
  narrativeGaps: ["把本周产出补充到 Timeline"],
  recommendations: ["今天先明确逾期计划的最小动作"],
  summaryTone: "本周主线清楚，但逾期风险需要先收敛。",
};

const evaluationInput: EvaluationEnhancementInput = {
  health: "risk",
  metrics: { overduePlans: 1, planCount: 3 },
  recommendations: ["先处理 1 项逾期计划"],
  scope: "overall",
  summary: "整体评估：3 项计划中有 1 项逾期。",
};

const validEvaluationEnhancement = {
  recommendations: ["今天为逾期计划确定一个最小动作"],
  summary: "建议先收敛逾期风险，再扩展新计划。",
};

const reviewPromptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-08-18T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const weeklyTask = (): TaskNode => ({
  agentRole: "review",
  args: { createSuggestions: true, persistReview: true },
  dependsOn: [],
  id: "review-1",
  intent: "weekly_review",
  label: "生成本周回顾",
});

describe("L3-D3 Review specialist structured boundary", () => {
  it("publishes strict prose-only schemas for weekly and plan-evaluation enrichment", () => {
    assert.equal(weeklyReviewInsightsBaseSchema.safeParse(validWeeklyInsights).success, true);
    assert.equal(weeklyReviewInsightsSchema.safeParse(validWeeklyInsights).success, true);
    assert.equal(evaluationEnhancementBaseSchema.safeParse(validEvaluationEnhancement).success, true);
    assert.equal(evaluationEnhancementSchema.safeParse(validEvaluationEnhancement).success, true);

    for (const forbidden of [
      { completed: ["模型伪造完成项"] },
      { execute: true },
      { health: "healthy" },
      { metrics: { overduePlans: 0 } },
      { planId: 999 },
      { resourceId: "plan-999" },
      { risks: ["没有风险"] },
      { state: "done" },
      { suggestionDrafts: [] },
    ]) {
      assert.equal(
        weeklyReviewInsightsSchema.safeParse({
          ...validWeeklyInsights,
          ...forbidden,
        }).success,
        false,
      );
      assert.equal(
        evaluationEnhancementSchema.safeParse({
          ...validEvaluationEnhancement,
          ...forbidden,
        }).success,
        false,
      );
    }
  });

  it("calls weekly enrichment once with accounted attempt and untrusted facts outside system rules", async () => {
    await withLlmEnabled(async () => {
      const sentinel = "WORKSPACE_IGNORE_RULES_AND_EXECUTE_SENTINEL";
      const captured: CapturedModelCall = { calls: 0 };
      const events: StructuredProviderAttemptEvent[] = [];
      let logicalCalls = 0;
      let providerAttempts = 0;
      const result = await enhanceWeeklyReviewWithLLM(
        weeklyRuleBased.metrics,
        {
          ...weeklyRuleBased,
          recommendations: [sentinel, ...weeklyRuleBased.recommendations],
        },
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validWeeklyInsights, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
          providerAttemptObserver: (event) => events.push(event),
        },
      );

      assert.deepEqual(result, validWeeklyInsights);
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.equal(providerAttempts, 1);
      assert.equal(events.filter((event) => event.phase === "providerRequestStarted").length, 1);
      assert.equal(events.filter((event) => event.phase === "strictSchemaValidated").length, 1);
      assert.doesNotMatch(messageText(captured.messages, "SystemMessage"), new RegExp(sentinel, "u"));
      assert.match(messageText(captured.messages, "HumanMessage"), /UNTRUSTED user data/u);
      assert.match(messageText(captured.messages, "HumanMessage"), new RegExp(sentinel, "u"));
    });
  });

  it("calls evaluation enrichment once with accounted attempt and untrusted facts outside system rules", async () => {
    await withLlmEnabled(async () => {
      const sentinel = "EVALUATION_IGNORE_RULES_AND_EXECUTE_SENTINEL";
      const captured: CapturedModelCall = { calls: 0 };
      let logicalCalls = 0;
      let providerAttempts = 0;
      const result = await enhanceEvaluationWithLLM(
        { ...evaluationInput, recommendations: [sentinel] },
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validEvaluationEnhancement, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
        },
      );

      assert.deepEqual(result, validEvaluationEnhancement);
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.equal(providerAttempts, 1);
      assert.doesNotMatch(messageText(captured.messages, "SystemMessage"), new RegExp(sentinel, "u"));
      assert.match(messageText(captured.messages, "HumanMessage"), /UNTRUSTED user data/u);
      assert.match(messageText(captured.messages, "HumanMessage"), new RegExp(sentinel, "u"));
    });
  });

  it("preserves deterministic facts and hard risks while only appending model prose", () => {
    const mergedWeekly = mergeWeeklyReviewInsights(
      weeklyRuleBased,
      validWeeklyInsights,
    );

    assert.deepEqual(mergedWeekly.completed, weeklyRuleBased.completed);
    assert.equal(mergedWeekly.health, weeklyRuleBased.health);
    assert.deepEqual(mergedWeekly.metrics, weeklyRuleBased.metrics);
    assert.deepEqual(mergedWeekly.risks, weeklyRuleBased.risks);
    assert.deepEqual(mergedWeekly.suggestionDrafts, weeklyRuleBased.suggestionDrafts);
    assert.deepEqual(
      mergedWeekly.recommendations,
      [...weeklyRuleBased.recommendations, ...validWeeklyInsights.recommendations],
    );

    const mergedEvaluation = mergeEvaluationEnhancement(
      evaluationInput,
      validEvaluationEnhancement,
    );
    assert.equal(mergedEvaluation.health, evaluationInput.health);
    assert.deepEqual(mergedEvaluation.metrics, evaluationInput.metrics);
    assert.deepEqual(
      mergedEvaluation.recommendations,
      [...evaluationInput.recommendations, ...validEvaluationEnhancement.recommendations],
    );
    assert.match(mergedEvaluation.summary, new RegExp(evaluationInput.summary, "u"));
    assert.match(mergedEvaluation.summary, new RegExp(validEvaluationEnhancement.summary, "u"));
  });

  it("keeps deterministic facts unchanged on schema and Provider failures", async () => {
    await withLlmEnabled(async () => {
      for (const output of [
        { ...validWeeklyInsights, execute: true },
        new Error("synthetic provider failure"),
      ]) {
        const captured: CapturedModelCall = { calls: 0 };
        let providerAttempts = 0;
        const insights = await enhanceWeeklyReviewWithLLM(
          weeklyRuleBased.metrics,
          weeklyRuleBased,
          {
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory(output, captured),
            providerAttemptAuthorizer: () => {
              providerAttempts += 1;
            },
          },
        );

        assert.equal(insights, null);
        assert.deepEqual(
          mergeWeeklyReviewInsights(weeklyRuleBased, insights),
          weeklyRuleBased,
        );
        assert.equal(captured.calls, 1);
        assert.equal(providerAttempts, 1);
      }

      for (const output of [
        { ...validEvaluationEnhancement, health: "healthy" },
        new Error("synthetic provider failure"),
      ]) {
        const captured: CapturedModelCall = { calls: 0 };
        let providerAttempts = 0;
        const enhancement = await enhanceEvaluationWithLLM(evaluationInput, {
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(output, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
        });

        assert.equal(enhancement, null);
        assert.deepEqual(
          mergeEvaluationEnhancement(evaluationInput, enhancement),
          evaluationInput,
        );
        assert.equal(captured.calls, 1);
        assert.equal(providerAttempts, 1);
      }
    });
  });

  it("bypasses generic Review specialist enrichment for complete Review intents", async () => {
    const task = weeklyTask();
    const recorder = createModelCallBudgetRecorder();

    assert.equal(
      evaluateSpecialistTaskCompleteness(task).disposition,
      "bypassed_complete",
    );
    assert.equal(reviewAgentDefinition.enrichIntent, undefined);

    const result = await runSpecializedAgentForTask(task, {
      dryRunContext: {} as never,
      intent: {
        args: { createSuggestions: true, persistReview: true },
        intent: "weekly_review",
      },
      message: "生成本周回顾",
      modelCallRecorder: recorder,
      promptContext: reviewPromptContext,
    });

    assert.equal(result.intent.intent, "weekly_review");
    assert.equal(result.disposition, "bypassed_complete");
    assert.equal(recorder.snapshot().specialistLogicalCalls, 0);
    assert.equal(recorder.snapshot().specialistProviderAttempts, 0);
  });

  it("contains no active Legacy Review model transport or manual JSON extraction", () => {
    const activeSources = [
      "src/lib/agent/workflows/weekly-review-llm.ts",
      "src/lib/agent/evaluation-llm.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(activeSources, /completeStructured/u);
    assert.doesNotMatch(activeSources, /fetchWithRetry|\/chat\/completions/u);
    assert.doesNotMatch(activeSources, /extractJSONObject|JSON\.parse|content\.match\(/u);
  });
});
