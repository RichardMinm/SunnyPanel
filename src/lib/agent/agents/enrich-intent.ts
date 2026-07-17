import { completeStructured } from "../llm/complete-structured";
import type { AgentPromptContext } from "../prompts";
import { parseAgentIntentResult, type AgentIntent } from "../schemas";
import type { SpecializedAgentInvocationOptions } from "./types";

export const buildEnrichIntentUserPrompt = (
  intent: AgentIntent,
  message: string,
  context: AgentPromptContext,
  upstreamContext?: string,
) => {
  const planSummary =
    context.plans.length > 0
      ? context.plans
          .slice(0, 10)
          .map((plan) => `- [${plan.state}/${plan.priority}] ${plan.title} (id=${plan.id ?? "?"})`)
          .join("\n")
      : "";

  return [
    `用户原话：${message}`,
    `编排器分配的意图：${intent.intent}`,
    `已有参数：${JSON.stringify(intent.args, null, 2)}`,
    planSummary ? `现有计划：\n${planSummary}` : "",
    upstreamContext ? `上游已完成任务的产物与推理（请据此补全参数、引用已生成的 id，并在它们冲突时纠正本任务意图）：\n${upstreamContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const enrichIntentWithAgentPrompt = async ({
  buildSystemPrompt,
  context,
  intent,
  message,
  onProviderAttempt,
  upstreamContext,
}: {
  buildSystemPrompt: (context: AgentPromptContext) => string;
  context: AgentPromptContext;
  intent: AgentIntent;
  message: string;
  onProviderAttempt?: SpecializedAgentInvocationOptions["onProviderAttempt"];
  upstreamContext?: string;
}): Promise<AgentIntent> => {
  const result = await completeStructured({
    fallback: () => intent,
    messages: [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: buildEnrichIntentUserPrompt(intent, message, context, upstreamContext) },
    ],
    onProviderAttempt,
    parse: (value) => parseAgentIntentResult(value),
    temperature: 0.3,
  });

  return result?.data ?? intent;
};
