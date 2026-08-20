import type {
  AgentChatResponse,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import { projectSafeExecutionFailure } from "@/lib/agent/orchestration/safe-execution-failure";

/** User-safe controlled failure message — no internal architecture details. */
const USER_FAILURE_MESSAGE =
  projectSafeExecutionFailure("runtime").safeUserMessage;

export const buildLangGraphFailureResponse = ({
  baseTokenUsage,
  error,
  pendingAction,
  threadId,
  workbenchMode,
}: {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  error: unknown;
  pendingAction: null | PendingAction;
  threadId: number;
  workbenchMode?: AgentWorkbenchMode | null;
}): AgentChatResponse => {
  void error;
  const assistantMessage = USER_FAILURE_MESSAGE;
  const failure = projectSafeExecutionFailure("runtime");
  const outputTokens = estimateTokenCount(assistantMessage);

  return {
    assistantMessage,
    confidence: 0,
    engine: "workflow",
    intent: "clarify",
    pendingAction,
    threadId,
    tokenUsage: {
      ...baseTokenUsage,
      outputTokens,
      totalTokens:
        baseTokenUsage.contextTokens +
        baseTokenUsage.inputTokens +
        outputTokens,
    },
    trace: [
      {
        detail: `${failure.code} · ${failure.safeObservationMessage}`,
        id: "langgraph-runtime-failure",
        kind: "error",
        status: "error",
        title: "运行未完成",
      },
    ],
    workbenchMode: workbenchMode ?? undefined,
  };
};
