/** LangChain + Zod structured output orchestrator.
 *
 * Uses the Phase L1-A foundation (model factory, message builder,
 * invokeStructured, OrchestratorOutputSchema) to produce validated
 * orchestration plans.
 *
 * On failure, this returns a safe clarify response. It NEVER falls
 * back to the legacy orchestrator or legacy write path automatically.
 */

import { logAgentEvent } from "../logger";
import type { AgentPromptContext } from "../prompts";
import { buildOrchestratorSystemPrompt, buildOrchestratorUserPrompt } from "../prompts/orchestrator";
import { invokeStructured } from "../llm/invoke-structured";
import { createChatModel } from "../llm/model-factory";
import { buildMessages } from "../llm/message-builder";
import { orchestratorOutputSchema, validateTaskDAG } from "../llm/schemas/orchestrator-output";
import type { ModelConfig } from "../llm/model-config";
import type { OrchestratorPlan } from "./types";
import { mapStructuredOutputToPlan } from "./orchestrator-mapper";

/* ---- Safe clarify fallback (deterministic, no model output reuse) ---- */

const SAFE_CLARIFY_PLAN: OrchestratorPlan = {
  mode: "single",
  reasoning: "LangChain Orchestrator 暂时无法可靠解析请求，需要重新确认。",
  source: "llm",
  tasks: [
    {
      id: "t1",
      label: "确认请求",
      intent: "clarify",
      args: {
        question:
          "我暂时无法可靠理解这项操作，请补充要创建、修改或查询的具体内容。",
      },
      dependsOn: [],
      agentRole: "query",
    },
  ],
};

/* ---- Workspace context builder ---- */

/** Build workspace context string from AgentPromptContext.
 *  This is UNTRUSTED data — it must be placed in a user-role message,
 *  never merged into system rules. */
const buildWorkspaceContext = (context: AgentPromptContext): string => {
  const parts: string[] = [];

  if (context.plans.length > 0) {
    parts.push("## 当前计划");
    for (const plan of context.plans.slice(0, 8)) {
      parts.push(
        `- [${plan.state ?? "active"}] ${plan.title ?? "未命名计划"}` +
        (plan.id ? ` (id=${plan.id})` : ""),
      );
    }
  }

  if (context.checklists.length > 0) {
    parts.push("\n## 当前清单");
    for (const cl of context.checklists.slice(0, 8)) {
      parts.push(`- ${cl.title ?? "未命名清单"} (id=${cl.id ?? "?"})`);
    }
  }

  if (context.memories && context.memories.length > 0) {
    parts.push("\n## 长期记忆");
    for (const mem of context.memories.slice(0, 10)) {
      parts.push(`- ${mem.content ?? ""}`.slice(0, 200));
    }
  }

  if (context.contentItems && context.contentItems.length > 0) {
    parts.push("\n## 写作内容");
    for (const item of context.contentItems.slice(0, 5)) {
      parts.push(`- ${item.title ?? "无标题"}`);
    }
  }

  return parts.join("\n") || "(empty workspace)";
};

/* ---- Main entry point ---- */

export type LangChainOrchestratorOptions = {
  message: string;
  context: AgentPromptContext;
  signal?: AbortSignal;
  /** Injectable model config for testing. */
  modelConfig?: ModelConfig;
};

export const runLangChainOrchestrator = async (
  options: LangChainOrchestratorOptions,
): Promise<OrchestratorPlan> => {
  const { message, context, signal, modelConfig } = options;

  /* 1. Build system rules (trusted, developer-authored) */
  const systemRules = buildOrchestratorSystemPrompt(context);

  /* 2. Build workspace context (UNTRUSTED user data) */
  const workspaceContext = buildWorkspaceContext(context);

  /* 3. Build messages with untrusted boundary */
  const messages = buildMessages({
    systemRules,
    workspaceContext,
    userMessage: buildOrchestratorUserPrompt(message, context),
  });

  /* 4. Resolve model config if not injected */
  let config: ModelConfig;

  if (modelConfig) {
    config = modelConfig;
  } else {
    try {
      const { getAgentModelConfig } = await import("../client");

      const rawConfig = await getAgentModelConfig();

      if (!rawConfig) {
        logAgentEvent("warn", "orchestrator.langchain.no_config", {});

        return SAFE_CLARIFY_PLAN;
      }

      const { createModelConfig } = await import("../llm/model-config");
      const resolved = createModelConfig({
        apiKey: rawConfig.apiKey,
        baseURL: rawConfig.baseUrl,
        model: rawConfig.model,
        provider: rawConfig.provider ?? "unknown",
      });

      if (typeof resolved === "object" && "code" in resolved) {
        logAgentEvent("warn", "orchestrator.langchain.invalid_config", {
          error: resolved.code,
        });

        return SAFE_CLARIFY_PLAN;
      }

      config = resolved;
    } catch (err) {
      logAgentEvent("warn", "orchestrator.langchain.config_error", {
        error: err instanceof Error ? err.message : String(err),
      });

      return SAFE_CLARIFY_PLAN;
    }
  }

  /* 5. Invoke with structured output */
  const result = await invokeStructured({
    schema: orchestratorOutputSchema,
    schemaName: "OrchestratorOutput",
    messages,
    modelConfig: config,
    modelFactory: createChatModel,
    signal,
    maxTransportRetries: 1,
    maxSchemaRetries: 1,
  });

  /* 6. Handle failure — safe clarify, no legacy fallback */
  if (!result.ok) {
    logAgentEvent("warn", "orchestrator.langchain.failed", {
      code: result.error.code,
      safeMessage: result.error.safeMessage,
    });

    return SAFE_CLARIFY_PLAN;
  }

  /* 7. Validate DAG */
  const dagResult = validateTaskDAG(result.data);

  if (!dagResult.valid) {
    logAgentEvent("warn", "orchestrator.langchain.invalid_dag", {
      errors: dagResult.errors,
    });

    return SAFE_CLARIFY_PLAN;
  }

  /* 8. Map to existing OrchestrationPlan */
  const plan = mapStructuredOutputToPlan(result.data);

  logAgentEvent("info", "orchestrator.langchain.completed", {
    mode: plan.mode,
    taskCount: plan.tasks.length,
  });

  return plan;
};
