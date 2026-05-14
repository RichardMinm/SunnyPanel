import { logAgentEvent } from "./logger";
import type { AgentPromptContext } from "./prompts";
import {
  createClarifyIntent,
  type AgentChatMessage,
  type AgentIntent,
  type AgentTokenUsage,
  type PendingAction,
} from "./schemas";

export type AgentModelIntentResolver = (input: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  message: string;
}) => Promise<null | {
  intent: AgentIntent;
  tokenUsage?: AgentTokenUsage;
}>;

const createPlanKeywords = ["帮我创建计划", "创建计划", "新建计划", "创建一个计划", "帮我新建计划"];
const composePlanKeywords = ["帮我制定计划", "制定计划", "帮我规划", "创建一个完整计划", "生成完整计划", "做一个完整计划"];
const scheduleComposerKeywords = ["安排今天", "帮我安排今天", "今天安排", "排到", "放到", "加入日程", "创建日程", "安排到", "日程"];
const appendItemKeywords = ["补充计划项", "追加计划项", "新增计划项", "添加计划项", "加一个条目", "补一个条目", "添加条目", "新增条目"];
const completionKeywords = ["完成了", "学完了", "做完了", "标记", "完成"];
const noteKeywords = ["补充备注", "添加备注", "备注是", "备注：", "感受是", "想法是"];
const memoryKeywords = ["记住", "记一下", "保存记忆", "保存偏好", "以后记得", "以后都", "我的偏好", "我的习惯"];
const progressKeywords = ["进度", "完成率", "完成情况", "统计"];
const evaluationKeywords = ["评估", "评价", "建议", "分析", "复盘"];
const weeklyReviewKeywords = ["本周回顾", "本周复盘", "周回顾", "周复盘", "复盘这一周", "复盘这周", "这一周", "这周", "本周计划执行情况"];
const timelineComposerKeywords = ["compose_timeline_event", "补时间线", "时间线节点", "Timeline 节点", "timeline 节点", "整理成 Timeline", "写进 Timeline"];
const negativeReplyKeywords = ["不用", "不用了", "先不用", "暂时不用", "不需要", "先这样"];
const confirmationReplyKeywords = ["确认", "确认执行", "执行", "可以执行", "同意", "继续", "继续执行", "没问题", "好的", "好"];
const cancellationReplyKeywords = ["取消", "不要执行", "不执行", "先别执行", "先别", "放弃", "停止"];
const mathTwoSyllabusAnswer = `考研数学二通常考两门：高等数学和线性代数，不考概率论与数理统计。分值结构一般是高等数学约 80%，线性代数约 20%，具体以当年官方考试大纲为准。

高等数学常见章节：
1. 函数、极限、连续
2. 一元函数微分学
3. 一元函数积分学
4. 多元函数微积分学
5. 常微分方程

线性代数常见章节：
1. 行列式
2. 矩阵
3. 向量
4. 线性方程组
5. 矩阵的特征值和特征向量
6. 二次型`;

const isMathTwoSyllabusQuestion = (message: string) => {
  const isMathTwoQuestion = /(考研)?数学\s*(二|2)|考研数\s*(二|2)|数二/.test(message);
  const asksSyllabus =
    message.includes("考哪些") ||
    message.includes("考什么") ||
    message.includes("哪些科目") ||
    message.includes("具体章节") ||
    message.includes("章节") ||
    message.includes("大纲") ||
    message.includes("范围");

  return isMathTwoQuestion && asksSyllabus;
};

const cleanupText = (value: string) =>
  value
    .trim()
    .replace(/^[，,：:\s]+/, "")
    .replace(/[。！!？?\s]+$/, "");

const cleanupPlanTitle = (value: string) =>
  cleanupText(
    value
      .replace(/^关于/, "")
      .replace(/^一个/, "")
      .replace(/^这条/, ""),
  );

const parseChecklistMention = (value: string) => {
  const cleaned = cleanupText(
    value
      .replace(/^(今天|我|刚刚|已经|刚|把)/, "")
      .replace(/^(这个|这条)/, ""),
  );

  if (!cleaned) {
    return null;
  }

  const segments = cleaned
    .split("的")
    .map((item) => cleanupText(item))
    .filter(Boolean);

  if (segments.length >= 3) {
    return {
      checklistTitle: segments[0],
      groupTitle: segments[1],
      itemTitle: segments[segments.length - 1],
    };
  }

  if (segments.length === 2) {
    return {
      checklistTitle: segments[0],
      groupTitle: null,
      itemTitle: segments[1],
    };
  }

  return null;
};

const parseChecklistGroupMention = (value: string) => {
  const cleaned = cleanupText(
    value
      .replace(/^(今天|我|刚刚|已经|刚|把|给|在|往|向)/, "")
      .replace(/(里面|里|中)$/, "")
      .replace(/^(这个|这条)/, ""),
  );

  if (!cleaned) {
    return null;
  }

  const segments = cleaned
    .split("的")
    .map((item) => cleanupText(item))
    .filter(Boolean);

  if (segments.length >= 2) {
    return {
      checklistTitle: segments[0],
      groupTitle: segments[segments.length - 1],
    };
  }

  return {
    checklistTitle: cleaned,
    groupTitle: null,
  };
};

const parseCreatePlanIntent = (message: string): AgentIntent | null => {
  const keyword = createPlanKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const remainder = cleanupText(message.slice(message.indexOf(keyword) + keyword.length));

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

const parseComposePlanIntent = (message: string): AgentIntent | null => {
  const keyword = composePlanKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const remainder = cleanupText(message.slice(message.indexOf(keyword) + keyword.length));

  return {
    args: {
      sourceText: remainder || message,
    },
    confidence: 0.72,
    intent: "compose_plan",
  };
};

const parseComposeScheduleItemIntent = (message: string): AgentIntent | null => {
  const hasKeyword =
    scheduleComposerKeywords.some((keyword) => message.includes(keyword)) ||
    (/(今天|明天|今晚|明早|下周[一二三四五六日天])/.test(message) && /(安排|排|日程)/.test(message));

  if (!hasKeyword) {
    return null;
  }

  const quotedTitle = message.match(/「([^」]+)」/)?.[1] ?? message.match(/"([^"]+)"/)?.[1] ?? null;
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

const parseAppendPlanItemIntent = (message: string): AgentIntent | null => {
  const keyword = appendItemKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const [beforeKeyword, afterKeyword = ""] = message.split(keyword, 2);
  const [itemPart, ...descriptionParts] = cleanupText(afterKeyword).split(/[，；;]/);
  const itemTitle = cleanupText(itemPart ?? "");

  if (!itemTitle) {
    return createClarifyIntent("你想补充的计划项标题是什么？可以直接说“给高等数学的映射与函数补一个条目：反函数练习”。", [
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

const parseExplicitNoteIntent = (message: string): AgentIntent | null => {
  const keyword = noteKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const [before, after] = message.split(keyword, 2);
  const completionNote = cleanupText(after ?? "");

  if (!completionNote) {
    return createClarifyIntent("你想补的完成备注是什么？可以直接说一句感受、难点或总结。", ["completionNote"]);
  }

  const parsedTarget = parseChecklistMention(
    before
      .replace(/^(给|把|为)/, "")
      .replace(/补充$/, "")
      .replace(/备注$/, ""),
  );

  if (!parsedTarget) {
    return createClarifyIntent("这条备注要补到哪份清单的哪个条目上？你可以说“给高等数学的有理积分章节补充备注：……”。", [
      "checklistTitle",
      "itemTitle",
    ]);
  }

  return {
    args: {
      checklistTitle: parsedTarget.checklistTitle,
      completionNote,
      groupTitle: parsedTarget.groupTitle,
      itemTitle: parsedTarget.itemTitle,
    },
    confidence: 0.55,
    intent: "add_completion_note",
  };
};

const parseProgressIntent = (message: string): AgentIntent | null => {
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

const parseEvaluatePlanIntent = (message: string): AgentIntent | null => {
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

const normalizeTimelineSourceType = (value: string) => {
  const normalized = value.toLowerCase();

  if (/(posts|post|文章|博客)/.test(normalized)) {
    return "post" as const;
  }

  if (/(notes|note|笔记)/.test(normalized)) {
    return "note" as const;
  }

  if (/(updates|update|动态|更新)/.test(normalized)) {
    return "update" as const;
  }

  if (/(checklists|checklist|清单|条目)/.test(normalized)) {
    return "checklist_item" as const;
  }

  if (/(plans|plan|计划)/.test(normalized)) {
    return "plan" as const;
  }

  return null;
};

const parseComposeTimelineEventIntent = (message: string): AgentIntent | null => {
  const hasKeyword = timelineComposerKeywords.some((keyword) => message.includes(keyword));

  if (!hasKeyword) {
    return null;
  }

  const quotedTitle = message.match(/「([^」]+)」/)?.[1] ?? message.match(/"([^"]+)"/)?.[1] ?? null;
  const sourceIdMatch = message.match(/(?:来源\s*ID|source\s*id|#)\s*[:：]?\s*(\d+)/i);
  const sourceTypeMatch = message.match(/(?:来源类型|source\s*type)\s*[:：]?\s*([a-zA-Z_-]+|文章|博客|笔记|动态|更新|清单|条目|计划)/i);
  const explicitSourceType = sourceTypeMatch ? normalizeTimelineSourceType(sourceTypeMatch[1] ?? "") : null;
  const inferredSourceType =
    explicitSourceType ??
    normalizeTimelineSourceType(message) ??
    (message.includes("这段") || message.includes("下面") ? "free_text" : null);
  const sourceText = cleanupText(
    message
      .replace(/^.*?(?:整理成 Timeline|写进 Timeline|补时间线|时间线节点|Timeline 节点|timeline 节点)/, "")
      .replace(/^(：|:|，|,)/, ""),
  );
  const wantsPreviewOnly = /(提案|预览|只生成|先生成|不要创建|不写入|先别写入)/.test(message);
  const visibility = message.includes("私有")
    ? "private" as const
    : message.includes("公开")
      ? "public" as const
      : null;

  return {
    args: {
      createEvent: !wantsPreviewOnly,
      sourceId: sourceIdMatch ? Number(sourceIdMatch[1]) : null,
      sourceText: quotedTitle ? null : sourceText || null,
      sourceTitle: quotedTitle,
      sourceType: inferredSourceType,
      visibility,
    },
    confidence: 0.68,
    intent: "compose_timeline_event",
  };
};

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

const inferMemoryType = (content: string): NonNullable<Extract<AgentIntent, { intent: "save_memory" }>["args"]["type"]> => {
  if (/(风格|语气|口吻|写作|文案)/.test(content)) {
    return "writing_style";
  }

  if (/(规则|流程|工作流|以后都|每次都|不要|必须|优先)/.test(content)) {
    return "workflow_rule";
  }

  if (/(项目|SunnyPanel|站点|产品|功能|代码库)/i.test(content)) {
    return "project_context";
  }

  if (/(偏好|喜欢|倾向|希望|习惯|以后|记住)/.test(content)) {
    return "preference";
  }

  return "fact";
};

const parseSaveMemoryIntent = (message: string): AgentIntent | null => {
  const keyword = memoryKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const content = cleanupText(
    message
      .slice(message.indexOf(keyword) + keyword.length)
      .replace(/^(一下|这个|这点|这条|：|:|，|,)/, ""),
  );

  if (!content) {
    return createClarifyIntent("你想让我长期记住什么？请用一句话说明偏好、规则、写作风格或项目事实。", [
      "content",
    ]);
  }

  const type = inferMemoryType(content);

  return {
    args: {
      confidence: 0.75,
      content,
      title: content.length <= 36 ? content : `${content.slice(0, 36).trimEnd()}...`,
      type,
    },
    confidence: 0.72,
    intent: "save_memory",
  };
};

const parseKnowledgeAnswerIntent = (message: string): AgentIntent | null => {
  if (!isMathTwoSyllabusQuestion(message)) {
    return null;
  }

  return {
    args: {
      answer: mathTwoSyllabusAnswer,
      suggestAction: "如果你愿意，我可以把这些章节拆成「考研数学二复习清单」。",
    },
    confidence: 0.92,
    intent: "answer_question",
  };
};

const parseCompleteItemIntent = (message: string): AgentIntent | null => {
  const keyword = completionKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const source = message.includes("标记") && message.includes("完成")
    ? message
        .replace(/^.*?标记/, "")
        .replace(/(?:为)?完成.*$/, "")
    : message.slice(message.indexOf(keyword) + keyword.length);
  const parsedTarget = parseChecklistMention(source);

  if (!parsedTarget) {
    return createClarifyIntent("我能帮你标记清单条目完成，但还需要知道是哪个清单、哪个条目。你可以说“我完成了高等数学的有理积分章节”。", [
      "checklistTitle",
      "itemTitle",
    ]);
  }

  return {
    args: {
      checklistTitle: parsedTarget.checklistTitle,
      groupTitle: parsedTarget.groupTitle,
      itemTitle: parsedTarget.itemTitle,
    },
    confidence: 0.55,
    intent: "complete_plan_item",
  };
};

const parseHeuristicIntent = (message: string): AgentIntent => {
  return (
    parseComposePlanIntent(message) ??
    parseComposeScheduleItemIntent(message) ??
    parseCreatePlanIntent(message) ??
    parseAppendPlanItemIntent(message) ??
    parseSaveMemoryIntent(message) ??
    parseExplicitNoteIntent(message) ??
    parseCompleteItemIntent(message) ??
    parseKnowledgeAnswerIntent(message) ??
    parseComposeTimelineEventIntent(message) ??
    parseProgressIntent(message) ??
    parseWeeklyReviewIntent(message) ??
    parseEvaluatePlanIntent(message) ??
    createClarifyIntent(
      "我现在可以帮你创建计划、补计划项、标记清单条目完成、补完成备注、补时间线，也能查询进度和评估计划。你可以直接说“帮我创建计划：……”，或者“给这条更新补时间线节点”。",
    )
  );
};

export const isNegativeReply = (message: string) => {
  const normalized = cleanupText(message);

  return negativeReplyKeywords.some((keyword) => normalized.includes(keyword));
};

export const isConfirmationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  return confirmationReplyKeywords.includes(normalized);
};

export const isCancellationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  return cancellationReplyKeywords.some((keyword) => normalized.includes(keyword)) || isNegativeReply(message);
};

export const shouldSkipPendingAction = (
  pendingAction: null | PendingAction,
  message: string,
): pendingAction is Exclude<PendingAction, { type: "await_confirmation" }> =>
  Boolean(pendingAction && pendingAction.type !== "await_confirmation" && isNegativeReply(message));

const isNewCommand = (message: string) =>
  createPlanKeywords.some((keyword) => message.includes(keyword)) ||
  composePlanKeywords.some((keyword) => message.includes(keyword)) ||
  scheduleComposerKeywords.some((keyword) => message.includes(keyword)) ||
  appendItemKeywords.some((keyword) => message.includes(keyword)) ||
  completionKeywords.some((keyword) => message.includes(keyword)) ||
  noteKeywords.some((keyword) => message.includes(keyword)) ||
  memoryKeywords.some((keyword) => message.includes(keyword)) ||
  progressKeywords.some((keyword) => message.includes(keyword)) ||
  timelineComposerKeywords.some((keyword) => message.includes(keyword)) ||
  weeklyReviewKeywords.some((keyword) => message.includes(keyword)) ||
  evaluationKeywords.some((keyword) => message.includes(keyword)) ||
  isMathTwoSyllabusQuestion(message);

const resolveClarificationIntent = (pendingAction: PendingAction, message: string): AgentIntent | null => {
  if (pendingAction.type !== "await_clarification" || isNegativeReply(message) || isNewCommand(message)) {
    return null;
  }

  const answer = cleanupText(message);

  if (!answer) {
    return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
  }

  const nextArgs: Record<string, unknown> = {
    ...pendingAction.args,
  };

  for (const field of pendingAction.missingFields) {
    if (!(field in nextArgs)) {
      nextArgs[field as keyof typeof nextArgs] = answer as never;
      break;
    }
  }

  if (pendingAction.intent === "compose_plan") {
    return {
      args: {
        agentBrief: typeof nextArgs.agentBrief === "string" ? nextArgs.agentBrief : null,
        goal: typeof nextArgs.goal === "string" ? nextArgs.goal : answer,
        motivation: typeof nextArgs.motivation === "string" ? nextArgs.motivation : null,
        outOfScope: typeof nextArgs.outOfScope === "string" ? nextArgs.outOfScope : null,
        scope: typeof nextArgs.scope === "string" ? nextArgs.scope : null,
        sourceText: typeof nextArgs.sourceText === "string" ? `${nextArgs.sourceText}；${answer}` : answer,
        suggestedDueDate: typeof nextArgs.suggestedDueDate === "string" ? nextArgs.suggestedDueDate : null,
        suggestedPriority:
          nextArgs.suggestedPriority === "high" || nextArgs.suggestedPriority === "medium" || nextArgs.suggestedPriority === "low"
            ? nextArgs.suggestedPriority
            : undefined,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
      },
      confidence: 1,
      intent: "compose_plan",
    };
  }

  if (pendingAction.intent === "compose_schedule_item") {
    return {
      args: {
        date: typeof nextArgs.date === "string" ? nextArgs.date : null,
        description: typeof nextArgs.description === "string" ? nextArgs.description : null,
        endTime: typeof nextArgs.endTime === "string" ? nextArgs.endTime : null,
        isAllDay: typeof nextArgs.isAllDay === "boolean" ? nextArgs.isAllDay : undefined,
        priority: nextArgs.priority === "high" || nextArgs.priority === "medium" || nextArgs.priority === "low" ? nextArgs.priority : undefined,
        reason: typeof nextArgs.reason === "string" ? nextArgs.reason : null,
        relatedChecklistId: typeof nextArgs.relatedChecklistId === "number" ? nextArgs.relatedChecklistId : null,
        relatedChecklistItemKey: typeof nextArgs.relatedChecklistItemKey === "string" ? nextArgs.relatedChecklistItemKey : null,
        relatedPlanId: typeof nextArgs.relatedPlanId === "number" ? nextArgs.relatedPlanId : null,
        sourceText: typeof nextArgs.sourceText === "string" ? `${nextArgs.sourceText}；${answer}` : answer,
        sourceType:
          nextArgs.sourceType === "agent" ||
          nextArgs.sourceType === "checklist" ||
          nextArgs.sourceType === "manual" ||
          nextArgs.sourceType === "plan"
            ? nextArgs.sourceType
            : null,
        startTime: typeof nextArgs.startTime === "string" ? nextArgs.startTime : null,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
      },
      confidence: 1,
      intent: "compose_schedule_item",
    };
  }

  if (pendingAction.intent === "append_plan_item") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;

    if (!checklistTitle || !itemTitle) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        description: typeof nextArgs.description === "string" ? nextArgs.description : null,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "append_plan_item",
    };
  }

  if (pendingAction.intent === "complete_plan_item") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;

    if (!checklistTitle || !itemTitle) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        completedAt: typeof nextArgs.completedAt === "string" ? nextArgs.completedAt : null,
        completionNote: typeof nextArgs.completionNote === "string" ? nextArgs.completionNote : null,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "complete_plan_item",
    };
  }

  if (pendingAction.intent === "add_completion_note") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;
    const completionNote = typeof nextArgs.completionNote === "string" ? nextArgs.completionNote : null;

    if (!checklistTitle || !itemTitle || !completionNote) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        completionNote,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "add_completion_note",
    };
  }

  if (pendingAction.intent === "save_memory") {
    const content = typeof nextArgs.content === "string" ? nextArgs.content : answer;

    if (!content) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        confidence: typeof nextArgs.confidence === "number" ? nextArgs.confidence : 0.7,
        content,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
        type:
          nextArgs.type === "preference" ||
          nextArgs.type === "project_context" ||
          nextArgs.type === "writing_style" ||
          nextArgs.type === "workflow_rule" ||
          nextArgs.type === "fact"
            ? nextArgs.type
            : inferMemoryType(content),
      },
      confidence: 1,
      intent: "save_memory",
    };
  }

  const title = typeof nextArgs.title === "string" ? nextArgs.title : answer;

  return {
    args: {
      agentBrief: typeof nextArgs.agentBrief === "string" ? nextArgs.agentBrief : null,
      description: typeof nextArgs.description === "string" ? nextArgs.description : null,
      dueDate: typeof nextArgs.dueDate === "string" ? nextArgs.dueDate : null,
      executionMode:
        nextArgs.executionMode === "agent" || nextArgs.executionMode === "hybrid" || nextArgs.executionMode === "manual"
          ? nextArgs.executionMode
          : undefined,
      priority: nextArgs.priority === "high" || nextArgs.priority === "medium" || nextArgs.priority === "low" ? nextArgs.priority : undefined,
      state:
        nextArgs.state === "active" || nextArgs.state === "backlog" || nextArgs.state === "done" || nextArgs.state === "paused"
          ? nextArgs.state
          : undefined,
      title,
    },
    confidence: 1,
    intent: "create_plan",
  };
};

export const resolveAgentIntent = async ({
  context,
  history,
  message,
  modelResolver,
  pendingAction,
}: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction: null | PendingAction;
}) => {
  if (pendingAction?.type === "await_clarification") {
    const clarificationIntent = resolveClarificationIntent(pendingAction, message);

    if (clarificationIntent) {
      return {
        engine: "workflow" as const,
        intent: clarificationIntent,
      };
    }
  }

  if (
    pendingAction?.type === "await_completion_note" &&
    !isNegativeReply(message) &&
    !isNewCommand(message)
  ) {
    return {
      engine: "workflow" as const,
      intent: {
        args: {
          checklistTitle: pendingAction.checklistTitle,
          completionNote: cleanupText(message),
          groupTitle: pendingAction.groupTitle ?? null,
          itemTitle: pendingAction.itemTitle,
        },
        confidence: 1,
        intent: "add_completion_note" as const,
      },
    };
  }

  const deterministicKnowledgeIntent = parseKnowledgeAnswerIntent(message);

  if (deterministicKnowledgeIntent) {
    return {
      engine: "heuristic" as const,
      intent: deterministicKnowledgeIntent,
    };
  }

  if (modelResolver) {
    try {
      const modelIntent = await modelResolver({
        context,
        history,
        message,
      });

      if (modelIntent) {
        return {
          engine: "glm" as const,
          intent: modelIntent.intent,
          tokenUsage: modelIntent.tokenUsage,
        };
      }
    } catch (error) {
      logAgentEvent("warn", "intent.model_fallback", {
        error: error instanceof Error ? error.message : "Unknown model error",
      });
    }
  }

  return {
    engine: "heuristic" as const,
    intent: parseHeuristicIntent(message),
  };
};
