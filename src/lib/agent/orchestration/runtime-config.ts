/** The authoritative Orchestrator is permanently LangChain.
 *
 * This compatibility surface remains for trace and evaluation consumers. It
 * intentionally does not read an environment variable and cannot select a
 * second Orchestrator implementation.
 */
export type OrchestratorRuntimeMode = "langchain";

export const resolveOrchestratorRuntimeMode = (): OrchestratorRuntimeMode =>
  "langchain";

export const isLangChainOrchestratorEnabled = (): true => true;
