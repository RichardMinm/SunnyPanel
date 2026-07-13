import { routeTaskToAgent } from "./router";
import { getSpecializedAgent } from "./registry";
import type {
  SpecialistCallDisposition,
  SpecializedAgentRunInput,
  SpecializedAgentRunResult,
} from "./types";
import type { TaskNode } from "../orchestration/types";
import { logAgentEvent } from "../logger";
import { parseAgentIntentResult, type AgentIntent } from "../schemas";

const deterministicallyCompleteIntents = new Set<AgentIntent["intent"]>([
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "create_plan",
  "create_schedule_items",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
]);

export const evaluateSpecialistTaskCompleteness = (
  task: TaskNode,
): { disposition: SpecialistCallDisposition; intent: AgentIntent | null } => {
  const intent = parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });

  return {
    disposition:
      intent && deterministicallyCompleteIntents.has(intent.intent)
        ? "bypassed_complete"
        : "required_incomplete",
    intent,
  };
};

/**
 * 自纠偏安全门：专业 Agent 可在自己 supportedIntents 范围内改写 intent（纠正编排器分错），
 * 但若改成不支持的意图（模型幻觉/越权），回退到编排器分配的基础意图，避免链路漂移。
 */
export const reconcileEnrichedIntent = (
  baseIntent: AgentIntent,
  enrichedIntent: AgentIntent,
  supportedIntents: Array<AgentIntent["intent"]>,
): { corrected: boolean; intent: AgentIntent; rejectedIntent?: AgentIntent["intent"] } => {
  const intentChanged = enrichedIntent.intent !== baseIntent.intent;

  if (!intentChanged) {
    return { corrected: false, intent: enrichedIntent };
  }

  if (supportedIntents.includes(enrichedIntent.intent)) {
    return { corrected: true, intent: enrichedIntent };
  }

  return { corrected: false, intent: baseIntent, rejectedIntent: enrichedIntent.intent };
};

export const runSpecializedAgentForTask = async (
  task: TaskNode,
  input: Omit<SpecializedAgentRunInput, "taskLabel">,
  dependencies: {
    getSpecializedAgent?: typeof getSpecializedAgent;
  } = {},
): Promise<SpecializedAgentRunResult> => {
  const agentId = routeTaskToAgent(task);
  const definition = (dependencies.getSpecializedAgent ?? getSpecializedAgent)(agentId);
  const completeness = evaluateSpecialistTaskCompleteness(task);
  const baseIntent = completeness.intent ?? input.intent;
  const shouldEnrich =
    completeness.disposition === "required_incomplete" &&
    Boolean(definition.enrichIntent);

  if (shouldEnrich) {
    input.modelCallRecorder?.record("specialist", task.id);
  }

  const enrichedRaw = shouldEnrich && definition.enrichIntent
    ? (await definition.enrichIntent(baseIntent, input.promptContext, input.message, input.upstreamContext)) ?? baseIntent
    : baseIntent;

  const { corrected, intent: enriched, rejectedIntent } = reconcileEnrichedIntent(
    baseIntent,
    enrichedRaw,
    definition.supportedIntents,
  );

  if (shouldEnrich) {
    logAgentEvent("info", "agent.enrich_intent", {
      agentId,
      argsChanged: JSON.stringify(enriched.args) !== JSON.stringify(baseIntent.args),
      intent: enriched.intent,
      intentCorrected: corrected,
      intentRejected: rejectedIntent,
      taskId: task.id,
    });
  }

  return {
    agentId,
    agentRole: task.agentRole,
    intent: enriched,
    disposition: completeness.disposition,
    note: corrected
      ? `${definition.systemPromptHint} · ${task.label}（已自纠偏：${baseIntent.intent}→${enriched.intent}）`
      : `${definition.systemPromptHint} · ${task.label}`,
  };
};
