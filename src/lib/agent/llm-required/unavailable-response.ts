/**
 * LLM Required Mode — unavailable response builder.
 *
 * Produces an AgentChatResponse that:
 *  - Has a static user-facing error message (no internal fields exposed)
 *  - Has no pendingAction, draft, receipt, or rollback
 *  - Has no write intent
 *  - Records backendTraceEvents for developer observability
 */

import type { AgentChatResponse } from "../schemas";
import type { AgentTraceEventPayload } from "../trace/types";
import type { AgentUnavailableReason } from "./types";
import { AGENT_UNAVAILABLE_USER_MESSAGE } from "./types";

export type BuildLLMUnavailableResponseInput = {
  reason: AgentUnavailableReason;
  threadId: number;
};

const reasonLabel: Record<AgentUnavailableReason, string> = {
  llm_disabled: "LLM disabled",
  llm_missing_api_key: "Missing API key",
  llm_missing_config: "Missing model configuration",
  llm_unavailable: "LLM unavailable",
};

/**
 * Build a stable AgentChatResponse for when LLM is unavailable in require mode.
 *
 * The user-facing message is a static string — no raw config, env vars,
 * API keys, or internal field names are exposed.
 *
 * Developer trace includes the reason via outputPreview.
 */
export const buildLLMUnavailableAgentResponse = (
  input: BuildLLMUnavailableResponseInput,
): AgentChatResponse => {
  const traceEvent: AgentTraceEventPayload = {
    createdAt: new Date().toISOString(),
    outputPreview: { reason: input.reason },
    phase: "llm_availability",
    status: "failed",
    summary: "LLM required but unavailable",
    threadId: String(input.threadId),
    title: reasonLabel[input.reason] ?? input.reason,
  };

  return {
    assistantMessage: AGENT_UNAVAILABLE_USER_MESSAGE,
    backendTraceEvents: [traceEvent],
    confidence: 1,
    engine: "workflow",
    intent: "clarify",
    pendingAction: null,
    threadId: input.threadId,
    tokenUsage: {
      contextTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      source: "estimate" as const,
      totalTokens: 0,
    },
  };
};
