import type {
  ExecutionGraphResult,
  OrchestratorPlan,
  TaskNode,
} from "@/lib/agent/orchestration/types";
import type {
  AgentIntent,
  PendingAction,
  ProposedAgentAction,
} from "@/lib/agent/schemas";

type PlanProjectionPayload = {
  update: (args: {
    collection: "plans";
    data: Record<string, unknown>;
    depth: 0;
    id: number;
    overrideAccess: true;
  }) => Promise<unknown>;
};

const relationPlanId = (
  args: unknown,
  intent?: AgentIntent["intent"],
): number | null => {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const record = args as Record<string, unknown>;

  if (typeof record.relatedPlanId === "number") {
    return record.relatedPlanId;
  }

  if (typeof record.planId === "number") {
    return record.planId;
  }

  if (
    intent === "modify_record" &&
    record.entityType === "plan" &&
    typeof record.targetId === "number"
  ) {
    return record.targetId;
  }

  return null;
};

const taskStatus = (
  task: TaskNode,
  result: ExecutionGraphResult,
) =>
  result.observations.find(
    (observation) => observation.taskId === task.id,
  )?.status ?? "pending";

export const projectCompletedOrchestrationToPlan = async ({
  orchestrationId,
  payload,
  plan,
  result,
}: {
  orchestrationId: string;
  payload: PlanProjectionPayload;
  plan: OrchestratorPlan;
  result: ExecutionGraphResult;
}) => {
  if (result.pendingAction) {
    return { status: "skipped_pending" as const };
  }

  const relatedPlanId = plan.tasks
    .map((task) => relationPlanId(task.args, task.intent))
    .find((id): id is number => id !== null);

  if (!relatedPlanId) {
    return { status: "skipped_unrelated" as const };
  }

  await payload.update({
    collection: "plans",
    data: {
      agentContext: {
        evaluation: result.evaluation,
        mode: plan.mode,
        orchestrationId,
        reasoning: plan.reasoning,
        updatedAt: new Date().toISOString(),
      },
      subtasks: plan.tasks.map((task) => ({
        agentRole: task.agentRole,
        id: task.id,
        intent: task.intent,
        label: task.label,
        status: taskStatus(task, result),
      })),
    },
    depth: 0,
    id: relatedPlanId,
    overrideAccess: true,
  });

  return { planId: relatedPlanId, status: "projected" as const };
};

const actionsFromPending = (
  pendingAction: PendingAction | null,
): ProposedAgentAction[] => {
  if (pendingAction?.type === "await_confirmation") {
    return [
      pendingAction.action,
      ...(pendingAction.deferredActions ?? []),
    ];
  }

  if (pendingAction?.type === "await_batch_confirmation") {
    return pendingAction.actions;
  }

  return [];
};

export const projectConfirmedOrchestrationToPlan = async ({
  payload,
  pendingAction,
}: {
  payload: PlanProjectionPayload;
  pendingAction: PendingAction | null;
}) => {
  const isOrchestrated =
    pendingAction != null &&
    (("orchestrationId" in pendingAction &&
      typeof pendingAction.orchestrationId === "string") ||
      ("resumeQueue" in pendingAction &&
        pendingAction.resumeQueue != null));

  if (!isOrchestrated) {
    return { status: "skipped_non_orchestration" as const };
  }

  const actions = actionsFromPending(pendingAction);
  const relatedPlanId = actions
    .map((action) => relationPlanId(action.args, action.intent))
    .find((id): id is number => id !== null);

  if (!relatedPlanId) {
    return { status: "skipped_unrelated" as const };
  }

  const orchestrationId =
    pendingAction &&
    "orchestrationId" in pendingAction &&
    typeof pendingAction.orchestrationId === "string"
      ? pendingAction.orchestrationId
      : `confirmed-${actions.map((action) => action.id).join("-")}`;

  await payload.update({
    collection: "plans",
    data: {
      agentContext: {
        mode: actions.length > 1 ? "compound" : "single",
        orchestrationId,
        phase: "executed",
        updatedAt: new Date().toISOString(),
      },
      subtasks: actions.map((action) => ({
        id: action.id,
        intent: action.intent,
        label: action.summary,
        status: "executed",
      })),
    },
    depth: 0,
    id: relatedPlanId,
    overrideAccess: true,
  });

  return { planId: relatedPlanId, status: "projected" as const };
};
