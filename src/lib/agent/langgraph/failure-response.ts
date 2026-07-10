import type {
  AgentChatResponse,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

/** User-safe controlled failure message — no internal architecture details. */
const USER_FAILURE_MESSAGE =
  "处理请求时遇到问题，你的会话状态已保留，请稍后重试。";

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
  const assistantMessage = USER_FAILURE_MESSAGE;
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
        detail: error instanceof Error ? error.message : String(error),
        id: "langgraph-runtime-failure",
        kind: "error",
        status: "error",
        title: "运行时错误（已脱敏记录）",
      },
    ],
    workbenchMode: workbenchMode ?? undefined,
  };
};
