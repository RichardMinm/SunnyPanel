import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { evaluatePlan } from "../../../src/lib/agent/evaluation";
import { createModelConfig } from "../../../src/lib/agent/llm/model-config";
import {
  createIntentFromProposedAction,
  dryRunAgentIntent,
} from "../../../src/lib/agent/safety";
import {
  frozenWeeklyReviewProposalSchema,
  type FrozenWeeklyReviewProposal,
} from "../../../src/lib/agent/review/model-schemas";
import { executeAgentTool } from "../../../src/lib/agent/tool-registry";
import {
  runWeeklyReviewPersistenceTransaction,
  runWeeklyReviewWorkflow,
  WeeklyReviewPersistenceIndeterminateError,
} from "../../../src/lib/agent/workflows/weekly-review";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubFindHandler,
} from "../../stubs/payload-client";

const frozenProposal = (): FrozenWeeklyReviewProposal => ({
  assistantMessage: [
    "本周主线清楚，但需要优先处理逾期风险。",
    "本周完成：1 项计划处于 done",
    "风险：1 项计划逾期：Review 安全收口",
    "叙事缺口：计划缺少可见产出",
    "下周建议：先处理逾期计划「Review 安全收口」",
  ].join("\n"),
  completed: ["1 项计划处于 done"],
  createSuggestions: true,
  health: "risk",
  metrics: { failedAgentRuns: 0, overduePlans: 1 },
  narrativeGaps: ["计划缺少可见产出"],
  recommendations: ["先处理逾期计划「Review 安全收口」"],
  reviewedAt: "2026-08-18T10:00:00.000+08:00",
  risks: ["1 项计划逾期：Review 安全收口"],
  scope: "overall",
  snapshotFingerprint: "a".repeat(64),
  source: "model",
  suggestionDrafts: [
    {
      createdBy: "agent",
      reason: "计划已经逾期",
      relatedPlan: 101,
      riskLevel: "high",
      source: "review",
      status: "pending",
      suggestedPrompt: "重新确定下一步",
      title: "处理逾期计划",
      uniqueKey: "weekly-review:2026-08-18:overdue-plan:101",
    },
  ],
  summary: [
    "本周主线清楚，但需要优先处理逾期风险。",
    "风险：1 项计划逾期：Review 安全收口",
  ].join("\n"),
  title: "Weekly Review · 2026-08-18",
});

describe("L3-D3 frozen Review workflow boundary", () => {
  it("validates a complete strict proposal with deterministic fingerprint and provenance", () => {
    const proposal = frozenProposal();
    assert.equal(frozenWeeklyReviewProposalSchema.safeParse(proposal).success, true);
    assert.equal(
      frozenWeeklyReviewProposalSchema.safeParse({ ...proposal, execute: true }).success,
      false,
    );
    assert.equal(
      frozenWeeklyReviewProposalSchema.safeParse({
        ...proposal,
        snapshotFingerprint: "provider-selected-fingerprint",
      }).success,
      false,
    );
    assert.equal(
      frozenWeeklyReviewProposalSchema.safeParse({
        ...proposal,
        suggestionDrafts: [{ ...proposal.suggestionDrafts[0], relatedPlan: 0 }],
      }).success,
      false,
    );
  });

  it("freezes the complete proposal during dry-run before confirmation", async () => {
    const proposal = frozenProposal();
    let prepareCalls = 0;
    const result = await dryRunAgentIntent(
      {
        args: {
          createSuggestions: true,
          now: "2026-08-18T10:00:00.000+08:00",
          persistReview: true,
        },
        intent: "weekly_review",
      },
      {
        createActionId: () => "weekly-review-action",
        prepareWeeklyReviewProposal: async (args) => {
          prepareCalls += 1;
          assert.equal(args.proposal, undefined);
          return proposal;
        },
      },
    );

    assert.equal(prepareCalls, 1);
    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") assert.fail("expected weekly review proposal");
    assert.equal(result.action.requiresConfirmation, true);
    assert.deepEqual(
      (result.action.args as { proposal?: unknown }).proposal,
      proposal,
    );
    assert.deepEqual(
      (result.action.afterSnapshot as { proposal?: unknown }).proposal,
      proposal,
    );
    assert.equal(
      (result.action.afterSnapshot as { snapshotFingerprint?: unknown }).snapshotFingerprint,
      proposal.snapshotFingerprint,
    );
  });

  it("fails dry-run closed when no complete Review proposal can be prepared", async () => {
    const result = await dryRunAgentIntent(
      {
        args: { createSuggestions: true, persistReview: true },
        intent: "weekly_review",
      },
      {
        prepareWeeklyReviewProposal: async () => null,
      },
    );

    assert.equal(result.type, "clarify");
    if (result.type !== "clarify") assert.fail("expected safe clarification");
    assert.equal(result.pendingAction?.type, "await_clarification");
    assert.match(result.assistantMessage, /无法.*回顾|重新.*回顾|稍后重试/u);
  });

  it("restores the exact frozen proposal and passes it unchanged to confirmed execution", async () => {
    const proposal = frozenProposal();
    const dryRun = await dryRunAgentIntent(
      {
        args: { createSuggestions: true, persistReview: true },
        intent: "weekly_review",
      },
      {
        createActionId: () => "weekly-review-action",
        prepareWeeklyReviewProposal: async () => proposal,
      },
    );
    assert.equal(dryRun.type, "proposed_action");
    if (dryRun.type !== "proposed_action") assert.fail("expected weekly review proposal");

    const restored = createIntentFromProposedAction(dryRun.action);
    assert.equal(restored?.intent, "weekly_review");
    if (restored?.intent !== "weekly_review") assert.fail("expected restored weekly_review");
    assert.deepEqual(restored.args.proposal, proposal);

    let executionCalls = 0;
    let executedProposal: unknown;
    const result = await executeAgentTool(restored, {
      weeklyReview: async (args) => {
        executionCalls += 1;
        executedProposal = args.proposal;
        return { assistantMessage: "已保存冻结的本周回顾。", pendingAction: null };
      },
    });

    assert.equal(executionCalls, 1);
    assert.deepEqual(executedProposal, proposal);
    assert.equal(result.assistantMessage, "已保存冻结的本周回顾。");
  });

  it("persists a confirmed proposal without recollecting facts or calling a model", async () => {
    const proposal = frozenProposal();
    let snapshotLoads = 0;
    let agentRunWrites = 0;
    let planReviewWrites = 0;
    const suggestionKeys: string[] = [];
    const result = await runWeeklyReviewWorkflow(
      {
        createSuggestions: true,
        persistReview: true,
        proposal,
      },
      {
        collectSnapshot: async () => {
          snapshotLoads += 1;
          throw new Error("confirmed execution must not rebuild Review facts");
        },
        createAgentRun: async () => {
          agentRunWrites += 1;
          return { id: 88 };
        },
        createPlanReview: async (data) => {
          planReviewWrites += 1;
          const record = data as Record<string, unknown>;
          assert.equal(record["health"], proposal.health);
          assert.deepEqual(record["metrics"], proposal.metrics);
          assert.equal(record["summary"], proposal.summary);
          return { id: 45 };
        },
        upsertSuggestion: async (uniqueKey, suggestion) => {
          suggestionKeys.push(uniqueKey);
          assert.deepEqual(suggestion, proposal.suggestionDrafts[0]);
          return { id: 55 };
        },
        userId: 7,
      },
    );

    assert.equal(snapshotLoads, 0);
    assert.equal(planReviewWrites, 1);
    assert.equal(agentRunWrites, 1);
    assert.deepEqual(suggestionKeys, [proposal.suggestionDrafts[0]?.uniqueKey]);
    assert.equal(result.reviewId, 45);
    assert.equal(result.agentRunId, 88);
    assert.deepEqual(result.metrics, proposal.metrics);
    assert.deepEqual(result.risks, proposal.risks);
  });

  it("commits the complete Review write set exactly once", async () => {
    const operations: string[] = [];
    const result = await runWeeklyReviewPersistenceTransaction({
      commit: async () => {
        operations.push("commit");
      },
      operation: async () => {
        operations.push("operation");
        return "saved";
      },
      rollback: async () => {
        operations.push("rollback");
      },
    });

    assert.equal(result, "saved");
    assert.deepEqual(operations, ["operation", "commit"]);
  });

  it("rolls back a failed Review write without committing partial records", async () => {
    const operations: string[] = [];
    const failure = new Error("suggestion write failed");
    await assert.rejects(
      runWeeklyReviewPersistenceTransaction({
        commit: async () => {
          operations.push("commit");
        },
        operation: async () => {
          operations.push("operation");
          throw failure;
        },
        rollback: async () => {
          operations.push("rollback");
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(operations, ["operation", "rollback"]);
  });

  it("rolls back when the Review transaction cannot commit", async () => {
    const operations: string[] = [];
    const failure = new Error("commit failed");
    await assert.rejects(
      runWeeklyReviewPersistenceTransaction({
        commit: async () => {
          operations.push("commit");
          throw failure;
        },
        operation: async () => {
          operations.push("operation");
          return "saved";
        },
        rollback: async () => {
          operations.push("rollback");
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(operations, ["operation", "commit", "rollback"]);
  });

  it("reports an indeterminate Review write when transaction rollback fails", async () => {
    let operationCalls = 0;
    await assert.rejects(
      runWeeklyReviewPersistenceTransaction({
        commit: async () => undefined,
        operation: async () => {
          operationCalls += 1;
          throw new Error("agent run write failed");
        },
        rollback: async () => {
          throw new Error("rollback failed");
        },
      }),
      WeeklyReviewPersistenceIndeterminateError,
    );
    assert.equal(operationCalls, 1);
  });

  it("rejects confirmed execution without a valid frozen proposal before DB access", async () => {
    resetPayloadStub();
    const result = await executeAgentIntent({
      args: {
        createSuggestions: true,
        persistReview: true,
      },
      intent: "weekly_review",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.pendingAction, null);
    assert.match(result.assistantMessage, /没有可验证的确认草案|未保存|重新生成/u);
    assert.deepEqual(getPayloadStubOperations(), []);
  });

  it("keeps evaluate_plan purely read-only with zero Payload writes", async () => {
    resetPayloadStub();
    setPayloadStubFindHandler(async (input) => {
      const args = input as { collection?: string };
      if (args.collection === "plans") {
        return {
          docs: [
            {
              agentBrief: "只进行确定性评估",
              agentState: "ready",
              dueDate: "2026-08-28T00:00:00.000Z",
              executionMode: "manual",
              id: 101,
              lastAgentRun: null,
              linkedContent: [],
              priority: "high",
              state: "active",
              title: "Review 安全收口",
            },
          ],
          totalDocs: 1,
        };
      }
      if (args.collection === "checklists") {
        return { docs: [], totalDocs: 0 };
      }
      throw new Error(`unexpected collection ${args.collection ?? "unknown"}`);
    });

    const result = await executeAgentIntent({
      args: { planId: 101, planTitle: null },
      intent: "evaluate_plan",
    });
    const writes = getPayloadStubOperations().filter((operation) =>
      operation.type === "create"
      || operation.type === "delete"
      || operation.type === "update");

    assert.match(result.assistantMessage, /Review 安全收口/u);
    assert.doesNotMatch(result.assistantMessage, /已.*保存.*PlanReview/u);
    assert.deepEqual(writes, []);
  });

  it("can run the standalone plan evaluation deterministically with zero model calls", async () => {
    resetPayloadStub();
    setPayloadStubFindHandler(async (input) => {
      const args = input as { collection?: string };
      if (args.collection === "plans") {
        return {
          docs: [{
            agentBrief: "只进行确定性评估",
            agentState: "ready",
            dueDate: "2026-08-28T00:00:00.000Z",
            executionMode: "manual",
            id: 101,
            lastAgentRun: null,
            linkedContent: [],
            priority: "high",
            state: "active",
            title: "Review 安全收口",
          }],
          totalDocs: 1,
        };
      }
      if (args.collection === "checklists") return { docs: [], totalDocs: 0 };
      throw new Error(`unexpected collection ${args.collection ?? "unknown"}`);
    });
    const config = createModelConfig({
      apiKey: "sk-test",
      baseURL: "https://api.test.example/v1",
      model: "review-test-model",
      provider: "openai",
      structuredOutputMode: "json_schema",
    });
    if ("code" in config) assert.fail(config.safeMessage);
    const previousDisabled = process.env.AGENT_DISABLE_LLM;
    delete process.env.AGENT_DISABLE_LLM;
    let logicalCalls = 0;
    try {
      const result = await evaluatePlan(
        { planId: 101, planTitle: null },
        {
          enhanceWithModel: false,
          modelInvocation: {
            logicalCallAuthorizer: () => {
              logicalCalls += 1;
              assert.fail("deterministic API evaluation must not authorize a model call");
            },
            modelConfig: config,
          },
          persistReview: false,
        },
      );
      assert.equal(result.planId, 101);
    } finally {
      if (previousDisabled === undefined) delete process.env.AGENT_DISABLE_LLM;
      else process.env.AGENT_DISABLE_LLM = previousDisabled;
    }

    assert.equal(logicalCalls, 0);
  });
});
