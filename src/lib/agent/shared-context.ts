import type { AgentPromptContext } from "./prompts";
import type { PendingAction } from "./schemas";
import type { AgentRole } from "./orchestration/types";
import { getRelevantMemories } from "./memory";

export type ActionTrace = {
  agentRole?: AgentRole;
  intent: string;
  recordedAt: string;
  summary: string;
};

export type WorkingMemory = {
  activePlanId?: number;
  pendingConfirmations: PendingAction[];
  recentActions: ActionTrace[];
  sessionId: string;
};

export type SharedContextSnapshot = {
  longTermMemoryCount: number;
  promptContext: AgentPromptContext;
  workingMemory: WorkingMemory;
};

const createSessionId = () => `session-${Date.now()}`;

export const createWorkingMemory = (input: {
  pendingAction?: null | PendingAction;
  sessionId?: string;
}): WorkingMemory => ({
  activePlanId: undefined,
  pendingConfirmations: input.pendingAction ? [input.pendingAction] : [],
  recentActions: [],
  sessionId: input.sessionId ?? createSessionId(),
});

export const appendActionTrace = (
  memory: WorkingMemory,
  trace: Omit<ActionTrace, "recordedAt"> & { recordedAt?: string },
): WorkingMemory => ({
  ...memory,
  recentActions: [
    ...memory.recentActions,
    {
      ...trace,
      recordedAt: trace.recordedAt ?? new Date().toISOString(),
    },
  ].slice(-12),
});

export const buildSharedContextSnapshot = async (input: {
  message: string;
  pendingAction?: null | PendingAction;
  promptContext: AgentPromptContext;
  sessionId?: string;
}): Promise<SharedContextSnapshot> => {
  const memories = await getRelevantMemories(input.message, 8);

  return {
    longTermMemoryCount: memories.length,
    promptContext: {
      ...input.promptContext,
      memories: memories.map((memory) => ({
        confidence: memory.confidence ?? 0.7,
        content: memory.content,
        id: memory.id,
        lastUsedAt: memory.lastUsedAt ?? null,
        title: memory.title,
        type: memory.type,
      })),
    },
    workingMemory: createWorkingMemory({
      pendingAction: input.pendingAction,
      sessionId: input.sessionId,
    }),
  };
};

export const mergeBusResultsIntoWorkingMemory = (
  memory: WorkingMemory,
  results: Array<{ agentRole: AgentRole; intent: string; summary: string }>,
): WorkingMemory =>
  results.reduce(
    (current, result) =>
      appendActionTrace(current, {
        agentRole: result.agentRole,
        intent: result.intent,
        summary: result.summary,
      }),
    memory,
  );
