/**
 * Deterministic tool metadata retained for the authoritative Capability Manifest.
 * The retired LLM Tool Planner runtime is intentionally not exported here.
 */
export { buildLLMToolCatalog } from "./build-tool-catalog";
export type { BuildLLMToolCatalogOptions } from "./build-tool-catalog";
export { validateLLMToolPlan } from "./validate-tool-plan";
export type { ValidateLLMToolPlanOptions } from "./validate-tool-plan";

export type {
  LLMToolCatalogEntry,
  LLMToolPlan,
  LLMToolPlanMode,
  LLMToolPlanStep,
  LLMToolPlanValidationResult,
} from "./types";

export {
  buildToolPlannerUnavailableAgentResponse,
  buildCapabilityAnswerResponse,
  buildLegacyHeuristicRetiredResponse,
} from "./unavailable-response";
export type {
  AgentToolPlannerUnavailableReason,
  BuildCapabilityAnswerResponseInput,
  BuildToolPlannerUnavailableResponseInput,
} from "./unavailable-response";
