import type { AgentIntent } from "../../schemas";
import {
  capabilityKeywords,
  queryChecklistKeywords,
  queryMemoryKeywords,
  queryPlanKeywords,
  queryScheduleKeywords,
  queryTimelineKeywords,
  queryPattern,
  writeVerbsPattern,
} from "./keywords";

/* ── CREATE exclusion pattern (blocks query for create intents) ── */

const createSchedulePattern = /(加一条|加一个|添加|创建|新建|安排一个|安排一场|安排一下|全天|每天早上|每天.*安排|下周.*每天|帮我加|帮我添加|加到|排到|排入|安排到)/;

const createChecklistPattern = /(做成一个清单|做成清单|生成清单|创建清单|拆成清单|列成清单|做一个清单|生成一个清单)/;

const createTimelinePattern = /(记一笔|记录一下|帮我记下来|帮我记[^得]|今天完成了.*帮我|我完成了.*帮我|[，,]帮我记)/;

/* ── capability_query ───────────────────────────── */

export const parseCapabilityQueryIntent = (message: string): AgentIntent | null => {
  const hasCapabilityKeyword =
    capabilityKeywords.some((kw) => {
      if (kw.includes(".*")) return new RegExp(kw).test(message);
      return message.includes(kw);
    }) ||
    /(是否|能不能|可以|支持).{0,12}(删除|修改|创建|新建|使用|操作).{0,3}[吗?？]/.test(message) ||
    (/吗[?？]?\s*$/.test(message) && /(可以|能|支持|会|有没有)/.test(message));

  if (!hasCapabilityKeyword) return null;

  return {
    args: { answer: "我理解你在询问功能。让我帮你说明一下。" },
    confidence: 0.88,
    intent: "capability_query",
  };
};

/* ── create_checklist ───────────────────────────── */

export const parseCreateChecklistIntent = (message: string): AgentIntent | null => {
  if (createChecklistPattern.test(message)) {
    return {
      args: { sourceText: message },
      confidence: 0.72,
      intent: "compose_plan",
    };
  }
  return null;
};

/* ── create_timeline ────────────────────────────── */

export const parseCreateTimelineIntent = (message: string): AgentIntent | null => {
  if (createTimelinePattern.test(message)) {
    return {
      args: {
        eventDate: new Date().toISOString().split("T")[0],
        sourceText: message,
      },
      confidence: 0.75,
      intent: "compose_timeline_event",
    };
  }
  return null;
};

/* ── query_schedule ─────────────────────────────── */

export const parseQueryScheduleIntent = (message: string): AgentIntent | null => {
  // Block create intents first
  if (createSchedulePattern.test(message)) return null;

  const hasQueryKeyword = queryScheduleKeywords.some((kw) => message.includes(kw));

  const isTemporalQuery =
    /(今天|明天|后天|本周|这周|下周|\d+月\d+[号日]|\d+月\d+)/.test(message) &&
    /(有什么|有哪些|安排|日程|事情|计划|什么事|什么事)/.test(message) &&
    !writeVerbsPattern.test(message);

  if (!hasQueryKeyword && !isTemporalQuery) return null;
  if (writeVerbsPattern.test(message)) return null;

  return {
    args: {},
    confidence: hasQueryKeyword ? 0.85 : 0.65,
    intent: "query_schedule",
  };
};

/* ── query_plan ─────────────────────────────────── */

export const parseQueryPlanIntent = (message: string): AgentIntent | null => {
  const hasQueryKeyword = queryPlanKeywords.some((kw) => message.includes(kw));

  const isPlanQuery =
    /(有哪些|进行中|查看|看看|看下|什么|哪些|怎么样)/.test(message) &&
    /(计划|进展|进度)/.test(message) &&
    !writeVerbsPattern.test(message);

  if (!hasQueryKeyword && !isPlanQuery) return null;
  if (writeVerbsPattern.test(message)) return null;

  return {
    args: {},
    confidence: hasQueryKeyword ? 0.85 : 0.62,
    intent: "query_plan",
  };
};

/* ── query_checklist_progress ───────────────────── */

export const parseQueryChecklistProgressIntent = (message: string): AgentIntent | null => {
  const hasQueryKeyword = queryChecklistKeywords.some((kw) => message.includes(kw));

  const isChecklistQuery =
    /(清单|还剩|做了多少|完成了多少|完成率)/.test(message) &&
    queryPattern.test(message) &&
    !writeVerbsPattern.test(message);

  if (!hasQueryKeyword && !isChecklistQuery) return null;
  if (writeVerbsPattern.test(message)) return null;

  return {
    args: {},
    confidence: hasQueryKeyword ? 0.85 : 0.6,
    intent: "query_checklist_progress",
  };
};

/* ── query_timeline ─────────────────────────────── */

export const parseQueryTimelineIntent = (message: string): AgentIntent | null => {
  // Block create timeline intents
  if (createTimelinePattern.test(message)) return null;

  const hasQueryKeyword = queryTimelineKeywords.some((kw) => message.includes(kw));

  const isTimelineQuery =
    /(最近|近期|过去|这周|本周|这个月).{0,8}(完成|做了|完成哪些|完成了哪些|进展|事情|记录|哪些事情)/.test(message) &&
    !writeVerbsPattern.test(message);

  if (!hasQueryKeyword && !isTimelineQuery) return null;
  if (writeVerbsPattern.test(message)) return null;

  return {
    args: {},
    confidence: hasQueryKeyword ? 0.82 : 0.58,
    intent: "query_timeline",
  };
};

/* ── query_memory ───────────────────────────────── */

export const parseQueryMemoryIntent = (message: string): AgentIntent | null => {
  const hasQueryKeyword = queryMemoryKeywords.some((kw) => message.includes(kw));

  const isMemoryQuery =
    /(有什么|什么|哪些).{0,6}(习惯|偏好|记忆)/.test(message) &&
    !writeVerbsPattern.test(message);

  if (!hasQueryKeyword && !isMemoryQuery) return null;
  if (writeVerbsPattern.test(message)) return null;

  return {
    args: { answer: "让我帮你查找相关记忆。" },
    confidence: hasQueryKeyword ? 0.82 : 0.58,
    intent: "query_memory",
  };
};
