import type { OrchestratorPlan } from "./types";
import type {
  ResourceReadinessErrorCode,
  ResourceReadinessIssue,
} from "./resource-readiness-guard";

const projectableCodes = [
  "RESOURCE_ID_MISSING",
  "RESOURCE_ID_PLACEHOLDER",
  "RESOURCE_ID_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_CONFLICT",
  "RESOURCE_TITLE_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_AMBIGUOUS",
  "RESOURCE_REF_MISSING",
  "RESOURCE_KIND_MISMATCH",
] as const satisfies readonly ResourceReadinessErrorCode[];

export const PROJECTABLE_RESOURCE_CLARIFICATION_CODES:
  ReadonlySet<ResourceReadinessErrorCode> = new Set(projectableCodes);

export type ResourceClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  resourceIssueCodes: readonly ResourceReadinessErrorCode[];
}>;

const questionByResourceKind = Object.freeze({
  checklist:
    "我没有在当前工作区找到你要操作的清单。请提供准确的清单标题，或先创建清单。",
  plan:
    "我没有在当前工作区找到你要操作的计划。请提供准确的计划名称或计划 ID。",
  schedule_item:
    "我没有在当前工作区找到你要操作的日程项。请提供准确的日程项。",
  timeline_event:
    "我没有在当前工作区找到你要操作的时间线事件。请提供准确的事件。",
});

const clarificationQuestion = (
  issues: readonly ResourceReadinessIssue[],
): string => {
  const resourceKinds = new Set(issues.map(({ resourceKind }) => resourceKind));
  if (resourceKinds.size !== 1) {
    return "我无法安全确定要操作的已有资源。请明确资源类型和准确名称。";
  }

  const [resourceKind] = resourceKinds;
  return questionByResourceKind[
    resourceKind as keyof typeof questionByResourceKind
  ] ?? "我无法安全确定要操作的已有资源。请明确资源类型和准确名称。";
};

export const projectResourceIssuesToClarification = (
  issues: readonly ResourceReadinessIssue[],
): ResourceClarificationProjection | null => {
  if (
    issues.length === 0
    || issues.some(
      ({ code }) => !PROJECTABLE_RESOURCE_CLARIFICATION_CODES.has(code),
    )
  ) {
    return null;
  }

  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning: "确定性资源澄清：已有资源引用未通过就绪校验。",
    source: "llm",
    tasks: [
      {
        agentRole: "query",
        args: {
          question: clarificationQuestion(issues),
        },
        dependsOn: [],
        id: "t1",
        intent: "clarify",
        label: "确认已有资源",
      },
    ],
  };
  Object.freeze(plan);

  return Object.freeze({
    plan,
    resourceIssueCodes: Object.freeze(issues.map(({ code }) => code)),
  });
};
