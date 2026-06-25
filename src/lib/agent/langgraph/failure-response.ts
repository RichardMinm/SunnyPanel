import type {
  AgentChatResponse,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

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
  const assistantMessage =
    "LangGraph 运行失败，本轮没有回退旧管线，也没有自动重试写操作。原待处理状态已保留；如果失败发生在写入期间，执行状态可能不确定，请先检查最近的 AgentRun，再决定是否重试。也可以临时将 AGENT_GRAPH_RUNTIME 设置为 legacy。";
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
        title: "LangGraph 已受控终止",
      },
    ],
    workbenchMode: workbenchMode ?? undefined,
  };
};
