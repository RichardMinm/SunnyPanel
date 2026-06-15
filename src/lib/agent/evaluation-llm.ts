import {
  completeStructured,
  type CompleteStructuredOptions,
  type StructuredLLMResult,
} from "./llm/complete-structured";

export type EvaluationEnhancementInput = {
  health: "attention" | "healthy" | "risk";
  metrics: Record<string, number | string>;
  recommendations: string[];
  scope: "overall" | "plan";
  summary: string;
};

export type EvaluationEnhancement = {
  recommendations?: string[];
  summary?: string;
};

export type EvaluationEnhancerDeps = {
  complete?: (
    options: CompleteStructuredOptions<EvaluationEnhancement>,
  ) => Promise<StructuredLLMResult<EvaluationEnhancement> | null>;
};

const EVALUATION_ENHANCER_SYSTEM_PROMPT = `你是 SunnyPanel 的计划评估增强器。你会收到一份由阈值规则生成的评估草稿（指标 + 规则结论 + 规则建议）。
你的任务：在规则诊断的基础上做语义增强，让 summary 更连贯、建议更具体可执行。

硬性要求：
- 不要推翻规则给出的健康度（health）或指标（metrics），也不要编造草稿里没有的数字。
- recommendations 要保留规则覆盖的硬风险（逾期、阻塞、失败、缺 AgentBrief 等），可重写措辞、合并重复、补一条最关键的下一步。
- summary 是一句到两句话的自然总结，先给结论再给最关键的下一步。

只输出 JSON：
{"summary":"...","recommendations":["...","..."]}`;

export const buildEvaluationEnhancerUserPrompt = (input: EvaluationEnhancementInput): string =>
  JSON.stringify(
    {
      health: input.health,
      metrics: input.metrics,
      ruleBasedRecommendations: input.recommendations,
      ruleBasedSummary: input.summary,
      scope: input.scope,
    },
    null,
    2,
  );

export const parseEvaluationEnhancement = (value: unknown): EvaluationEnhancement | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" && record.summary.trim().length > 0 ? record.summary.trim() : undefined;
  const recommendations = Array.isArray(record.recommendations)
    ? record.recommendations.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : undefined;

  if (!summary && (!recommendations || recommendations.length === 0)) {
    return null;
  }

  return {
    ...(recommendations && recommendations.length > 0 ? { recommendations } : {}),
    ...(summary ? { summary } : {}),
  };
};

/**
 * 纯合并：把 LLM 增强叠加到规则评估上。只覆盖 summary 与 recommendations，
 * health/metrics/scope 等规则结论保持不变（规则兜底）。
 */
export const mergeEvaluationEnhancement = <T extends EvaluationEnhancementInput>(
  ruleBased: T,
  enhancement: EvaluationEnhancement | null,
): T => {
  if (!enhancement) {
    return ruleBased;
  }

  return {
    ...ruleBased,
    ...(enhancement.recommendations && enhancement.recommendations.length > 0
      ? { recommendations: enhancement.recommendations }
      : {}),
    ...(enhancement.summary ? { summary: enhancement.summary } : {}),
  };
};

/**
 * 在阈值规则评估基础上叠加 LLM 语义诊断。LLM 不可用或解析失败时返回 null，调用方应回退到规则结论。
 */
export const enhanceEvaluationWithLLM = async (
  input: EvaluationEnhancementInput,
  deps: EvaluationEnhancerDeps = {},
): Promise<EvaluationEnhancement | null> => {
  const complete = deps.complete ?? completeStructured;
  const result = await complete({
    messages: [
      { role: "system", content: EVALUATION_ENHANCER_SYSTEM_PROMPT },
      { role: "user", content: buildEvaluationEnhancerUserPrompt(input) },
    ],
    parse: parseEvaluationEnhancement,
    temperature: 0.4,
  });

  return result?.data ?? null;
};
