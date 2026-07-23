import type {
  SchedulePlanReferenceErrorCode,
} from "./schedule-plan-reference-contract";
import type { OrchestratorPlan } from "./types";

export type SchedulePlanReferenceClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  schedulePlanReferenceErrorCode: SchedulePlanReferenceErrorCode;
}>;

export const projectSchedulePlanReferenceErrorToClarification = (
  code: SchedulePlanReferenceErrorCode,
): SchedulePlanReferenceClarificationProjection => {
  const dependsOn: string[] = [];
  Object.freeze(dependsOn);
  const task = Object.freeze({
    agentRole: "query" as const,
    args: Object.freeze({
      question:
        "我无法安全确认要安排的已有计划。请提供一个准确的计划 ID。",
    }),
    dependsOn,
    id: "t1",
    intent: "clarify" as const,
    label: "确认排期计划",
  });
  const tasks = [task];
  Object.freeze(tasks);
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning:
      "确定性计划引用澄清：排期目标未通过来源一致性校验。",
    source: "llm",
    tasks,
  };
  Object.freeze(plan);

  return Object.freeze({
    plan,
    schedulePlanReferenceErrorCode: code,
  });
};
