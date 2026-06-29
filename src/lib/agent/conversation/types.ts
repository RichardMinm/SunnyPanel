import type { AgentChatMessage } from "../schemas";

export const CONVERSATIONAL_INTENT_NAMES = [
  "explain_concept",
  "expand_answer",
  "give_examples",
  "compare_concepts",
  "give_learning_path",
  "summarize_answer",
  "rewrite_answer",
] as const;

export type ConversationalIntentName = (typeof CONVERSATIONAL_INTENT_NAMES)[number];

export type ConversationUserIntent =
  | ConversationalIntentName
  | "answer_question"
  | "clarify";

export type AgentConversationState = {
  answerMode?: "curated" | "open";
  lastAnswerDepth: "brief" | "detailed" | "expanded";
  lastAssistantAnswerSummary: string;
  lastDateRange?: null | { end?: string; label?: string; start?: string };
  lastMentionedEntities: string[];
  lastSearchResults?: Array<{ capability: string; summary: string; title?: string }>;
  lastTopic: string;
  lastUserIntent: ConversationUserIntent;
  pendingConfirmation?: null | { actionId: string; capability?: string };
  updatedAt: string;
};

export type ConversationalAnswerArgs = {
  answer: string;
  learningContext?: null | {
    originalMessage: string;
    subject: string;
  };
  requiresConfirmation?: false;
  riskLevel?: "none";
  suggestAction?: null | string;
  target?: "last_topic" | string;
  topic: string;
  writeRequired?: false;
};

export type FollowUpRouteInput = {
  conversationState?: AgentConversationState | null;
  history: AgentChatMessage[];
  message: string;
};

export const isConversationalIntent = (
  intent: string,
): intent is ConversationalIntentName =>
  (CONVERSATIONAL_INTENT_NAMES as readonly string[]).includes(intent);

export const isConversationalAgentIntent = (
  intent: import("../schemas").AgentIntent,
): intent is Extract<import("../schemas").AgentIntent, { intent: ConversationalIntentName }> =>
  isConversationalIntent(intent.intent);
