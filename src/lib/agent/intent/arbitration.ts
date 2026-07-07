import type { AgentPromptContext } from "../prompts";
import {
  createClarifyIntent,
  parseAgentIntentResult,
  type AgentChatMessage,
  type AgentIntent,
  type PendingAction,
} from "../schemas";
import { parseDefinitionQuestionIntent } from "./retired-intent-response";
import {
  isCancellationReply,
  isNegativeReply,
} from "./intent-safety-signals";
import {
  isGeneralConsultationQuestion,
  isLearningAdviceQuestion,
  parseKnowledgeAnswerIntent,
} from "../heuristic-intent-resolver";
import { routeFollowUpIntent } from "../conversation/follow-up-router";
import type { AgentConversationState } from "../conversation/types";
import { isConversationalIntent } from "../schemas";
import { AGENT_WRITE_INTENTS } from "./write-intents";
import { isRecord } from "@/lib/shared/is-record";

export type AgentRouteClass =
  | "answer"
  | "clarify"
  | "confirm_pending"
  | "cancel_pending"
  | "orchestrate"
  | "resume_pending"
  | "write";

export type PendingActionPolicy =
  | "answer_pending_field"
  | "cancel_pending"
  | "correct_pending_intent"
  | "keep_waiting"
  | "start_new_intent";

export type WriteSafetyAssessment = {
  allowed: boolean;
  explicitWriteSignal: boolean;
  reason: string;
  requiresWrite: boolean;
};

export type AgentArbitrationDecision = {
  confidence: number;
  intent: AgentIntent;
  isCorrection: boolean;
  pendingPolicy: PendingActionPolicy;
  reason: string;
  requiresWrite: boolean;
  route: AgentRouteClass;
  writeSafety: WriteSafetyAssessment;
};

/* R6-C1-E: HeuristicCandidate type was in deleted intent/heuristics/index.ts.
 * Inlined here since heuristic candidates no longer exist — the type is kept
 * only for backward compatibility with AgentArbitrationInput. */
type HeuristicCandidate = { intent: AgentIntent; source: string };

export type AgentArbitrationInput = {
  context: AgentPromptContext;
  conversationState?: AgentConversationState | null;
  heuristicCandidates: HeuristicCandidate[];
  history: AgentChatMessage[];
  message: string;
  modelDecision?: AgentArbitrationDecision | null;
  modelIntent?: AgentIntent | null;
  pendingAction: PendingAction | null;
};

const WRITE_INTENTS = AGENT_WRITE_INTENTS;

const explicitWritePattern =
  /(创建|新建|保存|记住|写入|添加|新增|追加|补充计划项|补一个条目|新增条目|添加条目|标记|完成了|做完了|学完了|补时间线|时间线节点|Timeline 节点|timeline 节点|compose_timeline_event|安排到|排进|排入|加入日程|创建日程|生成日程|确认执行|执行一下|(?:制定|生成|创建|做成|拆成|拆分|拆解).{0,8}(计划|清单|草稿|日程)|计划草稿|学习计划|复习计划|复习清单|学习清单|本周回顾|周报)/;
const consultationPattern =
  /(参谋|咨询|建议|分析|评估|看看|聊聊|说说|如何|怎么|怎样|路径|路线|路线图|顺序|方案即可|只要.*方案|只要.*路径|不是.*计划|并不是.*计划)/;
const compoundPattern = /(并|然后|同时|以及|再).{0,12}(日程|排期|安排|复盘|记住|保存|创建|生成)/;
const directPathCorrectionPattern =
  /((只要|仅要|直接|给出|给我|输出).{0,8}(路径|路线|路线图|学习顺序))|((路径|路线|路线图).{0,8}(即可|就行|就可以))|((不是|并不是|不要|不用|不需要).{0,8}计划)/;
const routeValues = new Set<AgentRouteClass>([
  "answer",
  "cancel_pending",
  "clarify",
  "confirm_pending",
  "orchestrate",
  "resume_pending",
  "write",
]);
const pendingPolicyValues = new Set<PendingActionPolicy>([
  "answer_pending_field",
  "cancel_pending",
  "correct_pending_intent",
  "keep_waiting",
  "start_new_intent",
]);

const confidenceOf = (intent: AgentIntent | null | undefined) => intent?.confidence ?? 0;

const isWeeklyReviewWrite = (intent: Extract<AgentIntent, { intent: "weekly_review" }>) =>
  intent.args.persistReview !== false;

export const intentRequiresWrite = (intent: AgentIntent): boolean => {
  if (isConversationalIntent(intent.intent)) {
    return false;
  }

  if (intent.intent === "weekly_review") {
    return isWeeklyReviewWrite(intent);
  }

  if (intent.intent === "compose_timeline_event") {
    return intent.args.createEvent !== false;
  }

  return WRITE_INTENTS.has(intent.intent);
};

const hasExplicitWriteSignal = (message: string, intent: AgentIntent) => {
  if (!intentRequiresWrite(intent)) {
    return false;
  }

  return explicitWritePattern.test(message);
};

export const assessWriteSafety = ({
  intent,
  message,
}: {
  intent: AgentIntent;
  message: string;
}): WriteSafetyAssessment => {
  const requiresWrite = intentRequiresWrite(intent);
  const explicitWriteSignal = hasExplicitWriteSignal(message, intent);

  if (!requiresWrite) {
    return {
      allowed: true,
      explicitWriteSignal,
      reason: "只读或直接回答意图，不需要写入授权。",
      requiresWrite,
    };
  }

  if (explicitWriteSignal) {
    return {
      allowed: true,
      explicitWriteSignal,
      reason: "用户包含明确写入、草稿、创建、保存或排期信号。",
      requiresWrite,
    };
  }

  return {
    allowed: false,
    explicitWriteSignal,
    reason: "用户没有明确要求创建、保存、排期或生成可确认草稿，写入意图被降级。",
    requiresWrite,
  };
};

export const parseAgentArbitrationResult = (value: unknown): AgentArbitrationDecision | null => {
  if (!isRecord(value)) {
    return null;
  }

  const decisionSource = isRecord(value.decision) ? value.decision : value;
  const route = typeof decisionSource.route === "string" && routeValues.has(decisionSource.route as AgentRouteClass)
    ? decisionSource.route as AgentRouteClass
    : null;
  const pendingPolicy =
    typeof decisionSource.pendingPolicy === "string" &&
    pendingPolicyValues.has(decisionSource.pendingPolicy as PendingActionPolicy)
      ? decisionSource.pendingPolicy as PendingActionPolicy
      : "start_new_intent";
  const intentSource = isRecord(value.intent) ? value.intent : value;
  const intent = parseAgentIntentResult(intentSource);

  if (!route || !intent) {
    return null;
  }

  const requiresWrite =
    typeof decisionSource.requiresWrite === "boolean"
      ? decisionSource.requiresWrite
      : intentRequiresWrite(intent);
  const confidence =
    typeof decisionSource.confidence === "number" && Number.isFinite(decisionSource.confidence)
      ? Math.max(0, Math.min(1, decisionSource.confidence))
      : intent.confidence ?? 0.75;
  const reason =
    typeof decisionSource.reason === "string" && decisionSource.reason.trim().length > 0
      ? decisionSource.reason.trim()
      : "模型返回了结构化意图仲裁结果。";
  const explicitWriteSignal = requiresWrite && (route === "write" || route === "orchestrate");

  return {
    confidence,
    intent,
    isCorrection: decisionSource.isCorrection === true,
    pendingPolicy,
    reason,
    requiresWrite,
    route,
    writeSafety: {
      allowed: !requiresWrite || explicitWriteSignal,
      explicitWriteSignal,
      reason,
      requiresWrite,
    },
  };
};

const bestCandidateIntent = (candidates: HeuristicCandidate[]) => candidates[0]?.intent ?? null;

const bestAnswerCandidate = (candidates: HeuristicCandidate[]) =>
  candidates.find((candidate) => candidate.intent.intent === "answer_question")?.intent ?? null;

const buildAnswerIntent = (
  message: string,
  candidates: HeuristicCandidate[],
  input?: Pick<AgentArbitrationInput, "conversationState" | "history">,
  fallbackTopic?: string,
) => {
  const followUpIntent = input
    ? routeFollowUpIntent({
        conversationState: input.conversationState,
        history: input.history,
        message,
      })
    : null;

  if (followUpIntent) {
    return followUpIntent;
  }

  const deterministic = parseKnowledgeAnswerIntent(message) ?? (fallbackTopic ? parseKnowledgeAnswerIntent(`${fallbackTopic}学习路径`) : null);

  return deterministic ?? bestAnswerCandidate(candidates);
};

const directAnswerDecision = ({
  confidence,
  intent,
  isCorrection = false,
  pendingPolicy,
  reason,
}: {
  confidence?: number;
  intent: AgentIntent;
  isCorrection?: boolean;
  pendingPolicy: PendingActionPolicy;
  reason: string;
}): AgentArbitrationDecision => ({
  confidence: confidence ?? confidenceOf(intent) ?? 0.75,
  intent,
  isCorrection,
  pendingPolicy,
  reason,
  requiresWrite: false,
  route: intent.intent === "clarify" ? "clarify" : "answer",
  writeSafety: {
    allowed: true,
    explicitWriteSignal: false,
    reason: "直接回答或澄清不会写入系统数据。",
    requiresWrite: false,
  },
});

const classifyWriteRoute = (message: string, intent: AgentIntent): AgentRouteClass =>
  compoundPattern.test(message) && intent.intent !== "clarify" && intent.intent !== "answer_question" ? "orchestrate" : "write";

const pendingCancellationDecision = (pendingAction: PendingAction): AgentArbitrationDecision =>
  directAnswerDecision({
    confidence: 1,
    intent: {
      args: {
        answer:
          pendingAction.type === "await_confirmation" || pendingAction.type === "await_batch_confirmation"
            ? "好的，已取消这次待确认操作。"
            : "好的，这次先不继续这个待处理动作。",
        suggestAction: null,
      },
      confidence: 1,
      intent: "answer_question",
    },
    pendingPolicy: "cancel_pending",
    reason: "用户明确取消或拒绝继续待处理动作。",
  });

const answerFromPendingLearningContext = (pendingAction: Extract<PendingAction, { type: "await_learning_followup" }>) => {
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
    } satisfies AgentIntent;
  }

  return null;
};

const arbitratePendingAction = (
  input: AgentArbitrationInput,
): AgentArbitrationDecision | null => {
  const { heuristicCandidates, message, pendingAction } = input;

  if (!pendingAction) {
    return null;
  }

  if (isNegativeReply(message) || isCancellationReply(message)) {
    return {
      ...pendingCancellationDecision(pendingAction),
      route: "cancel_pending",
    };
  }

  if (pendingAction.type === "await_learning_followup") {
    const definitionIntent = parseDefinitionQuestionIntent(message);

    if (definitionIntent?.intent === "answer_question" && definitionIntent.args.openDomainTopic) {
      return directAnswerDecision({
        confidence: definitionIntent.confidence,
        intent: definitionIntent,
        pendingPolicy: "start_new_intent",
        reason: "用户提出了新的开放域定义问题，不再续接上一轮学习跟进。",
      });
    }
  }

  if (pendingAction.type === "await_learning_followup" && directPathCorrectionPattern.test(message)) {
    const answerIntent = answerFromPendingLearningContext(pendingAction);

    if (answerIntent) {
      return directAnswerDecision({
        confidence: 0.96,
        intent: answerIntent,
        isCorrection: true,
        pendingPolicy: "correct_pending_intent",
        reason: "用户纠正前一轮计划化理解，明确只要学习路径回答。",
      });
    }
  }

  if (pendingAction.type === "await_clarification") {
    const answerIntent = buildAnswerIntent(message, heuristicCandidates);

    if (answerIntent || isGeneralConsultationQuestion(message) || isLearningAdviceQuestion(message)) {
      return directAnswerDecision({
        confidence: confidenceOf(answerIntent) || 0.82,
        intent:
          answerIntent ??
          ({
            args: {
              answer: `我先把这个当作新的咨询问题处理，不会把它填成「${pendingAction.intent}」的缺失字段。`,
              suggestAction: null,
            },
            confidence: 0.78,
            intent: "answer_question",
          } satisfies AgentIntent),
        pendingPolicy: "start_new_intent",
        reason: "用户的新输入是咨询/问答，不应填入上一轮 pending clarification。",
      });
    }

    return {
      confidence: 0.84,
      intent: createClarifyIntent(pendingAction.question, pendingAction.missingFields),
      isCorrection: false,
      pendingPolicy: "answer_pending_field",
      reason: "用户输入看起来是在补充 pending clarification 所需字段。",
      requiresWrite: true,
      route: "resume_pending",
      writeSafety: {
        allowed: true,
        explicitWriteSignal: true,
        reason: "续接用户已发起的待澄清写入动作。",
        requiresWrite: true,
      },
    };
  }

  return null;
};

const maybeAnswerInsteadOfUnsafeWrite = (
  message: string,
  candidates: HeuristicCandidate[],
  writeIntent: AgentIntent,
): AgentIntent | null => {
  if (!consultationPattern.test(message)) {
    return null;
  }

  return buildAnswerIntent(message, candidates, writeIntent.intent === "compose_plan" ? undefined : undefined);
};

export const arbitrateAgentIntent = async (
  input: AgentArbitrationInput,
): Promise<AgentArbitrationDecision> => {
  const pendingDecision = arbitratePendingAction(input);

  if (pendingDecision) {
    return pendingDecision;
  }

  const modelDecision = input.modelDecision ?? null;
  const modelIntent = modelDecision?.intent ?? input.modelIntent ?? null;
  const candidateIntent = bestCandidateIntent(input.heuristicCandidates);
  const answerIntent = buildAnswerIntent(input.message, input.heuristicCandidates, input);
  const followUpIntent = routeFollowUpIntent({
    conversationState: input.conversationState,
    history: input.history,
    message: input.message,
  });
  const preferredIntent =
    modelIntent ??
    followUpIntent ??
    candidateIntent ??
    createClarifyIntent(
      "我还没理解你要我回答问题、生成建议，还是执行系统操作。你可以换一种说法再描述一次。",
    );

  if (modelDecision && !intentRequiresWrite(modelDecision.intent)) {
    const definitionIntent = parseDefinitionQuestionIntent(input.message);
    let intent = modelDecision.intent;

    if (
      definitionIntent?.intent === "answer_question" &&
      definitionIntent.args.openDomainTopic &&
      intent.intent === "answer_question" &&
      !intent.args.openDomainTopic &&
      intent.args.answer.trim().length === 0
    ) {
      intent = {
        ...intent,
        args: {
          ...intent.args,
          openDomainTopic: definitionIntent.args.openDomainTopic,
        },
      };
    }

    return {
      ...modelDecision,
      intent,
      writeSafety: assessWriteSafety({
        intent,
        message: input.message,
      }),
    };
  }

  if (answerIntent && (!modelIntent || intentRequiresWrite(modelIntent))) {
    const modelSafety = modelIntent ? assessWriteSafety({ intent: modelIntent, message: input.message }) : null;

    if (!modelSafety || !modelSafety.allowed) {
      return directAnswerDecision({
        confidence: Math.max(confidenceOf(answerIntent), confidenceOf(modelIntent), 0.78),
        intent: answerIntent,
        pendingPolicy: "start_new_intent",
        reason: modelIntent
          ? "用户表达是路径、咨询或学习建议，模型写入意图未通过写入安全门，改为直接回答。"
          : "用户表达是咨询或学习建议，直接回答且不写入数据库。",
      });
    }
  }

  if (preferredIntent.intent === "clarify") {
    const retryFollowUp = routeFollowUpIntent({
      conversationState: input.conversationState,
      history: input.history,
      message: input.message,
    });

    if (retryFollowUp) {
      return directAnswerDecision({
        confidence: confidenceOf(retryFollowUp) || 0.92,
        intent: retryFollowUp,
        pendingPolicy: "start_new_intent",
        reason: `存在可继承主题，追问命中 ${retryFollowUp.intent}，不进入 clarify。`,
      });
    }

    return directAnswerDecision({
      confidence: confidenceOf(preferredIntent) || 0.6,
      intent: preferredIntent,
      pendingPolicy: "start_new_intent",
      reason: "候选意图不足以安全执行，需要澄清。",
    });
  }

  const writeSafety = assessWriteSafety({
    intent: preferredIntent,
    message: input.message,
  });

  if (writeSafety.requiresWrite && !writeSafety.allowed) {
    const fallbackAnswer = maybeAnswerInsteadOfUnsafeWrite(input.message, input.heuristicCandidates, preferredIntent);

    if (fallbackAnswer) {
      return directAnswerDecision({
        confidence: Math.max(confidenceOf(fallbackAnswer), confidenceOf(preferredIntent), 0.78),
        intent: fallbackAnswer,
        pendingPolicy: "start_new_intent",
        reason: `${writeSafety.reason} 已改为直接回答。`,
      });
    }

    return directAnswerDecision({
      confidence: 0.68,
      intent: createClarifyIntent("你是想让我直接给建议，还是生成一个可确认的计划草稿？"),
      pendingPolicy: "start_new_intent",
      reason: writeSafety.reason,
    });
  }

  return {
    confidence: confidenceOf(preferredIntent) || 0.75,
    intent: preferredIntent,
    isCorrection: false,
    pendingPolicy: "start_new_intent",
    reason: writeSafety.requiresWrite ? "用户包含明确写入或草稿信号，允许进入 DryRun/确认流程。" : "只读意图，直接进入回答或查询流程。",
    requiresWrite: writeSafety.requiresWrite,
    route: writeSafety.requiresWrite ? classifyWriteRoute(input.message, preferredIntent) : "answer",
    writeSafety,
  };
};
