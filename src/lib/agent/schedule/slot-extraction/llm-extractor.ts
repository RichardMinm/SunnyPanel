import { completeStructured } from "@/lib/agent/llm/complete-structured";
import type { StructuredLLMMessage } from "@/lib/agent/llm/complete-structured";
import type { ScheduleSlotExtractionInput, ScheduleSlotExtractionOutput } from "./types";
import { isLLMSlotExtractorEnabled } from "./feature-flag";
import { validateSlotExtractionOutput } from "./validate-output";

/* ──── LLM Output Schema ──── */

type LLMSlotExtractionRaw = {
  confidence: number;
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    evidence?: string;
  }>;
  warnings?: string[];
};

const parseLLMOutput = (raw: unknown): LLMSlotExtractionRaw | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const confidence = typeof obj.confidence === "number" ? obj.confidence : 0.5;
  const candidates = Array.isArray(obj.candidates) ? obj.candidates : [];
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return { confidence, candidates, warnings };
};

/* ──── Prompt Builder ──── */

const buildPrompt = (input: ScheduleSlotExtractionInput): StructuredLLMMessage[] => {
  const systemPrompt = [
    "你是 Sunny Schedule Slot Extractor。你的唯一任务是从用户的中文自然语言中提取日程创建所需的 slot 信息。",
    "",
    "输出严格 JSON，不要 Markdown，不要解释，不要推理过程。",
    "",
    "格式：",
    '{"confidence": 0.9, "candidates": [{"key": "...", "value": ..., "confidence": 0.85, "evidence": "..."}]}',
    "",
    "你可以提取的 key：",
    "- deadline: 截止时间。值用 YYYY-MM-DD 或 relative label (today/tomorrow/this_week/next_week/this_month)",
    "- availableDays: 可安排日期。值为字符串数组，如 [\"周一\", \"周三\"] 或 [\"每天\", \"工作日\"]",
    "- availableTimeWindows: 可用时间段。值为对象数组，每个对象包含 startTime(HH:mm), endTime(HH:mm)，可选 day 或 label",
    "- dailyCapacity: 每日/每周可投入时间。值可以是字符串如\"每天 2 小时\"，或对象 {minutes: 120, frequency: \"daily\"}",
    "- preferredTime: 偏好时间。值为字符串，如 \"晚上\", \"上午\", \"周末\"",
    "- conflictPolicy: 冲突策略。值必须是 ask | skip | allow-overlap | reschedule 之一",
    "- priorityRule: 优先级规则。值为描述性字符串",
    "- durationEstimate: 任务时长估计。值可以是字符串如\"约 30 分钟\"，或对象 {minutes: 30}",
    "- scheduleGranularity: 日程粒度。值必须是 day | time-block | unscheduled 之一",
    "- excludedDates: 排除日期。值为字符串数组",
    "",
    "规则：",
    "- 每个 candidate 必须有 key, value, confidence, evidence",
    "- 时间格式必须是 HH:mm（如 20:00）",
    "- 日期格式必须是 YYYY-MM-DD（如 2026-07-06）",
    "- conflictPolicy 只能是 ask / skip / allow-overlap / reschedule",
    "- confidence 范围 0-1",
    "- evidence 是从用户消息中引用的原文片段",
    "- 没有把握的 slot 不要输出",
    "- 不要猜测 sourcePlanId / sourceChecklistId / sourceType",
    "- 不要输出 execute / write / save / pendingAction / create 等执行指令",
    "- 如果用户消息中没有明确的 slot 信息，返回空 candidates 数组",
    "- low confidence (<0.65) 也输出，让 validator 决定是否丢弃",
  ].join("\n");

  const userPrompt = [
    `当前日期：${input.currentDate}`,
    `用户消息：${input.userMessage}`,
    "",
    "请提取 slots:",
  ].join("\n");

  return [
    { content: systemPrompt, role: "system" },
    { content: userPrompt, role: "user" },
  ];
};

/**
 * Try to extract schedule slots from user message using LLM.
 *
 * Falls back to returning a fallback output when:
 * - Feature flag is OFF
 * - AGENT_DISABLE_LLM=1
 * - LLM call fails
 * - LLM output fails validation
 *
 * The fallback output has source="fallback" and empty candidates,
 * which tells the merge function to use deterministic-only slots.
 */
export const extractSlotsWithLLM = async (
  input: ScheduleSlotExtractionInput,
): Promise<ScheduleSlotExtractionOutput> => {
  if (!isLLMSlotExtractorEnabled()) {
    return { candidates: [], confidence: 0, source: "fallback" };
  }

  try {
    const messages = buildPrompt(input);
    const result = await completeStructured({
      messages,
      parse: parseLLMOutput,
      temperature: 0.2,
    });

    if (!result?.data) {
      return { candidates: [], confidence: 0, source: "fallback" };
    }

    const validated = validateSlotExtractionOutput(result.data, input);
    if (!validated) {
      return { candidates: [], confidence: 0, source: "fallback" };
    }

    return validated;
  } catch {
    return { candidates: [], confidence: 0, source: "fallback" };
  }
};
