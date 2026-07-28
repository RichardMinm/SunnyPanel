import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeAgentIntent } from "../../src/lib/agent/executor";
import {
  buildWeeklyReviewFromSnapshot,
  runWeeklyReviewWorkflow,
  type WeeklyReviewSnapshot,
} from "../../src/lib/agent/workflows/weekly-review";
import {
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindHandler,
} from "../stubs/payload-client";

beforeEach(() => resetPayloadStub());

const snapshot: WeeklyReviewSnapshot = {
  agentRuns: [
    {
      id: 31,
      startedAt: "2026-05-07T10:00:00.000Z",
      status: "failed",
      summary: "缺少 AgentBrief。",
      title: "Agent readiness audit",
      workflow: "readiness-audit",
    },
  ],
  checklists: [
    {
      groups: [
        {
          items: [
            {
              isCompleted: true,
              title: "完成首页改版",
            },
            {
              isCompleted: false,
              title: "补齐回顾工作流",
            },
          ],
          title: "开发",
        },
      ],
      id: 21,
      title: "SunnyPanel 周计划",
    },
  ],
  plans: {
    active: [
      {
        dueDate: "2026-05-01T00:00:00.000Z",
        id: 12,
        linkedContent: [],
        priority: "high",
        state: "active",
        title: "补齐 Agent 周回顾",
      },
    ],
    backlog: [],
    done: [
      {
        dueDate: null,
        id: 13,
        linkedContent: [],
        priority: "medium",
        state: "done",
        title: "完成 Agent Inbox",
      },
    ],
  },
  recentPublicContent: [
    {
      id: 7,
      kind: "posts",
      status: "published",
      title: "SunnyPanel Agent Inbox 设计",
      updatedAt: "2026-05-07T00:00:00.000Z",
      visibility: "public",
    },
  ],
  recentTimelineEvents: [],
};

test("generates weekly review from mocked data", () => {
  const review = buildWeeklyReviewFromSnapshot(snapshot, "2026-05-08T00:00:00.000Z");

  assert.equal(review.health, "risk");
  assert.match(review.completed.join("；"), /本周公开内容|公开内容/);
  assert.match(review.risks.join("；"), /逾期|AgentRun/);
  assert.match(review.narrativeGaps.join("；"), /Timeline|关联产出/);
  assert.match(review.recommendations.join("；"), /逾期计划|失败运行/);
  assert.equal(review.metrics.overduePlans, 1);
});

test("weekly review workflow creates AgentRun", async () => {
  const capturedAgentRuns: Array<Record<string, unknown>> = [];

  const result = await runWeeklyReviewWorkflow(
    {
      createSuggestions: true,
      now: "2026-05-08T00:00:00.000Z",
      persistReview: true,
    },
    {
      collectSnapshot: async () => snapshot,
      createAgentRun: async (data) => {
        capturedAgentRuns.push(data as Record<string, unknown>);

        return {
          id: 88,
        };
      },
      createPlanReview: async () => ({
        id: 45,
      }),
      upsertSuggestion: async () => null,
      userId: 7,
    },
  );

  const agentRunData = capturedAgentRuns[0];

  assert.equal(result.reviewId, 45);
  assert.equal(result.agentRunId, 88);
  assert.ok(agentRunData);
  assert.equal(agentRunData["user"], 7);
  assert.equal(agentRunData["workflow"], "weekly-review");
  assert.equal(agentRunData["status"], "succeeded");
  assert.equal(agentRunData["rollbackAvailable"], true);
  assert.deepEqual(agentRunData["rollbackPayload"], {
    reason: "删除本次 Weekly Review 创建的 PlanReview，并将自动生成的建议归档为 dismissed；AgentRun 保留为回滚审计。",
    strategy: "delete_created_weekly_review_artifacts",
    target: {
      agentRunId: null,
      collection: "plan-reviews",
      planReviewId: 45,
      suggestionIds: [],
    },
  });
  assert.deepEqual(agentRunData["relatedContent"], [
    {
      relationTo: "plan-reviews",
      value: 45,
    },
  ]);
  assert.match(result.assistantMessage, /已保存为 PlanReview #45/);
});

test("weekly review workflow creates suggestions for next actions", async () => {
  const suggestionKeys: string[] = [];

  const result = await runWeeklyReviewWorkflow(
    {
      createSuggestions: true,
      now: "2026-05-08T00:00:00.000Z",
      persistReview: true,
    },
    {
      collectSnapshot: async () => snapshot,
      createAgentRun: async () => ({
        id: 88,
      }),
      createPlanReview: async () => ({
        id: 45,
      }),
      upsertSuggestion: async (uniqueKey) => {
        suggestionKeys.push(uniqueKey);

        return null;
      },
    },
  );

  assert.ok(result.suggestionDrafts.length > 0);
  assert.ok(suggestionKeys.some((key) => key.includes("weekly-review:2026-05-08:overdue-plan:12")));
  assert.equal(result.suggestionDrafts.every((suggestion) => suggestion.source === "review"), true);
});

test("persisted weekly review returns and stores its durable rollback AgentRun source", async () => {
  let storedAgentRunData: Record<string, unknown> | undefined;

  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as {
      collection?: string;
      data?: Record<string, unknown>;
    };

    if (args.collection === "plan-reviews") {
      return {
        id: 45,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      storedAgentRunData = args.data;

      return {
        id: 88,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });

  const result = await executeAgentIntent(
    {
      args: {
        createSuggestions: false,
        now: "2026-07-28T00:00:00.000Z",
        persistReview: true,
      },
      intent: "weekly_review",
    },
    undefined,
    { userId: 7 },
  );

  assert.equal(result.rollbackSourceRunId, 88);
  assert.deepEqual(result.rollbackPayload, storedAgentRunData?.rollbackPayload);
  assert.equal(storedAgentRunData?.rollbackAvailable, true);
  assert.equal(
    (
      result.rollbackPayload as {
        target?: { agentRunId?: null | number };
      }
    ).target?.agentRunId,
    null,
  );
});

test("persisted weekly review fails closed when its AgentRun source is invalid", async () => {
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as {
      collection?: string;
      data?: Record<string, unknown>;
    };

    if (args.collection === "plan-reviews") {
      return {
        id: 45,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 0,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });

  const result = await executeAgentIntent(
    {
      args: {
        createSuggestions: false,
        now: "2026-07-28T00:00:00.000Z",
        persistReview: true,
      },
      intent: "weekly_review",
    },
    undefined,
    { userId: 7 },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.rollbackPayload, undefined);
  assert.equal(result.rollbackSourceRunId, undefined);
  assert.match(result.assistantMessage, /回滚来源不可用/);
});
