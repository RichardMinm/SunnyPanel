import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enhanceEvaluationWithLLM,
  mergeEvaluationEnhancement,
  parseEvaluationEnhancement,
  type EvaluationEnhancementInput,
} from "../../src/lib/agent/evaluation-llm";
import {
  enhanceSuggestionsWithLLM,
  mergeSuggestionEnhancements,
  parseSuggestionEnhancements,
} from "../../src/lib/agent/suggestions-llm";
import type { AgentSuggestionDraft } from "../../src/lib/agent/suggestions-core";
import { createTokenUsageSnapshot } from "../../src/lib/agent/token-usage";

const draft = (overrides: Partial<AgentSuggestionDraft> = {}): AgentSuggestionDraft => ({
  createdBy: "agent",
  reason: "规则原因",
  riskLevel: "medium",
  source: "plan",
  status: "pending",
  suggestedPrompt: "规则提示",
  title: "规则标题",
  uniqueKey: "overdue-plan:1",
  ...overrides,
});

test("mergeSuggestionEnhancements only rewrites text fields and preserves structure", () => {
  const drafts = [draft({ relatedPlan: 1 }), draft({ uniqueKey: "timeline-gap:posts:9", source: "timeline" })];
  const merged = mergeSuggestionEnhancements(drafts, [
    { reason: "更自然的原因", suggestedPrompt: "更具体的指令", title: "更好的标题", uniqueKey: "overdue-plan:1" },
  ]);

  assert.equal(merged[0].title, "更好的标题");
  assert.equal(merged[0].suggestedPrompt, "更具体的指令");
  assert.equal(merged[0].relatedPlan, 1);
  assert.equal(merged[0].source, "plan");
  assert.equal(merged[0].riskLevel, "medium");
  // 未被润色的草稿原样保留（规则兜底）。
  assert.equal(merged[1].title, "规则标题");
});

test("parseSuggestionEnhancements requires uniqueKey and drops invalid entries", () => {
  const parsed = parseSuggestionEnhancements({
    suggestions: [
      { title: "缺 uniqueKey" },
      { uniqueKey: "overdue-plan:1", title: "ok" },
    ],
  });

  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0].uniqueKey, "overdue-plan:1");
});

test("enhanceSuggestionsWithLLM falls back to the rule drafts when the model is unavailable", async () => {
  const drafts = [draft()];
  const result = await enhanceSuggestionsWithLLM(drafts, { complete: async () => null });

  assert.deepEqual(result, drafts);
});

test("enhanceSuggestionsWithLLM applies a mocked rewrite while keeping uniqueKey", async () => {
  const drafts = [draft()];
  const result = await enhanceSuggestionsWithLLM(drafts, {
    complete: async () => ({
      data: [{ suggestedPrompt: "复盘逾期计划并给止损动作", title: "处理逾期", uniqueKey: "overdue-plan:1" }],
      raw: "",
      tokenUsage: createTokenUsageSnapshot(),
    }),
  });

  assert.equal(result[0].title, "处理逾期");
  assert.equal(result[0].suggestedPrompt, "复盘逾期计划并给止损动作");
  assert.equal(result[0].uniqueKey, "overdue-plan:1");
});

const evalInput: EvaluationEnhancementInput = {
  health: "risk",
  metrics: { overduePlans: 2, planCount: 5 },
  recommendations: ["先处理 2 项逾期计划"],
  scope: "overall",
  summary: "整体评估：5 项计划...",
};

test("mergeEvaluationEnhancement overlays summary/recommendations but keeps health and metrics", () => {
  const merged = mergeEvaluationEnhancement(evalInput, {
    recommendations: ["今天先把 2 项逾期计划重新定下一步"],
    summary: "整体偏紧：先止损逾期计划。",
  });

  assert.equal(merged.summary, "整体偏紧：先止损逾期计划。");
  assert.deepEqual(merged.recommendations, ["今天先把 2 项逾期计划重新定下一步"]);
  assert.equal(merged.health, "risk");
  assert.deepEqual(merged.metrics, { overduePlans: 2, planCount: 5 });
});

test("mergeEvaluationEnhancement returns the rule-based result when enhancement is null", () => {
  const merged = mergeEvaluationEnhancement(evalInput, null);

  assert.deepEqual(merged, evalInput);
});

test("parseEvaluationEnhancement rejects empty payloads", () => {
  assert.equal(parseEvaluationEnhancement({}), null);
  assert.equal(parseEvaluationEnhancement({ recommendations: [] }), null);
  assert.deepEqual(parseEvaluationEnhancement({ summary: "ok" }), { summary: "ok" });
});

test("enhanceEvaluationWithLLM returns null when the model is unavailable", async () => {
  const result = await enhanceEvaluationWithLLM(evalInput, { complete: async () => null });

  assert.equal(result, null);
});
