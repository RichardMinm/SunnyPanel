import { dryRunAgentIntent } from "../safety";
import { executeAgentTool } from "../tool-registry";
import type { AgentIntent, AgentWriteIntentName, ProposedAgentAction } from "../schemas";
import { parseAgentIntentResult } from "../schemas";
import { getCapability } from "./registry";
import type { CapabilityContext, CapabilityResult } from "./types";

const asRecord = (input: unknown): Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

/** preview capability → legacy write intent */
const PREVIEW_CAPABILITY_TO_LEGACY: Record<
  string,
  { defaultArgs?: Record<string, unknown>; intent: AgentWriteIntentName }
> = {
  preview_create_plan: { intent: "create_plan" },
  preview_create_schedule: { intent: "compose_schedule_item" },
  preview_update_plan: {
    defaultArgs: { entityType: "plan" },
    intent: "modify_record",
  },
  preview_update_schedule: { intent: "reschedule_item" },
  preview_delete_plan: {
    defaultArgs: { entityType: "plan" },
    intent: "delete_record",
  },
  preview_delete_schedule: { intent: "cancel_schedule_item" },
  preview_update_checklist: {
    defaultArgs: { entityType: "checklist" },
    intent: "modify_record",
  },
  preview_delete_checklist: {
    defaultArgs: { entityType: "checklist" },
    intent: "delete_record",
  },
  preview_create_timeline: { intent: "compose_timeline_event" },
  preview_delete_timeline: {
    defaultArgs: { entityType: "timeline" },
    intent: "delete_record",
  },
};

/** execute capability → legacy write intent */
const EXECUTE_CAPABILITY_TO_LEGACY: Record<string, AgentWriteIntentName> = {
  execute_create_plan: "create_plan",
  execute_create_schedule: "compose_schedule_item",
  execute_update_plan: "modify_record",
  execute_update_schedule: "reschedule_item",
  execute_delete_plan: "delete_record",
  execute_delete_schedule: "cancel_schedule_item",
  execute_update_checklist: "modify_record",
  execute_delete_checklist: "delete_record",
  execute_create_timeline: "compose_timeline_event",
  execute_delete_timeline: "delete_record",
};

/** legacy write intent → preview / execute capability names */
const LEGACY_INTENT_TO_PREVIEW: Partial<Record<AgentWriteIntentName, string>> = {
  cancel_schedule_item: "preview_delete_schedule",
  compose_plan: "preview_create_plan",
  compose_schedule_item: "preview_create_schedule",
  create_plan: "preview_create_plan",
  delete_record: "preview_delete_plan",
  modify_record: "preview_update_plan",
  reschedule_item: "preview_update_schedule",
  compose_timeline_event: "preview_create_timeline",
};

const LEGACY_INTENT_TO_EXECUTE: Partial<Record<AgentWriteIntentName, string>> = {
  cancel_schedule_item: "execute_delete_schedule",
  compose_plan: "execute_create_plan",
  compose_schedule_item: "execute_create_schedule",
  create_plan: "execute_create_plan",
  delete_record: "execute_delete_plan",
  modify_record: "execute_update_plan",
  reschedule_item: "execute_update_schedule",
  compose_timeline_event: "execute_create_timeline",
};

export const legacyIntentForCapability = (name: string): AgentWriteIntentName | null => {
  const cap = getCapability(name);

  if (cap?.legacyIntent) {
    return cap.legacyIntent;
  }

  return PREVIEW_CAPABILITY_TO_LEGACY[name]?.intent ?? EXECUTE_CAPABILITY_TO_LEGACY[name] ?? null;
};

export const capabilityForLegacyIntent = (
  intent: AgentWriteIntentName,
  phase: "execute" | "preview" = "preview",
  entityType?: null | string,
): string | null => {
  if (entityType === "checklist") {
    if (intent === "modify_record") {
      return phase === "execute" ? "execute_update_checklist" : "preview_update_checklist";
    }

    if (intent === "delete_record") {
      return phase === "execute" ? "execute_delete_checklist" : "preview_delete_checklist";
    }
  }

  if (entityType === "timeline") {
    if (intent === "compose_timeline_event") {
      return phase === "execute" ? "execute_create_timeline" : "preview_create_timeline";
    }

    if (intent === "delete_record") {
      return phase === "execute" ? "execute_delete_timeline" : "preview_delete_timeline";
    }
  }

  const map = phase === "execute" ? LEGACY_INTENT_TO_EXECUTE : LEGACY_INTENT_TO_PREVIEW;

  return map[intent] ?? null;
};

export const executeCapabilityForPreview = (previewName: string): string | null => {
  if (!previewName.startsWith("preview_")) {
    return null;
  }

  const executeName = previewName.replace(/^preview_/, "execute_");

  return getCapability(executeName) ? executeName : null;
};

const buildLegacyIntent = (capabilityName: string, input: unknown): AgentIntent | null => {
  const mapping = PREVIEW_CAPABILITY_TO_LEGACY[capabilityName];

  if (mapping) {
    const args = { ...(mapping.defaultArgs ?? {}), ...asRecord(input) };

    if (capabilityName === "preview_create_plan" && typeof args.goal === "string" && args.goal.trim()) {
      return (
        parseAgentIntentResult({
          args: {
            dueDate: args.dueDate,
            goal: args.goal,
            priority: args.priority,
            scope: args.scope,
            title: args.title ?? args.goal,
          },
          confidence: 0.92,
          intent: "compose_plan",
        }) ?? null
      );
    }

    return (
      parseAgentIntentResult({
        args,
        confidence: 0.92,
        intent: mapping.intent,
      }) ?? null
    );
  }

  const legacyIntent = legacyIntentForCapability(capabilityName);

  if (!legacyIntent) {
    return null;
  }

  return (
    parseAgentIntentResult({
      args: asRecord(input),
      confidence: 0.92,
      intent: legacyIntent,
    }) ?? null
  );
};

export const intentFromCapabilityCall = (
  capabilityName: string,
  input: unknown,
): AgentIntent | null => buildLegacyIntent(capabilityName, input);

export const runPreviewCapability = async (
  name: string,
  input: unknown,
  _ctx: CapabilityContext = {},
): Promise<CapabilityResult> => {
  const intent = buildLegacyIntent(name, input);

  if (!intent) {
    return { ok: false, summary: `无法将 capability ${name} 映射为 legacy intent。`, error: "mapping_failed" };
  }

  const dryRun = await dryRunAgentIntent(intent);

  if (dryRun.type === "clarify") {
    return {
      ok: false,
      summary: dryRun.assistantMessage,
      error: "clarify",
      data: dryRun,
    };
  }

  if (dryRun.type === "proposed_action") {
    const action: ProposedAgentAction = {
      ...dryRun.action,
      capability: name,
      toolName: name,
    };

    return {
      ok: true,
      summary: action.summary,
      data: { action, dryRunType: dryRun.type, intent },
    };
  }

  if (dryRun.type === "bypass") {
    return {
      ok: true,
      summary: "该预览无需确认，可直接执行。",
      data: dryRun,
    };
  }

  return { ok: false, summary: "DryRun 未返回可用提案。", error: "empty_dry_run" };
};

export const runExecuteCapability = async (
  name: string,
  input: unknown,
  ctx: CapabilityContext = {},
): Promise<CapabilityResult> => {
  const legacyIntent = legacyIntentForCapability(name);

  if (!legacyIntent) {
    return { ok: false, summary: `${name} 无法映射到 legacy execute。`, error: "mapping_failed" };
  }

  const pending = ctx.pendingAction;

  if (pending) {
    const expectedExecute = executeCapabilityForPreview(pending.capability ?? "");

    if (expectedExecute && expectedExecute !== name) {
      return {
        error: "capability_mismatch",
        ok: false,
        summary: `确认的能力 ${pending.capability} 与 execute ${name} 不一致，已拒绝执行。`,
      };
    }

    if (ctx.confirmedPreviewId && pending.id !== ctx.confirmedPreviewId) {
      return {
        error: "action_id_mismatch",
        ok: false,
        summary: "确认的动作 ID 与待执行提案不匹配。",
      };
    }

    if (
      ctx.structuredCapability &&
      pending.capability &&
      ctx.structuredCapability !== pending.capability
    ) {
      return {
        error: "structured_capability_mismatch",
        ok: false,
        summary: "结构化确认携带的 capability 与提案不一致。",
      };
    }
  }

  const args = asRecord(input);
  const intentArgs =
    pending?.args && typeof pending.args === "object" && !Array.isArray(pending.args)
      ? { ...(pending.args as Record<string, unknown>), ...args }
      : args;
  const intent =
    parseAgentIntentResult({
      args: intentArgs,
      confidence: 1,
      intent: legacyIntent,
    }) ?? null;

  if (!intent) {
    return { ok: false, summary: "Execute 参数无法解析。", error: "invalid_args" };
  }

  const result = await executeAgentTool(intent as Extract<AgentIntent, { intent: AgentWriteIntentName }>);

  return {
    ok: true,
    summary: result.assistantMessage,
    data: result,
  };
};

export const attachCapabilityToProposedAction = (
  action: ProposedAgentAction,
  capability?: string,
): ProposedAgentAction => {
  const args =
    typeof action.args === "object" && action.args !== null && !Array.isArray(action.args)
      ? (action.args as Record<string, unknown>)
      : {};
  const entityType = typeof args.entityType === "string" ? args.entityType : null;
  const mapped =
    capability ??
    capabilityForLegacyIntent(action.intent as AgentWriteIntentName, "preview", entityType) ??
    undefined;

  return mapped ? { ...action, capability: mapped, toolName: mapped } : action;
};
