import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync("src/app/api/agent/schedule/route.ts", "utf8");

test("schedule status route exposes an injectable authenticated handler", () => {
  assert.match(route, /createScheduleStatusHandler/);
});

test("schedule status route requires the server-authenticated users record", () => {
  assert.match(route, /getPayloadAuthResult\(\)/);
  assert.match(route, /if \(!authResult\.user\).*status: 401/s);
  assert.doesNotMatch(route, /body\.(?:actor|role|createdBy)/);
  assert.doesNotMatch(route, /existing\.createdBy/);
});

test("schedule status route rejects malformed ids and statuses before mutation", () => {
  assert.match(route, /isPositiveItemId\(body\.id\)/);
  assert.match(route, /Number\.isInteger\(value\).*value > 0/s);
  assert.match(route, /validStatuses\.includes/);
  assert.match(route, /status: 400/);
});

test("schedule status route completes through the transactional shared operation", () => {
  assert.match(route, /createTransactionalScheduleCompletionPayload/);
  assert.match(route, /completeScheduleItem/);
  assert.match(route, /userId:\s*authResult\.user\.id/);
  assert.match(route, /isAdministrator:\s*true/);
  assert.match(route, /body\.status === "done"/);
});

test("schedule status route forbids direct reversal of a completed item", () => {
  assert.match(route, /existing\.status === "done"/);
  assert.match(route, /status: 409/);
});

test("schedule status route returns sanitized completion data only", () => {
  assert.match(route, /success:\s*true/);
  assert.match(route, /affectedDocuments/);
  assert.match(route, /item:/);
  assert.doesNotMatch(route, /return NextResponse\.json\(result/);
  assert.doesNotMatch(route, /safeMessage/);
});
