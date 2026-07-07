import type { AgentPromptContext } from "./prompts";
import { appendFileSync } from "node:fs";
import { getAgentDebugLogPath } from "./debug-log";
import {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  shouldSkipPendingAction,
} from "./intent/intent-safety-signals";
import { buildConversationalIntent } from "./conversation/answer-generator";
import { classifyFollowUpIntent, routeDefinitionIntent, routeFollowUpIntent } from "./conversation/follow-up-router";
import type { AgentConversationState } from "./conversation/types";
import { intentRequiresWrite } from "./intent/arbitration";
import type { AgentArbitrationDecision } from "./intent/arbitration";
import {
  createClarifyIntent,
  type AgentChatMessage,
  type AgentEngine,
  type AgentIntent,
  type AgentLearningProfile,
  type AgentTokenUsage,
  type PendingAction,
} from "./schemas";

export type AgentModelIntentResolver = (input: {
  context: AgentPromptContext;
  deps?: import("./client").GenerateIntentDeps;
  history: AgentChatMessage[];
  message: string;
}) => Promise<null | {
  arbitration?: AgentArbitrationDecision;
  intent: AgentIntent;
  tokenUsage?: AgentTokenUsage;
}>;

export type AgentIntentResolutionResult = {
  arbitration?: AgentArbitrationDecision;
  engine: AgentEngine;
  intent: AgentIntent;
  llmRouterOutput?: import("./router/llm-router-schema").LLMRouterOutput;
  routerOutput?: import("./router/types").AgentRouterOutput;
  routerSource?: import("./router/resolve-router-chain").RouterChainSource;
  tokenUsage?: AgentTokenUsage;
};

export {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  shouldSkipPendingAction,
};

/* ── R6-C1-D-A-Fix-2: Local stubs replace heuristic-intent-resolver dependency ── */

const cleanupText = (text: string): string => text.trim();
const isNewCommand = (_message: string): boolean => false;
const parseKnowledgeAnswerIntent = (_message: string): AgentIntent | null => null;
const isGeneralConsultationQuestion = (_message: string): boolean => false;
const extractConsultationTopic = (_message: string): string | null => null;
const inferMemoryType = (_content: string) => "fact" as const;

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
        sourceText: pendingAction.originalMessage
          ? `${pendingAction.originalMessage}；${answer}`
          : typeof nextArgs.sourceText === "string"
            ? `${nextArgs.sourceText}；${answer}`
            : answer,
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

const isLearningPlanFollowup = (message: string) =>
  /(学习计划|复习计划|复习清单|学习清单|拆成|拆分|拆解|规划一下|制定|生成|做成)/.test(message) &&
  !/(日程|排期|排进|排入|安排到)/.test(message);

const isDirectLearningPathFollowup = (message: string) =>
  /((只要|仅要|直接|给出|给我|输出).{0,8}(路径|路线|路线图|学习顺序))|((路径|路线|路线图).{0,8}(即可|就行|就可以))|((不是|并不是|不要|不用|不需要).{0,8}计划)/.test(
    message,
  );

const profileFieldLabels: Record<keyof AgentLearningProfile, string> = {
  baseline: "当前基础",
  dailyTime: "每天可投入时间",
  deadline: "期望完成期限",
  goal: "学习目标",
};

const extractSegment = (message: string, pattern: RegExp) => cleanupText(message.match(pattern)?.[0] ?? "");

const parseLearningProfileFromMessage = (message: string): AgentLearningProfile => {
  const profile: AgentLearningProfile = {};
  const goal = extractSegment(message, /(考研\s*数?\s*(二|2)|考研|期末|课程|自学|工作应用|面试)[^，,；;。]*/);
  const baseline = extractSegment(message, /(零基础|基础\s*(一般|薄弱|还行|较好|很好|不好)|有基础|没学过|学过[^，,；;。]*)/);
  const dailyTime = extractSegment(message, /(?:每天|每日|每晚|晚上|早上|每周)[^，,；;。]*(?:小时|分钟|h|H)/);
  const deadline = extractSegment(message, /(?:[一二三四五六七八九十两\d]+个?月|[一二三四五六七八九十\d]+周|[一二三四五六七八九十\d]+天|月底|下个月|本月底)[^，,；;。]*(?:完成|学完)?/);

  if (goal) profile.goal = goal;
  if (baseline) profile.baseline = baseline;
  if (dailyTime) profile.dailyTime = dailyTime;
  if (deadline) profile.deadline = deadline;

  return profile;
};

const mergeLearningProfile = (
  existing: AgentLearningProfile | undefined,
  incoming: AgentLearningProfile,
): AgentLearningProfile => ({
  ...existing,
  ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => typeof value === "string" && value.length > 0)),
});

const getMissingLearningProfileFields = (profile: AgentLearningProfile) =>
  (["goal", "baseline", "dailyTime", "deadline"] as Array<keyof AgentLearningProfile>).filter((field) => !profile[field]);

const summarizeLearningProfile = (profile: AgentLearningProfile) =>
  [
    profile.goal ? `目标=${profile.goal}` : null,
    profile.baseline ? `基础=${profile.baseline}` : null,
    profile.dailyTime ? `每日时间=${profile.dailyTime}` : null,
    profile.deadline ? `期限=${profile.deadline}` : null,
  ]
    .filter(Boolean)
    .join("；");

const contextKeywordStopwords = [
  "给我",
  "帮我",
  "请你",
  "请",
  "关于",
  "参谋一下",
  "参谋",
  "分析一下",
  "评估一下",
  "建议一下",
  "帮我看看",
  "给我看看",
  "看看",
  "聊聊",
  "说说",
  "怎么看",
  "怎么做",
  "怎么办",
  "如何推进",
  "如何处理",
  "如何",
  "怎样",
  "应该",
  "可以",
  "一下",
  "下一步",
  "目前",
  "当前",
  "学习",
  "复习",
  "建议",
  "方案",
  "路线",
  "问题",
  "情况",
];

const contextSemanticAliasGroups = [
  ["agent", "ai", "aiagent", "助手", "智能体", "个人助手"],
  ["泛化", "通用", "开放", "开放式", "开放式请求", "模糊", "模糊问题"],
  ["咨询", "参谋", "建议", "判断", "评估", "分析", "诊断", "决策"],
  ["上下文", "context", "语境", "工作台", "长期目标"],
  ["写库", "写入", "数据库", "保存"],
  ["计划", "规划", "plan"],
  ["清单", "检查", "质量门", "checklist"],
  ["记忆", "长期记忆", "memory"],
];

const normalizeContextMatchText = (value: null | string | undefined) =>
  cleanupText(value ?? "")
    .toLowerCase()
    .replace(/[\s，,。！!？?：:；;、“”"'（）()【】[\]{}<>《》-]+/g, "");

const removeContextKeywordNoise = (value: string) =>
  contextKeywordStopwords.reduce((current, stopword) => current.replaceAll(stopword, ""), value);

const addKeywordWithSemanticAliases = (keywords: Set<string>, keyword: string, normalizedTopic: string) => {
  if (keyword.length >= 2 && !contextKeywordStopwords.includes(keyword)) {
    keywords.add(keyword);
  }

  for (const group of contextSemanticAliasGroups) {
    if (group.some((alias) => keyword.includes(alias) || normalizedTopic.includes(alias))) {
      for (const alias of group) {
        const normalizedAlias = normalizeContextMatchText(alias);

        if (normalizedAlias.length >= 2) {
          keywords.add(normalizedAlias);
        }
      }
    }
  }
};

const extractContextMatchKeywords = (topic: string) => {
  const normalized = normalizeContextMatchText(topic);
  const keywords = new Set<string>();

  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) {
    addKeywordWithSemanticAliases(keywords, token, normalized);
  }

  for (const segment of normalized.match(/[\u4e00-\u9fff]+/g) ?? []) {
    const cleaned = removeContextKeywordNoise(segment);

    addKeywordWithSemanticAliases(keywords, cleaned, normalized);

    for (let size = Math.min(4, cleaned.length); size >= 2; size--) {
      for (let index = 0; index + size <= cleaned.length; index++) {
        addKeywordWithSemanticAliases(keywords, cleaned.slice(index, index + size), normalized);
      }
    }
  }

  return [...keywords].filter((keyword) => keyword.length >= 2 && !contextKeywordStopwords.includes(keyword));
};

const scoreContextMatch = (parts: Array<null | string | undefined>, topic: string) => {
  const searchable = normalizeContextMatchText(parts.filter(Boolean).join(" "));
  const normalizedTopic = normalizeContextMatchText(topic);
  const compactTopic = removeContextKeywordNoise(normalizedTopic);

  if (!searchable || (!compactTopic && extractContextMatchKeywords(topic).length === 0)) {
    return 0;
  }

  let score = compactTopic && (searchable.includes(compactTopic) || compactTopic.includes(searchable)) ? 12 : 0;

  for (const keyword of extractContextMatchKeywords(topic)) {
    if (searchable.includes(keyword)) {
      score += Math.min(keyword.length, 8);
    }
  }

  return score;
};

const buildWorkspaceContextSummary = (context: AgentPromptContext, topic: string) => {
  const normalizedTopic = normalizeContextMatchText(topic);

  if (!normalizedTopic) {
    return null;
  }

  const relevantPlans = context.plans
    .map((plan) => ({
      plan,
      score: scoreContextMatch([plan.title, plan.agentBrief], topic),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const relevantChecklists = context.checklists
    .map((checklist) => ({
      checklist,
      score: scoreContextMatch(
        [
          checklist.title,
          ...checklist.groups.flatMap((group) => [group.title, ...group.items]),
        ],
        topic,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const relevantMemories = (context.memories ?? [])
    .map((memory) => ({
      memory,
      score: scoreContextMatch([memory.title, memory.content], topic),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const lines = [
    relevantPlans.length > 0
      ? `已有计划：${relevantPlans.map(({ plan }) => `「${plan.title}」（${plan.state}，${plan.priority}）`).join("；")}`
      : null,
    relevantChecklists.length > 0
      ? `相关清单：${relevantChecklists
          .map(({ checklist }) => {
            const groups = checklist.groups
              .slice(0, 2)
              .map((group) => `${group.title}${group.items[0] ? `：${group.items.slice(0, 2).join("、")}` : ""}`)
              .join("；");

            return `「${checklist.title}」${groups ? `（${groups}）` : ""}`;
          })
          .join("；")}`
      : null,
    relevantMemories.length > 0
      ? `已记录偏好/事实：${relevantMemories.map(({ memory }) => memory.content).join("；")}`
      : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : null;
};

const buildLearningWorkspaceContextSummary = (context: AgentPromptContext, subject: string) =>
  buildWorkspaceContextSummary(context, subject);

const enrichLearningAdviceWithWorkspaceContext = (intent: AgentIntent, context: AgentPromptContext): AgentIntent => {
  if (intent.intent !== "answer_question" || !intent.args.learningContext?.subject) {
    return intent;
  }

  const contextSummary = buildLearningWorkspaceContextSummary(context, intent.args.learningContext.subject);

  if (!contextSummary) {
    return intent;
  }

  return {
    ...intent,
    args: {
      ...intent.args,
      answer: `${intent.args.answer}\n\n结合当前工作台：\n${contextSummary}\n\n所以这次我会优先沿着已有计划和清单做诊断：先看错题/专项里反复卡住的部分，再决定是补概念还是加题型训练。`,
    },
  };
};

const resolveGeneralConsultationIntent = (message: string, context: AgentPromptContext): AgentIntent | null => {
  if (!isGeneralConsultationQuestion(message)) {
    return null;
  }

  const topic = extractConsultationTopic(message);

  if (!topic) {
    return null;
  }

  const contextSummary = buildWorkspaceContextSummary(context, topic);
  const contextBlock = contextSummary ?? "当前工作台里还没有明显匹配的计划、清单或记忆；我会先按目标、现状、约束来给出初步判断。";

  return {
    args: {
      answer: `我先把「${topic}」当作一个咨询判断问题处理，不会直接写入数据库。

我的判断：
1. 先明确你要解决的是方向选择、节奏安排，还是某个具体执行障碍。
2. 优先复用当前工作台里已有的计划、清单和记忆，避免重新发明一套方案。
3. 下一步只选一个最小切片推进，先验证它是否真的改善结果。

结合当前工作台：
${contextBlock}

所以这次我会先看上下文再给建议：如果已有计划和清单能支撑，就围绕它们调整下一步；如果上下文不足，再补目标、约束和成功标准。`,
      suggestAction: `我可以继续把「${topic}」拆成下一步计划或检查清单，先生成 DryRun 供你确认。`,
    },
    confidence: contextSummary ? 0.8 : 0.74,
    intent: "answer_question",
  };
};

const resolveLearningFollowupIntent = (pendingAction: PendingAction, message: string): AgentIntent | null => {
  if (pendingAction.type !== "await_learning_followup") {
    return null;
  }

  if (classifyFollowUpIntent(message)) {
    const kind = classifyFollowUpIntent(message)!;

    return buildConversationalIntent(kind, pendingAction.subject, message);
  }

  if (isDirectLearningPathFollowup(message)) {
    const pathIntent =
      parseKnowledgeAnswerIntent(pendingAction.originalMessage) ??
      parseKnowledgeAnswerIntent(`${pendingAction.subject}学习路径`);

    if (pathIntent?.intent === "answer_question") {
      return {
        ...pathIntent,
        args: {
          ...pathIntent.args,
          answer: `可以，我按学习路径回答，不进入计划草稿。\n\n${pathIntent.args.answer}`,
          learningContext: {
            originalMessage: pendingAction.originalMessage,
            subject: pendingAction.subject,
          },
          suggestAction: null,
        },
        confidence: 0.96,
      };
    }
  }

  if (isNegativeReply(message) || isCancellationReply(message)) {
    return {
      args: {
        answer: `好的，我先不把${pendingAction.subject}拆成计划。你之后想继续时，可以直接说“基于刚才的建议生成学习计划”。`,
        suggestAction: null,
      },
      confidence: 1,
      intent: "answer_question",
    };
  }

  if (pendingAction.requestedAction === "compose_plan") {
    const profile = cleanupText(message);
    const mergedProfile = mergeLearningProfile(pendingAction.profile, parseLearningProfileFromMessage(profile));
    const missingFields = getMissingLearningProfileFields(mergedProfile);

    if (!profile || missingFields.length > 0) {
      const recorded = summarizeLearningProfile(mergedProfile);
      const missing = missingFields.map((field) => profileFieldLabels[field]).join("、");

      return {
        args: {
          answer: recorded
            ? `我已记录：${recorded}。还需要补充：${missing}。`
            : `要把${pendingAction.subject}拆成计划，我还需要你的学习目标、当前基础、每天可投入时间和期望完成期限。`,
          learningContext: {
            originalMessage: pendingAction.originalMessage,
            profile: mergedProfile,
            requestedAction: "compose_plan",
            subject: pendingAction.subject,
          },
          suggestAction: "补充这些信息后，我会生成可确认的学习计划草稿。",
        },
        confidence: 0.88,
        intent: "answer_question",
      };
    }

    return {
      args: {
        goal: `系统学习${pendingAction.subject}`,
        sourceText: `${pendingAction.originalMessage}；学习画像：${summarizeLearningProfile(mergedProfile)}。请基于上一轮学习参谋建议和这份画像，生成一份可执行的${pendingAction.subject}学习计划。`,
        title: `${pendingAction.subject}学习计划`,
      },
      confidence: 0.94,
      intent: "compose_plan",
    };
  }

  if (!isLearningPlanFollowup(message)) {
    return null;
  }

  return {
    args: {
      answer: `可以。为了让${pendingAction.subject}计划真的贴合你，我先确认 4 个信息：目标是什么（考试/课程/自学/工作应用）、当前基础如何、每天能投入多久、希望多久完成？`,
      learningContext: {
        originalMessage: pendingAction.originalMessage,
        profile: parseLearningProfileFromMessage(message),
        requestedAction: "compose_plan",
        subject: pendingAction.subject,
      },
      suggestAction: "你给出这 4 点后，我会生成可确认的学习计划草稿。",
    },
    confidence: 0.9,
    intent: "answer_question",
  };
};

export const resolveOrchestrationPreflightIntent = ({
  context,
  conversationState = null,
  history = [],
  message,
  pendingAction,
}: {
  context: AgentPromptContext;
  conversationState?: AgentConversationState | null;
  history?: AgentChatMessage[];
  message: string;
  pendingAction: null | PendingAction;
}): AgentIntent | null => {
  const openDomainDefinition = routeDefinitionIntent(message);

  if (openDomainDefinition?.intent === "answer_question" && openDomainDefinition.args.openDomainTopic) {
    return openDomainDefinition;
  }

  if (pendingAction?.type === "await_learning_followup") {
    return resolveLearningFollowupIntent(pendingAction, message);
  }

  const followUpIntent = routeFollowUpIntent({
    conversationState,
    history,
    message,
  });

  if (followUpIntent) {
    return enrichLearningAdviceWithWorkspaceContext(followUpIntent, context);
  }

  if (
    pendingAction &&
    pendingAction.type !== "await_clarification" &&
    pendingAction.type !== "await_completion_note"
  ) {
    return null;
  }

  const definitionIntent = routeDefinitionIntent(message);

  if (definitionIntent) {
    return enrichLearningAdviceWithWorkspaceContext(definitionIntent, context);
  }

  const deterministicKnowledgeIntent = parseKnowledgeAnswerIntent(message);

  if (deterministicKnowledgeIntent) {
    return enrichLearningAdviceWithWorkspaceContext(deterministicKnowledgeIntent, context);
  }

  return resolveGeneralConsultationIntent(message, context);
};

const withRouterChain = (
  result: AgentIntentResolutionResult,
  routerChain: import("./router/resolve-router-chain").RouterChainResult | null,
): AgentIntentResolutionResult =>
  routerChain && routerChain.intent.intent === result.intent.intent
    ? {
        ...result,
        llmRouterOutput: routerChain.llmRouterOutput,
        routerOutput: routerChain.routerOutput,
        routerSource: routerChain.source,
      }
    : result;

/**
 * R6-C0-C BOUNDARY:
 * - PendingAction confirmation path (await_confirmation, cancel, still_waiting)
 *   is handled in resolve-intent-step.ts BEFORE this function is called.
 * - This function handles legacy heuristic intent resolution.
 * - In AGENT_REQUIRE_LLM=1, new user goals are gated by R5-A and never reach here.
 * - In AGENT_REQUIRE_LLM=0, legacy hybrid mode uses this path for intent resolution.
 *
 * Future: extract legacy heuristic path into separate module (R6-C4).
 */
export const resolveAgentIntent = async ({
  context,
  conversationState = null,
  history,
  intentModelEngine,
  message,
  modelResolver,
  pendingAction,
  userContext,
}: {
  context: AgentPromptContext;
  conversationState?: AgentConversationState | null;
  history: AgentChatMessage[];
  intentModelEngine?: AgentEngine;
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction: null | PendingAction;
  userContext?: { preferences?: import("./user-preferences").UserPreferences | null; userId: number };
}): Promise<AgentIntentResolutionResult> => {
  if (pendingAction?.type === "await_completion_note" && !isNegativeReply(message) && !isNewCommand(message)) {
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

  const { resolveUnifiedIntent } = await import("./intent/llm-unified");
  const { resolveRouterChain } = await import("./router/resolve-router-chain");
  const routerChain = resolveRouterChain({
    conversationState,
    history,
    message,
    pendingAction,
  });
  const deterministicIntent =
    routerChain?.intent ??
    (pendingAction?.type === "await_learning_followup"
      ? null
      : resolveOrchestrationPreflightIntent({
          context,
          conversationState,
          history,
          message,
          pendingAction,
        }));

  const resolution = await resolveUnifiedIntent({
    context,
    conversationState,
    deterministicIntent,
    history,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
    userContext,
  });

  if (
    pendingAction &&
    (resolution.arbitration.pendingPolicy === "correct_pending_intent" ||
      resolution.arbitration.route === "cancel_pending")
  ) {
    return withRouterChain(
      {
        ...resolution,
        engine: "workflow" as const,
      },
      routerChain,
    );
  }

  if (pendingAction?.type === "await_clarification" && resolution.arbitration.route === "resume_pending") {
    const clarificationIntent = resolveClarificationIntent(pendingAction, message);

    if (clarificationIntent) {
      return {
        ...resolution,
        arbitration: {
          ...resolution.arbitration,
          intent: clarificationIntent,
          reason: "意图仲裁允许续接上一轮澄清，已把用户输入填入缺失字段。",
          requiresWrite: intentRequiresWrite(clarificationIntent),
          route: intentRequiresWrite(clarificationIntent) ? "write" as const : "answer" as const,
        },
        engine: "workflow" as const,
        intent: clarificationIntent,
      };
    }
  }

  const openDomainInterrupt = (() => {
    const definitionIntent = routeDefinitionIntent(message);
    return Boolean(
      definitionIntent?.intent === "answer_question" && definitionIntent.args.openDomainTopic,
    );
  })();

  if (
    pendingAction?.type === "await_learning_followup" &&
    resolution.arbitration.pendingPolicy !== "correct_pending_intent" &&
    resolution.arbitration.route !== "cancel_pending" &&
    !(resolution.arbitration.pendingPolicy === "start_new_intent" && openDomainInterrupt)
  ) {
    const learningFollowupIntent = resolveLearningFollowupIntent(pendingAction, message);

    if (learningFollowupIntent) {
      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "intent-resolution.ts:learning-followup-override",
              message: "learning followup override applied",
              data: {
                pendingPolicy: resolution.arbitration.pendingPolicy,
                openDomainTopic:
                  resolution.intent.intent === "answer_question"
                    ? resolution.intent.args.openDomainTopic ?? null
                    : null,
              },
              timestamp: Date.now(),
              hypothesisId: "H18",
              runId: "post-fix-6",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion
      return {
        ...resolution,
        arbitration: {
          ...resolution.arbitration,
          intent: learningFollowupIntent,
          pendingPolicy: "answer_pending_field" as const,
          reason: "意图仲裁允许续接学习咨询上下文，进入学习画像或计划草稿流程。",
          requiresWrite: intentRequiresWrite(learningFollowupIntent),
          route: intentRequiresWrite(learningFollowupIntent) ? "write" as const : "answer" as const,
        },
        engine: "workflow" as const,
        intent: learningFollowupIntent,
      };
    }
  }

  return withRouterChain(resolution, routerChain);
};
