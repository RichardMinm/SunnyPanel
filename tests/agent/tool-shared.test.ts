import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOwnedRollbackToolResult,
  sanitizeAffectedDocuments,
  scoreTextMatch,
} from "../../src/lib/agent/tool-shared";

test("owned rollback result construction requires its AgentRun source ID", () => {
  const result = createOwnedRollbackToolResult({
    assistantMessage: "done",
    pendingAction: null,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: { collection: "plans", documentId: 1 },
    },
    rollbackSourceRunId: 91,
  });

  assert.equal(result.rollbackSourceRunId, 91);

  if (false) {
    // @ts-expect-error successful rollbackable results require their AgentRun source
    createOwnedRollbackToolResult({
      assistantMessage: "unsafe",
      pendingAction: null,
      rollbackPayload: {
        strategy: "delete_created_document",
        target: { collection: "plans", documentId: 1 },
      },
    });
  }
});

test("scoreTextMatch returns 100 for exact match (case-insensitive)", () => {
  assert.equal(scoreTextMatch("高等数学", "高等数学"), 100);
  assert.equal(scoreTextMatch("Linear Algebra", "linear algebra"), 100);
});

test("scoreTextMatch returns 80 for prefix match", () => {
  assert.equal(scoreTextMatch("高等数学习题集", "高等数学"), 80);
  assert.equal(scoreTextMatch("高等数学", "高等数学习题集"), 80);
});

test("scoreTextMatch returns 60 for substring match", () => {
  assert.equal(scoreTextMatch("习题高等数学复习", "高等数学"), 60);
});

test("scoreTextMatch returns 0 for no match", () => {
  assert.equal(scoreTextMatch("高等数学", "线性代数"), 0);
});

test("scoreTextMatch handles empty strings", () => {
  assert.equal(scoreTextMatch("", "test"), 0);
  assert.equal(scoreTextMatch("test", ""), 0);
});

test("scoreTextMatch normalizes whitespace, punctuation, and CJK separators", () => {
  // Spaces, hyphens, CJK punctuation should be stripped
  assert.equal(scoreTextMatch("高等 数学", "高等数学"), 100);
  assert.equal(scoreTextMatch("高等-数学", "高等数学"), 100);
  assert.equal(scoreTextMatch("高等·数学", "高等数学"), 100);
});

test("sanitizeAffectedDocuments omits invalid entries and raw extras", () => {
  assert.deepEqual(sanitizeAffectedDocuments([
    { collection: "plans", documentId: 1, operation: "update", secret: "no", visibility: "private" },
    { collection: "users", documentId: 2, operation: "update", visibility: "private" },
    { collection: "plans", documentId: 0, operation: "update", visibility: "private" },
  ]), [{ collection: "plans", documentId: 1, operation: "update", visibility: "private" }]);
});
