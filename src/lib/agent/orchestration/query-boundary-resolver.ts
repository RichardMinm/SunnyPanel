import type {
  OrchestratorOutput,
  OrchestratorTask,
} from "../llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../prompts";
import { normalizePlanTitle } from "../query/plan-title";
import type {
  AgentIntent,
  QueryPlanProgressArgs,
  QueryProgressArgs,
} from "../schemas";
import type { QueryScopeProvenance } from "./query-scope-contract";
import type {
  ActorAuthorizedResourceSnapshot,
  FixedTaskMetadata,
  HybridQueryBoundaryResolution,
  QueryBoundaryClarifyReason,
  ResidualIntentPolicy,
  ResidualPlanningInput,
} from "./hybrid-query-boundary-types";
import { resolveResidualIntentPolicy } from "./residual-intent-policy";

export type SnapshotBuildResult =
  | Readonly<{ snapshot: ActorAuthorizedResourceSnapshot; valid: true }>
  | Readonly<{
      code: "actor_not_trusted" | "snapshot_source_invalid";
      valid: false;
    }>;

type AuthenticatedPayloadActor = Readonly<{
  collection: "users";
  id: number;
}>;

const PROGRESS_CUE = /(?:进度|完成情况|完成度|progress)/iu;
const EXPLICIT_PLAN_ID_MARKER =
  /(?:plan\s*id|planid|计划\s*(?:id|编号|#))/iu;
const RESIDUAL_WRITE_CUE =
  /(?:记录|创建|新建|添加|保存|安排|排进|排到|取消|修改|删除|作为新任务|生成(?:一个|一份)?(?:任务|清单))/u;
const GENERIC_PLAN_REFERENCES = [
  "工作计划",
  "项目计划",
  "所有计划",
  "全部计划",
  "整体计划",
  "当前计划",
  "我的计划",
] as const;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const freezeSnapshot = (
  plans: ActorAuthorizedResourceSnapshot["plans"],
): ActorAuthorizedResourceSnapshot =>
  Object.freeze({
    actorKind: "authenticated_payload_user" as const,
    plans: Object.freeze(
      plans.map((plan) => Object.freeze({ ...plan })),
    ),
  });

export const createActorAuthorizedResourceSnapshot = (input: Readonly<{
  authenticatedActor: AuthenticatedPayloadActor | null;
  context: AgentPromptContext;
  clientClaims?: unknown;
}>): SnapshotBuildResult => {
  if (
    input.authenticatedActor?.collection !== "users"
    || !isPositiveInteger(input.authenticatedActor.id)
  ) {
    return { code: "actor_not_trusted", valid: false };
  }
  if (!input.context || !Array.isArray(input.context.plans)) {
    return { code: "snapshot_source_invalid", valid: false };
  }

  const plans = input.context.plans.flatMap((plan) => {
    if (!isPositiveInteger(plan.id) || typeof plan.title !== "string") {
      return [];
    }
    const normalizedTitle = normalizePlanTitle(plan.title);
    return normalizedTitle
      ? [{ id: plan.id, normalizedTitle }]
      : [];
  });

  return {
    snapshot: freezeSnapshot(plans),
    valid: true,
  };
};

export const buildActorAuthorizedResourceSnapshot =
  createActorAuthorizedResourceSnapshot;

export const isHybridQueryBoundaryEnabled = (): true => true;

const collectExplicitPlanIds = (message: string): number[] => {
  const normalized = message.normalize("NFKC");
  const ids = new Set<number>();
  const patterns = [
    /(?:plan\s*id|planid)\s*[:=#]?\s*(\d+)/giu,
    /计划\s*(?:id|编号|#)\s*[:=#：]?\s*(\d+)/giu,
    /计划\s*[:：#]?\s+(\d+)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1]);
      if (isPositiveInteger(value)) ids.add(value);
    }
  }
  return [...ids];
};

const queryTask = (
  intent: "query_plan_progress" | "query_progress",
  args: Record<string, unknown>,
): OrchestratorTask => ({
  agentRole: "query",
  args,
  dependsOn: [],
  id: "query-boundary",
  intent,
  label: intent === "query_progress" ? "读取项目进度" : "读取计划进度",
});

const fixedMetadata = (
  taskId: string,
  queryScopeProvenance: QueryScopeProvenance,
): FixedTaskMetadata => ({
  ownership: "deterministic_query_boundary",
  queryScopeProvenance,
  taskId,
});

const toIntent = (task: OrchestratorTask): AgentIntent =>
  task.intent === "query_plan_progress"
    ? {
        args: task.args as QueryPlanProgressArgs,
        confidence: 1,
        intent: "query_plan_progress",
      }
    : {
        args: task.args as QueryProgressArgs,
        confidence: 1,
        intent: "query_progress",
      };

const clarify = (
  reason: QueryBoundaryClarifyReason,
): HybridQueryBoundaryResolution => {
  const question = reason === "id_title_conflict"
    ? "计划 ID 与标题指向不同资源，请确认要查询的计划。"
    : "请提供要查询计划的准确完整标题或有效计划 ID。";
  const output: OrchestratorOutput = {
    decisionCode: "unsupported_request",
    mode: "single",
    routingSummary: "需要确认具体计划",
    tasks: [{
      agentRole: "query",
      args: { question },
      dependsOn: [],
      id: "t1",
      intent: "clarify",
      label: "确认计划范围",
    }],
    version: 2,
  };

  return {
    kind: "clarify",
    output,
    providerCalls: 0,
    reason,
  };
};

const looksLikeSpecificPlanQuery = (normalizedMessage: string): boolean => {
  if (!normalizedMessage.includes("计划")) return false;
  let residual = normalizedMessage;
  let removedGenericReference = false;
  for (const reference of GENERIC_PLAN_REFERENCES) {
    if (!residual.includes(reference)) continue;
    removedGenericReference = true;
    residual = residual.replaceAll(reference, "");
  }
  if (!removedGenericReference) return true;

  residual = residual
    .replace(
      /(?:查看|看看|查询|检查|了解|显示|告诉我|帮我|请|一下|我的|里|中|中的|内|的|进度|完成情况|完成度)/gu,
      "",
    )
    .replace(/[\s,，。.!！?？:：;；、"'“”‘’（）()【】[\]{}]/gu, "");

  return residual.length > 0;
};

const residualInput = (
  originalRequest: string,
  authorizedSnapshot: ActorAuthorizedResourceSnapshot,
  task: OrchestratorTask,
  intentPolicy: ResidualIntentPolicy,
): ResidualPlanningInput => ({
  allowedIntentFamilies: ["write_candidate"],
  authorizedSnapshot,
  fixedTasks: [{
    family: "query",
    intent: task.intent as AgentIntent["intent"],
    taskId: task.id,
  }],
  forbiddenIntentFamilies: ["query"],
  intentPolicy,
  originalRequest,
  satisfiedIntentFamilies: ["query"],
});

const resolvedQuery = (input: {
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  originalRequest: string;
  provenance: QueryScopeProvenance;
  task: OrchestratorTask;
}): HybridQueryBoundaryResolution => {
  const metadata = fixedMetadata(input.task.id, input.provenance);
  const intentPolicy = resolveResidualIntentPolicy(input.originalRequest);
  if (intentPolicy) {
    return {
      fixedMetadata: metadata,
      fixedQueryTask: input.task,
      kind: "compound",
      residualInput: residualInput(
        input.originalRequest,
        input.authorizedSnapshot,
        input.task,
        intentPolicy,
      ),
    };
  }
  if (RESIDUAL_WRITE_CUE.test(input.originalRequest)) {
    return { kind: "not_applicable" };
  }
  return {
    fixedMetadata: metadata,
    fixedQueryTask: input.task,
    kind: "pure_query",
    preResolvedIntent: toIntent(input.task),
  };
};

export const resolveHybridQueryBoundary = (input: Readonly<{
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  originalRequest: string;
}>): HybridQueryBoundaryResolution => {
  const normalizedMessage = normalizePlanTitle(input.originalRequest);
  if (!PROGRESS_CUE.test(normalizedMessage)) {
    return { kind: "not_applicable" };
  }

  const explicitIds = collectExplicitPlanIds(input.originalRequest);
  if (explicitIds.length > 1) return clarify("invalid_plan_reference");
  if (EXPLICIT_PLAN_ID_MARKER.test(normalizedMessage) && explicitIds.length === 0) {
    return clarify("invalid_plan_reference");
  }

  const exactTitleMatches = input.authorizedSnapshot.plans.filter((plan) =>
    normalizedMessage.includes(plan.normalizedTitle)
  );
  if (exactTitleMatches.length > 1) return clarify("title_ambiguous");

  if (explicitIds.length === 1) {
    const plan = input.authorizedSnapshot.plans.find(
      (candidate) => candidate.id === explicitIds[0],
    );
    if (!plan) return clarify("explicit_plan_id_not_found");
    if (
      exactTitleMatches.length === 1
      && exactTitleMatches[0].id !== plan.id
    ) {
      return clarify("id_title_conflict");
    }
    return resolvedQuery({
      authorizedSnapshot: input.authorizedSnapshot,
      originalRequest: input.originalRequest,
      provenance: {
        planId: plan.id,
        scope: "plan",
        source: "explicit_plan_id",
      },
      task: queryTask("query_plan_progress", { planId: plan.id }),
    });
  }

  if (exactTitleMatches.length === 1) {
    const plan = exactTitleMatches[0];
    return resolvedQuery({
      authorizedSnapshot: input.authorizedSnapshot,
      originalRequest: input.originalRequest,
      provenance: {
        planId: plan.id,
        scope: "plan",
        source: "resolved_exact_title",
      },
      task: queryTask("query_plan_progress", { planId: plan.id }),
    });
  }

  if (
    RESIDUAL_WRITE_CUE.test(input.originalRequest)
    && !resolveResidualIntentPolicy(input.originalRequest)
  ) {
    return { kind: "not_applicable" };
  }

  if (looksLikeSpecificPlanQuery(normalizedMessage)) {
    return clarify("title_not_found");
  }

  return resolvedQuery({
    authorizedSnapshot: input.authorizedSnapshot,
    originalRequest: input.originalRequest,
    provenance: { scope: "aggregate", source: "user_unspecified" },
    task: queryTask("query_progress", {}),
  });
};

export type {
  ActorAuthorizedResourceSnapshot,
  FixedTaskMetadata,
  HybridQueryBoundaryResolution,
  QueryBoundaryClarifyReason,
  ResidualPlanningInput,
} from "./hybrid-query-boundary-types";
