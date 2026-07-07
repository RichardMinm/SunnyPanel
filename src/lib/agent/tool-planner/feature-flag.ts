/**
 * Phase LLM-R3: Tool Planner feature flag.
 *
 * AGENT_LLM_TOOL_PLANNER=0 (default) → planner not active
 * AGENT_LLM_TOOL_PLANNER=1          → planner enabled (prototype only)
 *
 * The planner is also gated by AGENT_REQUIRE_LLM / AGENT_DISABLE_LLM —
 * if LLM is unavailable in require mode, the planner returns "failed".
 */

export const isLLMToolPlannerEnabled = (): boolean =>
  process.env.AGENT_LLM_TOOL_PLANNER === "1";

/**
 * Trace-only shadow mode: runs the LLM Tool Planner alongside the pipeline,
 * records structured trace events, but has ZERO effect on business decisions.
 *
 * AGENT_LLM_TOOL_PLANNER_TRACE_ONLY=0 (default) → shadow planner not active
 * AGENT_LLM_TOOL_PLANNER_TRACE_ONLY=1          → run shadow planner, trace only
 */
export const isAgentToolPlannerTraceOnlyEnabled = (): boolean =>
  process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY === "1";

/**
 * LangGraph Tool Planner Runtime (Read/Draft Only).
 *
 * AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME=0 (default) → graph runtime not active
 * AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME=1          → run LangGraph runtime (R4B)
 *
 * Priority: graph runtime (R4B) > shadow runner (R4A)
 */
export const isAgentToolPlannerGraphRuntimeEnabled = (): boolean =>
  process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME === "1";

/**
 * Write Tool Dry-run Proposal Integration (R4C).
 *
 * AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS=0 (default) → write steps blocked (R4B behavior)
 * AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS=1          → eligible write steps enter dryRun → Policy Guard → pending preview
 *
 * Requires: AGENT_REQUIRE_LLM=1 + AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME=1
 */
export const isAgentToolPlannerWriteProposalsEnabled = (): boolean =>
  process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS === "1";

/**
 * Real Policy Guard & PendingAction Integration (R4D).
 *
 * AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION=0 (default) → keep R4C preview-only
 * AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION=1          → real Policy Guard + real PendingAction
 *
 * Requires: AGENT_REQUIRE_LLM=1 + AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME=1
 *           + AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS=1
 */
export const isAgentToolPlannerRealPendingActionEnabled = (): boolean =>
  process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION === "1";
