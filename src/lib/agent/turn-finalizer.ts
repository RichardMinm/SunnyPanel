import type { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import type {
  AgentChatResponse,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import {
  AGENT_THREAD_EVENT_SCHEMA_VERSION,
  agentThreadEventKeys,
  projectAgentThreadFromEvents,
  type AgentSuggestionTurnSource,
  type AgentThreadEventStore,
  type AgentThreadProjection,
} from "@/lib/agent/thread-events";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentThread } from "@/payload-types";
import { markSuggestionDone as markSuggestionDoneDefault } from "@/lib/agent/suggestions";
import {
  buildConversationStateFromTurn,
  resolveConversationState,
} from "@/lib/agent/conversation/conversation-state";
import type { AgentConversationState } from "@/lib/agent/conversation/types";
import { parseDefinitionQuestionIntent } from "@/lib/agent/intent/retired-intent-response";
import { isConversationalIntent, type AgentChatMessage } from "@/lib/agent/schemas";
import {
  ModelCallAuthorizationError,
  type ModelCallBudgetRecorder,
} from "@/lib/agent/orchestration/model-call-budget";

type LearningInput = Parameters<typeof runAgentLearningLoop>[0];

export type AgentTurnFinalizerInput = {
  conversationStateOverride?: unknown;
  existingMemories: LearningInput["existingMemories"];
  failure?: unknown;
  projectFailureAssistantMessage?: boolean;
  pushTrace: (step: AgentTraceStep) => void;
  response: AgentChatResponse;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type AgentTurnFinalizer = (
  input: AgentTurnFinalizerInput,
) => Promise<AgentChatResponse>;

const terminalResponse = (value: unknown): AgentChatResponse | null => {
  if (
    !value ||
    typeof value !== "object" ||
    !("response" in value)
  ) {
    return null;
  }

  const response = (value as { response?: unknown }).response;

  return response &&
    typeof response === "object" &&
    "assistantMessage" in response &&
    typeof response.assistantMessage === "string"
    ? (response as AgentChatResponse)
    : null;
};

const mergeTrace = (
  current: AgentTraceStep[] | undefined,
  additions: AgentTraceStep[],
) => {
  const merged = new Map<string, AgentTraceStep>();

  for (const step of [...(current ?? []), ...additions]) {
    merged.set(step.id, {
      ...(merged.get(step.id) ?? {}),
      ...step,
    } as AgentTraceStep);
  }

  return [...merged.values()];
};

const resolveTopicForStateUpdate = (
  intent: AgentChatResponse["intent"],
  message: string,
  history: AgentChatMessage[],
  previous: AgentConversationState | null,
) => {
  if (previous?.lastTopic) {
    return previous.lastTopic;
  }

  const definitionIntent = parseDefinitionQuestionIntent(message);

  if (definitionIntent?.intent === "answer_question" && definitionIntent.args.openDomainTopic) {
    return definitionIntent.args.openDomainTopic;
  }

  if (definitionIntent?.intent === "answer_question" && definitionIntent.args.learningContext?.subject) {
    return definitionIntent.args.learningContext.subject;
  }

  return resolveConversationState(null, history)?.lastTopic ?? "该主题";
};

export const createAgentTurnFinalizer = ({
  conversationStateBefore = null,
  eventStore,
  markSuggestionDone = markSuggestionDoneDefault,
  message,
  modelCallRecorder,
  pendingBefore,
  project,
  resolvedHistory = [],
  runLearningLoop,
  suggestionSource,
  thread,
  turnId,
  user,
  workbenchMode,
  signal,
}: {
  conversationStateBefore?: AgentConversationState | null;
  eventStore: AgentThreadEventStore;
  markSuggestionDone?: (id: number) => Promise<unknown>;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  pendingBefore: null | PendingAction;
  project: (projection: AgentThreadProjection) => Promise<unknown>;
  resolvedHistory?: AgentChatMessage[];
  runLearningLoop: typeof runAgentLearningLoop;
  suggestionSource?: AgentSuggestionTurnSource | null;
  thread: AgentThread;
  turnId: string;
  user: { id: number };
  workbenchMode?: AgentWorkbenchMode | null;
  signal?: AbortSignal;
}): AgentTurnFinalizer => {
  let finalizedResponse: AgentChatResponse | null = null;

  return async ({
    existingMemories,
    conversationStateOverride,
    failure,
    projectFailureAssistantMessage,
    pushTrace,
    response,
    tokenUsage,
  }) => {
    if (finalizedResponse) {
      return finalizedResponse;
    }

    const assistantEventKey = agentThreadEventKeys.assistant(
      thread.id,
      turnId,
    );
    const failedEventKey = agentThreadEventKeys.failed(
      thread.id,
      turnId,
    );
    const eventKey = failure ? failedEventKey : assistantEventKey;
    const existing =
      (await eventStore.findByEventKey(assistantEventKey)) ??
      (await eventStore.findByEventKey(failedEventKey));
    const replay = terminalResponse(existing?.payload);

    if (replay?.assistantMessage?.trim()) {
      finalizedResponse = replay;
      return replay;
    }

    const completedResponse: AgentChatResponse = {
      ...response,
      threadId: thread.id,
      tokenUsage: response.tokenUsage ?? tokenUsage,
      turnId,
      workbenchMode: workbenchMode ?? undefined,
    };
    const learningTrace: AgentTraceStep[] = [];
    const pushLearningTrace = (step: AgentTraceStep) => {
      const index = learningTrace.findIndex(
        (existingStep) => existingStep.id === step.id,
      );

      if (index === -1) {
        learningTrace.push(step);
      } else {
        learningTrace[index] = {
          ...learningTrace[index],
          ...step,
        };
      }

      pushTrace(step);
    };

    // Persist the authoritative terminal response before optional post-turn
    // learning. A slow or failed enhancement must never make a completed turn
    // disappear or be replayed as unfinished.
    try {
      await eventStore.append({
        eventKey,
        eventType: failure ? "turn_failed" : "assistant_completed",
        payload: failure
          ? {
              error:
                failure instanceof Error
                  ? failure.message
                  : String(failure),
              pendingAfter: completedResponse.pendingAction,
              ...(projectFailureAssistantMessage === false
                ? { projectAssistantMessage: false }
                : {}),
              response: completedResponse,
            }
          : {
              pendingAfter: completedResponse.pendingAction,
              response: completedResponse,
            },
        recordedAt: new Date().toISOString(),
        schemaVersion: AGENT_THREAD_EVENT_SCHEMA_VERSION,
        threadId: thread.id,
        turnId,
        userId: user.id,
      });
    } catch (error) {
      const raced =
        (await eventStore.findByEventKey(assistantEventKey)) ??
        (await eventStore.findByEventKey(failedEventKey));
      const racedResponse = terminalResponse(raced?.payload);

      if (racedResponse) {
        finalizedResponse = racedResponse;
        return racedResponse;
      }

      throw error;
    }

    if (!(failure && projectFailureAssistantMessage === false)) {
      try {
        await runLearningLoop({
          assistantMessage: completedResponse.assistantMessage,
          existingMemories,
          intent: completedResponse.intent,
          learningModelInvocation: {
            logicalCallAuthorizer: (scopeId) => {
              if (modelCallRecorder?.record("learning", scopeId) === false) {
                throw new ModelCallAuthorizationError(
                  "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED",
                );
              }
            },
            providerAttemptAuthorizer: () =>
              modelCallRecorder?.recordProviderAttempt("learning"),
            signal,
          },
          message,
          pendingActionAfter: completedResponse.pendingAction,
          pendingActionBefore: pendingBefore,
          pushTrace: pushLearningTrace,
          sourceThread: thread.id,
          tokenUsage: completedResponse.tokenUsage ?? tokenUsage,
          user,
        });
      } catch {
        pushLearningTrace({
          detail: "LEARNING_POST_TURN_FAILED",
          id: "turn-learning-failure",
          kind: "error",
          status: "error",
          title: "学习循环未完成",
        });
      }
    }

    completedResponse.trace = mergeTrace(
      completedResponse.trace,
      learningTrace,
    );

    if (!failure && completedResponse.pendingAction === null && suggestionSource) {
      try {
        await markSuggestionDone(suggestionSource.suggestionId);
      } catch (error) {
        pushTrace({
          detail: error instanceof Error ? error.message : String(error),
          id: "turn-suggestion-done-failure",
          kind: "error",
          status: "error",
          title: "建议完成状态未同步",
        });
      }
    }

    await projectAgentThreadFromEvents({
      project: async (projection) => {
        const topic = resolveTopicForStateUpdate(
          completedResponse.intent,
          message,
          resolvedHistory,
          conversationStateBefore,
        );
        const nextConversationState =
          conversationStateOverride !== undefined
            ? conversationStateOverride
            : (
                isConversationalIntent(completedResponse.intent) ||
                completedResponse.intent === "answer_question"
              )
              ? buildConversationStateFromTurn({
                  assistantAnswer: completedResponse.assistantMessage,
                  answerMode:
                    completedResponse.intent === "answer_question" &&
                    (() => {
                      const def = parseDefinitionQuestionIntent(message);
                      return def?.intent === "answer_question" && Boolean(def.args.openDomainTopic);
                    })()
                      ? "open"
                      : conversationStateBefore?.answerMode,
                  intent: completedResponse.intent,
                  message,
                  previous: conversationStateBefore,
                  topic,
                })
              : conversationStateBefore;

        await project({
          ...projection,
          ...(nextConversationState
            ? { conversationState: nextConversationState as AgentThreadProjection["conversationState"] }
            : {}),
        });
      },
      store: eventStore,
      threadId: thread.id,
      turnId,
      userId: user.id,
    });

    finalizedResponse = completedResponse;

    return completedResponse;
  };
};
