import { routeTaskToAgent } from "./router";
import { getSpecializedAgent } from "./registry";
import type { SpecializedAgentRunInput, SpecializedAgentRunResult } from "./types";
import type { TaskNode } from "../orchestration/types";
import { logAgentEvent } from "../logger";
import { parseAgentIntentResult } from "../schemas";

export const runSpecializedAgentForTask = async (
  task: TaskNode,
  input: Omit<SpecializedAgentRunInput, "taskLabel">,
): Promise<SpecializedAgentRunResult> => {
  const agentId = routeTaskToAgent(task);
  const definition = getSpecializedAgent(agentId);
  const baseIntent =
    parseAgentIntentResult({
      args: task.args,
      confidence: 0.9,
      intent: task.intent,
    }) ?? input.intent;

  const enriched = definition.enrichIntent
    ? (await definition.enrichIntent(baseIntent, input.promptContext, input.message)) ?? baseIntent
    : baseIntent;

  if (definition.enrichIntent) {
    logAgentEvent("info", "agent.enrich_intent", {
      agentId,
      argsChanged: JSON.stringify(enriched.args) !== JSON.stringify(baseIntent.args),
      intent: enriched.intent,
      taskId: task.id,
    });
  }

  return {
    agentId,
    agentRole: task.agentRole,
    intent: enriched,
    note: `${definition.systemPromptHint} · ${task.label}`,
  };
};
