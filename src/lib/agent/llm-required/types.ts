/**
 * LLM Required Mode — shared types.
 *
 * When AGENT_REQUIRE_LLM=1 and LLM is unavailable, the Agent returns an
 * unavailable error instead of falling back to heuristic business logic.
 *
 * Safety invariants (Policy Guard, Confirmation, Receipt, Rollback, etc.)
 * are NOT affected — they remain deterministic regardless of this mode.
 */

export type AgentUnavailableReason =
  | "llm_unavailable"
  | "llm_disabled"
  | "llm_missing_config"
  | "llm_missing_api_key";

export type AgentLLMAvailability =
  | { available: true }
  | {
      available: false;
      reason: AgentUnavailableReason;
      /** Developer-facing detail (goes to trace, NOT user-visible message). */
      message: string;
    };

/** User-visible static message when Agent is unavailable in require mode. */
export const AGENT_UNAVAILABLE_USER_MESSAGE =
  "当前 Agent 需要 LLM 才能处理这个请求。请检查模型配置后重试。";
