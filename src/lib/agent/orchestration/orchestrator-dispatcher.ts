/** Authoritative LangChain Orchestrator entry.
 *
 * This is the single production entry for Orchestrator model decisions.
 *
 * Contract:
 *  - On LangChain failure, the dispatcher returns the safe clarify result.
 *  - There is no alternate Orchestrator or cross-mode fallback.
 */

import type { AgentPromptContext } from "../prompts";
import type { AgentChatMessage } from "../schemas";
import type { OrchestratorPlan } from "./types";
import {
  projectOrchestratorFailureToSafePlan,
  runLangChainOrchestratorResult,
  type OrchestratorInvocationResult,
} from "./langchain-orchestrator";
import type {
  ModelCallBudgetRecorder,
  ModelCallRole,
} from "./model-call-budget";

export type OrchestratorCallAccountingOptions = Readonly<{
  history?: readonly AgentChatMessage[];
  modelCallRecorder?: ModelCallBudgetRecorder;
  role?: Extract<ModelCallRole, "orchestrator" | "replan">;
  scopeId?: string;
}>;

export type OrchestratorService = (
  message: string,
  context: AgentPromptContext,
  signal?: AbortSignal,
  accounting?: OrchestratorCallAccountingOptions,
) => Promise<OrchestratorInvocationResult>;

export type OrchestratorPlanService = (
  message: string,
  context: AgentPromptContext,
  signal?: AbortSignal,
  accounting?: OrchestratorCallAccountingOptions,
) => Promise<OrchestratorPlan>;

export const dispatchOrchestratorResultForRuntime = async (
  input: Readonly<{
    context: AgentPromptContext;
    message: string;
    runLangChain: () => Promise<OrchestratorInvocationResult>;
  }>,
): Promise<OrchestratorInvocationResult> => input.runLangChain();

export const dispatchOrchestratorResult: OrchestratorService = async (
  message,
  context,
  signal,
  accounting = undefined,
) => {
  const role = accounting?.role ?? "orchestrator";
  const scopeId = accounting?.scopeId ?? "orchestrator";

  return dispatchOrchestratorResultForRuntime({
    context,
    message,
    runLangChain: () =>
      runLangChainOrchestratorResult({
        context,
        message,
        modelCallRecorder: accounting?.modelCallRecorder,
        modelCallRole: role,
        modelCallScopeId: scopeId,
        history: accounting?.history,
        signal,
      }),
  });
};

/** Return a safe plan projection for compatibility with plan consumers. */
export const dispatchOrchestrator: OrchestratorPlanService = async (
  message: string,
  context: AgentPromptContext,
  signal?: AbortSignal,
  accounting: OrchestratorCallAccountingOptions | undefined = undefined,
): Promise<OrchestratorPlan> => {
  const result = await dispatchOrchestratorResult(
    message,
    context,
    signal,
    accounting,
  );
  return result.status === "unavailable"
    ? projectOrchestratorFailureToSafePlan(result.reason)
    : result.plan;
};

/** Re-export for convenience — the mode that was actually used. */
export { resolveOrchestratorRuntimeMode } from "./runtime-config";
export { runLangChainOrchestrator } from "./langchain-orchestrator";
