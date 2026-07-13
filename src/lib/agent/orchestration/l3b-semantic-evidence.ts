import type { L3BSafetyClass } from "./l3b-evaluation";

export type SanitizedSemanticDecisionProjection = Readonly<{
  decisionCode: "not_available_pre_r1" | string;
  intents: readonly string[];
  mode: "compound" | "single";
  safetyClass: L3BSafetyClass;
  taskCount: number;
}>;

export type SemanticRequestClass =
  | "clarify"
  | "compound"
  | "consultation"
  | "read"
  | "write";

export type SemanticMismatchCategory =
  | "clarify_to_write"
  | "compound_to_single"
  | "intent_family_mismatch"
  | "read_to_write"
  | "single_to_compound"
  | "task_count_mismatch"
  | "write_to_clarify"
  | "write_to_read";

export type OrchestratorDisagreementEvidence = Readonly<{
  actualIntentCategory:
    | "clarify"
    | "consultation"
    | "not_retained"
    | "read_query"
    | "write_candidate";
  actualMode: "compound" | "single";
  actualRequestClass: SemanticRequestClass;
  actualTaskCount: number;
  expectedIntentCategory: string;
  expectedMode: "compound" | "single";
  expectedRequestClass: SemanticRequestClass;
  expectedTaskCount: number;
  fixtureId: string;
  mismatchCategory: SemanticMismatchCategory;
  resourceGuardResult: "accepted" | "not_run" | "rejected";
  resourceState: "ambiguous" | "conflicting" | "missing" | "not_required" | "ready";
  round: number;
  usablePlan: boolean;
}>;

export type HistoricalOrchestratorDisagreementEvidence =
  OrchestratorDisagreementEvidence & Readonly<{
    sourceMismatchCategory: "intent_mismatch" | "read_write_mismatch";
  }>;

type UnclassifiedEvidence = Omit<OrchestratorDisagreementEvidence, "mismatchCategory">;

export const classifySemanticDisagreement = (
  evidence: UnclassifiedEvidence,
): OrchestratorDisagreementEvidence => {
  let mismatchCategory: SemanticMismatchCategory;

  if (evidence.expectedMode !== evidence.actualMode) {
    mismatchCategory = evidence.expectedMode === "compound"
      ? "compound_to_single"
      : "single_to_compound";
  } else if (evidence.expectedTaskCount !== evidence.actualTaskCount) {
    mismatchCategory = "task_count_mismatch";
  } else if (
    evidence.expectedRequestClass === "read"
    && evidence.actualRequestClass === "write"
  ) {
    mismatchCategory = "read_to_write";
  } else if (
    evidence.expectedRequestClass === "write"
    && evidence.actualRequestClass === "read"
  ) {
    mismatchCategory = "write_to_read";
  } else if (
    evidence.expectedRequestClass === "clarify"
    && evidence.actualRequestClass === "write"
  ) {
    mismatchCategory = "clarify_to_write";
  } else if (
    evidence.expectedRequestClass === "write"
    && evidence.actualRequestClass === "clarify"
  ) {
    mismatchCategory = "write_to_clarify";
  } else {
    mismatchCategory = "intent_family_mismatch";
  }

  return Object.freeze({ ...evidence, mismatchCategory });
};

const increment = (distribution: Record<string, number>, key: string) => {
  distribution[key] = (distribution[key] ?? 0) + 1;
};

export const summarizeSemanticDisagreements = (
  disagreements: readonly OrchestratorDisagreementEvidence[],
) => {
  const disagreementsByActualClass: Record<string, number> = {};
  const disagreementsByDirection: Record<string, number> = {};
  const disagreementsByExpectedClass: Record<string, number> = {};
  const disagreementsByFixture: Record<string, number> = {};
  const disagreementsByRound: Record<string, number> = {};

  for (const disagreement of disagreements) {
    increment(disagreementsByActualClass, disagreement.actualRequestClass);
    increment(disagreementsByDirection, disagreement.mismatchCategory);
    increment(disagreementsByExpectedClass, disagreement.expectedRequestClass);
    increment(disagreementsByFixture, disagreement.fixtureId);
    increment(disagreementsByRound, String(disagreement.round));
  }

  return {
    disagreementsByActualClass,
    disagreementsByDirection,
    disagreementsByExpectedClass,
    disagreementsByFixture,
    disagreementsByRound,
  };
};

const expectedByFixture = {
  "cmp-3": {
    intent: "write_candidate",
    mode: "compound",
    requestClass: "compound",
    taskCount: 2,
  },
  "cmp-4": {
    intent: "write_candidate",
    mode: "compound",
    requestClass: "compound",
    taskCount: 2,
  },
  "mis-2": {
    intent: "clarify",
    mode: "single",
    requestClass: "write",
    taskCount: 1,
  },
  "qry-1": {
    intent: "read_query",
    mode: "single",
    requestClass: "read",
    taskCount: 1,
  },
  "qry-2": {
    intent: "read_query",
    mode: "single",
    requestClass: "read",
    taskCount: 1,
  },
} as const;

const historicalRows = [
  ["qry-1", 1, "read_write_mismatch"],
  ["qry-2", 1, "read_write_mismatch"],
  ["cmp-3", 1, "read_write_mismatch"],
  ["cmp-4", 1, "intent_mismatch"],
  ["qry-1", 2, "read_write_mismatch"],
  ["qry-2", 2, "intent_mismatch"],
  ["cmp-4", 2, "read_write_mismatch"],
  ["qry-1", 3, "read_write_mismatch"],
  ["cmp-3", 3, "read_write_mismatch"],
  ["cmp-4", 3, "read_write_mismatch"],
  ["mis-2", 3, "read_write_mismatch"],
] as const;

export const L3B_HISTORICAL_DISAGREEMENTS:
readonly HistoricalOrchestratorDisagreementEvidence[] = Object.freeze(
  historicalRows.map(([fixtureId, round, sourceMismatchCategory]) => {
    const expected = expectedByFixture[fixtureId];
    const wasIntentOnly = sourceMismatchCategory === "intent_mismatch";
    const actualRequestClass = wasIntentOnly ? expected.requestClass : "clarify";
    const actualMode = wasIntentOnly ? expected.mode : "single";
    const actualTaskCount = wasIntentOnly ? expected.taskCount : 1;
    return Object.freeze({
      ...classifySemanticDisagreement({
        actualIntentCategory: "not_retained",
        actualMode,
        actualRequestClass,
        actualTaskCount,
        expectedIntentCategory: expected.intent,
        expectedMode: expected.mode,
        expectedRequestClass: expected.requestClass,
        expectedTaskCount: expected.taskCount,
        fixtureId,
        resourceGuardResult: "not_run",
        resourceState: "not_required",
        round,
        usablePlan: false,
      }),
      sourceMismatchCategory,
    });
  }),
);
