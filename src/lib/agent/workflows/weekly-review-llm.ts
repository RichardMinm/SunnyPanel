import { completeStructured } from "../llm/complete-structured";
import { buildWeeklyReviewInsightsSystemPrompt } from "../prompts/review";
import type { WeeklyReviewResult } from "./weekly-review";

export type WeeklyReviewLLMInsights = {
  narrativeGaps: string[];
  recommendations: string[];
  risks: string[];
  summaryTone: string;
};

const parseWeeklyReviewInsights = (value: unknown): WeeklyReviewLLMInsights | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const toStrings = (key: string) =>
    Array.isArray(record[key])
      ? (record[key] as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];

  const summaryTone = typeof record.summaryTone === "string" ? record.summaryTone : "";

  if (!summaryTone) {
    return null;
  }

  return {
    narrativeGaps: toStrings("narrativeGaps"),
    recommendations: toStrings("recommendations"),
    risks: toStrings("risks"),
    summaryTone,
  };
};

export const enhanceWeeklyReviewWithLLM = async (
  snapshotSummary: Record<string, unknown>,
  ruleBased: Pick<WeeklyReviewResult, "completed" | "narrativeGaps" | "recommendations" | "risks">,
): Promise<WeeklyReviewLLMInsights | null> => {
  const result = await completeStructured({
    messages: [
      { role: "system", content: buildWeeklyReviewInsightsSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify(
          {
            metrics: snapshotSummary,
            ruleBasedDraft: {
              completed: ruleBased.completed,
              narrativeGaps: ruleBased.narrativeGaps,
              recommendations: ruleBased.recommendations,
              risks: ruleBased.risks,
            },
          },
          null,
          2,
        ),
      },
    ],
    parse: parseWeeklyReviewInsights,
    temperature: 0.45,
  });

  return result?.data ?? null;
};
