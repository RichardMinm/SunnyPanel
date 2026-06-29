import { runExecuteCapability, runPreviewCapability } from "../capabilities/adapters";
import type { CapabilityContext } from "../capabilities/types";
import type { ToolPlan } from "../plan/tool-plan";
import type { AgentIntent } from "../schemas";

export type WorkflowExecutionInput = {
  capabilityContext?: CapabilityContext;
  confirmed: boolean;
  intent: AgentIntent;
  toolPlan: ToolPlan;
};

export type WorkflowExecutionResult = {
  assistantMessage?: string;
  executedCapabilities: string[];
  ok: boolean;
  pendingProposal?: unknown;
};

export const executeWorkflowPlan = async (
  input: WorkflowExecutionInput,
): Promise<WorkflowExecutionResult> => {
  const executedCapabilities: string[] = [];

  if (input.toolPlan.workflow === "query") {
    return { executedCapabilities: input.toolPlan.plannedCapabilities, ok: true };
  }

  if (!input.confirmed) {
    const previewName = input.toolPlan.plannedCapabilities.find((name) => name.startsWith("preview_"));

    if (!previewName) {
      return { executedCapabilities, ok: true };
    }

    const preview = await runPreviewCapability(previewName, input.intent.args ?? {}, input.capabilityContext);

    return {
      assistantMessage: preview.summary,
      executedCapabilities: [previewName],
      ok: preview.ok,
      pendingProposal: preview.data,
    };
  }

  const executeName = input.toolPlan.executeCapability;

  if (!executeName) {
    return { executedCapabilities, ok: false };
  }

  const result = await runExecuteCapability(executeName, input.intent.args ?? {}, input.capabilityContext ?? {});

  if (result.ok) {
    executedCapabilities.push(executeName);
  }

  return {
    assistantMessage: result.summary,
    executedCapabilities,
    ok: result.ok,
  };
};
