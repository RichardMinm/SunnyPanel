import { completeStructuredStreaming } from "../llm/complete-structured";
import { logAgentEvent } from "../logger";
import type { AgentPromptContext } from "../prompts";
import { buildOrchestratorSystemPrompt, buildOrchestratorUserPrompt } from "../prompts/orchestrator";
import { parseAgentIntentResult, type AgentIntent } from "../schemas";
import { parseHeuristicIntent } from "../heuristic-intent-resolver";
import type { AgentRole, OrchestratorPlan, TaskNode } from "./types";

const agentRoles = new Set<AgentRole>(["plan", "schedule", "review", "memory", "content", "query"]);

const parseTaskNode = (value: unknown): TaskNode | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const intent = typeof record.intent === "string" ? record.intent : null;
  const id = typeof record.id === "string" ? record.id : null;
  const label = typeof record.label === "string" ? record.label : null;

  if (!intent || !id || !label) {
    return null;
  }

  const parsedIntent = parseAgentIntentResult({
    args: record.args && typeof record.args === "object" ? record.args : {},
    confidence: 0.85,
    intent,
  });

  if (!parsedIntent) {
    return null;
  }

  const agentRole =
    typeof record.agentRole === "string" && agentRoles.has(record.agentRole as AgentRole)
      ? (record.agentRole as AgentRole)
      : inferAgentRole(parsedIntent.intent);

  const dependsOn = Array.isArray(record.dependsOn)
    ? record.dependsOn.filter((item): item is string => typeof item === "string")
    : [];

  return {
    agentRole,
    args: parsedIntent.args as Record<string, unknown>,
    dependsOn,
    id,
    intent: parsedIntent.intent,
    label,
  };
};

const inferAgentRole = (intent: AgentIntent["intent"]): AgentRole => {
  if (intent === "compose_plan" || intent === "create_plan" || intent === "append_plan_item" || intent === "schedule_plan") {
    return "plan";
  }

  if (intent === "compose_schedule_item" || intent === "reschedule_item" || intent === "cancel_schedule_item") {
    return "schedule";
  }

  if (intent === "weekly_review" || intent === "evaluate_plan") {
    return "review";
  }

  if (intent === "save_memory") {
    return "memory";
  }

  if (intent === "query_progress" || intent === "query_plan_progress") {
    return "query";
  }

  return "content";
};

const parseOrchestratorPlan = (value: unknown): OrchestratorPlan | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const mode = record.mode === "compound" ? "compound" : record.mode === "single" ? "single" : null;
  const reasoning = typeof record.reasoning === "string" ? record.reasoning : "";

  if (!mode || !Array.isArray(record.tasks)) {
    return null;
  }

  const tasks = record.tasks.map(parseTaskNode).filter((task): task is TaskNode => task !== null);

  if (tasks.length === 0) {
    return null;
  }

  return {
    mode: tasks.length > 1 ? "compound" : "single",
    reasoning,
    tasks,
  };
};

const heuristicToPlan = (message: string): OrchestratorPlan => {
  const intent = parseHeuristicIntent(message);

  return {
    mode: "single",
    reasoning: "启发式单意图解析",
    source: "heuristic",
    tasks: [
      {
        agentRole: inferAgentRole(intent.intent),
        args: intent.args as Record<string, unknown>,
        dependsOn: [],
        id: "t1",
        intent: intent.intent,
        label: intent.intent,
      },
    ],
  };
};

export const runOrchestrator = async (
  message: string,
  context: AgentPromptContext,
  signal?: AbortSignal,
): Promise<OrchestratorPlan> => {
  const result = await completeStructuredStreaming({
    fallback: () => heuristicToPlan(message),
    messages: [
      { role: "system", content: buildOrchestratorSystemPrompt(context) },
      { role: "user", content: buildOrchestratorUserPrompt(message, context) },
    ],
    parse: parseOrchestratorPlan,
    temperature: 0.2,
    signal,
  });

  if (!result) {
    logAgentEvent("warn", "orchestrator.fallback", { reason: "no_llm_no_parse" });

    return heuristicToPlan(message);
  }

  logAgentEvent("info", "orchestrator.completed", {
    mode: result.data.mode,
    source: result.data.source ?? "llm",
    taskCount: result.data.tasks.length,
  });

  return {
    ...result.data,
    source: result.data.source ?? "llm",
  };
};

export const orchestratorPlanToIntent = (plan: OrchestratorPlan): AgentIntent | null => {
  if (plan.tasks.length !== 1) {
    return null;
  }

  const task = plan.tasks[0];

  return parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });
};
