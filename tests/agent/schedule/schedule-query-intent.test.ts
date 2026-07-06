import assert from "node:assert/strict";
import { test } from "node:test";

import { collectHeuristicCandidates, parseHeuristicIntent } from "../../../src/lib/agent/intent/heuristics/parse-heuristic-intent";

const parse = (message: string) => parseHeuristicIntent(message).intent;

test("schedule query phrases resolve to query_schedule", () => {
  assert.equal(parse("帮我查看最近的日程安排"), "query_schedule");
  assert.equal(parse("查看一下本周日程"), "query_schedule");
  assert.equal(parse("今天有什么安排"), "query_schedule");
  assert.equal(parse("最近有什么日程"), "query_schedule");
});

test("schedule creation phrases still resolve to schedule creation intents", () => {
  const creationIntents = new Set(["compose_schedule_item", "schedule_plan"]);

  assert.ok(creationIntents.has(parse("帮我把这些任务安排进日程")));
  assert.ok(creationIntents.has(parse("把计划排到下周日程里")));
});

test("日程安排 as a noun phrase does not trigger schedule creation", () => {
  const candidates = collectHeuristicCandidates("日程安排");
  const creationCandidate = candidates.find((candidate) =>
    candidate.intent.intent === "compose_schedule_item" ||
    candidate.intent.intent === "schedule_plan" ||
    candidate.intent.intent === "create_schedule_items"
  );

  assert.equal(parse("日程安排"), "query_schedule");
  assert.equal(creationCandidate, undefined);
});
