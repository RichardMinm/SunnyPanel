import { createHash } from "node:crypto";

import {
  getLangChainOrchestratorContractFingerprints,
} from "./langchain-orchestrator-contract";
import type {
  L3BProductionGateStage,
  L3BProductionStageCase,
} from "./l3b-production-gate-contract";
import {
  buildActorAuthorizedResourceSnapshot,
  resolveHybridQueryBoundary,
} from "./query-boundary-resolver";
import {
  getResidualPlannerContractFingerprints,
} from "./residual-planner-contract";

export type ProductionGateDisclosureManifestInput = Readonly<{
  cases: readonly L3BProductionStageCase[];
  evaluationConfigHash: string;
  logicalCallMaximum: number;
  providerAttemptMaximum: number;
  providerAttemptsPerObservationMaximum: number;
  reportPath: string;
  stage: L3BProductionGateStage;
}>;

const DISCLOSURE_ACTOR = Object.freeze({
  collection: "users" as const,
  id: 7,
  isAdmin: true,
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const hash = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");

export const createProductionGateDisclosureManifest = (
  input: ProductionGateDisclosureManifestInput,
) => {
  const fullOrchestrator =
    getLangChainOrchestratorContractFingerprints();
  const residualPlanner = Object.freeze(input.cases.flatMap(
    (entry, index) => {
      const snapshot = buildActorAuthorizedResourceSnapshot({
        authenticatedActor: DISCLOSURE_ACTOR,
        context: entry.source.context,
      });
      if (!snapshot.valid) return [];
      const boundary = resolveHybridQueryBoundary({
        authorizedSnapshot: snapshot.snapshot,
        originalRequest: entry.source.message,
      });
      if (boundary.kind !== "compound") return [];
      return [Object.freeze({
        fixtureId: entry.fixtureId,
        observationIndex: index + 1,
        round: entry.round,
        ...getResidualPlannerContractFingerprints(
          boundary.residualInput,
        ),
      })];
    },
  ));
  const manifest = Object.freeze({
    actor: DISCLOSURE_ACTOR,
    cases: Object.freeze(input.cases.map((entry) => Object.freeze({
      fixtureId: entry.fixtureId,
      round: entry.round,
      source: entry.source,
    }))),
    ceilings: Object.freeze({
      logicalCalls: input.logicalCallMaximum,
      providerAttempts: input.providerAttemptMaximum,
      providerAttemptsPerObservation:
        input.providerAttemptsPerObservationMaximum,
    }),
    evaluationConfigHash: input.evaluationConfigHash,
    fullOrchestrator,
    observationCount: input.cases.length,
    reportPath: input.reportPath,
    residualPlanner,
    rounds: Object.freeze([
      ...new Set(input.cases.map(({ round }) => round)),
    ]),
    stage: input.stage,
  });

  return Object.freeze({
    hash: hash(manifest),
    manifest,
  });
};
