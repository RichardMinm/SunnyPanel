/**
 * Frozen, sanitized preflight for the one-time R4 Hybrid focused gate.
 *
 * Hash source material is built from the real runtime contracts and is never
 * returned, logged, or retained. This module is deterministic and performs no
 * Provider call, database access, task execution, or business mutation.
 */

import { createHash } from "node:crypto";

import {
  HYBRID_FOCUSED_FIXTURE_IDS,
} from "./hybrid-focused-gate";
import {
  L3B_EVALUATION_CONFIG,
  L3B_EVALUATION_CONFIG_HASH,
} from "./l3b-evaluation-config";
import {
  L3B_EVALUATION_FIXTURES,
  type L3BEvaluationFixture,
} from "./l3b-evaluation-fixtures";
import {
  buildActorAuthorizedResourceSnapshot,
  resolveHybridQueryBoundary,
} from "./query-boundary-resolver";
import {
  buildResidualPlannerSystemPrompt,
  hashResidualPlannerSchema,
  RESIDUAL_PLANNER_RETRY_POLICY,
} from "./residual-langchain-planner";
import type {
  ResidualPlanningInput,
} from "./hybrid-query-boundary-types";

export type HybridFocusedGatePreflightErrorCode =
  | "CMP4_RESIDUAL_INPUT_INVALID"
  | "EVALUATION_CONFIG_HASH_MISMATCH"
  | "EVALUATION_CONFIG_INVALID"
  | "FIXTURE_SNAPSHOT_HASH_MISMATCH"
  | "FOCUSED_FIXTURE_SET_INVALID"
  | "HYBRID_FOCUSED_GATE_RETIRED"
  | "OBSERVATION_CONTRACT_MISMATCH"
  | "QUERY_COMMENTARY_MODE_MISMATCH"
  | "RESIDUAL_BUDGET_CONFIG_MISMATCH"
  | "RESIDUAL_PROMPT_HASH_MISMATCH"
  | "RESIDUAL_SCHEMA_HASH_MISMATCH";

export class HybridFocusedGatePreflightError extends Error {
  readonly code: HybridFocusedGatePreflightErrorCode;

  constructor(code: HybridFocusedGatePreflightErrorCode) {
    super(code);
    this.code = code;
    this.name = "HybridFocusedGatePreflightError";
  }
}

export type HybridFocusedGatePreflight = Readonly<{
  authorizedLogicalCallBudget: 3;
  authorizedProviderAttemptBudget: number;
  baseURLHost: string;
  commentaryMode: "omitted";
  evaluationConfigHash: string;
  fixtureSnapshotHash: string;
  head: string;
  maxAttemptsPerLogicalCall: number;
  model: string;
  observations: 12;
  outputBudget: number;
  residualPromptHash: string;
  residualSchemaHash: string;
  schemaRetries: number;
  temperature: number;
  timeoutMs: number;
  transportRetries: number;
}>;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const sha256 = (value: unknown): string =>
  createHash("sha256")
    .update(
      typeof value === "string"
        ? value
        : JSON.stringify(canonicalize(value)),
    )
    .digest("hex");

const focusedSourceFixtures = (
  fixtures: readonly L3BEvaluationFixture[],
): readonly L3BEvaluationFixture[] =>
  Object.freeze(HYBRID_FOCUSED_FIXTURE_IDS.map((fixtureId) => {
    const matches = fixtures.filter((fixture) => fixture.id === fixtureId);
    if (matches.length !== 1 || !matches[0]) {
      throw new HybridFocusedGatePreflightError(
        "FOCUSED_FIXTURE_SET_INVALID",
      );
    }
    return matches[0];
  }));

export const hashHybridFocusedFixtureSnapshot = (
  fixtures: readonly L3BEvaluationFixture[] = L3B_EVALUATION_FIXTURES,
): string => sha256(focusedSourceFixtures(fixtures).map((fixture) => ({
  context: fixture.context,
  expected: fixture.expected,
  fixtureId: fixture.id,
  message: fixture.message,
})));

const focusedResidualInput = (
  fixtures: readonly L3BEvaluationFixture[],
): ResidualPlanningInput => {
  const fixture = focusedSourceFixtures(fixtures).find(
    (candidate) => candidate.id === "cmp-4",
  );
  if (!fixture) {
    throw new HybridFocusedGatePreflightError(
      "FOCUSED_FIXTURE_SET_INVALID",
    );
  }
  const snapshot = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: { collection: "users", id: 7 },
    context: fixture.context,
  });
  if (!snapshot.valid) {
    throw new HybridFocusedGatePreflightError(
      "CMP4_RESIDUAL_INPUT_INVALID",
    );
  }
  const boundary = resolveHybridQueryBoundary({
    authorizedSnapshot: snapshot.snapshot,
    originalRequest: fixture.message,
  });
  if (boundary.kind !== "compound") {
    throw new HybridFocusedGatePreflightError(
      "CMP4_RESIDUAL_INPUT_INVALID",
    );
  }
  return boundary.residualInput;
};

export const HYBRID_FOCUSED_GATE_FROZEN_HASHES = Object.freeze({
  evaluationConfigHash:
    "4d50c829aa5dc290acfdbed050a8be36359a83ff7c299b8da9754e657a651405",
  fixtureSnapshotHash:
    "be856ddcba4a60f65e6a1e360027c3e1e5eface66c434f40f9df298b5286966d",
  residualPromptHash:
    "46cc533b94aa5ceb46a7e3e4e6193cfa056399371d03c8fd72b87b70c3800005",
  residualSchemaHash:
    "44d6ee2304cfb3b4eeaa178253a69b6dfde98c1055d3684bdc8a42f6fc98665c",
});

export const buildHybridFocusedGatePreflight = (input: Readonly<{
  fixtures?: readonly L3BEvaluationFixture[];
  head: string;
}>): HybridFocusedGatePreflight => {
  const fixtures = input.fixtures ?? L3B_EVALUATION_FIXTURES;
  let baseURLHost: string;
  try {
    baseURLHost = new URL(L3B_EVALUATION_CONFIG.baseURL).host;
  } catch {
    throw new HybridFocusedGatePreflightError(
      "EVALUATION_CONFIG_INVALID",
    );
  }
  const schemaRetries =
    RESIDUAL_PLANNER_RETRY_POLICY.maxSchemaRetries;
  const transportRetries =
    RESIDUAL_PLANNER_RETRY_POLICY.maxTransportRetries;
  const maxAttemptsPerLogicalCall =
    (schemaRetries + 1) * (transportRetries + 1);
  const authorizedLogicalCallBudget = 3 as const;
  const residualInput = focusedResidualInput(fixtures);

  return Object.freeze({
    authorizedLogicalCallBudget,
    authorizedProviderAttemptBudget:
      authorizedLogicalCallBudget * maxAttemptsPerLogicalCall,
    baseURLHost,
    commentaryMode: "omitted" as const,
    evaluationConfigHash: L3B_EVALUATION_CONFIG_HASH,
    fixtureSnapshotHash: hashHybridFocusedFixtureSnapshot(fixtures),
    head: input.head,
    maxAttemptsPerLogicalCall,
    model: L3B_EVALUATION_CONFIG.model,
    observations: 12 as const,
    outputBudget: L3B_EVALUATION_CONFIG.orchestratorMaxOutputTokens,
    residualPromptHash: sha256(
      buildResidualPlannerSystemPrompt(residualInput),
    ),
    residualSchemaHash: hashResidualPlannerSchema(residualInput),
    schemaRetries,
    temperature: L3B_EVALUATION_CONFIG.temperature,
    timeoutMs: L3B_EVALUATION_CONFIG.orchestratorTimeoutMs,
    transportRetries,
  });
};

export const assertHybridFocusedGatePreflight = (
  _preflight: HybridFocusedGatePreflight,
): never => {
  throw new HybridFocusedGatePreflightError(
    "HYBRID_FOCUSED_GATE_RETIRED",
  );
};
