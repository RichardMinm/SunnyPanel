import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DISMISS_WEIGHT_FLOOR,
  computeCategoryDismissWeights,
  feedbackWeightForSuggestion,
  rankPendingSuggestionsByFeedback,
  suggestionCategory,
} from "../../src/lib/agent/suggestion-feedback";

describe("suggestion feedback loop", () => {
  test("suggestionCategory takes the prefix before the first colon", () => {
    assert.equal(suggestionCategory("content-lifecycle-timeline:posts:42"), "content-lifecycle-timeline");
    assert.equal(suggestionCategory("overdue-plan:12"), "overdue-plan");
    assert.equal(suggestionCategory("weekly-review-due"), "weekly-review-due");
  });

  test("repeated dismissals lower a category weight toward the floor", () => {
    const weights = computeCategoryDismissWeights([
      "timeline-gap:posts:1",
      "timeline-gap:posts:2",
      "timeline-gap:updates:3",
      "overdue-plan:9",
    ]);

    // timeline-gap dismissed 3 次 → 1 - 0.25*3 = 0.25。
    assert.equal(weights.get("timeline-gap"), 0.25);
    // overdue-plan dismissed 1 次 → 0.75。
    assert.equal(weights.get("overdue-plan"), 0.75);

    const heavilyDismissed = computeCategoryDismissWeights(
      Array.from({ length: 10 }, (_, index) => `timeline-gap:posts:${index}`),
    );
    assert.equal(heavilyDismissed.get("timeline-gap"), DISMISS_WEIGHT_FLOOR);
  });

  test("feedbackWeightForSuggestion defaults to 1 for never-dismissed categories", () => {
    const weights = computeCategoryDismissWeights(["timeline-gap:posts:1"]);

    assert.equal(feedbackWeightForSuggestion("overdue-plan:1", weights), 1);
    assert.equal(feedbackWeightForSuggestion("timeline-gap:posts:9", weights), 0.75);
  });

  test("ranking sinks a heavily dismissed category below an untouched one", () => {
    const weights = computeCategoryDismissWeights(
      Array.from({ length: 4 }, (_, index) => `timeline-gap:posts:${index}`),
    );

    const ranked = rankPendingSuggestionsByFeedback(
      [
        { id: 1, riskLevel: "low" as const, uniqueKey: "overdue-plan:7" },
        { id: 2, riskLevel: "high" as const, uniqueKey: "timeline-gap:posts:99" },
      ],
      weights,
    );

    // timeline-gap 即便 high 风险（基分 3 × 0.2 = 0.6）也低于未被忽略的 overdue-plan（low：1 × 1 = 1）。
    assert.equal(ranked[0]?.id, 1);
    assert.equal(ranked[1]?.id, 2);
  });

  test("ranking is stable and risk-ordered without dismissals", () => {
    const ranked = rankPendingSuggestionsByFeedback(
      [
        { id: 1, riskLevel: "low" as const, uniqueKey: "a:1" },
        { id: 2, riskLevel: "high" as const, uniqueKey: "b:1" },
        { id: 3, riskLevel: "medium" as const, uniqueKey: "c:1" },
      ],
      new Map(),
    );

    assert.deepEqual(
      ranked.map((item) => item.id),
      [2, 3, 1],
    );
  });
});
