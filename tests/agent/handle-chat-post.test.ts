import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRollbackPayload, isRollbackPayloadExecutable } from "../../src/lib/agent/rollback-parse";

test("parseRollbackPayload rejects non-object input", () => {
  assert.equal(parseRollbackPayload(null), null);
  assert.equal(parseRollbackPayload(undefined), null);
  assert.equal(parseRollbackPayload("string"), null);
  assert.equal(parseRollbackPayload(42), null);
  assert.equal(parseRollbackPayload([]), null);
});

test("parseRollbackPayload rejects object without strategy", () => {
  assert.equal(parseRollbackPayload({}), null);
  assert.equal(parseRollbackPayload({ target: { collection: "plans" } }), null);
});

test("parseRollbackPayload parses minimal valid payload", () => {
  const result = parseRollbackPayload({ strategy: "delete_created_document" });

  assert.ok(result);
  assert.equal(result.strategy, "delete_created_document");
  assert.equal(result.target, undefined);
});

test("parseRollbackPayload parses full payload with reason", () => {
  const result = parseRollbackPayload({
    reason: "test reason",
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: 1 },
  });

  assert.ok(result);
  assert.equal(result.reason, "test reason");
  assert.equal(result.target?.collection, "plans");
  assert.equal(result.target?.documentId, 1);
});

test("parseRollbackPayload handles null documentId", () => {
  const result = parseRollbackPayload({
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: null },
  });

  assert.ok(result);
  assert.equal(result.target?.documentId, null);
});

test("isRollbackPayloadExecutable rejects unknown strategies", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "unknown_strategy",
      target: { collection: "plans", documentId: 1 },
    }),
    false,
  );
});

test("isRollbackPayloadExecutable rejects unsupported collections", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "delete_created_document",
      target: { collection: "unknown-collection", documentId: 1 },
    }),
    false,
  );
});
