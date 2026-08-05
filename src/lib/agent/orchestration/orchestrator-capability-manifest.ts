import {
  AGENT_INTENT_PARAMETER_HINTS,
  AGENT_INTENT_REQUIRED_FIELDS,
} from "../function-tools";
import { ROUTER_INTENT_NAMES, type RouterIntentName } from "../llm/schemas/router-output";
import type { AgentPromptContext } from "../prompts";
import { buildLLMToolCatalog } from "../tool-planner/build-tool-catalog";
import {
  READ_QUERY_INTENTS,
} from "./orchestrator-decision-consistency";
import {
  getResourceProtocolProjection,
  type ResourceKind,
} from "./resource-readiness-guard";

export const ORCHESTRATOR_CAPABILITY_MANIFEST_VERSION =
  "orchestrator-capability-manifest-v1";

export type OrchestratorCapabilityAvailability =
  | "available"
  | "context_dependent"
  | "clarify_only_missing_resource"
  | "requires_explicit_resource_reference";

export type OrchestratorCapabilityManifestEntry = Readonly<{
  availability: OrchestratorCapabilityAvailability;
  capability: "draft" | "read" | "write";
  description: string;
  directExecutionAllowed: false;
  intent: RouterIntentName;
  optionalArgs: readonly string[];
  requiredArgs: readonly string[];
  resourceContract: null | Readonly<{
    idFields: readonly string[];
    kind: ResourceKind;
    titleFields: readonly string[];
  }>;
  selectionEffect: "draft_candidate" | "read_only" | "write_candidate";
}>;

const routerIntentNames = new Set<string>(ROUTER_INTENT_NAMES);
const resourceContracts = new Map(
  getResourceProtocolProjection().map((entry) => [entry.intent, entry] as const),
);

const resourceCount = (
  context: AgentPromptContext,
  kind: ResourceKind,
): number => {
  switch (kind) {
    case "plan":
      return context.plans.length;
    case "checklist":
      return context.checklists.length;
    case "schedule_item":
      return context.schedules?.length ?? 0;
    case "timeline_event":
      return context.timelineEvents?.length ?? 0;
  }
};

const availabilityFor = (
  intent: string,
  context?: AgentPromptContext,
): OrchestratorCapabilityAvailability => {
  const contract = resourceContracts.get(intent);
  if (!contract) return "available";
  if (!context) return "context_dependent";
  return resourceCount(context, contract.resourceKind) > 0
    ? "requires_explicit_resource_reference"
    : "clarify_only_missing_resource";
};

const selectionEffectFor = (
  capability: "draft" | "read" | "write",
): OrchestratorCapabilityManifestEntry["selectionEffect"] => {
  switch (capability) {
    case "read":
      return "read_only";
    case "draft":
      return "draft_candidate";
    case "write":
      return "write_candidate";
  }
};

export const buildOrchestratorCapabilityManifest = (
  context?: AgentPromptContext,
): readonly OrchestratorCapabilityManifestEntry[] =>
  Object.freeze(
    buildLLMToolCatalog().flatMap((tool) => {
      if (!routerIntentNames.has(tool.name)) return [];
      if (
        tool.capability !== "read"
        && tool.capability !== "draft"
        && tool.capability !== "write"
      ) {
        return [];
      }

      const intent = tool.name as RouterIntentName;
      const argumentHints = AGENT_INTENT_PARAMETER_HINTS[intent as keyof typeof AGENT_INTENT_PARAMETER_HINTS];
      const argumentNames = Object.keys(argumentHints ?? {});
      const requiredArgs = AGENT_INTENT_REQUIRED_FIELDS[
        intent as keyof typeof AGENT_INTENT_REQUIRED_FIELDS
      ] ?? [];
      const requiredArgSet = new Set(requiredArgs);
      const contract = resourceContracts.get(intent);

      return [Object.freeze({
        availability: availabilityFor(intent, context),
        capability: tool.capability,
        description: tool.description,
        directExecutionAllowed: false as const,
        intent,
        optionalArgs: Object.freeze(
          argumentNames.filter((name) => !requiredArgSet.has(name)),
        ),
        requiredArgs: Object.freeze([...requiredArgs]),
        resourceContract: contract
          ? Object.freeze({
              idFields: Object.freeze([...contract.existingIdFields]),
              kind: contract.resourceKind,
              titleFields: Object.freeze([...contract.existingTitleFields]),
            })
          : null,
        selectionEffect: selectionEffectFor(tool.capability),
      })];
    }),
  );

const registeredIntentNames = new Set(
  buildOrchestratorCapabilityManifest().map(({ intent }) => intent),
);

export const ORCHESTRATOR_PROTOCOL_ONLY_INTENTS = Object.freeze([
  "answer_question",
  "clarify",
  ...READ_QUERY_INTENTS.filter((intent) => !registeredIntentNames.has(intent)),
] as const);

export const ORCHESTRATOR_NON_CANONICAL_CONVERSATION_INTENTS = Object.freeze(
  ROUTER_INTENT_NAMES.filter(
    (intent) =>
      !registeredIntentNames.has(intent)
      && !ORCHESTRATOR_PROTOCOL_ONLY_INTENTS.includes(
        intent as (typeof ORCHESTRATOR_PROTOCOL_ONLY_INTENTS)[number],
      ),
  ),
);

const formatArgs = (args: readonly string[]): string =>
  args.length > 0 ? args.join("|") : "none";

export const renderOrchestratorCapabilityManifest = (
  context?: AgentPromptContext,
): string => {
  const entries = buildOrchestratorCapabilityManifest(context)
    .map((entry) => {
      const resource = entry.resourceContract
        ? [
            entry.resourceContract.kind,
            `ids=${formatArgs(entry.resourceContract.idFields)}`,
            `titles=${formatArgs(entry.resourceContract.titleFields)}`,
          ].join(";")
        : "none";
      return [
        `- ${entry.intent}`,
        `capability=${entry.capability}`,
        `effect=${entry.selectionEffect}`,
        `availability=${entry.availability}`,
        `required=${formatArgs(entry.requiredArgs)}`,
        `optional=${formatArgs(entry.optionalArgs)}`,
        `resource=${resource}`,
        `description=${entry.description}`,
      ].join(" | ");
    })
    .join("\n");

  return `[${ORCHESTRATOR_CAPABILITY_MANIFEST_VERSION}]
这份清单由当前 Tool Registry、Router intent allowlist、共享参数提示和 Resource Guard 合同生成。
你只能选择清单中的 intent 或下方 protocol-only intent；选择并不等于执行。
${entries}

protocol-only intents: ${ORCHESTRATOR_PROTOCOL_ONLY_INTENTS.join(", ")}
non-canonical conversation intents: ${ORCHESTRATOR_NON_CANONICAL_CONVERSATION_INTENTS.join(", ")}

Capability Manifest 规则：
- capability=read 只能读取或表达事实，不能产生业务写入。
- capability=draft 只能形成草案候选；capability=write 只能形成 write candidate。
- directExecutionAllowed 对所有条目恒为 false；模型永远不能直接执行工具。
- availability=clarify_only_missing_resource 时必须输出 clarify，不得选择对应 mutation intent。
- availability=requires_explicit_resource_reference 时，只有用户消息或可信 workspace resource projection 明确且唯一定位资源后才能选择。
- non-canonical conversation intents 必须规范化为 answer_question，不得作为 Orchestrator task intent。
- 参数只能使用 required/optional 中列出的字段；没有足够信息时澄清，不得猜测 ID、字段或执行结果。
- 后续 Zod、Resource Guard、Dry-run、Policy、Confirmation 与 Executor 仍拥有最终裁决权。`;
};
