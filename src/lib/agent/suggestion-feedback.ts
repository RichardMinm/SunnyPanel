import type { AgentSuggestionRiskLevel } from "./suggestions-core";

/**
 * 建议反馈回流（纯函数，便于测试，不触碰 DB schema）。
 *
 * 设计目标：
 * - 同一类建议被反复忽略（dismiss）后，降低其后续 surfacing 排序权重，避免持续打扰；
 * - 风险更高的建议优先 surfacing，但会被反馈权重折减；
 * - 采纳（accept）侧的"强化关联记忆"复用 memory-ranking 的 reinforce 逻辑，在 suggestions.ts 内回流。
 */

/** 每多一次同类 dismiss，surfacing 权重下调的步长。 */
export const DISMISS_WEIGHT_STEP = 0.25;

/** 反馈权重下限：再不受欢迎的建议也保留一点出场机会，避免规则候选被彻底抹掉。 */
export const DISMISS_WEIGHT_FLOOR = 0.2;

const riskBaseScore: Record<AgentSuggestionRiskLevel, number> = {
  high: 3,
  low: 1,
  medium: 2,
};

/** 取 uniqueKey 的类别前缀（首个冒号之前），用于按"建议类型"聚合反馈。 */
export const suggestionCategory = (uniqueKey: string): string => {
  const separatorIndex = uniqueKey.indexOf(":");

  return separatorIndex === -1 ? uniqueKey : uniqueKey.slice(0, separatorIndex);
};

/**
 * 由历史 dismiss 的 uniqueKey 列表计算每个类别的 surfacing 权重。
 * 权重 = max(floor, 1 - step × 该类别被 dismiss 的次数)。
 */
export const computeCategoryDismissWeights = (dismissedUniqueKeys: string[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const key of dismissedUniqueKeys) {
    const category = suggestionCategory(key);

    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const weights = new Map<string, number>();

  for (const [category, count] of counts) {
    weights.set(category, Math.max(DISMISS_WEIGHT_FLOOR, 1 - DISMISS_WEIGHT_STEP * count));
  }

  return weights;
};

/** 单条建议的反馈权重：未被 dismiss 过的类别默认 1。 */
export const feedbackWeightForSuggestion = (
  uniqueKey: string,
  weights: Map<string, number>,
): number => weights.get(suggestionCategory(uniqueKey)) ?? 1;

/**
 * 按 (风险基分 × 反馈权重) 稳定降序重排待处理建议；同分时保持原有顺序。
 * 纯排序、不丢弃任何建议，由调用方决定 slice 数量（保留规则兜底）。
 */
export const rankPendingSuggestionsByFeedback = <
  T extends { riskLevel: AgentSuggestionRiskLevel; uniqueKey: string },
>(
  items: T[],
  weights: Map<string, number>,
): T[] =>
  items
    .map((item, index) => ({
      index,
      item,
      score: riskBaseScore[item.riskLevel] * feedbackWeightForSuggestion(item.uniqueKey, weights),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
