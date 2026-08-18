import { z } from "zod";

import { invokeStructured } from "@/lib/agent/llm/invoke-structured";
import type { StructuredProviderAttemptObserver } from "@/lib/agent/llm/invoke-structured";
import { buildMessages } from "@/lib/agent/llm/message-builder";
import type { ModelConfig } from "@/lib/agent/llm/model-config";
import type { ModelFactory } from "@/lib/agent/llm/model-factory";
import { resolveAgentStructuredModelConfig } from "@/lib/agent/llm/resolve-agent-model-config";
import { buildStrictSchemaRepairInstruction } from "@/lib/agent/llm/schema-repair-instruction";
import type {
  ClarificationComposerInput,
  ClarificationComposerOutput,
} from "./types";
import { composeClarificationFallback } from "./fallback-composer";
import { validateClarificationOutput } from "./validate-output";
import { isClarificationComposerLLMEnabled } from "./feature-flag";

const clarificationShape = {
  message: z.string().trim().min(1).max(2_000),
  questions: z.array(z.string().trim().min(1).max(300)).max(5),
  safetyNote: z.string().trim().min(1).max(500),
  suggestedReply: z.string().trim().max(1_000),
};

export const clarificationComposerBaseSchema = z.object(clarificationShape);
export const clarificationComposerSchema = z.object(clarificationShape).strict();

const CLARIFICATION_TOP_LEVEL_FIELDS = Object.freeze(
  clarificationComposerSchema.keyof().options,
);

const CLARIFICATION_OUTPUT_EXAMPLE = {
  message: "我先不直接创建计划。为了生成合适的草案，请补充每天可投入的时间。",
  questions: ["每天可以投入多少时间？"],
  safetyNote: "下一步先生成草案，暂时不会写入。",
  suggestedReply: "每天两小时。",
} satisfies z.infer<typeof clarificationComposerSchema>;

export type ClarificationModelInvocationOptions = Readonly<{
  modelConfig?: ModelConfig;
  modelFactory?: ModelFactory;
  providerAttemptAuthorizer?: (attempt: number) => void;
  providerAttemptObserver?: StructuredProviderAttemptObserver;
  signal?: AbortSignal;
}>;

const CLARIFICATION_SYSTEM_RULES = `你是 SunnyPanel 的 Clarification Wording Specialist，只负责把确定性 Readiness 结果表达为柔和、简洁的中文澄清文案。
你不能改变缺失字段、Readiness 状态、用户目标或安全边界；不能创建计划或日程、调用工具或修改数据库。
不得输出内部字段名、execute、receipt、rollback、toolCall、hidden reasoning 或 raw reasoning。
只返回严格结构化对象，不要输出 Markdown 或额外说明。`;

export const buildClarificationMessages = (
  input: ClarificationComposerInput,
) => {
  const entity = input.workflow === "schedule_creation" ? "日程" : "计划";
  const needs = input.missingNeeds
    .slice(0, input.maxQuestions)
    .map((need, index) => {
      const examples = need.examples?.length
        ? `（例如：${need.examples.join("、")}）`
        : "";
      return `${index + 1}. ${need.label}${examples}`;
    })
    .join("\n");

  return buildMessages({
    domainContract: [
      `为${entity}创建请求生成澄清文案。`,
      `questions 最多 ${input.maxQuestions} 个。`,
      `必须明确当前不会直接写入${entity}，下一步先生成草案。`,
      "不得暴露 sourceType、missingSlots、conflictPolicy 等内部名称。",
      "suggestedReply 必须是用户可直接复制的简短示例。",
      `严格 JSON 对象必须且只能包含这些字段：${CLARIFICATION_TOP_LEVEL_FIELDS.join(", ")}。`,
      `合法结构示例：${JSON.stringify(CLARIFICATION_OUTPUT_EXAMPLE)}`,
    ].join("\n"),
    systemRules: CLARIFICATION_SYSTEM_RULES,
    userMessage: [
      input.userGoalSummary
        ? `用户目标：${input.userGoalSummary}`
        : `用户消息：${input.userMessage.slice(0, 500)}`,
      input.knownFacts.length > 0
        ? `已知信息：\n${input.knownFacts.map((fact) => `- ${fact}`).join("\n")}`
        : null,
      needs ? `需要确认：\n${needs}` : null,
      `确定性安全边界：当前不写入；下一步=${input.safetyBoundary.nextStep}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n"),
  });
};

/**
 * Optional wording-only enrichment. Readiness and write authority stay in
 * deterministic code; every model/protocol/schema failure returns the same
 * deterministic fallback response.
 */
export const composeClarificationWithLLM = async (
  input: ClarificationComposerInput,
  options: ClarificationModelInvocationOptions = {},
): Promise<ClarificationComposerOutput> => {
  if (!isClarificationComposerLLMEnabled()) {
    return composeClarificationFallback(input);
  }

  try {
    const modelConfig = options.modelConfig
      ?? await resolveAgentStructuredModelConfig(undefined, {
        maxOutputTokens: 2_048,
        maxRetries: 0,
        temperature: 0.7,
        timeoutMs: 30_000,
      });
    if (!modelConfig) return composeClarificationFallback(input);

    const result = await invokeStructured({
      maxSchemaRetries: 1,
      maxTransportRetries: 1,
      messages: buildClarificationMessages(input),
      modelConfig,
      modelFactory: options.modelFactory,
      modelSchema: clarificationComposerBaseSchema,
      providerAttemptAuthorizer: options.providerAttemptAuthorizer,
      providerAttemptObserver: options.providerAttemptObserver,
      schema: clarificationComposerSchema,
      schemaRepairInstruction: (issues) =>
        buildStrictSchemaRepairInstruction(
          {
            allowedFields: CLARIFICATION_TOP_LEVEL_FIELDS,
            contractName: "ClarificationWording",
          },
          issues,
        ),
      schemaName: "ClarificationWording",
      signal: options.signal,
      tags: ["agent", "clarification", "wording"],
    });
    if (!result.ok) return composeClarificationFallback(input);

    return validateClarificationOutput(
      { ...result.data, source: "llm" },
      input,
    ) ?? composeClarificationFallback(input);
  } catch {
    return composeClarificationFallback(input);
  }
};
