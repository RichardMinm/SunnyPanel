/** Public API surface for the LLM foundation layer.
 *
 * This module provides LangChain-based model construction, structured
 * output invocation, Zod-validated schemas for Router and Orchestrator
 * outputs, and message building with untrusted-context isolation.
 *
 * This is a NEW layer — it coexists alongside the legacy
 * complete-structured.ts / client.ts and does NOT switch production paths.
 */

/* Model configuration */
export {
  createModelConfig,
  isModelConfigValid,
  resolveModelApiProtocol,
  summarizeModelConfig,
} from "./model-config";
export type { ModelApiProtocol, ModelConfig, ModelProvider } from "./model-config";

/* Model factory */
export { createChatModel } from "./model-factory";
export type { ModelFactory } from "./model-factory";

/* Model errors */
export {
  isModelError,
  modelAuthFailed,
  modelInvalidResponse,
  modelNotConfigured,
  modelRateLimited,
  modelSchemaViolation,
  modelTimeout,
  modelUnavailable,
  structuredOutputInvalid,
  structuredOutputRetryExhausted,
  structuredOutputUnsupported,
} from "./model-errors";
export type { ModelError, ModelErrorCode } from "./model-errors";

/* Structured invocation */
export { invokeStructured } from "./invoke-structured";
export type {
  InvokeStructuredOptions,
  StructuredModelResult,
} from "./invoke-structured";

/* Safe structured-output protocol diagnostics */
export {
  createSafeProtocolDiagnostics,
} from "./structured-protocol";
export type {
  SafeProtocolDiagnostics,
  StructuredProtocolFailure,
} from "./structured-protocol";

/* Strict whole-output prompt JSON parser */
export {
  extractWholePromptJson,
  parsePromptJsonObject,
} from "./prompt-json-parser";

/* Provider capabilities */
export {
  getProviderCapabilities,
  getStructuredOutputMode,
  mapStatusCodeToError,
} from "./provider-capabilities";
export type {
  ProviderCapabilityProfile,
  StructuredOutputMode,
} from "./provider-capabilities";

/* Message builder */
export { buildMessages, estimateMessageTokens } from "./message-builder";
export type { BuildMessagesParams, ChatMessage, MessageRole } from "./message-builder";

/* Router schema */
export {
  classifyIntentRoute,
  contextReferenceSchema,
  readWriteClassSchema,
  ROUTER_OUTPUT_SCHEMA_VERSION,
  routerIntentNameSchema,
  routerOutputSchema,
} from "./schemas/router-output";
export type {
  ContextReference,
  ReadWriteClass,
  RouterIntentName,
  RouterOutput,
} from "./schemas/router-output";

/* Orchestrator schema */
export {
  agentRoleSchema,
  ORCHESTRATOR_OUTPUT_SCHEMA_VERSION,
  orchestratorOutputBaseSchema,
  orchestratorOutputSchema,
  orchestratorTaskSchema,
  validateTaskDAG,
} from "./schemas/orchestrator-output";
export type {
  AgentRole,
  DAGValidationResult,
  OrchestratorOutput,
  OrchestratorTask,
} from "./schemas/orchestrator-output";

/* Task output reference */
export {
  taskOutputRefSchema,
  validateOutputRefDependencies,
} from "./schemas/task-output-ref";
export type { TaskOutputRef } from "./schemas/task-output-ref";
