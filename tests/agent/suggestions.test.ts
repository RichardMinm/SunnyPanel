import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateSuggestionsFromWorkspaceSnapshot,
  shouldResurfaceDismissedSuggestion,
  type AgentSuggestionSnapshot,
} from "../../src/lib/agent/suggestions-core";

const baseSnapshot: AgentSuggestionSnapshot = {
  agent: {
    recentReviews: [
      {
        reviewedAt: "2026-05-06T00:00:00.000Z",
      },
    ],
    recentRuns: [],
  },
  execution: {
    recentContentWithoutPlans: [],
    recentPrivateReady: [],
    timelineCandidates: [],
  },
  plans: {
    active: [],
    backlog: [],
    paused: [],
  },
};

test("generates overdue plan suggestion", () => {
  const suggestions = generateSuggestionsFromWorkspaceSnapshot(
    {
      ...baseSnapshot,
      plans: {
        ...baseSnapshot.plans,
        active: [
          {
            dueDate: "2026-05-01T00:00:00.000Z",
            id: 12,
            priority: "high",
            state: "active",
            title: "补齐 Agent Inbox",
          },
        ],
      },
    },
    new Date("2026-05-08T12:00:00.000Z"),
  );

  assert.equal(suggestions[0]?.uniqueKey, "overdue-plan:12");
  assert.equal(suggestions[0]?.riskLevel, "high");
  assert.match(suggestions[0]?.suggestedPrompt ?? "", /逾期风险/);
});

test("avoids duplicate suggestions from identical unique keys", () => {
  const duplicatePlan = {
    dueDate: "2026-05-01T00:00:00.000Z",
    id: 8,
    priority: "medium",
    state: "active" as const,
    title: "重复计划",
  };
  const suggestions = generateSuggestionsFromWorkspaceSnapshot(
    {
      ...baseSnapshot,
      plans: {
        active: [duplicatePlan],
        backlog: [duplicatePlan],
        paused: [],
      },
    },
    new Date("2026-05-08T12:00:00.000Z"),
  );

  assert.equal(suggestions.filter((suggestion) => suggestion.uniqueKey === "overdue-plan:8").length, 1);
});

test("dismissed suggestions do not reappear immediately", () => {
  assert.equal(
    shouldResurfaceDismissedSuggestion({
      dismissedAt: "2026-05-07T12:00:00.000Z",
      now: new Date("2026-05-08T12:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    shouldResurfaceDismissedSuggestion({
      dismissedAt: "2026-04-28T12:00:00.000Z",
      now: new Date("2026-05-08T12:00:00.000Z"),
    }),
    true,
  );
});

test("published public content generates content-lifecycle timeline and plan-link suggestions", () => {
  const publicPost = {
    id: 42,
    kind: "posts" as const,
    status: "published" as const,
    title: "发布内容协作演进",
    visibility: "public" as const,
  };

  const suggestions = generateSuggestionsFromWorkspaceSnapshot({
    ...baseSnapshot,
    execution: {
      ...baseSnapshot.execution,
      recentContentWithoutPlans: [publicPost],
      recentPublicContent: [publicPost],
      timelineCandidates: [publicPost],
    },
    plans: {
      ...baseSnapshot.plans,
      active: [
        {
          id: 9,
          state: "active",
          title: "内容运营协作者",
        },
      ],
    },
  });

  const timeline = suggestions.find((item) => item.uniqueKey === "content-lifecycle-timeline:posts:42");
  const planLink = suggestions.find((item) => item.uniqueKey === "content-lifecycle-plan:posts:42");

  assert.ok(timeline, "应生成发布后补时间线建议");
  assert.equal(timeline?.source, "content-lifecycle");
  assert.match(timeline?.suggestedPrompt ?? "", /compose_timeline_event/);
  assert.match(timeline?.suggestedPrompt ?? "", /来源 ID 42/);

  assert.ok(planLink, "应生成发布成果关联计划建议");
  assert.equal(planLink?.relatedPlan, 9);
  assert.match(planLink?.suggestedPrompt ?? "", /计划 ID 9/);

  // 生命周期建议已覆盖该内容，通用 timeline-gap 不应对同一条内容重复 surfacing。
  assert.equal(
    suggestions.some((item) => item.uniqueKey === "timeline-gap:posts:42"),
    false,
  );
});

test("timeline gap suggestions use timeline composer workflow", () => {
  const suggestions = generateSuggestionsFromWorkspaceSnapshot({
    ...baseSnapshot,
    execution: {
      ...baseSnapshot.execution,
      timelineCandidates: [
        {
          id: 22,
          kind: "updates",
          status: "published",
          title: "发布 Timeline Composer",
          visibility: "public",
        },
      ],
    },
  });

  const suggestion = suggestions.find((item) => item.uniqueKey === "timeline-gap:updates:22");

  assert.ok(suggestion);
  assert.match(suggestion.suggestedPrompt, /compose_timeline_event/);
  assert.match(suggestion.suggestedPrompt, /来源类型 update/);
});
