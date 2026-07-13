import assert from "node:assert/strict";
import { test } from "node:test";

import {
  L3B_HISTORICAL_DISAGREEMENTS,
  summarizeSemanticDisagreements,
} from "../../../src/lib/agent/orchestration/l3b-semantic-evidence";

const FORBIDDEN_KEY = /message|prompt|response|reasoning|context|title|secret|apiKey/i;

const collectKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)]);
};

test("captures the exact eleven pre-R1 semantic disagreement observations", () => {
  assert.deepEqual(
    L3B_HISTORICAL_DISAGREEMENTS.map((row) => [
      row.fixtureId,
      row.round,
      row.sourceMismatchCategory,
    ]),
    [
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
    ],
  );
  assert.equal(
    L3B_HISTORICAL_DISAGREEMENTS.every(
      (row) => row.actualIntentCategory === "not_retained",
    ),
    true,
  );
  assert.deepEqual(
    collectKeys(L3B_HISTORICAL_DISAGREEMENTS).filter((key) => FORBIDDEN_KEY.test(key)),
    [],
  );
});

test("summarizes historical disagreement evidence across all five dimensions", () => {
  assert.deepEqual(
    summarizeSemanticDisagreements(L3B_HISTORICAL_DISAGREEMENTS),
    {
      disagreementsByActualClass: { clarify: 9, compound: 1, read: 1 },
      disagreementsByDirection: {
        compound_to_single: 4,
        intent_family_mismatch: 6,
        write_to_clarify: 1,
      },
      disagreementsByExpectedClass: { compound: 5, read: 5, write: 1 },
      disagreementsByFixture: {
        "cmp-3": 2,
        "cmp-4": 3,
        "mis-2": 1,
        "qry-1": 3,
        "qry-2": 2,
      },
      disagreementsByRound: { "1": 4, "2": 3, "3": 4 },
    },
  );
});
