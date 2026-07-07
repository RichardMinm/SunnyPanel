import { completeStructured } from "@/lib/agent/llm/complete-structured";
import type { StructuredLLMMessage } from "@/lib/agent/llm/complete-structured";
import type { ClarificationComposerInput, ClarificationComposerOutput } from "./types";
import { composeClarificationFallback } from "./fallback-composer";
import { validateClarificationOutput } from "./validate-output";
import { isClarificationComposerLLMEnabled } from "./feature-flag";

/* ──── LLM Output Schema (for structured parsing) ──── */

type LLMClarificationOutput = {
  message: string;
  questions: string[];
  safetyNote: string;
  suggestedReply: string;
};

const parseLLMOutput = (raw: unknown): LLMClarificationOutput | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const message = typeof obj.message === "string" ? obj.message.trim() : "";
  if (!message) return null;

  const questions = Array.isArray(obj.questions)
    ? obj.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : [];

  const safetyNote = typeof obj.safetyNote === "string" ? obj.safetyNote.trim() : "";
  if (!safetyNote) return null;

  const suggestedReply = typeof obj.suggestedReply === "string" ? obj.suggestedReply.trim() : "";

  return { message, questions, safetyNote, suggestedReply };
};

/* ──── Prompt Builder ──── */

const buildLLMPrompt = (input: ClarificationComposerInput): StructuredLLMMessage[] => {
  const entity = input.workflow === "schedule_creation" ? "日程" : "计划";
  const goalLine = input.userGoalSummary
    ? `用户目标：${input.userGoalSummary}`
    : `用户消息：${input.userMessage.slice(0, 200)}`;

  const knownBlock = input.knownFacts.length > 0
    ? `\n已知信息：\n${input.knownFacts.map((f) => `- ${f}`).join("\n")}`
    : "";

  const needsBlock = input.missingNeeds
    .slice(0, input.maxQuestions)
    .map((n, i) => {
      let line = `${i + 1}. ${n.label}`;
      if (n.examples && n.examples.length > 0) {
        line += `（比如：${n.examples.join("、")}）`;
      }
      return line;
    })
    .join("\n");

  const systemPrompt = [
    `你是 Sunny，一个 AI 原生个人工作台的助手。用户正在请求创建${entity}，但信息还不足够。`,
    "",
    "你需要生成一段**柔和、简洁、有帮助感**的中文回复，帮助用户补充缺失的信息。",
    "",
    "回复要求：",
    `1. 先说明当前不会直接写入${entity}（安全边界）`,
    `2. 简要重述用户目标（让对方感到被理解）`,
    `3. 提出最多 ${input.maxQuestions} 个核心问题（编号列表）`,
    "4. 给一个用户可以直接复制的示例回复",
    `5. 最后说明下一步会先生成${entity}草案，暂时不会写入`,
    "",
    "严格规则：",
    "- 使用中文",
    "- 不要使用表格",
    "- 不要长篇解释",
    "- 不要暴露内部字段名（sourceType, missingSlots, conflictPolicy 等）",
    "- 不要承诺已经写入",
    "- 不要展示推理过程",
    "- 返回严格 JSON，格式：{\"message\": \"...\", \"questions\": [\"...\"], \"safetyNote\": \"...\", \"suggestedReply\": \"...\"}",
    `- questions 最多 ${input.maxQuestions} 个`,
  ].join("\n");

  const userPrompt = [
    goalLine,
    knownBlock,
    needsBlock ? `\n需要确认的问题：\n${needsBlock}` : "",
    `\n请生成自然的澄清回复。JSON:`,
  ].join("\n");

  return [
    { content: systemPrompt, role: "system" },
    { content: userPrompt, role: "user" },
  ];
};

/* ──── Main Composer ──── */

/**
 * Compose a clarification message using LLM.
 *
 * Falls back to the deterministic fallback composer when:
 * - AGENT_DISABLE_LLM=1
 * - AGENT_LLM_CLARIFICATION_COMPOSER=0
 * - LLM call fails
 * - LLM returns invalid JSON
 * - LLM output fails validation
 */
export const composeClarificationWithLLM = async (
  input: ClarificationComposerInput,
): Promise<ClarificationComposerOutput> => {
  /* ── Feature flag check ── */
  if (!isClarificationComposerLLMEnabled()) {
    return composeClarificationFallback(input);
  }

  /* ── Try LLM ── */
  try {
    const messages = buildLLMPrompt(input);
    const result = await completeStructured({
      messages,
      parse: parseLLMOutput,
      temperature: 0.7,
    });

    if (!result?.data) {
      return composeClarificationFallback(input);
    }

    /* ── Validate LLM output ── */
    const validated = validateClarificationOutput(
      {
        ...result.data,
        source: "llm",
      },
      input,
    );

    if (!validated) {
      return composeClarificationFallback(input);
    }

    return validated;
  } catch {
    return composeClarificationFallback(input);
  }
};
