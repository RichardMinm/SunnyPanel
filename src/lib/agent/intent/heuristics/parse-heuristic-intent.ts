import { createClarifyIntent, type AgentIntent } from "../../schemas";
import type { HeuristicCandidate } from "./index";
import { weeklyReviewKeywords, queryPattern, writeVerbsPattern } from "./keywords";
import { parseCompleteItemIntent, parseExplicitNoteIntent } from "./checklist";
import { parseKnowledgeAnswerIntent } from "./knowledge";
import { parseSaveMemoryIntent } from "./memory";
import {
  parseAppendPlanItemIntent,
  parseComposePlanIntent,
  parseComposeScheduleItemIntent,
  parseCreatePlanIntent,
  parseSchedulePlanIntent,
} from "./plan-schedule";
import { parseEvaluatePlanIntent, parseProgressIntent } from "./progress-review";
import { parseComposeTimelineEventIntent } from "./timeline";
import {
  parseCapabilityQueryIntent,
  parseCreateChecklistIntent,
  parseCreateTimelineIntent,
  parseQueryScheduleIntent,
  parseQueryPlanIntent,
  parseQueryChecklistProgressIntent,
  parseQueryTimelineIntent,
  parseQueryMemoryIntent,
} from "./query";
import { parseDeleteRecordIntent, parseModifyRecordIntent } from "./delete-update";

const HEURISTIC_CONFIDENCE_THRESHOLD = 0.3;

const parseWeeklyReviewIntent = (message: string): AgentIntent | null => {
  const mentionsWeek =
    weeklyReviewKeywords.some((keyword) => message.includes(keyword)) ||
    (message.includes("本周") && /(回顾|复盘|执行情况|计划执行|总结)/.test(message));

  if (!mentionsWeek) {
    return null;
  }

  const wantsPreviewOnly = /(预览|看看|看下|看一下|只看|先看|不要保存|不保存|不写入|纯预览)/.test(message);
  const skipSuggestions = /(不要建议|不生成建议|不创建建议|不要生成建议)/.test(message);

  return {
    args: {
      createSuggestions: !skipSuggestions,
      persistReview: !wantsPreviewOnly,
    },
    confidence: 0.72,
    intent: "weekly_review",
  };
};

type HeuristicParser = {
  parse: (message: string) => AgentIntent | null;
  source: string;
};

const heuristicParsers: HeuristicParser[] = [
  /* ── Create (before query — "安排/创建/加一条" → write, not query) ── */
  { parse: parseCreateChecklistIntent, source: "create_checklist" },
  { parse: parseCreateTimelineIntent, source: "create_timeline" },
  /* ── Query-first (highest priority for read intents) ── */
  { parse: parseCapabilityQueryIntent, source: "capability_query" },
  { parse: parseQueryScheduleIntent, source: "query_schedule" },
  { parse: parseQueryPlanIntent, source: "query_plan" },
  { parse: parseQueryChecklistProgressIntent, source: "query_checklist_progress" },
  { parse: parseQueryTimelineIntent, source: "query_timeline" },
  { parse: parseQueryMemoryIntent, source: "query_memory" },
  { parse: parseKnowledgeAnswerIntent, source: "answer_question" },
  { parse: parseProgressIntent, source: "query_progress" },
  { parse: parseWeeklyReviewIntent, source: "weekly_review" },
  { parse: parseEvaluatePlanIntent, source: "evaluate_plan" },
  /* ── Delete / cancel (higher than create/update) ── */
  { parse: parseDeleteRecordIntent, source: "delete_record" },
  { parse: parseCompleteItemIntent, source: "complete_plan_item" },
  /* ── Update / modify ── */
  { parse: parseModifyRecordIntent, source: "modify_record" },
  { parse: parseAppendPlanItemIntent, source: "append_plan_item" },
  { parse: parseSchedulePlanIntent, source: "schedule_plan" },
  /* ── Create ── */
  { parse: parseCreatePlanIntent, source: "create_plan" },
  { parse: parseSaveMemoryIntent, source: "save_memory" },
  { parse: parseExplicitNoteIntent, source: "explicit_note" },
  { parse: parseComposeTimelineEventIntent, source: "compose_timeline_event" },
  /* ── Compose (lowest write priority, narrow) ── */
  { parse: parseComposePlanIntent, source: "compose_plan" },
  { parse: parseComposeScheduleItemIntent, source: "compose_schedule_item" },
];

const defaultClarifyIntent = createClarifyIntent(
  `我现在可以帮你创建计划、补计划项、标记清单条目完成、补完成备注、补时间线，也能查询进度和评估计划。你可以直接说“帮我创建计划：……”，或者“给这条更新补时间线节点”。`,
);

const questionLikePattern = /[？?]$|什么是|是什么|什么叫|如何|怎么|为什么|吗/;

const fallbackClarifyIntent = (message: string): AgentIntent => {
  if (questionLikePattern.test(message.trim())) {
    return createClarifyIntent(
      "这看起来是咨询/知识类问题。若已配置 Agent LLM，我会优先直接回答；当前未命中明确规则时，请换一种说法，或检查 Admin → Agent Settings 中的模型配置。",
    );
  }

  return defaultClarifyIntent;
};

/**
 * 收集所有启发式解析器的候选结果，按置信度降序选择最佳匹配。
 * 若最高置信度低于阈值则 fallback 到 clarify。
 *
 * `clarify` 意图由特定解析器返回时表示"已识别意图类型但缺少必要参数"，
 * 此类 clarify 带有 missingFields，应保留而非被通用 fallback 替换。
 */
export const collectHeuristicCandidates = (message: string): HeuristicCandidate[] => {
  const candidates: HeuristicCandidate[] = [];

  for (const parser of heuristicParsers) {
    const intent = parser.parse(message);

    if (intent) {
      candidates.push({ intent, source: parser.source });
    }
  }

  candidates.sort((a, b) => (b.intent.confidence ?? 0) - (a.intent.confidence ?? 0));

  return candidates;
};

export const parseHeuristicIntent = (message: string): AgentIntent => {
  const candidates = collectHeuristicCandidates(message);

  if (candidates.length === 0) {
    return fallbackClarifyIntent(message);
  }

  const best = candidates[0];

  if (best.intent.intent === "clarify") {
    return best.intent;
  }

  /* ── Query-First Guard ──
     If the best heuristic match is a write intent (compose_*, create_*, update_*, delete_*)
     but the message looks like a query (has query patterns, no write verbs),
     check if a query candidate exists and prefer it. */
  const isWriteIntent = /^(compose_|create_|update_|save_|delete_|cancel_|append_|schedule_)/.test(best.intent.intent);
  if (isWriteIntent && queryPattern.test(message) && !writeVerbsPattern.test(message)) {
    // Find the best query candidate
    const queryCandidate = candidates.find((c) =>
      /^(query_|capability_query|answer_question|weekly_review|evaluate_plan|clarify)/.test(c.intent.intent),
    );
    if (queryCandidate && (queryCandidate.intent.confidence ?? 0) >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      return queryCandidate.intent;
    }
    // If no query candidate found but input looks like a pure query, rewrite to clarify
    // rather than executing a write
    if (!queryCandidate) {
      return createClarifyIntent("我理解你在查询信息。请告诉我你想查看什么：计划、日程、清单还是时间线？");
    }
  }

  if ((best.intent.confidence ?? 0) < HEURISTIC_CONFIDENCE_THRESHOLD) {
    return fallbackClarifyIntent(message);
  }

  return best.intent;
};
