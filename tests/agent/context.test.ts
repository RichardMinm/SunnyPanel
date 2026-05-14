import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentContext,
  resolveAgentContextMode,
  type AgentContextBudget,
  type AgentContextSource,
} from "../../src/lib/agent/context-builder";

const budget: AgentContextBudget = {
  maxAgentRuns: 3,
  maxContentItems: 3,
  maxPlanReviews: 3,
  maxPlans: 3,
  maxTimelineEvents: 3,
};

const source: AgentContextSource = {
  agentRuns: [
    {
      completedAt: "2026-05-06T10:10:00.000Z",
      goal: "检查计划推进风险",
      id: 301,
      relatedPlan: {
        id: 1,
        title: "主动计划",
      },
      startedAt: "2026-05-06T10:00:00.000Z",
      status: "succeeded",
      summary: "发现一个内容输出缺口。",
      title: "Agent 复盘主动计划",
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
              title: "完成第一节",
            },
            {
              isCompleted: false,
              title: "整理第二节",
            },
          ],
          title: "章节",
        },
      ],
      id: 101,
      status: "draft",
      title: "高等数学",
      updatedAt: "2026-05-06T09:00:00.000Z",
      visibility: "private",
    },
  ],
  contentItems: [
    {
      id: 201,
      kind: "posts",
      status: "published",
      summary: "已有时间线节点的文章。",
      title: "SunnyPanel 第一版",
      updatedAt: "2026-05-06T08:00:00.000Z",
      visibility: "public",
    },
    {
      id: 202,
      kind: "updates",
      status: "published",
      summary: "还没有时间线节点的更新。",
      title: "完成 AI Agent dry-run",
      updatedAt: "2026-05-07T08:00:00.000Z",
      visibility: "private",
    },
    {
      id: 203,
      kind: "notes",
      status: "draft",
      summary: "需要整理的草稿。",
      title: "复盘草稿",
      updatedAt: "2026-05-05T08:00:00.000Z",
      visibility: "private",
    },
  ],
  memories: [
    {
      confidence: 0.9,
      content: "用户偏好先给结论，再补必要细节。",
      id: 601,
      lastUsedAt: "2026-05-07T09:00:00.000Z",
      status: "active",
      title: "回答风格偏好",
      type: "preference",
      visibility: "private",
    },
    {
      confidence: 0.95,
      content: "旧规则，不应该再进入上下文。",
      id: 602,
      lastUsedAt: "2026-05-07T10:00:00.000Z",
      status: "archived",
      title: "已归档规则",
      type: "workflow_rule",
      visibility: "private",
    },
  ],
  now: "2026-05-07T00:00:00.000Z",
  planReviews: [
    {
      health: "attention",
      id: 401,
      plan: {
        id: 1,
        title: "主动计划",
      },
      recommendations: [
        {
          content: "补一条公开输出。",
        },
      ],
      reviewedAt: "2026-05-06T11:00:00.000Z",
      scope: "plan",
      source: "agent",
      summary: "计划健康，但输出关联不足。",
      title: "主动计划复盘",
    },
  ],
  plans: [
    {
      agentState: "ready",
      executionMode: "agent",
      id: 1,
      linkedContent: null,
      priority: "high",
      state: "active",
      title: "主动计划",
      updatedAt: "2026-05-06T08:00:00.000Z",
      visibility: "private",
    },
    {
      agentState: "idle",
      executionMode: "manual",
      id: 2,
      linkedContent: [
        {
          relationTo: "posts",
          value: 201,
        },
      ],
      priority: "medium",
      state: "backlog",
      title: "文章输出计划",
      updatedAt: "2026-05-05T08:00:00.000Z",
      visibility: "private",
    },
  ],
  timelineEvents: [
    {
      eventDate: "2026-05-04T00:00:00.000Z",
      id: 501,
      isFeatured: true,
      relatedPost: 201,
      status: "published",
      title: "SunnyPanel 第一版上线",
      type: "milestone",
      visibility: "public",
    },
    {
      eventDate: "2026-05-06T00:00:00.000Z",
      id: 502,
      isFeatured: false,
      status: "draft",
      title: "AI Agent dry-run",
      type: "project",
      visibility: "private",
    },
  ],
};

test("planning mode includes active plans and recent PlanReviews", () => {
  const context = buildAgentContext({
    budget,
    message: "帮我规划接下来要推进的计划",
    pendingAction: null,
    source,
  });

  assert.equal(context.mode, "planning");
  assert.equal(context.plans[0]?.title, "主动计划");
  assert.equal(context.plans[0]?.state, "active");
  assert.equal(context.planReviews?.[0]?.title, "主动计划复盘");
});

test("timeline mode includes timeline candidates", () => {
  const context = buildAgentContext({
    budget,
    message: "帮我看看时间线还有哪些候选内容",
    pendingAction: null,
    source,
  });

  assert.equal(context.mode, "timeline");
  assert.equal(context.timelineEvents?.[0]?.isFeatured, true);
  assert.equal(context.timelineCandidates?.some((item) => item.title === "完成 AI Agent dry-run"), true);
  assert.equal(context.timelineCandidates?.some((item) => item.title === "SunnyPanel 第一版"), false);
});

test("review mode includes AgentRuns and PlanReviews", () => {
  const context = buildAgentContext({
    budget,
    message: "复盘最近的 Agent run 和计划回顾",
    pendingAction: null,
    source,
  });

  assert.equal(context.mode, "review");
  assert.equal(context.agentRuns?.[0]?.title, "Agent 复盘主动计划");
  assert.equal(context.planReviews?.[0]?.health, "attention");
});

test("context respects configured limits", () => {
  const limitedContext = buildAgentContext({
    budget: {
      maxAgentRuns: 1,
      maxContentItems: 1,
      maxPlanReviews: 1,
      maxPlans: 1,
      maxTimelineEvents: 1,
    },
    message: "复盘所有内容、计划和时间线",
    pendingAction: null,
    source,
  });

  assert.equal(limitedContext.plans.length, 1);
  assert.equal(limitedContext.contentItems?.length, 1);
  assert.equal(limitedContext.timelineEvents?.length, 1);
  assert.equal(limitedContext.agentRuns?.length, 1);
  assert.equal(limitedContext.planReviews?.length, 1);
});

test("context includes active memories and excludes archived memories", () => {
  const context = buildAgentContext({
    budget,
    message: "按我的回答风格偏好规划一下",
    pendingAction: null,
    source,
  });

  assert.equal(context.memories?.some((memory) => memory.title === "回答风格偏好"), true);
  assert.equal(context.memories?.some((memory) => memory.title === "已归档规则"), false);
});

test("resolved intent can override message keyword mode", () => {
  assert.equal(
    resolveAgentContextMode({
      intent: {
        args: {
          checklistTitle: null,
          scope: "all",
        },
        confidence: 0.9,
        intent: "query_progress",
      },
      message: "复盘一下",
    }),
    "progress",
  );
});
