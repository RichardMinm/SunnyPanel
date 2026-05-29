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
