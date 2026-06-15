import {
  completeStructured,
  type CompleteStructuredOptions,
  type StructuredLLMResult,
} from "./llm/complete-structured";
import type { AgentSuggestionDraft } from "./suggestions-core";

export type SuggestionEnhancement = {
  reason?: string;
  suggestedPrompt?: string;
  title?: string;
  uniqueKey: string;
};

export type SuggestionEnhancerDeps = {
  complete?: (
    options: CompleteStructuredOptions<SuggestionEnhancement[]>,
  ) => Promise<StructuredLLMResult<SuggestionEnhancement[]> | null>;
};

const SUGGESTION_ENHANCER_SYSTEM_PROMPT = `你是 SunnyPanel 的建议润色器。你会收到一批由规则生成的工作台建议草稿（JSON 数组）。
你的任务：在**不改变每条建议本质动作**的前提下，让 title / reason / suggestedPrompt 更自然、更具体、更可执行。

硬性要求：
- 必须原样保留每条建议的 uniqueKey，不能新增、删除或合并建议。
- 不要编造草稿里不存在的对象名、id 或数据。
- suggestedPrompt 要像用户能直接发给 Agent 的一句话指令，包含关键对象与下一步动作。
- title 控制在 18 字内；reason 一句话说清为什么现在值得做。

只输出 JSON：
{"suggestions":[{"uniqueKey":"...","title":"...","reason":"...","suggestedPrompt":"..."}]}`;

export const buildSuggestionEnhancerUserPrompt = (drafts: AgentSuggestionDraft[]): string =>
  JSON.stringify(
    drafts.map((draft) => ({
      reason: draft.reason,
      riskLevel: draft.riskLevel,
      source: draft.source,
      suggestedPrompt: draft.suggestedPrompt,
      title: draft.title,
      uniqueKey: draft.uniqueKey,
    })),
    null,
    2,
  );

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export const parseSuggestionEnhancements = (value: unknown): SuggestionEnhancement[] | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const list = (value as Record<string, unknown>).suggestions;

  if (!Array.isArray(list)) {
    return null;
  }

  const enhancements: SuggestionEnhancement[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const uniqueKey = nonEmptyString(record.uniqueKey);

    if (!uniqueKey) {
      continue;
    }

    enhancements.push({
      reason: nonEmptyString(record.reason),
      suggestedPrompt: nonEmptyString(record.suggestedPrompt),
      title: nonEmptyString(record.title),
      uniqueKey,
    });
  }

  return enhancements.length > 0 ? enhancements : null;
};

/**
 * 纯合并：把 LLM 润色覆盖到规则草稿的文本字段上，只改 title/reason/suggestedPrompt，
 * 保留所有结构字段（uniqueKey/source/riskLevel/relatedPlan/relatedContent/status/createdBy）。
 * 缺失润色的草稿原样保留——规则兜底永不丢失。
 */
export const mergeSuggestionEnhancements = (
  drafts: AgentSuggestionDraft[],
  enhancements: SuggestionEnhancement[],
): AgentSuggestionDraft[] => {
  const byKey = new Map(enhancements.map((enhancement) => [enhancement.uniqueKey, enhancement]));

  return drafts.map((draft) => {
    const enhancement = byKey.get(draft.uniqueKey);

    if (!enhancement) {
      return draft;
    }

    return {
      ...draft,
      reason: enhancement.reason ?? draft.reason,
      suggestedPrompt: enhancement.suggestedPrompt ?? draft.suggestedPrompt,
      title: enhancement.title ?? draft.title,
    };
  });
};

/**
 * 在规则草稿基础上叠加 LLM 重排/改写。LLM 不可用或解析失败时，原样返回规则草稿（兜底不回归）。
 */
export const enhanceSuggestionsWithLLM = async (
  drafts: AgentSuggestionDraft[],
  deps: SuggestionEnhancerDeps = {},
): Promise<AgentSuggestionDraft[]> => {
  if (drafts.length === 0) {
    return drafts;
  }

  const complete = deps.complete ?? completeStructured;
  const result = await complete({
    messages: [
      { role: "system", content: SUGGESTION_ENHANCER_SYSTEM_PROMPT },
      { role: "user", content: buildSuggestionEnhancerUserPrompt(drafts) },
    ],
    parse: parseSuggestionEnhancements,
    temperature: 0.5,
  });

  if (!result?.data) {
    return drafts;
  }

  return mergeSuggestionEnhancements(drafts, result.data);
};
