import type { AgentIntent } from "@/lib/agent/schemas";

export type AgentGraphRuntimeMode = "hybrid" | "langgraph" | "legacy";

export type AgentGraphRuntimeConfig = {
  intents: ReadonlySet<AgentIntent["intent"]>;
  mode: AgentGraphRuntimeMode;
};

const DEFAULT_PHASE_ONE_INTENTS: AgentIntent["intent"][] = [
  "answer_question",
  "query_progress",
  "query_plan_progress",
];

const runtimeModes = new Set<AgentGraphRuntimeMode>([
  "hybrid",
  "langgraph",
  "legacy",
]);

const isAgentIntentName = (
  value: string,
): value is AgentIntent["intent"] =>
  [
    "add_completion_note",
    "answer_question",
    "append_plan_item",
    "cancel_schedule_item",
    "capability_query",
    "clarify",
    "complete_plan_item",
    "compose_plan",
    "compose_schedule_item",
    "compose_timeline_event",
    "create_plan",
    "delete_record",
    "evaluate_plan",
    "modify_record",
    "query_checklist_progress",
    "query_memory",
    "query_plan",
    "query_plan_progress",
    "query_progress",
    "query_schedule",
    "query_timeline",
    "reschedule_item",
    "save_memory",
    "schedule_plan",
    "weekly_review",
  ].includes(value);

export const getAgentGraphRuntimeConfig = (
  env: Record<string, string | undefined> = process.env,
): AgentGraphRuntimeConfig => {
  const rawMode = env.AGENT_GRAPH_RUNTIME?.trim().toLowerCase();
  const mode =
    rawMode && runtimeModes.has(rawMode as AgentGraphRuntimeMode)
      ? (rawMode as AgentGraphRuntimeMode)
      : "legacy";
  const configuredIntents = env.AGENT_LANGGRAPH_INTENTS
    ?.split(",")
    .map((intent) => intent.trim())
    .filter(isAgentIntentName);
  const intents =
    configuredIntents && configuredIntents.length > 0
      ? configuredIntents
      : DEFAULT_PHASE_ONE_INTENTS;

  return {
    intents: new Set(intents),
    mode,
  };
};

export const isLangGraphIntentEnabled = (
  intent: AgentIntent["intent"],
  config: AgentGraphRuntimeConfig,
) => config.intents.has(intent);
