export type ScheduleBoundaryIntent =
  | "ambiguous"
  | "query_schedule"
  | "revise_schedule_draft"
  | "schedule_creation";

export type ScheduleBoundarySource = "fallback" | "llm" | "rule";

export type ScheduleIntentBoundaryResult = {
  confidence: number;
  intent: ScheduleBoundaryIntent;
  readOrWrite: "read" | "unclear" | "write";
  reason: string;
  source: ScheduleBoundarySource;
};

export type ScheduleIntentBoundaryLlmIntent =
  | "ambiguous"
  | "create_schedule"
  | "query_schedule"
  | "revise_schedule_draft"
  | "schedule_creation";

export type ScheduleIntentBoundaryLlmResult = {
  confidence: number;
  intent: ScheduleIntentBoundaryLlmIntent;
  readOrWrite: "read" | "unclear" | "write";
  reason: string;
};

export type ScheduleIntentBoundaryLlmClassifier = (
  input: Pick<
    ClassifyScheduleIntentBoundaryInput,
    "hasPendingAction" | "hasSchedulingDraft" | "routerIntent" | "userMessage"
  >,
) => null | ScheduleIntentBoundaryLlmResult | undefined;

export type ClassifyScheduleIntentBoundaryInput = {
  hasPendingAction?: boolean;
  hasSchedulingDraft?: boolean;
  llmClassifier?: ScheduleIntentBoundaryLlmClassifier;
  llmEnabled?: boolean;
  routerIntent?: null | string;
  userMessage: string;
};

import { isAgentRequireLLMEnabled } from "../llm-required";

const WRITE_CONFIDENCE_THRESHOLD = 0.75;

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const hasScheduleNoun = (message: string): boolean =>
  /(日程|安排|任务|日历|schedule|calendar)/i.test(message);

const hasQuerySignal = (message: string): boolean =>
  /(查看|看看|查询|查一下|看一下|列出|展示|浏览)/.test(message) ||
  /(最近|近期).*(有什么|有哪些|排了哪些|安排|日程|任务)/.test(message) ||
  /(今天|明天|本周|这周|下周).*(有什么|有哪些)/.test(message) ||
  /(日程安排是什么|有什么日程|有哪些日程|我的日程安排)/.test(message);

const isScheduleNounPhrase = (message: string): boolean =>
  /^(我的)?日程安排$/.test(message) || /^最近(的)?日程(安排)?$/.test(message);

const hasDraftRevisionSignal = (message: string): boolean =>
  /(调整|修改|改到|改成|换到|移到|挪到|删除|移除|暂不安排|允许重叠|继续修改|改一下)/.test(message);

const hasExplicitCreateSignal = (message: string): boolean =>
  /(安排进日程|排进日程|排入日程|安排到.+日程|排到.+日程|创建日程|保存到日程|写入日程|生成日程草案|准备创建日程)/.test(message) ||
  /把.+安排到.+/.test(message) ||
  /把.+排到.+/.test(message) ||
  /(帮我|给我)?排一下/.test(message) ||
  /每天.+安排/.test(message) ||
  /每晚.+安排/.test(message) ||
  /每天.+排/.test(message);

const isLlmEnabled = (input: ClassifyScheduleIntentBoundaryInput): boolean =>
  input.llmEnabled ?? process.env.AGENT_DISABLE_LLM !== "1";

const normalizeLlmResult = (
  result: ScheduleIntentBoundaryLlmResult,
): ScheduleIntentBoundaryResult => {
  const confidence = Number.isFinite(result.confidence)
    ? Math.max(0, Math.min(1, result.confidence))
    : 0;

  if (result.intent === "query_schedule" && result.readOrWrite === "read") {
    return {
      confidence,
      intent: "query_schedule",
      readOrWrite: "read",
      reason: result.reason || "LLM 将日程意图判断为只读查询。",
      source: "llm",
    };
  }

  if (
    (result.intent === "create_schedule" || result.intent === "schedule_creation") &&
    result.readOrWrite === "write" &&
    confidence >= WRITE_CONFIDENCE_THRESHOLD
  ) {
    return {
      confidence,
      intent: "schedule_creation",
      readOrWrite: "write",
      reason: result.reason || "LLM 高置信度判断为创建日程。",
      source: "llm",
    };
  }

  if (
    result.intent === "revise_schedule_draft" &&
    result.readOrWrite === "write" &&
    confidence >= WRITE_CONFIDENCE_THRESHOLD
  ) {
    return {
      confidence,
      intent: "revise_schedule_draft",
      readOrWrite: "write",
      reason: result.reason || "LLM 高置信度判断为修改日程草案。",
      source: "llm",
    };
  }

  return {
    confidence,
    intent: "ambiguous",
    readOrWrite: "unclear",
    reason: result.reason || "LLM 分类置信度不足，不能升级为写入型日程操作。",
    source: "llm",
  };
};

export const classifyScheduleIntentBoundary = (
  input: ClassifyScheduleIntentBoundaryInput,
): ScheduleIntentBoundaryResult => {
  const message = normalize(input.userMessage);

  if (!message) {
    return {
      confidence: 0.3,
      intent: "ambiguous",
      readOrWrite: "unclear",
      reason: "用户消息为空，无法判断日程意图。",
      source: "fallback",
    };
  }

  // Query wins before write checks: "查看日程安排" uses 安排 as a noun.
  if ((hasScheduleNoun(message) && hasQuerySignal(message)) || isScheduleNounPhrase(message)) {
    return {
      confidence: 0.95,
      intent: "query_schedule",
      readOrWrite: "read",
      reason: "命中查看 / 查询日程规则，属于只读日程查询。",
      source: "rule",
    };
  }

  // R6-C2-D: Keyword/regex write-intent rules are gated behind AGENT_REQUIRE_LLM=0.
  // In LLM-required mode, only the LLM classifier (or query guard below) may produce
  // a non-ambiguous intent. Keyword guessing of write intents is retired.
  if (!isAgentRequireLLMEnabled()) {
    if (input.hasSchedulingDraft && hasDraftRevisionSignal(message)) {
      return {
        confidence: 0.88,
        intent: "revise_schedule_draft",
        readOrWrite: "write",
        reason: "已有日程草案且用户表达修改草案。",
        source: "rule",
      };
    }

    if (hasExplicitCreateSignal(message)) {
      return {
        confidence: 0.9,
        intent: "schedule_creation",
        readOrWrite: "write",
        reason: "命中明确安排 / 创建 / 写入日程规则。",
        source: "rule",
      };
    }
  }

  if (input.routerIntent === "query_schedule" && hasScheduleNoun(message)) {
    return {
      confidence: 0.85,
      intent: "query_schedule",
      readOrWrite: "read",
      reason: "Router 已识别为日程查询，且没有明确写入信号。",
      source: "rule",
    };
  }

  if (isLlmEnabled(input) && input.llmClassifier) {
    const result = input.llmClassifier({
      hasPendingAction: input.hasPendingAction,
      hasSchedulingDraft: input.hasSchedulingDraft,
      routerIntent: input.routerIntent,
      userMessage: input.userMessage,
    });
    if (result) {
      return normalizeLlmResult(result);
    }
  }

  return {
    confidence: hasScheduleNoun(message) ? 0.5 : 0.3,
    intent: "ambiguous",
    readOrWrite: "unclear",
    reason: hasScheduleNoun(message)
      ? "消息提到日程，但没有明确只读查询或写入创建信号。"
      : "没有足够日程信号。",
    source: "fallback",
  };
};
