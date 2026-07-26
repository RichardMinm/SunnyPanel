import {
  L3B_EVALUATION_FIXTURES,
  L3B_KNOWN_ID_DIAGNOSTICS,
  type L3BEvaluationFixture,
  type L3BKnownIdDiagnostic,
} from "./l3b-evaluation-fixtures";
import type { ProductionBranchKind } from "./hybrid-production-evaluation";

export const L3B_PRODUCTION_GATE_PROTOCOL_VERSION =
  "l3b-production-seam-stability-gate-v2" as const;

export type L3BProductionGateStage =
  | "acceptance"
  | "focused"
  | "known_id"
  | "stability";

export type L3BProductionGateRound = 1 | 2 | 3;

export const L3B_PRODUCTION_FOCUSED_FIXTURE_IDS = Object.freeze([
  "qry-1",
  "qry-4",
  "cmp-4",
  "wrt-1",
  "cmp-1",
] as const);

const allFixtureIds = Object.freeze(
  L3B_EVALUATION_FIXTURES.map(({ id }) => id),
);
const allKnownIdDiagnosticIds = Object.freeze(
  L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id),
);

export const L3B_PRODUCTION_STAGE_CONTRACTS = Object.freeze({
  acceptance: Object.freeze({
    fixtureIds: allFixtureIds,
    rounds: Object.freeze([1] as const),
  }),
  focused: Object.freeze({
    fixtureIds: L3B_PRODUCTION_FOCUSED_FIXTURE_IDS,
    rounds: Object.freeze([1, 2, 3] as const),
  }),
  known_id: Object.freeze({
    fixtureIds: allKnownIdDiagnosticIds,
    rounds: Object.freeze([1] as const),
  }),
  stability: Object.freeze({
    fixtureIds: allFixtureIds,
    rounds: Object.freeze([1, 2, 3] as const),
  }),
});

export const L3B_PRODUCTION_EXPECTED_BRANCHES = Object.freeze({
  "cmp-1": "full_orchestrator",
  "cmp-4": "hybrid_compound",
  "qry-1": "pure_query",
  "qry-4": "deterministic_clarify",
  "wrt-1": "full_orchestrator",
} satisfies Readonly<Record<
  typeof L3B_PRODUCTION_FOCUSED_FIXTURE_IDS[number],
  ProductionBranchKind
>>);

export type L3BProductionGateContractErrorCode =
  | "fixture_duplicate"
  | "fixture_extra"
  | "fixture_missing"
  | "fixture_reordered"
  | "observation_duplicate"
  | "observation_extra"
  | "observation_missing"
  | "observation_reordered";

export class L3BProductionGateContractError extends Error {
  readonly code: L3BProductionGateContractErrorCode;

  constructor(code: L3BProductionGateContractErrorCode) {
    super(code);
    this.name = "L3BProductionGateContractError";
    this.code = code;
  }
}

const duplicate = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

export const assertProductionStageFixtureIds = (
  stage: L3BProductionGateStage,
  actualIds: readonly string[],
): void => {
  const expectedIds = L3B_PRODUCTION_STAGE_CONTRACTS[stage].fixtureIds;
  if (duplicate(actualIds)) {
    throw new L3BProductionGateContractError("fixture_duplicate");
  }
  const actual = new Set(actualIds);
  const expected = new Set<string>(expectedIds);
  if (expectedIds.some((id) => !actual.has(id))) {
    throw new L3BProductionGateContractError("fixture_missing");
  }
  if (actualIds.some((id) => !expected.has(id))) {
    throw new L3BProductionGateContractError("fixture_extra");
  }
  if (
    actualIds.length !== expectedIds.length
    || actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new L3BProductionGateContractError("fixture_reordered");
  }
};

export type L3BProductionStageCase = Readonly<{
  fixtureId: string;
  round: L3BProductionGateRound;
  source: L3BEvaluationFixture | L3BKnownIdDiagnostic;
  stage: L3BProductionGateStage;
}>;

const resolveSource = (
  stage: L3BProductionGateStage,
  fixtureId: string,
): L3BEvaluationFixture | L3BKnownIdDiagnostic => {
  const sources = stage === "known_id"
    ? L3B_KNOWN_ID_DIAGNOSTICS
    : L3B_EVALUATION_FIXTURES;
  const matches = sources.filter(({ id }) => id === fixtureId);
  if (matches.length === 0) {
    throw new L3BProductionGateContractError("fixture_missing");
  }
  if (matches.length > 1) {
    throw new L3BProductionGateContractError("fixture_duplicate");
  }
  return matches[0];
};

export const getL3BProductionStageCases = (
  stage: L3BProductionGateStage,
): readonly L3BProductionStageCase[] => {
  const contract = L3B_PRODUCTION_STAGE_CONTRACTS[stage];
  assertProductionStageFixtureIds(stage, contract.fixtureIds);
  return Object.freeze(contract.rounds.flatMap((round) =>
    contract.fixtureIds.map((fixtureId) => Object.freeze({
      fixtureId,
      round,
      source: resolveSource(stage, fixtureId),
      stage,
    }))
  ));
};
