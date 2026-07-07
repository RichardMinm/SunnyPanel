import type { AgentChatMessage, AgentIntent } from "../schemas";
import { parseDefinitionQuestionIntent } from "../intent/retired-intent-response";
import type { AgentConversationState, ConversationUserIntent } from "./types";
import { isConversationalIntent } from "./types";

const truncate = (value: string, max = 160) =>
  value.length <= max ? value : `${value.slice(0, max).trimEnd()}...`;

const summarizeAssistantAnswer = (answer: string, topic: string) => {
  if (/ctf|夺旗/i.test(`${topic}${answer}`)) {
    return "解释了 CTF 的定义、常见方向和入门路径";
  }

  if (/信息安全|网络安全|网安|蓝队/.test(`${topic}${answer}`)) {
    return "解释了信息安全的 CIA 目标、三层能力模型与蓝队职责";
  }

  return truncate(answer.replace(/\s+/g, " "), 120);
};

const extractEntities = (topic: string, answer: string) => {
  const entities = new Set<string>([topic]);
  const patterns = [
    "Web",
    "Reverse",
    "Pwn",
    "Crypto",
    "Misc",
    "Forensics",
    "Jeopardy",
    "Attack-Defense",
    "flag",
    "CIA",
    "蓝队",
    "红队",
  ];

  for (const item of patterns) {
    if (new RegExp(item, "i").test(answer)) {
      entities.add(item);
    }
  }

  return [...entities].slice(0, 8);
};

const inferTopicFromHistory = (history: AgentChatMessage[]) => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== "user") {
      continue;
    }

    const definitionIntent = parseDefinitionQuestionIntent(entry.content);

    if (
      definitionIntent?.intent === "answer_question" &&
      definitionIntent.args.learningContext?.subject
    ) {
      return definitionIntent.args.learningContext.subject;
    }
  }

  const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant")?.content ?? "";

  if (/ctf|夺旗/i.test(lastAssistant)) {
    return "CTF";
  }

  if (/信息安全|网络安全|网安|蓝队/.test(lastAssistant)) {
    return "信息安全";
  }

  return null;
};

export const deriveConversationState = (
  history: AgentChatMessage[],
  previous?: AgentConversationState | null,
): AgentConversationState | null => {
  if (previous?.lastTopic) {
    return previous;
  }

  const topic = inferTopicFromHistory(history);

  if (!topic) {
    return null;
  }

  const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant")?.content ?? "";

  return {
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: summarizeAssistantAnswer(lastAssistant, topic),
    lastMentionedEntities: extractEntities(topic, lastAssistant),
    lastTopic: topic,
    lastUserIntent: "explain_concept",
    updatedAt: new Date().toISOString(),
  };
};

export const resolveConversationState = (
  stored: unknown,
  history: AgentChatMessage[],
): AgentConversationState | null => {
  if (stored && typeof stored === "object" && "lastTopic" in stored) {
    const candidate = stored as AgentConversationState;

    if (typeof candidate.lastTopic === "string" && candidate.lastTopic.trim()) {
      return candidate;
    }
  }

  return deriveConversationState(history);
};

export const buildConversationStateFromTurn = (input: {
  assistantAnswer: string;
  intent: AgentIntent["intent"];
  message: string;
  pendingConfirmation?: AgentConversationState["pendingConfirmation"];
  previous?: AgentConversationState | null;
  topic: string;
  answerMode?: "curated" | "open";
}): AgentConversationState => {
  const lastUserIntent: ConversationUserIntent = isConversationalIntent(input.intent)
    ? input.intent
    : input.intent === "answer_question"
      ? parseDefinitionQuestionIntent(input.message)
        ? "explain_concept"
        : "answer_question"
      : input.intent === "clarify"
        ? "clarify"
        : "answer_question";

  const depth =
    input.intent === "expand_answer" || input.previous?.lastAnswerDepth === "expanded"
      ? "expanded"
      : input.intent === "explain_concept" || lastUserIntent === "explain_concept"
        ? "brief"
        : input.previous?.lastAnswerDepth ?? "brief";

  return {
    answerMode: input.answerMode ?? input.previous?.answerMode ?? "curated",
    lastAnswerDepth: depth === "brief" && input.intent === "expand_answer" ? "expanded" : depth,
    lastAssistantAnswerSummary: summarizeAssistantAnswer(input.assistantAnswer, input.topic),
    lastDateRange: input.previous?.lastDateRange ?? null,
    lastMentionedEntities: extractEntities(input.topic, input.assistantAnswer),
    lastSearchResults: input.previous?.lastSearchResults,
    lastTopic: input.topic,
    lastUserIntent,
    pendingConfirmation: input.pendingConfirmation ?? input.previous?.pendingConfirmation ?? null,
    updatedAt: new Date().toISOString(),
  };
};

export const getThreadConversationState = (thread: { conversationState?: unknown }) =>
  thread.conversationState ?? null;
