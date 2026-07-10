/** Orchestrator runtime mode configuration.
 *
 * Controls which orchestrator implementation is used at runtime.
 *
 *   AGENT_ORCHESTRATOR_RUNTIME=legacy    → current production orchestrator (default)
 *   AGENT_ORCHESTRATOR_RUNTIME=langchain → new LangChain + Zod structured output orchestrator
 *
 * Unknown or unset values ALWAYS resolve to "legacy".
 * There is no automatic fallback between modes at runtime — switching
 * requires an explicit env-var change and restart.
 */

export type OrchestratorRuntimeMode = "langchain" | "legacy";

/** Resolve the orchestrator runtime mode from the environment.
 *  Never throws. Unknown values log a warning and return "legacy". */
export const resolveOrchestratorRuntimeMode = (): OrchestratorRuntimeMode => {
  const raw = process.env.AGENT_ORCHESTRATOR_RUNTIME?.trim().toLowerCase();

  if (!raw || raw === "legacy") {
    return "legacy";
  }

  if (raw === "langchain") {
    return "langchain";
  }

  console.warn(
    `[orchestrator] Unknown AGENT_ORCHESTRATOR_RUNTIME="${raw}". ` +
    'Falling back to "legacy". Valid values: legacy, langchain.',
  );

  return "legacy";
};

/** Returns true when LangChain orchestrator mode is enabled. */
export const isLangChainOrchestratorEnabled = (): boolean =>
  resolveOrchestratorRuntimeMode() === "langchain";
