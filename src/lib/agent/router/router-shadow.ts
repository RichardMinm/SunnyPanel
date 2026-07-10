/** Router Shadow — Structured Router comparison, no side effects.
 *
 * Calls the L1-A LangChain Router with the RouterOutputSchema
 * and compares the structured output against the production decision.
 *
 * Shadow results are NEVER authoritative. Failures are ALWAYS isolated.
 */

import { isRouterShadowEnabled } from "./router-shadow-config";
import { classifyIntent, type SafetyClass } from "../orchestration/safety-classifier";
import type { AgentIntent } from "../schemas";
import type {
  SanitizedStructuredOutputIssue,
  StructuredOutputDiagnostics,
} from "../llm/model-errors";
import type { ModelConfig } from "../llm/model-config";
import type { ModelFactory } from "../llm/model-factory";
import type { ChatMessage } from "../llm/message-builder";
import type { RouterProtocolContext } from "./router-protocol";

/* ---- Production decision snapshot ---- */

export interface ProductionDecisionSnapshot {
  intent: string;
  mode: "compound" | "single" | "unknown";
  readWriteClass: SafetyClass | "unknown";
  needsClarification: boolean;
}

/** Build a sanitized snapshot of the production decision for comparison. */
export const snapshotProductionDecision = (intent: AgentIntent | null): ProductionDecisionSnapshot => {
  if (!intent) {
    return { intent: "unknown", mode: "unknown", readWriteClass: "unknown", needsClarification: false };
  }

  return {
    intent: intent.intent,
    mode: "single", /* AgentIntent is always single-task */
    readWriteClass: classifyIntent(intent.intent),
    needsClarification: intent.intent === "clarify",
  };
};

/* ---- Shadow result ---- */

export interface RouterShadowResult {
  attempted: boolean;
  intent?: string;
  mode?: string;
  readWriteClass?: string;
  confidence?: number;
  needsClarification?: boolean;
  contextReferences?: Array<{
    type: string;
    id?: number;
    name?: string;
  }>;
  schemaValid?: boolean;
  latencyMs?: number;
  errorCode?: string;
  failureKind?: "provider" | "schema";
  schemaErrors?: RouterSchemaErrorCategory[];
  schemaIssues?: SanitizedStructuredOutputIssue[];
}

export type RouterSchemaErrorCategory =
  | "args_shape_invalid"
  | "context_reference_invalid"
  | "extra_fields_rejected"
  | "invalid_clarify_fields"
  | "invalid_intent"
  | "invalid_read_write_class"
  | "missing_required_field"
  | "other_zod_issue"
  | "provider_structured_output_protocol_failure";

export const classifyRouterSchemaDiagnostics = (
  diagnostics: StructuredOutputDiagnostics,
): RouterSchemaErrorCategory[] => {
  if (diagnostics.stage === "provider_protocol") {
    return ["provider_structured_output_protocol_failure"];
  }

  const categories = new Set<RouterSchemaErrorCategory>();

  for (const issue of diagnostics.issues) {
    const field = issue.path[0];

    if (issue.missing) categories.add("missing_required_field");
    else if (field === "intent") categories.add("invalid_intent");
    else if (field === "readWriteClass") categories.add("invalid_read_write_class");
    else if (field === "needsClarification" || field === "clarificationQuestion") {
      categories.add("invalid_clarify_fields");
    } else if (issue.code === "unrecognized_keys") categories.add("extra_fields_rejected");
    else if (field === "args") categories.add("args_shape_invalid");
    else if (field === "contextReferences") categories.add("context_reference_invalid");
    else categories.add("other_zod_issue");
  }

  return [...categories];
};

/* ---- Comparison ---- */

export type RouterMismatchCategory =
  | "match"
  | "intent_mismatch"
  | "mode_mismatch"
  | "read_write_mismatch"
  | "clarify_mismatch"
  | "resource_reference_mismatch"
  | "shadow_schema_failure"
  | "shadow_provider_failure"
  | "primary_unknown";

export interface RouterComparison {
  primary: ProductionDecisionSnapshot;
  shadow: RouterShadowResult;
  categories: RouterMismatchCategory[];
}

/** Compare production decision with shadow result. Pure function. */
export const compareRouterDecisions = (
  primary: ProductionDecisionSnapshot,
  shadow: RouterShadowResult,
): RouterComparison => {
  const categories: RouterMismatchCategory[] = [];

  if (!shadow.attempted) {
    return { primary, shadow, categories: ["shadow_provider_failure"] };
  }

  if (shadow.failureKind === "provider") {
    categories.push("shadow_provider_failure");
  } else if (shadow.schemaValid === false) {
    categories.push("shadow_schema_failure");
  }

  if (primary.intent === "unknown") {
    categories.push("primary_unknown");
  }

  if (shadow.intent && primary.intent !== "unknown") {
    if (primary.intent === shadow.intent) {
      categories.push("match");
    } else {
      categories.push("intent_mismatch");

      /* Safety-critical: read → write */
      const primarySC = primary.readWriteClass;
      const shadowSC: SafetyClass = shadow.readWriteClass === "answer"
        ? "read"
        : shadow.readWriteClass === "clarify"
          ? "clarify"
          : "write_candidate";

      if (
        (primarySC === "read" || primarySC === "clarify")
        && shadowSC === "write_candidate"
      ) {
        categories.push("read_write_mismatch");
      }

      if (primarySC === "clarify" && shadowSC === "write_candidate") {
        categories.push("clarify_mismatch");
      }
    }
  }

  if (categories.length === 0) {
    categories.push("match");
  }

  return { primary, shadow, categories };
};

/* ---- Shadow invocation ---- */

export type RouterShadowInput = {
  message: string;
  /** Sanitized context for Router — no raw workspace dump */
  context: RouterProtocolContext;
  signal?: AbortSignal;
};

export type RouterShadowDependencies = {
  modelConfig?: ModelConfig;
  modelFactory?: ModelFactory;
  /** Evaluation-only override for replaying an earlier prompt contract. */
  messagesBuilder?: (input: RouterShadowInput) => ChatMessage[];
  /** Observation-only counter hook. Never receives prompts, responses, or secrets. */
  onProviderCall?: () => void;
};

/* ---- Safety-first mismatch prioritization ---- */

/** Priority order: highest-risk category first. */
export const priorityCategory = (categories: RouterMismatchCategory[]): RouterMismatchCategory => {
  const order: RouterMismatchCategory[] = [
    "read_write_mismatch",
    "clarify_mismatch",
    "resource_reference_mismatch",
    "intent_mismatch",
    "mode_mismatch",
    "shadow_schema_failure",
    "shadow_provider_failure",
    "primary_unknown",
    "match",
  ];
  for (const cat of order) {
    if (categories.includes(cat)) return cat;
  }
  return "match";
};

/** Returns true if ANY category is safety-critical. */
export const isUnsafe = (categories: RouterMismatchCategory[]): boolean =>
  categories.includes("read_write_mismatch") || categories.includes("clarify_mismatch");

/* ---- In-memory collector (no DB, no schema) ---- */

export interface CollectorEntry {
  primaryIntent: string;
  shadowIntent?: string;
  primaryCategory: RouterMismatchCategory;
  allCategories: RouterMismatchCategory[];
  unsafe: boolean;
  latencyMs?: number;
  timestamp: string;
}

const collector: CollectorEntry[] = [];
const MAX_COLLECTOR_SIZE = 100;

/** Track pending shadow promises for test/observation use.
 *  Each pending promise settles independently; Primary never awaits them. */
const pendingPromises: Set<Promise<unknown>> = new Set();

export const getCollectorEntries = (): readonly CollectorEntry[] => collector;

export const clearCollector = (): void => { collector.length = 0; };

const addToCollector = (entry: CollectorEntry): void => {
  if (collector.length >= MAX_COLLECTOR_SIZE) collector.shift();
  collector.push(entry);
};

/** Resolves when all pending shadow promises have settled.
 *  For test/observation use ONLY — Primary code must never call this. */
export const flushPendingShadow = async (): Promise<void> => {
  while (pendingPromises.size > 0) {
    const batch = Array.from(pendingPromises);
    pendingPromises.clear();
    await Promise.allSettled(batch);
  }
};

/* ---- Safe shadow wrapper ---- */

export type SafeShadowOptions = {
  primaryIntent: string;
  message: string;
  hasActivePlans: boolean;
  hasChecklists: boolean;
  hasMemories: boolean;
  now: string;
  actor?: "admin" | "user";
};

/** Fire-and-forget shadow invocation. Schedules the shadow in background,
 *  tracking the promise for test/observation via flushPendingShadow().
 *  Primary code calls this and immediately continues — it NEVER awaits. */
export const scheduleRouterShadow = (options: SafeShadowOptions): void => {
  const promise = runRouterShadowSafely(options);
  pendingPromises.add(promise);
  void promise.then(
    () => pendingPromises.delete(promise),
    () => pendingPromises.delete(promise),
  );
};

/** Run Router Shadow safely — never throws, never blocks primary.
 *  Returns comparison or null if shadow is disabled/skipped.
 *  Internal; callers use scheduleRouterShadow() for production. */
const runRouterShadowSafely = async (
  options: SafeShadowOptions,
): Promise<RouterComparison | null> => {
  const mode = (await import("./router-shadow-config")).resolveRouterShadowMode();

  /* off → skip */
  if (mode === "off") return null;

  /* admin → only allowlist */
  if (mode === "admin" && options.actor !== "admin") return null;

  const primary = snapshotProductionDecision(
    { intent: options.primaryIntent, args: {}, confidence: 0.9 } as never,
  );

  const shadow = await runRouterShadow({
    message: options.message,
    context: {
      hasActivePlans: options.hasActivePlans,
      hasChecklists: options.hasChecklists,
      hasMemories: options.hasMemories,
      now: options.now,
    },
  });

  if (!shadow) {
    addToCollector({
      primaryIntent: options.primaryIntent,
      primaryCategory: "shadow_disabled" as RouterMismatchCategory,
      allCategories: ["shadow_disabled" as RouterMismatchCategory],
      unsafe: false,
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  const comparison = compareRouterDecisions(primary, shadow);
  const pc = priorityCategory(comparison.categories);

  addToCollector({
    primaryIntent: options.primaryIntent,
    shadowIntent: shadow.intent,
    primaryCategory: pc,
    allCategories: comparison.categories,
    unsafe: isUnsafe(comparison.categories),
    latencyMs: shadow.latencyMs,
    timestamp: new Date().toISOString(),
  });

  return comparison;
};

/** Run Router Shadow. Returns null when disabled. Catches ALL errors. */
export const runRouterShadow = async (
  input: RouterShadowInput,
  dependencies: RouterShadowDependencies = {},
): Promise<RouterShadowResult | null> => {
  if (!isRouterShadowEnabled()) return null;

  try {
    const { invokeStructured } = await import("../llm/invoke-structured");
    const { createChatModel } = await import("../llm/model-factory");
    const { routerOutputSchema, routerOutputBaseSchema } = await import("../llm/schemas/router-output");
    const { createModelConfig } = await import("../llm/model-config");
    const { buildRouterProtocolMessages } = await import("./router-protocol");

    /* Resolve config from env vars directly — skip Payload to avoid
     *   Postgres dependency in shadow path. Production config is
     *   still resolved through the full chain in the Primary path. */
    const configResult = dependencies.modelConfig ?? (() => {
      const envApiKey =
        process.env.DEEPSEEK_API_KEY?.trim() ||
        process.env.OPENAI_API_KEY?.trim() ||
        process.env.ZAI_API_KEY?.trim();

      if (!envApiKey) return null;

      const provider = process.env.DEEPSEEK_API_KEY ? "deepseek"
        : process.env.OPENAI_API_KEY ? "openai"
        : "zai";

      const baseURL =
        process.env.DEEPSEEK_BASE_URL?.trim() ||
        process.env.OPENAI_BASE_URL?.trim() ||
        process.env.ZAI_BASE_URL?.trim() ||
        "https://api.deepseek.com";

      const model =
        process.env.DEEPSEEK_MODEL?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        process.env.ZAI_MODEL?.trim() ||
        "deepseek-v4-pro";

      return createModelConfig({ apiKey: envApiKey, baseURL, model, provider });
    })();

    if (!configResult) {
      return { attempted: true, errorCode: "no_config", failureKind: "provider" };
    }

    if (typeof configResult === "object" && "code" in configResult) {
      return { attempted: true, errorCode: configResult.code, failureKind: "provider" };
    }

    const messages = dependencies.messagesBuilder?.(input)
      ?? buildRouterProtocolMessages(input);

    const start = Date.now();
    dependencies.onProviderCall?.();
    const result = await invokeStructured({
      schema: routerOutputSchema,
      modelSchema: routerOutputBaseSchema,
      schemaName: "RouterOutput",
      messages,
      modelConfig: configResult,
      modelFactory: dependencies.modelFactory ?? createChatModel,
      signal: input.signal,
      maxTransportRetries: 0,
      maxSchemaRetries: 0,
    });

    if (!result.ok) {
      const diagnostics = result.error.structuredOutput;

      return {
        attempted: true,
        schemaValid: diagnostics ? false : undefined,
        failureKind: diagnostics ? "schema" : "provider",
        schemaErrors: diagnostics
          ? classifyRouterSchemaDiagnostics(diagnostics)
          : undefined,
        schemaIssues: diagnostics ? [...diagnostics.issues] : undefined,
        errorCode: result.error.code,
        latencyMs: Date.now() - start,
      };
    }

    const allowedResourceIds = new Set(input.context.resourceIds ?? []);
    const inventedResourceId = result.data.contextReferences.some(
      (reference) => reference.id !== undefined && !allowedResourceIds.has(reference.id),
    );

    if (inventedResourceId) {
      return {
        attempted: true,
        schemaValid: false,
        failureKind: "schema",
        schemaErrors: ["context_reference_invalid"],
        schemaIssues: [{
          code: "custom",
          path: ["contextReferences"],
          missing: false,
        }],
        errorCode: "ROUTER_CONTEXT_REFERENCE_INVALID",
        latencyMs: Date.now() - start,
      };
    }

    return {
      attempted: true,
      intent: result.data.intent,
      mode: result.data.mode,
      readWriteClass: result.data.readWriteClass,
      confidence: result.data.confidence,
      needsClarification: result.data.needsClarification,
      contextReferences: result.data.contextReferences,
      schemaValid: true,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      attempted: true,
      errorCode: "shadow_exception",
      failureKind: "provider",
    };
  }
};
