/**
 * Phase R5-A: Tool Planner Unavailable Response Builders.
 *
 * When AGENT_REQUIRE_LLM=1 and the Tool Planner cannot produce a valid result,
 * these builders produce controlled responses that DO NOT fall through to
 * heuristic business paths.
 *
 * Safety invariants:
 *  - No pendingAction
 *  - No dryRun / execute
 *  - No DB write
 *  - backendTraceEvents included for developer observability
 *  - User-facing message is natural, no internal enums / raw JSON exposed
 */

import type { AgentChatResponse } from "../schemas";
import type { AgentTraceEventPayload } from "../trace/types";

/* ──── Reason types ──── */

export type AgentToolPlannerUnavailableReason =
  | "tool_planner_disabled"
  | "tool_planner_invalid_plan"
  | "tool_planner_unsupported_tool"
  | "tool_planner_low_confidence"
  | "tool_planner_missing_information"
  | "tool_planner_failed";

/* ──── User-visible messages ──── */

const USER_MESSAGES: Record<AgentToolPlannerUnavailableReason, string> = {
  tool_planner_disabled:
    "当前 Agent 已切换到 LLM 工具规划模式，但工具规划器暂不可用。请检查 Agent 配置后重试。",
  tool_planner_invalid_plan:
    "LLM 工具规划器未能生成有效的工具计划。请尝试用更具体的方式描述你的需求。",
  tool_planner_unsupported_tool:
    "你请求的操作目前不在 LLM 工具规划器的支持范围内。请尝试用其他方式描述，或使用已支持的操作类型。",
  tool_planner_low_confidence:
    "LLM 工具规划器对当前请求的置信度不足，无法安全地生成工具计划。请提供更多细节后重试。",
  tool_planner_missing_information:
    "我还需要确认一些信息，才能继续生成工具计划。",
  tool_planner_failed:
    "LLM 工具规划器在处理你的请求时遇到了问题。请稍后重试，或调整你的描述方式。",
};

/* ──── Developer trace titles ──── */

const TRACE_TITLES: Record<AgentToolPlannerUnavailableReason, string> = {
  tool_planner_disabled: "Tool Planner 未启用",
  tool_planner_invalid_plan: "Tool Plan 验证未通过",
  tool_planner_unsupported_tool: "不支持的工具操作",
  tool_planner_low_confidence: "Tool Plan 置信度不足",
  tool_planner_missing_information: "Tool Planner 信息不足",
  tool_planner_failed: "Tool Planner 执行失败",
};

/* ──── Input / Output ──── */

export type BuildToolPlannerUnavailableResponseInput = {
  detail?: string;
  reason: AgentToolPlannerUnavailableReason;
  threadId: number | string;
};

/**
 * Build a controlled AgentChatResponse for when the Tool Planner is unavailable
 * or cannot produce a valid result in LLM-required mode.
 */
export const buildToolPlannerUnavailableAgentResponse = (
  input: BuildToolPlannerUnavailableResponseInput,
): AgentChatResponse => {
  const traceEvent: AgentTraceEventPayload = {
    createdAt: new Date().toISOString(),
    outputPreview: {
      detail: input.detail ?? null,
      reason: input.reason,
      source: "tool_planner",
    },
    phase: "tool_planner_unavailable",
    status: "failed",
    summary: USER_MESSAGES[input.reason],
    threadId: String(input.threadId),
    title: TRACE_TITLES[input.reason],
  };

  return {
    assistantMessage: USER_MESSAGES[input.reason],
    backendTraceEvents: [traceEvent],
    confidence: 0.5,
    engine: "workflow",
    intent: "clarify",
    pendingAction: null,
    threadId: typeof input.threadId === "string" ? parseInt(input.threadId, 10) : input.threadId,
    tokenUsage: {
      contextTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      source: "estimate" as const,
      totalTokens: 0,
    },
  };
};

/* ──── R5-C: Capability Answer ──── */

const CAPABILITY_ANSWER_MESSAGE = `我现在可以帮你做以下几类事情：

**查询类（只读，不写入）：**
• 查询计划进展 — 查看计划完成情况、阶段进度
• 查询日程 — 查看今天、本周、下周的日程安排

**草案类（生成预览，不写入）：**
• 生成计划草案 — 为你的目标制定计划框架
• 生成日程草案 — 为你的日常安排生成时间线预览
• 生成时间线事件草案 — 记录和展示时间线节点

**写入类（需要先生成预览，你确认后才执行）：**
• 创建计划 — 将计划草案保存为正式计划
• 创建清单 — 将任务拆解为可跟踪的检查清单
• 创建日程项 — 将日程草案保存到你的日程表

写入操作必须经过：预览 → 安全检查 → 你的明确确认 → 执行 → 记录凭证。
部分操作支持撤销（回滚），具体取决于操作类型。

我不会：自动执行写入、绕过确认、或承诺所有操作都可回滚。`;

export type BuildCapabilityAnswerResponseInput = {
  threadId: number | string;
};

/**
 * Build a controlled capability answer response.
 *
 * This is a RESPONSE-ONLY path — no tool execution, no pendingAction,
 * no DB write, no Policy Guard, no regex capability router.
 */
export const buildCapabilityAnswerResponse = (
  input: BuildCapabilityAnswerResponseInput,
): AgentChatResponse => {
  const traceEvent: AgentTraceEventPayload = {
    createdAt: new Date().toISOString(),
    outputPreview: { source: "capability_answer", responseType: "controlled_static" },
    phase: "tool_planning",
    status: "success",
    summary: "Returned controlled capability answer — not a heuristic fallback.",
    threadId: String(input.threadId),
    title: "能力说明",
  };

  return {
    assistantMessage: CAPABILITY_ANSWER_MESSAGE,
    backendTraceEvents: [traceEvent],
    confidence: 0.9,
    engine: "workflow",
    intent: "answer_question",
    pendingAction: null,
    threadId: typeof input.threadId === "string" ? parseInt(input.threadId, 10) : input.threadId,
    tokenUsage: {
      contextTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      source: "estimate" as const,
      totalTokens: 0,
    },
  };
};

/* ──── R6-C1-B: Legacy Heuristic Retired ──── */

const LEGACY_HEURISTIC_RETIRED_MESSAGE =
  "当前 Agent 已切换到 LLM 工具规划模式，旧的规则式意图解析路径已停用。请确保 LLM Tool Planner 已启用后重试。";

export type BuildLegacyHeuristicRetiredInput = { threadId: number | string };

export const buildLegacyHeuristicRetiredResponse = (
  input: BuildLegacyHeuristicRetiredInput,
): AgentChatResponse => {
  return {
    assistantMessage: LEGACY_HEURISTIC_RETIRED_MESSAGE,
    backendTraceEvents: [{
      createdAt: new Date().toISOString(),
      outputPreview: { reason: "legacy_heuristic_business_path_retired", source: "legacy_heuristic_resolution_step" },
      phase: "tool_planner_unavailable",
      status: "warning",
      summary: "Legacy heuristic intent aggregator retired.",
      threadId: String(input.threadId),
      title: "旧规则路径已停用",
    }],
    confidence: 0.5,
    engine: "workflow",
    intent: "clarify",
    pendingAction: null,
    threadId: typeof input.threadId === "string" ? parseInt(input.threadId, 10) : input.threadId,
    tokenUsage: { contextTokens: 0, inputTokens: 0, outputTokens: 0, source: "estimate" as const, totalTokens: 0 },
  };
};
