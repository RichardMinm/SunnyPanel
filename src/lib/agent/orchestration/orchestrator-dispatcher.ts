/** Orchestrator dispatcher — selects between legacy and LangChain implementations.
 *
 * This is the SINGLE decision point for orchestrator implementation selection.
 * The rest of the pipeline should not know which implementation is active.
 *
 * Contract:
 *  - Default mode is ALWAYS "legacy".
 *  - LangChain mode only activates when AGENT_ORCHESTRATOR_RUNTIME=langchain.
 *  - On LangChain failure, the dispatcher returns the safe clarify result.
 *  - There is NO automatic fallback from langchain to legacy.
 */

import type { AgentPromptContext } from "../prompts";
import type { OrchestratorPlan } from "./types";
import { resolveOrchestratorRuntimeMode } from "./runtime-config";
import { runOrchestrator as runLegacyOrchestrator } from "./orchestrator";
import {
  projectOrchestratorFailureToSafePlan,
  runLangChainOrchestratorResult,
  type OrchestratorInvocationResult,
} from "./langchain-orchestrator";
import { validateAndNormalizeOrchestratorPlanQueryScopes } from "./query-scope-contract";
import type {
  ModelCallBudgetRecorder,
  ModelCallRole,
} from "./model-call-budget";

export type OrchestratorCallAccountingOptions = Readonly<{
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

export const dispatchOrchestratorResult: OrchestratorService = async (
  message,
  context,
  signal,
  accounting = undefined,
) => {
  const mode = resolveOrchestratorRuntimeMode();
  const role = accounting?.role ?? "orchestrator";
  const scopeId = accounting?.scopeId ?? "orchestrator";

  if (mode === "langchain") {
    return runLangChainOrchestratorResult({
      context,
      message,
      modelCallRecorder: accounting?.modelCallRecorder,
      modelCallRole: role,
      modelCallScopeId: scopeId,
      signal,
    });
  }

  try {
    const queryScopeResult = validateAndNormalizeOrchestratorPlanQueryScopes({
      context,
      message,
      plan: await runLegacyOrchestrator(message, context, signal, {
        modelCallRecorder: accounting?.modelCallRecorder,
        role,
        scopeId,
      }),
    });
    if (!queryScopeResult.valid) {
      return {
        queryScopeErrorCode: queryScopeResult.code,
        reason: "invalid_query_scope",
        safeMessage: queryScopeResult.safeMessage,
        status: "unavailable",
      };
    }
    return {
      plan: queryScopeResult.plan,
      schedulePlanReferenceCorrectionCode: null,
      status: "success",
    };
  } catch {
    return {
      reason: "provider_error",
      safeMessage: "AI 服务暂时不可用，请稍后重试。",
      status: "unavailable",
    };
  }
};

/** Dispatch to the active orchestrator based on AGENT_ORCHESTRATOR_RUNTIME.
 *  Signature matches legacy runOrchestrator for drop-in compatibility. */
export const dispatchOrchestrator = async (
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
    ? projectOrchestratorFailureToSafePlan()
    : result.plan;
};

/** Re-export for convenience — the mode that was actually used. */
export { resolveOrchestratorRuntimeMode } from "./runtime-config";
export { runLangChainOrchestrator } from "./langchain-orchestrator";
export { runOrchestrator as runLegacyOrchestrator } from "./orchestrator";
