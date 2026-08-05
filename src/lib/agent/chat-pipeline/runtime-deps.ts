import type { Payload } from "payload";

import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import type { generateIntentWithAgentModel } from "@/lib/agent/client";
import type { AgentConversationState } from "@/lib/agent/conversation/types";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AgentPerformanceTimer } from "@/lib/agent/trace/perf-trace";
import type { AgentTurnFinalizer } from "@/lib/agent/turn-finalizer";
import type { UserPreferences } from "@/lib/agent/user-preferences";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentThread } from "@/payload-types";

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

export type RunAgentChatPipelineDeps = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences | null;
  conversationState?: AgentConversationState | null;
  finalizeTurn?: AgentTurnFinalizer;
  generateIntentWithAgentModel: typeof generateIntentWithAgentModel;
  intentModelEngine: AgentEngine;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  payload: Payload;
  pendingAction: null | PendingAction;
  perfTimer?: AgentPerformanceTimer | null;
  resolvedHistory: AgentChatMessage[];
  signal?: AbortSignal;
  structuredConfirmation: null | StructuredConfirmation;
  thread: AgentThread;
  turnId?: string;
  user: { id: number };
  userPreferences?: UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
};
