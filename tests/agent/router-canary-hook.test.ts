import assert from "node:assert/strict";
import { describe, it } from "node:test";


import { runOrchestrationStep } from "../../src/lib/agent/chat-pipeline/orchestration-step";
import type { RouterCanaryDecision } from "../../src/lib/agent/router/router-canary";
import type { AgentChatResponse, AgentIntent } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const primaryAnswer: AgentIntent = {
  args: { answer: "Primary answer", learningContext: null, suggestAction: null },
  confidence: 0.9,
  intent: "answer_question",
  reply: "Primary answer",
};

const orchestratorPrimary: AgentIntent = { ...primaryAnswer, reply: undefined };

const orchestrationPlan = {
  mode: "single" as const,
  reasoning: "Primary classification",
  source: "llm" as const,
  tasks: [{
    agentRole: "query" as const,
    args: primaryAnswer.args,
    dependsOn: [],
    id: "primary-task",
    intent: primaryAnswer.intent,
    label: "Answer",
  }],
};

const baseParams = {
  context: {
    checklists: [],
    memories: [],
    now: "2026-07-11T12:00:00+08:00",
    pendingAction: null,
    plans: [],
  },
  emitStatus: () => undefined,
  emitToken: () => undefined,
  message: "解释线性代数",
  pendingAction: null,
  persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
  pushTrace: () => undefined,
  runOrchestratorFn: async () => orchestrationPlan,
  tokenUsage,
  trace: [],
  user: { id: 1 },
};

describe("Router Canary production hook", () => {
  it("runs after Primary and adopts only the decision returned by the Canary gate", async () => {
    let calls = 0;
    const adopted: AgentIntent = { ...orchestratorPrimary, confidence: 0.92 };

    const result = await runOrchestrationStep({
      ...baseParams,
      resolveRouterCanaryRoutingFn: async (input): Promise<RouterCanaryDecision> => {
        calls += 1;
        assert.deepEqual(input.primary, orchestratorPrimary);
        return { adopted: true, decision: adopted, latencyMs: 5, reason: "adopted_read" };
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.outcome, "continue");
    if (result.outcome !== "continue") return;
    assert.strictEqual(result.data.preResolvedIntent, adopted);
  });

  it("keeps the exact Primary decision when Canary falls back or throws", async () => {
    let fallbackPrimary: AgentIntent | null = null;
    const fallback = await runOrchestrationStep({
      ...baseParams,
      resolveRouterCanaryRoutingFn: async (input) => {
        fallbackPrimary = input.primary;
        return {
          adopted: false,
          decision: input.primary,
          latencyMs: 8_000,
          reason: "timeout",
        };
      },
    });
    assert.equal(fallback.outcome, "continue");
    if (fallback.outcome === "continue") {
      assert.strictEqual(fallback.data.preResolvedIntent, fallbackPrimary);
    }

    const failed = await runOrchestrationStep({
      ...baseParams,
      resolveRouterCanaryRoutingFn: async () => { throw new Error("canary failed"); },
    });
    assert.equal(failed.outcome, "continue");
    if (failed.outcome === "continue") {
      assert.deepEqual(failed.data.preResolvedIntent, orchestratorPrimary);
    }
  });

  it("does not receive execution, receipt, rollback, or database dependencies", async () => {
    const result = await runOrchestrationStep({
      ...baseParams,
      resolveRouterCanaryRoutingFn: async (input) => ({
        adopted: true,
        decision: { ...input.primary, confidence: 0.93 },
        latencyMs: 4,
        reason: "adopted_read",
      }),
    });

    assert.equal(result.outcome, "continue");
  });

  it("passes only IDs from the already-loaded workspace context", async () => {
    let resourceIds: readonly number[] | undefined;
    let resourceReferences: readonly { id: number; type: string }[] | undefined;
    await runOrchestrationStep({
      ...baseParams,
      context: {
        ...baseParams.context,
        checklists: [{ groups: [], id: 7, title: "清单" }],
        plans: [{ id: 42, priority: "medium", state: "active", title: "现有计划" }],
      },
      resolveRouterCanaryRoutingFn: async (input) => {
        resourceIds = input.context.resourceIds;
        resourceReferences = input.context.resourceReferences;
        return { adopted: false, decision: input.primary, latencyMs: 0, reason: "disabled" };
      },
    });
    assert.deepEqual(resourceIds, [42, 7]);
    assert.deepEqual(resourceReferences, [
      { id: 42, type: "plan" },
      { id: 7, type: "checklist" },
    ]);
  });

  it("runs Canary for a real conversational preflight without invoking the orchestrator", async () => {
    let canaryCalls = 0;
    let orchestratorCalls = 0;
    const result = await runOrchestrationStep({
      ...baseParams,
      conversationState: {
        lastAnswerDepth: "brief",
        lastAssistantAnswerSummary: "解释了 CTF",
        lastMentionedEntities: ["CTF"],
        lastTopic: "CTF",
        lastUserIntent: "explain_concept",
        updatedAt: "2026-07-11T12:00:00+08:00",
      },
      message: "我需要更加详细的信息",
      resolvedHistory: [
        { content: "什么是 CTF？", role: "user" },
        { content: "CTF 是信息安全竞赛。", role: "assistant" },
      ],
      resolveRouterCanaryRoutingFn: async (input) => {
        canaryCalls += 1;
        return { adopted: true, decision: { ...input.primary, confidence: 0.91 }, latencyMs: 1, reason: "adopted_read" };
      },
      runOrchestratorFn: async () => {
        orchestratorCalls += 1;
        return orchestrationPlan;
      },
    });
    assert.equal(result.outcome, "continue");
    assert.equal(canaryCalls, 1);
    assert.equal(orchestratorCalls, 0);
  });
});
