import type {
  OrchestratorOutput,
  OrchestratorTask,
} from "../llm/schemas/orchestrator-output";
import type { QueryScopeProvenance } from "./query-scope-contract";
import type { AgentIntent } from "../schemas";

export type IntentFamily = "consultation" | "query" | "write_candidate";

export type AuthorizedPlanProjection = Readonly<{
  id: number;
  normalizedTitle: string;
}>;

export type ActorAuthorizedResourceSnapshot = Readonly<{
  actorKind: "authenticated_payload_user";
  plans: readonly AuthorizedPlanProjection[];
}>;

export type FixedTaskSummary = Readonly<{
  family: IntentFamily;
  intent: AgentIntent["intent"];
  taskId: string;
}>;

export type FixedTaskMetadata = Readonly<{
  ownership: "deterministic_query_boundary";
  queryScopeProvenance: QueryScopeProvenance;
  taskId: string;
}>;

export type ResidualPlanningInput = Readonly<{
  allowedIntentFamilies: readonly IntentFamily[];
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  fixedTasks: readonly FixedTaskSummary[];
  forbiddenIntentFamilies: readonly IntentFamily[];
  originalRequest: string;
  satisfiedIntentFamilies: readonly IntentFamily[];
}>;

export type FixedTaskPlanCompositionInput = Readonly<{
  fixedMetadata: FixedTaskMetadata;
  fixedQueryTask: OrchestratorTask;
  residualTasks: readonly OrchestratorTask[];
}>;

export type HybridOrchestrationCandidate = Readonly<{
  fixedTaskMetadata: readonly FixedTaskMetadata[];
  output: OrchestratorOutput;
}>;

export type QueryBoundaryClarifyReason =
  | "explicit_plan_id_not_found"
  | "id_title_conflict"
  | "invalid_plan_reference"
  | "specific_reference_required"
  | "title_ambiguous"
  | "title_not_found";

export type HybridQueryBoundaryResolution =
  | Readonly<{ kind: "not_applicable" }>
  | Readonly<{
      fixedMetadata: FixedTaskMetadata;
      fixedQueryTask: OrchestratorTask;
      kind: "pure_query";
      preResolvedIntent: AgentIntent;
    }>
  | Readonly<{
      kind: "clarify";
      output: OrchestratorOutput;
      providerCalls: 0;
      reason: QueryBoundaryClarifyReason;
    }>
  | Readonly<{
      fixedMetadata: FixedTaskMetadata;
      fixedQueryTask: OrchestratorTask;
      kind: "compound";
      residualInput: ResidualPlanningInput;
    }>;
