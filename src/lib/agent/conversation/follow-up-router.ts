import type { AgentIntent } from "../schemas";
import { parseDefinitionQuestionIntent } from "../intent/retired-intent-response";
import { buildConversationalIntent } from "./answer-generator";
import {
  deriveConversationState,
  resolveConversationState,
} from "./conversation-state";
import type { ConversationalIntentName, FollowUpRouteInput } from "./types";

const normalizedMessage = (message: string) => message.replace(/\s+/g, "");

export const classifyFollowUpIntent = (message: string): ConversationalIntentName | null => {
  const normalized = normalizedMessage(message);

  if (/(举个例子|举例说明|例子呢|有例子吗|来几个例子)/.test(normalized)) {
    return "give_examples";
  }

  if (/(区别|对比|有什么不同|差异|vs|VS)/.test(normalized)) {
    return "compare_concepts";
  }

  if (/(总结一下|概括一下|简短点|精简|太长)/.test(normalized)) {
    return "summarize_answer";
  }

  if (/(换种说法|重新解释|再说一遍|换个角度)/.test(normalized)) {
    return "rewrite_answer";
  }

  if (
    /((怎么|如何|怎样)学|怎么入门|入门路径|学习路径|路径是什么|路线是什么|学习顺序)/.test(normalized) &&
    !/(计划|清单|日程|保存|创建)/.test(normalized)
  ) {
    return "give_learning_path";
  }

  if (/(原理是什么|实际场景呢|应用场景|底层原理|为什么)/.test(normalized)) {
    return "explain_concept";
  }

  if (
    /(更加详细|更详细|详细一点|详细些|详细一些|展开说说|展开讲|展开一下|多说一点|多说一些|深入一点|再详细|补充细节|能不能细说|继续讲|接着说|讲详细点|具体一点|我需要更加详细的信息|讲细一点)/.test(
      normalized,
    )
  ) {
    return "expand_answer";
  }

  return null;
};

export const routeFollowUpIntent = (input: FollowUpRouteInput): AgentIntent | null => {
  const followUpKind = classifyFollowUpIntent(input.message);

  if (!followUpKind) {
    return null;
  }

  const state =
    resolveConversationState(input.conversationState ?? null, input.history) ??
    deriveConversationState(input.history);

  if (!state?.lastTopic) {
    return null;
  }

  return buildConversationalIntent(followUpKind, state.lastTopic, input.message, state);
};

export const routeDefinitionIntent = (message: string): AgentIntent | null => {
  const definitionIntent = parseDefinitionQuestionIntent(message);

  if (!definitionIntent || definitionIntent.intent !== "answer_question") {
    return null;
  }

  if (definitionIntent.args.openDomainTopic) {
    return definitionIntent;
  }

  const topic = definitionIntent.args.learningContext?.subject ?? "该主题";
  const base = buildConversationalIntent("explain_concept", topic, message);

  return {
    ...base,
    args: {
      ...base.args,
      answer: definitionIntent.args.answer,
      suggestAction: definitionIntent.args.suggestAction ?? base.args.suggestAction,
    },
  };
};

export const shouldBlockClarifyFallback = (input: FollowUpRouteInput) =>
  Boolean(routeFollowUpIntent(input));
