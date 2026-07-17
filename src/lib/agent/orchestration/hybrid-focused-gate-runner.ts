/**
 * Fixed-denominator runner for the R4 Hybrid focused gate.
 *
 * Four frozen fixtures are evaluated in the same order for three rounds.
 * Query Commentary is intentionally omitted only within this evaluation.
 */

import { createHash } from "node:crypto";

import type { QualitativeCommentaryResult } from "../query/qualitative-commentary";
import {
  HYBRID_FOCUSED_FIXTURES,
  HYBRID_FOCUSED_ROUNDS,
  type HybridFocusedFixture,
  type HybridFocusedRound,
  type HybridLiveObservation,
} from "./hybrid-focused-gate";

export const HYBRID_QUERY_COMMENTARY_OMISSION_NOTE =
  "Query Commentary omitted to isolate Hybrid Query Boundary and Residual Planner evaluation.";

const omitQueryCommentary =
  async (): Promise<QualitativeCommentaryResult> => ({
    latencyMs: 0,
    modelCalls: 0,
    reason: "provider_error",
    status: "omitted",
    ttftMs: null,
  });

export type HybridFocusedRunnerCase = Readonly<{
  expectation: HybridFocusedFixture["expectation"];
  fixtureId: HybridFocusedFixture["fixtureId"];
  message: string;
  observationIndex: number;
  queryCommentaryAdapter: typeof omitQueryCommentary;
  round: HybridFocusedRound;
}>;

const canonicalFixtureSnapshot = (): string => JSON.stringify(
  HYBRID_FOCUSED_FIXTURES.map((fixture) => ({
    expectation: {
      boundaryResolutionKind:
        fixture.expectation.boundaryResolutionKind,
      finalTaskIntents: [...fixture.expectation.finalTaskIntents],
    },
    fixtureId: fixture.fixtureId,
    message: fixture.message,
  })),
);

export const HYBRID_FOCUSED_FIXTURE_SNAPSHOT_SHA256 =
  "9bd481010f4ad295f8e4b2abf0574ebc2fc11c6d08f8150f2fad03f6b621b5a7";

export const hashHybridFocusedFixtureSnapshot = (): string =>
  createHash("sha256")
    .update(canonicalFixtureSnapshot())
    .digest("hex");

export const assertHybridFocusedFixtureSnapshot = (): void => {
  if (
    hashHybridFocusedFixtureSnapshot()
    !== HYBRID_FOCUSED_FIXTURE_SNAPSHOT_SHA256
  ) {
    throw new Error("Hybrid focused fixture snapshot mismatch.");
  }
};

export const runHybridFocusedGate = async (input: Readonly<{
  evaluate: (
    evaluation: HybridFocusedRunnerCase,
  ) => Promise<HybridLiveObservation>;
}>): Promise<readonly HybridLiveObservation[]> => {
  assertHybridFocusedFixtureSnapshot();
  const observations: HybridLiveObservation[] = [];
  let observationIndex = 0;

  for (const round of HYBRID_FOCUSED_ROUNDS) {
    for (const fixture of HYBRID_FOCUSED_FIXTURES) {
      observationIndex += 1;
      observations.push(await input.evaluate(Object.freeze({
        expectation: fixture.expectation,
        fixtureId: fixture.fixtureId,
        message: fixture.message,
        observationIndex,
        queryCommentaryAdapter: omitQueryCommentary,
        round,
      })));
    }
  }

  return Object.freeze(observations);
};
