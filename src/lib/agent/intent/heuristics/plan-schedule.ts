import { createClarifyIntent, type AgentIntent } from "../../schemas";
import {
  appendItemKeywords,
  composePlanKeywords,
  createPlanKeywords,
  scheduleComposerKeywords,
  schedulePlanKeywords,
} from "./keywords";
import { cleanupPlanTitle, cleanupText, parseChecklistGroupMention } from "./shared-text";

export const parseCreatePlanIntent = (message: string): AgentIntent | null => {
  const keyword = createPlanKeywords.find((item) => {
    if (item.includes(".*")) return new RegExp(item).test(message);
    return message.includes(item);
  });

  if (!keyword) {
    return null;
  }

  const matchIndex = keyword.includes(".*") ? (message.match(new RegExp(keyword))?.index ?? 0) : message.indexOf(keyword);
  const remainder = cleanupText(message.slice(matchIndex + keyword.length));

  if (!remainder) {
    return createClarifyIntent("你想创建的计划标题是什么？最好直接给我一句明确标题。", ["title"]);
  }

  const [titlePart, ...descriptionParts] = remainder.split(/[，；;]/);
  const title = cleanupPlanTitle(titlePart);

  if (!title) {
    return createClarifyIntent("我还没抓到这条计划的标题。你可以直接说一句计划名。", ["title"]);
  }

  const description = descriptionParts.join("，").trim();

  return {
    args: {
      description: description || null,
      title,
    },
    confidence: 0.55,
    intent: "create_plan",
  };
};

export const parseComposePlanIntent = (message: string): AgentIntent | null => {
  const keyword = composePlanKeywords.find((item) => message.includes(item));

  if (keyword) {
    const remainder = cleanupText(message.slice(message.indexOf(keyword) + keyword.length));

    return {
      args: {
        sourceText: remainder || message,
      },
      confidence: 0.72,
      intent: "compose_plan",
    };
  }

  return null;
};

export const parseComposeScheduleItemIntent = (message: string): AgentIntent | null => {
  const hasKeyword =
    scheduleComposerKeywords.some((keyword) => message.includes(keyword)) ||
    (/(今天|明天|今晚|明早|下周[一二三四五六日天])/.test(message) && /(安排到|加到|创建|新建|添加|排到|排入)/.test(message));

  if (!hasKeyword) {
    return null;
  }

  const quotedTitle = message.match(/\u300c([^\u300d]+)\u300d/)?.[1] ?? message.match(/\u201c([^\u201d]+)\u201d/)?.[1] ?? null;
  const planIdMatch = message.match(/(?:计划\s*ID|plan\s*id|plan#)\s*[:：#]?\s*(\d+)/i);
  const checklistIdMatch = message.match(/(?:清单\s*ID|checklist\s*id|checklist#)\s*[:：#]?\s*(\d+)/i);

  return {
    args: {
      relatedChecklistId: checklistIdMatch ? Number(checklistIdMatch[1]) : null,
      relatedPlanId: planIdMatch ? Number(planIdMatch[1]) : null,
      sourceText: message,
      title: quotedTitle,
    },
    confidence: 0.7,
    intent: "compose_schedule_item",
  };
};

export const parseAppendPlanItemIntent = (message: string): AgentIntent | null => {
  const keyword = appendItemKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const [beforeKeyword, afterKeyword = ""] = message.split(keyword, 2);
  const [itemPart, ...descriptionParts] = cleanupText(afterKeyword).split(/[，；;]/);
  const itemTitle = cleanupText(itemPart ?? "");

  if (!itemTitle) {
    return createClarifyIntent(`你想补充的计划项标题是什么？可以直接说\u201c给高等数学的映射与函数补一个条目：反函数练习\u201d。`, [
      "itemTitle",
    ]);
  }

  const parsedTarget = parseChecklistGroupMention(beforeKeyword);

  if (!parsedTarget) {
    return createClarifyIntent("这条计划项要补到哪份清单里？如果清单有多个分组，也请一起告诉我分组名。", [
      "checklistTitle",
    ]);
  }

  return {
    args: {
      checklistTitle: parsedTarget.checklistTitle,
      description: descriptionParts.join("，").trim() || null,
      groupTitle: parsedTarget.groupTitle,
      itemTitle,
    },
    confidence: 0.55,
    intent: "append_plan_item",
  };
};

export const parseSchedulePlanIntent = (message: string): AgentIntent | null => {
  const keyword = schedulePlanKeywords.find((item) => message.includes(item));

  if (!keyword) return null;

  const planIdMatch = message.match(/(?:计划\s*ID|plan\s*id|plan#)\s*[:：#]?\s*(\d+)/i);
  const planId = planIdMatch ? Number(planIdMatch[1]) : null;

  return {
    args: {
      planId: planId ?? 0,
      startDate: null,
    },
    confidence: planId ? 0.7 : 0.45,
    intent: "schedule_plan",
  };
};
