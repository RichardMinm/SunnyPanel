import type { AgentIntent } from "../../schemas";
import { evaluationKeywords, progressKeywords } from "./keywords";
import { cleanupPlanTitle, cleanupText } from "./shared-text";

export const parseProgressIntent = (message: string): AgentIntent | null => {
  const keyword = progressKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const beforeKeyword = cleanupText(message.slice(0, message.indexOf(keyword)));
  const maybeChecklistTitle = cleanupText(
    beforeKeyword
      .replace(/^(帮我|请|看一下|看下|看看|查询|查一下|查)/, "")
      .replace(/的$/, ""),
  );

  return {
    args: {
      checklistTitle:
        maybeChecklistTitle && !["整体", "总体", "全部", "计划", "清单"].includes(maybeChecklistTitle)
          ? maybeChecklistTitle
          : null,
      scope: message.includes("清单") ? "checklists" : message.includes("计划") ? "plans" : "all",
    },
    confidence: 0.5,
    intent: "query_progress",
  };
};

export const parseEvaluatePlanIntent = (message: string): AgentIntent | null => {
  const keyword = evaluationKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const afterKeyword = cleanupText(message.slice(message.indexOf(keyword) + keyword.length));
  const beforeKeyword = cleanupText(message.slice(0, message.indexOf(keyword)));
  const candidate = cleanupPlanTitle(
    (afterKeyword || beforeKeyword)
      .replace(/^(帮我|请|一下|整体|总体|全部)/, "")
      .replace(/(这个计划|这项计划|计划)$/, ""),
  );

  return {
    args: {
      planTitle: candidate && !["整体", "总体", "全部"].includes(candidate) ? candidate : null,
    },
    confidence: 0.5,
    intent: "evaluate_plan",
  };
};
