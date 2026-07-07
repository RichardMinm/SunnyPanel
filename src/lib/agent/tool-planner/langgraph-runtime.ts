/**
 * Phase LLM-R4C: LangGraph Tool Planner Runtime (Write Dry-run Proposal).
 */

import { Annotation, StateGraph } from "@langchain/langgraph";
import { buildLLMToolCatalog } from "./build-tool-catalog";
import { planToolsWithLLM } from "./llm-tool-planner";
import { validateLLMToolPlan } from "./validate-tool-plan";
import { getAgentToolDefinition, dryRunAgentTool } from "../tool-registry";
import { isAgentRequireLLMEnabled, isAgentLLMDisabled } from "../llm-required";
import { isAgentToolPlannerWriteProposalsEnabled, isAgentToolPlannerRealPendingActionEnabled } from "./feature-flag";
import { applyPolicyGuard } from "../policy/guard";
import { evaluatePolicyGuard } from "../policy/tool-gate";
import { buildProposedActionMessage } from "../safety";
import type { AgentTraceEventPayload } from "../trace/types";
import type { LLMToolPlan, LLMToolPlanStep } from "./types";
import type {
  ToolPlannerGraphState,
  ToolPlannerGraphStatus,
  ToolPlannerStepResult,
  ToolPlannerWriteProposalResult,
  ToolPlannerPolicyResult,
  ToolPlannerRealPendingActionResult,
} from "./langgraph-state";
import type { ProposedAgentAction } from "../schemas";
import type { AgentRouterOutput } from "../router/types";

/* ──── Allowlist ──── */
const WRITE_PROPOSAL_ALLOWLIST: ReadonlySet<string> = new Set([
  "create_schedule_items",
  "create_plan",
  "create_checklist",
]);

/* ──── Annotation ──── */
const GraphAnnotation = Annotation.Root({
  sessionId: Annotation<string | undefined>,
  userMessage: Annotation<string>,
  currentDate: Annotation<string | undefined>,
  timezone: Annotation<string | undefined>,
  status: Annotation<ToolPlannerGraphStatus>,
  toolPlan: Annotation<LLMToolPlan | undefined>,
  validatedPlan: Annotation<LLMToolPlan | undefined>,
  validationWarnings: Annotation<string[]>,
  readSteps: Annotation<LLMToolPlanStep[]>,
  draftSteps: Annotation<LLMToolPlanStep[]>,
  blockedSteps: Annotation<LLMToolPlanStep[]>,
  stepResults: Annotation<ToolPlannerStepResult[]>,
  writeProposalResults: Annotation<ToolPlannerWriteProposalResult[]>,
  proposalStatus: Annotation<ToolPlannerGraphState["proposalStatus"]>,
  /** R4D: Real Policy Guard results for eligible write steps. */
  policyResults: Annotation<ToolPlannerPolicyResult[]>,
  /** R4D: Real PendingAction from a single eligible write step. */
  realPendingAction: Annotation<ToolPlannerRealPendingActionResult | null | undefined>,
  /** R4D: User-facing assistant message for the real PendingAction. */
  assistantMessage: Annotation<string | undefined>,
  traceEvents: Annotation<AgentTraceEventPayload[]>,
  error: Annotation<ToolPlannerGraphState["error"]>,
});

/* ──── Trace helpers ──── */
const makeTrace = (status: AgentTraceEventPayload["status"], title: string, summary: string, meta?: Record<string, unknown>): AgentTraceEventPayload => ({
  createdAt: new Date().toISOString(), phase: "tool_planning", status, threadId: "graph", title, summary,
  outputPreview: { mode: "graph_runtime", ...meta },
});

const sanitizeEvents = (events: AgentTraceEventPayload[]): AgentTraceEventPayload[] => {
  const forbidden = ["sk-", "Bearer", "api_key", "apiKey", "token", "secret", "password", "rawPrompt", "rawResponse"];
  return events.map((e) => { const s = JSON.stringify(e); for (const t of forbidden) if (s.includes(t)) return { ...e, outputPreview: { sanitized: true } }; return e; });
};

/* ──── Nodes ──── */

const checkLLMAvailabilityNode = (_: typeof GraphAnnotation.State) => {
  if (isAgentRequireLLMEnabled() && isAgentLLMDisabled()) {
    return { status: "failed" as const, error: { code: "llm_unavailable", message: "LLM required but disabled." }, traceEvents: [makeTrace("failed", "Graph: LLM unavailable", "LLM required mode active but LLM disabled")] };
  }
  return { traceEvents: [makeTrace("started", "Graph: starting", "LangGraph tool planner runtime started")] };
};

const prepareToolCatalogNode = (_: typeof GraphAnnotation.State) => {
  const catalog = buildLLMToolCatalog();
  return { status: "planning" as const, traceEvents: [makeTrace("success", "Graph: catalog ready", `Catalog: ${catalog.length} tools`, { toolCount: catalog.length })] };
};

const planToolsNode = async (state: typeof GraphAnnotation.State) => {
  try {
    const result = await planToolsWithLLM({ userMessage: state.userMessage, currentDate: state.currentDate, timezone: state.timezone });
    if (result.status === "planned") {
      return { toolPlan: result.plan, traceEvents: [makeTrace("success", "Graph: plan generated", "LLM plan generated", { confidence: result.plan.confidence, stepCount: result.plan.steps.length })] };
    }
    return { status: "failed" as const, error: { code: "planner_failed", message: result.message }, traceEvents: [makeTrace("failed", "Graph: plan failed", result.message)] };
  } catch (err) {
    return { status: "failed" as const, error: { code: "planner_error", message: err instanceof Error ? err.message : String(err) }, traceEvents: [makeTrace("failed", "Graph: planner error", "LLM planner threw an error")] };
  }
};

const validatePlanNode = (state: typeof GraphAnnotation.State) => {
  if (!state.toolPlan) return { status: "failed" as const, error: { code: "no_plan", message: "No tool plan to validate." } };
  const result = validateLLMToolPlan(state.toolPlan);
  if (result.ok) return { status: "validated" as const, validatedPlan: result.plan, validationWarnings: result.warnings, traceEvents: [makeTrace("success", "Graph: plan validated", "Tool plan passed validation", { warnings: result.warnings.length })] };
  return { status: "failed" as const, validationWarnings: result.warnings, error: { code: "validation_failed", message: result.reason }, traceEvents: [makeTrace("failed", "Graph: plan rejected", result.reason)] };
};

const routeStepsNode = (state: typeof GraphAnnotation.State) => {
  if (!state.validatedPlan) return { status: "failed" as const };
  const readSteps: LLMToolPlanStep[] = [], draftSteps: LLMToolPlanStep[] = [], blockedSteps: LLMToolPlanStep[] = [];
  for (const step of state.validatedPlan.steps) {
    const toolDef = getAgentToolDefinition(step.toolName as string as keyof typeof import("../tool-registry").agentToolRegistry);
    if (!toolDef) { blockedSteps.push(step); continue; }
    if (toolDef.capability === "read" && step.mode === "read") { readSteps.push(step); continue; }
    if (toolDef.capability === "draft" && (step.mode === "draft" || step.mode === "dry_run")) { draftSteps.push(step); continue; }
    // Write tools with dry_run mode → eligible for R4C proposal (but routing still puts in blockedSteps; R4C node will filter)
    if (toolDef.capability === "write" && step.mode === "dry_run") { blockedSteps.push(step); continue; }
    blockedSteps.push(step);
  }
  return { readSteps, draftSteps, blockedSteps, traceEvents: [makeTrace("success", "Graph: steps routed", `Steps: ${readSteps.length} read, ${draftSteps.length} draft, ${blockedSteps.length} pending`)], proposalStatus: "none" as const };
};

/* ──── R4B: Read/Draft dryRun previews ──── */

/** R5-B: Build a natural-language assistant message from read/draft preview results. */
const buildReadDraftAssistantMessage = (state: typeof GraphAnnotation.State): string | undefined => {
  const previewedResults = (state.stepResults ?? []).filter((r) => r.status === "previewed");
  if (previewedResults.length === 0) return undefined;

  const lines = previewedResults
    .map((r) => {
      const pv = r.preview as { summary?: string; type?: string } | undefined;
      if (pv?.summary) return `• ${pv.summary}`;
      if (pv?.type === "clarify") return null; // clarify-type results without summary are skipped
      return null;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return undefined;
  return `根据你的请求，我准备了以下预览（不会写入数据库）：\n\n${lines.join("\n")}`;
};

const runReadDraftPreviewsNode = async (state: typeof GraphAnnotation.State) => {
  const results: ToolPlannerStepResult[] = [];
  const allSteps = [...state.readSteps, ...state.draftSteps];
  for (const step of allSteps) {
    try {
      const toolDef = getAgentToolDefinition(step.toolName as string as keyof typeof import("../tool-registry").agentToolRegistry);
      if (!toolDef) { results.push({ stepId: step.id, toolName: step.toolName, mode: step.mode, status: "skipped", reason: "unknown" }); continue; }
      // R5-B: guard against tools without dryRun support
      if (!toolDef.supportsDryRun) { results.push({ stepId: step.id, toolName: step.toolName, mode: step.mode, status: "skipped", reason: "Tool does not support dryRun" }); continue; }
      const dr = await toolDef.dryRun(step.input as never, {});
      // R5-C: Extract assistantMessage from clarify-type results for read tools
      let preview: { summary?: string; riskLevel?: string; type?: string };
      if (dr.type === "proposed_action") {
        preview = { summary: dr.action.summary, riskLevel: dr.action.riskLevel };
      } else {
        // clarify type — extract assistantMessage for read tools
        preview = { type: dr.type, summary: (dr as { assistantMessage?: string }).assistantMessage };
      }
      results.push({ stepId: step.id, toolName: step.toolName, mode: step.mode, status: "previewed", preview });
    } catch (err) {
      results.push({ stepId: step.id, toolName: step.toolName, mode: step.mode, status: "error", reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
    }
  }
  return { stepResults: results, traceEvents: [makeTrace("success", "Graph: read/draft previews done", "Read/draft previews completed", { previewedCount: allSteps.length })] };
};

/* ──── R4C: Write dry-run proposals ──── */

const runWriteDryRunProposalsNode = async (state: typeof GraphAnnotation.State) => {
  if (!isAgentToolPlannerWriteProposalsEnabled()) {
    // R4B behavior: block all write steps
    const blockedResults: ToolPlannerStepResult[] = state.blockedSteps.map((s) => ({ stepId: s.id, toolName: s.toolName, mode: s.mode, status: "blocked" as const, reason: "Write step blocked (R4C not enabled)" }));
    return { stepResults: [...state.stepResults, ...blockedResults], proposalStatus: "none" as const, traceEvents: [makeTrace("warning", "Graph: write steps blocked", "R4C write proposals not enabled")] };
  }

  const writeResults: ToolPlannerWriteProposalResult[] = [];
  let anyEligible = false;

  for (const step of state.blockedSteps) {
    // Eligibility check
    if (step.mode !== "dry_run") {
      writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "mode must be dry_run" });
      continue;
    }
    const toolDef = getAgentToolDefinition(step.toolName as string as keyof typeof import("../tool-registry").agentToolRegistry);
    if (!toolDef) { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "unknown tool" }); continue; }
    if (toolDef.capability !== "write") { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "not write capability" }); continue; }
    if (!WRITE_PROPOSAL_ALLOWLIST.has(step.toolName)) { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "not in write proposal allowlist" }); continue; }
    if (!toolDef.requiresConfirmation) { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "requiresConfirmation=false" }); continue; }
    if (toolDef.canRunWithoutConfirmation) { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "canRunWithoutConfirmation=true" }); continue; }
    if (!toolDef.supportsDryRun) { writeResults.push({ stepId: step.id, toolName: step.toolName, status: "blocked", reason: "tool does not support dryRun" }); continue; }

    // Eligible — call dryRun
    try {
      const dryRunResult = await dryRunAgentTool({ intent: step.toolName, args: step.input } as never, {});
      writeResults.push({ stepId: step.id, toolName: step.toolName, status: "dry_run_success", dryRunPreview: dryRunResult });
      anyEligible = true;
    } catch (err) {
      writeResults.push({ stepId: step.id, toolName: step.toolName, status: "dry_run_failed", reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
    }
  }

  const proposalStatus = anyEligible ? "dry_run_ready" as const : "none" as const;
  return { writeProposalResults: writeResults, proposalStatus, traceEvents: [makeTrace("success", "Graph: write proposals", anyEligible ? "Write dry-run proposals ready for Policy Guard" : "No eligible write steps", { eligibleCount: writeResults.filter((r) => r.status === "dry_run_success").length })] };
};

/* ──── R4C + R4D: Policy Guard ──── */

/** Build a synthetic AgentRouterOutput for Policy Guard evaluation from a tool plan step. */
const buildSyntheticRouterOutput = (step: LLMToolPlanStep, plan: LLMToolPlan): AgentRouterOutput => ({
  action: "create",
  confidence: plan.confidence,
  intent: { intent: step.toolName, args: step.input, confidence: plan.confidence } as AgentRouterOutput["intent"],
  reason: step.reason,
  requiresWrite: true,
  target: {},
});

const evaluatePolicyGuardNode = (state: typeof GraphAnnotation.State) => {
  // R4D path: real Policy Guard evaluation
  if (isAgentToolPlannerRealPendingActionEnabled() && state.proposalStatus === "dry_run_ready" && state.writeProposalResults && state.validatedPlan) {
    const policyResults: ToolPlannerPolicyResult[] = [];
    let anyPassed = false;

    for (const result of state.writeProposalResults) {
      if (result.status !== "dry_run_success") continue;

      const step = state.validatedPlan.steps.find((s) => s.id === result.stepId);
      if (!step) {
        policyResults.push({
          stepId: result.stepId, toolName: result.toolName,
          policyGuardOutput: { allowDryRun: false, allowExecute: false, mustShowImpactPreview: false, reason: "Step not found in plan", requiresConfirmation: false, riskLevel: "none", writeRequired: false },
          toolGateResult: { allowed: false, allowedTools: [], plannedTools: [], reason: "Step not found in plan" },
          passed: false, blockReason: "Step not found in validated plan",
        });
        continue;
      }

      try {
        const syntheticRouter = buildSyntheticRouterOutput(step, state.validatedPlan);
        const policyGuardOutput = applyPolicyGuard({ router: syntheticRouter });
        const toolGateResult = evaluatePolicyGuard(syntheticRouter, { userContext: { userId: 0 } });

        const passed = toolGateResult.allowed && policyGuardOutput.allowDryRun;

        policyResults.push({
          stepId: result.stepId, toolName: result.toolName,
          policyGuardOutput, toolGateResult, passed,
          blockReason: passed ? undefined : (toolGateResult.reason || policyGuardOutput.reason),
        });

        if (passed) anyPassed = true;
      } catch (err) {
        policyResults.push({
          stepId: result.stepId, toolName: result.toolName,
          policyGuardOutput: { allowDryRun: false, allowExecute: false, mustShowImpactPreview: false, reason: "Policy evaluation error", requiresConfirmation: false, riskLevel: "none", writeRequired: false },
          toolGateResult: { allowed: false, allowedTools: [], plannedTools: [], reason: err instanceof Error ? err.message : String(err) },
          passed: false, blockReason: `Policy Guard error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const proposalStatus = anyPassed ? "pending_preview" as const : "policy_blocked" as const;
    return {
      policyResults,
      proposalStatus,
      traceEvents: [makeTrace(anyPassed ? "success" : "warning", "Graph: real policy guard", anyPassed ? "Real Policy Guard passed — proceeding to pending action" : "Real Policy Guard blocked all write proposals", { evaluatedCount: policyResults.length, passedCount: policyResults.filter((r) => r.passed).length })],
    };
  }

  // R4C path: preview-only policy evaluation (unchanged)
  if (state.proposalStatus !== "dry_run_ready" || !state.writeProposalResults) {
    return { proposalStatus: "none" as const };
  }

  const results = [...state.writeProposalResults];
  let anyPassed = false;

  for (const result of results) {
    if (result.status !== "dry_run_success") continue;

    try {
      result.status = "pending_preview";
      result.policyDecision = "preview_only";
      result.pendingActionPreview = { toolName: result.toolName, status: "pending_preview", note: "Preview only — not a real pendingAction. Real Policy Guard will evaluate in the actual pipeline." };
      anyPassed = true;
    } catch {
      result.status = "policy_failed";
      result.policyDecision = "error";
      result.reason = "Unexpected error in policy evaluation preview";
    }
  }

  const proposalStatus = anyPassed ? "pending_preview" as const : "policy_blocked" as const;
  return { writeProposalResults: results, proposalStatus, traceEvents: [makeTrace(anyPassed ? "success" : "warning", "Graph: policy evaluation (preview)", anyPassed ? "Preview policy passed — pending preview" : "Preview policy blocked all write proposals")] };
};

/* ──── R4C: Build Confirmation Preview (preview-only, no real PendingAction) ──── */

const buildConfirmationPreviewNode = (state: typeof GraphAnnotation.State) => {
  if (state.proposalStatus !== "pending_preview") {
    // Blocked write steps go into stepResults
    const blockedResults: ToolPlannerStepResult[] = (state.writeProposalResults ?? []).map((r) => ({ stepId: r.stepId, toolName: r.toolName, mode: "dry_run", status: r.status === "blocked" ? "blocked" as const : "skipped" as const, reason: r.reason }));
    // R5-B: Build assistant message for read/draft completions (no write proposals)
    const assistantMessage = buildReadDraftAssistantMessage(state);
    return { stepResults: [...state.stepResults, ...blockedResults], status: "completed" as const, assistantMessage, traceEvents: [makeTrace("skipped", "Graph: no pending", assistantMessage ? "Read/draft previews ready" : "Write proposals did not reach pending preview stage")] };
  }

  const passedResults = (state.writeProposalResults ?? []).filter((r) => r.status === "pending_preview");
  const stepResults: ToolPlannerStepResult[] = passedResults.map((r) => ({ stepId: r.stepId, toolName: r.toolName, mode: "dry_run", status: "previewed" as const, preview: r.pendingActionPreview }));
  // Also record blocked results
  const blocked = (state.writeProposalResults ?? []).filter((r) => r.status !== "pending_preview").map((r) => ({ stepId: r.stepId, toolName: r.toolName, mode: "dry_run", status: "blocked" as const, reason: r.reason }));

  return {
    stepResults: [...state.stepResults, ...stepResults, ...blocked],
    status: "completed" as const,
    traceEvents: [
      makeTrace("success", "Graph: pending preview", `Write proposals ready: ${passedResults.length} pending preview`, { previewCount: passedResults.length, proposalStatus: "pending_preview" }),
      makeTrace("success", "Graph: STOP", "Pipeline stopped before execute. User must confirm before any database write."),
    ],
  };
};

/* ──── R4D: Build Real PendingAction ──── */

const buildRealPendingActionNode = (state: typeof GraphAnnotation.State) => {
  if (!isAgentToolPlannerRealPendingActionEnabled() || state.proposalStatus !== "pending_preview") {
    // R5-B: When no real pending action, build assistant message for read/draft completions
    const assistantMessage = buildReadDraftAssistantMessage(state);
    return { assistantMessage };
  }

  const policyResults = state.policyResults ?? [];
  const passedResults = policyResults.filter((r) => r.passed);

  if (passedResults.length !== 1) {
    // R4D requires exactly one eligible write step
    const blockedResults: ToolPlannerStepResult[] = policyResults
      .filter((r) => !r.passed)
      .map((r) => ({ stepId: r.stepId, toolName: r.toolName, mode: "dry_run", status: "blocked" as const, reason: r.blockReason }));
    return {
      stepResults: [...state.stepResults, ...blockedResults],
      realPendingAction: null,
      status: "completed" as const,
      traceEvents: [makeTrace("warning", "Graph: real pending skipped", passedResults.length === 0 ? "No write proposals passed Policy Guard" : `Multiple write proposals passed (${passedResults.length}) — R4D requires exactly one`)],
    };
  }

  const passed = passedResults[0];
  const writeResult = (state.writeProposalResults ?? []).find((r) => r.stepId === passed.stepId);
  if (!writeResult || writeResult.status !== "dry_run_success") {
    return {
      stepResults: [...state.stepResults],
      realPendingAction: null,
      status: "completed" as const,
      traceEvents: [makeTrace("warning", "Graph: real pending skipped", "Dry-run result not found for passed policy step")],
    };
  }

  // Extract ProposedAgentAction from dry-run result
  const dryRunResult = writeResult.dryRunPreview as { type?: string; action?: ProposedAgentAction } | undefined;
  if (!dryRunResult || dryRunResult.type !== "proposed_action" || !dryRunResult.action) {
    return {
      stepResults: [...state.stepResults],
      realPendingAction: null,
      status: "completed" as const,
      traceEvents: [makeTrace("warning", "Graph: real pending skipped", "Dry-run result is not a proposed_action — cannot build PendingAction")],
    };
  }

  const proposedAction: ProposedAgentAction = dryRunResult.action;
  const realPendingAction = {
    action: proposedAction,
    type: "await_confirmation" as const,
  };

  const assistantMessage = buildProposedActionMessage(proposedAction);

  const result: ToolPlannerRealPendingActionResult = {
    stepId: passed.stepId,
    toolName: passed.toolName,
    proposedAction,
    pendingAction: realPendingAction,
    policyGuardOutput: passed.policyGuardOutput,
    source: "llm_tool_planner",
  };

  // Add previewed step result for trace
  const previewStep: ToolPlannerStepResult = {
    stepId: passed.stepId,
    toolName: passed.toolName,
    mode: "dry_run",
    status: "previewed",
    preview: {
      actionId: proposedAction.id,
      summary: proposedAction.summary,
      riskLevel: proposedAction.riskLevel,
      changesCount: proposedAction.changes.length,
      source: "llm_tool_planner",
    },
  };

  return {
    stepResults: [...state.stepResults, previewStep],
    realPendingAction: result,
    status: "completed" as const,
    traceEvents: [
      makeTrace("success", "Graph: real pending action", `Real PendingAction created: ${proposedAction.summary}`, {
        actionId: proposedAction.id,
        toolName: passed.toolName,
        riskLevel: proposedAction.riskLevel,
        source: "llm_tool_planner",
      }),
      makeTrace("success", "Graph: STOP", "Real PendingAction created. Pipeline stopped before execute. User must confirm before any database write."),
    ],
    assistantMessage,
  };
};

const finalizeTraceNode = (state: typeof GraphAnnotation.State) => {
  const finalStatus = state.status === "failed" ? "failed" : "completed";
  const hasRealPending = state.realPendingAction != null;
  return {
    status: finalStatus as ToolPlannerGraphStatus,
    traceEvents: [makeTrace("success", "Graph: trace finalized", `Graph runtime ${finalStatus}`, {
      status: finalStatus,
      readSteps: state.readSteps.length,
      draftSteps: state.draftSteps.length,
      blockedSteps: state.blockedSteps.length,
      writeProposals: (state.writeProposalResults ?? []).length,
      hasRealPendingAction: hasRealPending,
      r4dEnabled: isAgentToolPlannerRealPendingActionEnabled(),
    })],
  };
};

/* ──── Graph builder ──── */

const buildGraph = () => {
  const graph = new StateGraph(GraphAnnotation)
    .addNode("checkLLM", checkLLMAvailabilityNode)
    .addNode("prepareCatalog", prepareToolCatalogNode)
    .addNode("planTools", planToolsNode)
    .addNode("validatePlan", validatePlanNode)
    .addNode("routeSteps", routeStepsNode)
    .addNode("runReadDraftPreviews", runReadDraftPreviewsNode)
    .addNode("runWriteDryRunProposals", runWriteDryRunProposalsNode)
    .addNode("evaluatePolicyGuard", evaluatePolicyGuardNode)
    .addNode("buildConfirmationPreview", buildConfirmationPreviewNode)
    .addNode("buildRealPendingAction", buildRealPendingActionNode)
    .addNode("finalizeTrace", finalizeTraceNode)

    .addEdge("__start__", "checkLLM")
    .addConditionalEdges("checkLLM", (s) => s.status === "failed" ? "finalizeTrace" : "prepareCatalog")
    .addEdge("prepareCatalog", "planTools")
    .addConditionalEdges("planTools", (s) => s.status === "failed" ? "finalizeTrace" : "validatePlan")
    .addConditionalEdges("validatePlan", (s) => s.status === "failed" ? "finalizeTrace" : "routeSteps")
    .addEdge("routeSteps", "runReadDraftPreviews")
    .addEdge("runReadDraftPreviews", "runWriteDryRunProposals")
    .addEdge("runWriteDryRunProposals", "evaluatePolicyGuard")
    // R4D: route to real pending action when flag on and policy passed, else R4C preview
    .addConditionalEdges("evaluatePolicyGuard", (s) => {
      if (isAgentToolPlannerRealPendingActionEnabled() && s.proposalStatus === "pending_preview" && (s.policyResults ?? []).some((r) => r.passed)) {
        return "buildRealPendingAction";
      }
      return "buildConfirmationPreview";
    })
    .addEdge("buildConfirmationPreview", "finalizeTrace")
    .addEdge("buildRealPendingAction", "finalizeTrace")
    .addEdge("finalizeTrace", "__end__");

  return graph.compile();
};

/* ──── Public runner ──── */

export const runToolPlannerGraphRuntime = async (input: {
  userMessage: string; sessionId?: string; currentDate?: string; timezone?: string;
}): Promise<{
  status: ToolPlannerGraphStatus;
  traceEvents: AgentTraceEventPayload[];
  stepResults: ToolPlannerStepResult[];
  error?: ToolPlannerGraphState["error"];
  /** R4D: Real PendingAction (await_confirmation shape) when feature flag is on and proposal passes Policy Guard. */
  realPendingAction?: ToolPlannerRealPendingActionResult | null;
  /** R4D: User-facing assistant message for the real PendingAction. */
  assistantMessage?: string;
}> => {
  try {
    const graph = buildGraph();
    const result = await graph.invoke({
      userMessage: input.userMessage, currentDate: input.currentDate, timezone: input.timezone, sessionId: input.sessionId,
      status: "idle", validationWarnings: [], readSteps: [], draftSteps: [], blockedSteps: [], stepResults: [], writeProposalResults: [], proposalStatus: "none", policyResults: [], realPendingAction: undefined, traceEvents: [],
    });
    return {
      status: result.status as ToolPlannerGraphStatus,
      traceEvents: sanitizeEvents(result.traceEvents ?? []),
      stepResults: result.stepResults ?? [],
      error: result.error,
      realPendingAction: result.realPendingAction ?? undefined,
      assistantMessage: result.assistantMessage ?? undefined,
    };
  } catch (err) {
    return { status: "failed", traceEvents: [makeTrace("failed", "Graph: runtime error", err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200))], stepResults: [], error: { code: "graph_runtime_error", message: "Unexpected error in graph runtime" } };
  }
};
