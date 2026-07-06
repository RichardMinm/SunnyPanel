import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeTimelineEventProposal,
} from "../../src/lib/agent/workflows/timeline-composer";
import {
  runWeeklyReviewWorkflow,
  type WeeklyReviewSnapshot,
} from "../../src/lib/agent/workflows/weekly-review";

const weeklySnapshot: WeeklyReviewSnapshot = {
  agentRuns: [],
  checklists: [
    {
      groups: [
        {
          items: [
            {
              isCompleted: true,
              title: "整理本周完成项",
            },
            {
              isCompleted: false,
              title: "补齐下周建议",
            },
          ],
          title: "复盘",
        },
      ],
      id: 21,
      title: "SunnyPanel 周计划",
    },
  ],
  plans: {
    active: [
      {
        dueDate: "2026-05-12T00:00:00.000Z",
        id: 12,
        linkedContent: [],
        priority: "medium",
        state: "active",
        title: "补齐 Agent Eval",
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
        title: "完成 Timeline Composer",
      },
    ],
  },
  recentPublicContent: [],
  recentTimelineEvents: [
    {
      eventDate: "2026-05-07T00:00:00.000Z",
      id: 501,
      status: "published",
      title: "完成 Timeline Composer",
      type: "milestone",
      visibility: "public",
    },
  ],
};

test("weekly review workflow contract generates PlanReview payload", async () => {
  const capturedReviews: Array<Record<string, unknown>> = [];

  const result = await runWeeklyReviewWorkflow(
    {
      createSuggestions: false,
      now: "2026-05-08T00:00:00.000Z",
      persistReview: true,
    },
    {
      collectSnapshot: async () => weeklySnapshot,
      createAgentRun: async () => ({
        id: 88,
      }),
      createPlanReview: async (data) => {
        capturedReviews.push(data as Record<string, unknown>);

        return {
          id: 45,
        };
      },
    },
  );

  const reviewData = capturedReviews[0];

  assert.ok(reviewData);
  assert.equal(reviewData["scope"], "overall");
  assert.equal(reviewData["source"], "agent");
  assert.equal(reviewData["reviewedAt"], "2026-05-08T00:00:00.000Z");
  assert.match(String(reviewData["summary"]), /本周完成/);
  assert.ok(Array.isArray(reviewData["recommendations"]));
  assert.equal(result.reviewId, 45);
});

test("timeline composer workflow contract includes required proposal fields", () => {
  const proposal = composeTimelineEventProposal(
    {
      sourceId: 7,
      sourceText: "Timeline Composer 把机械同步升级为可公开回看的记忆节点。",
      sourceTitle: "完成 Timeline Composer",
      sourceType: "update",
      visibility: "public",
    },
    "2026-05-08T00:00:00.000Z",
  );

  assert.ok(proposal);
  assert.equal(typeof proposal.title, "string");
  assert.equal(typeof proposal.description, "string");
  assert.equal(proposal.eventDate, "2026-05-08T00:00:00.000Z");
  assert.equal(proposal.type, "milestone");
  assert.equal(typeof proposal.isFeatured, "boolean");
  assert.equal(proposal.visibility, "public");
  assert.equal(proposal.relatedFields.relatedUpdate, 7);
  assert.match(proposal.reason, /公开记忆骨架|Timeline/);
});
