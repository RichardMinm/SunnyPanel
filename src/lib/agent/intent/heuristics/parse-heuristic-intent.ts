import { createClarifyIntent, type AgentIntent } from "../../schemas";
import type { HeuristicCandidate } from "./index";
import { weeklyReviewKeywords } from "./keywords";
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
  { parse: parseComposePlanIntent, source: "compose_plan" },
  { parse: parseComposeScheduleItemIntent, source: "compose_schedule_item" },
  { parse: parseCreatePlanIntent, source: "create_plan" },
  { parse: parseAppendPlanItemIntent, source: "append_plan_item" },
  { parse: parseSaveMemoryIntent, source: "save_memory" },
  { parse: parseExplicitNoteIntent, source: "explicit_note" },
  { parse: parseCompleteItemIntent, source: "complete_plan_item" },
  { parse: parseKnowledgeAnswerIntent, source: "answer_question" },
  { parse: parseComposeTimelineEventIntent, source: "compose_timeline_event" },
  { parse: parseProgressIntent, source: "query_progress" },
  { parse: parseSchedulePlanIntent, source: "schedule_plan" },
  { parse: parseWeeklyReviewIntent, source: "weekly_review" },
  { parse: parseEvaluatePlanIntent, source: "evaluate_plan" },
];

const defaultClarifyIntent = createClarifyIntent(
  `我现在可以帮你创建计划、补计划项、标记清单条目完成、补完成备注、补时间线，也能查询进度和评估计划。你可以直接说\u201c帮我创建计划：\u2026\u2026\u201d，或者\u201c给这条更新补时间线节点\u201d。`,
);

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
    return defaultClarifyIntent;
  }

  const best = candidates[0];

  if (best.intent.intent === "clarify") {
    return best.intent;
  }

  if ((best.intent.confidence ?? 0) < HEURISTIC_CONFIDENCE_THRESHOLD) {
    return defaultClarifyIntent;
  }

  return best.intent;
};
