import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRollbackResultDisplayRows,
  formatRollbackStrategyLabel,
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
} from "../../src/components/dashboard/agent/rollback-display";

test("rollback result display summarizes mixed affected documents", () => {
  const result = normalizeRollbackExecutionResult({
    affectedDocuments: [
      {
        collection: "checklists",
        documentId: 101,
        operation: "update",
        visibility: "unknown",
      },
      {
        collection: "timeline-events",
        documentId: 501,
        operation: "delete",
        visibility: "unknown",
      },
    ],
    strategy: "restore_checklist_groups_and_timeline",
    summary: "已执行回滚 restore_checklist_groups_and_timeline，影响 2 个对象：checklists #101 已更新；timeline-events #501 已删除",
  });

  assert.deepEqual(result, {
    affectedDocuments: [
      {
        collection: "checklists",
        documentId: 101,
        operation: "update",
        visibility: "unknown",
      },
      {
        collection: "timeline-events",
        documentId: 501,
        operation: "delete",
        visibility: "unknown",
      },
    ],
    strategy: "restore_checklist_groups_and_timeline",
    summary: "已执行回滚 restore_checklist_groups_and_timeline，影响 2 个对象：checklists #101 已更新；timeline-events #501 已删除",
  });
  assert.equal(formatRollbackResultStatus(result), "已执行撤销，影响 2 个对象");
  assert.deepEqual(buildRollbackResultDisplayRows(result), [
    {
      detail: "checklists #101",
      label: "清单",
      operationLabel: "已恢复",
    },
    {
      detail: "timeline-events #501",
      label: "时间线",
      operationLabel: "已删除",
    },
  ]);
});

test("rollback result display rejects malformed API payloads", () => {
  assert.equal(normalizeRollbackExecutionResult(null), null);
  assert.equal(normalizeRollbackExecutionResult({ strategy: "" }), null);
  assert.equal(
    normalizeRollbackExecutionResult({
      affectedDocuments: [{ collection: "plans", documentId: "not-number", operation: "update" }],
      strategy: "delete_created_document",
    }),
    null,
  );
});

test("rollback strategy labels cover executable strategies without exposing enum names", () => {
  const strategies = [
    "delete_created_document",
    "delete_created_documents",
    "delete_created_timeline_event",
    "archive_created_memory",
    "restore_checklist_groups",
    "restore_checklist_groups_and_timeline",
    "restore_modified_record",
    "restore_schedule_item_snapshot",
    "restore_schedule_item_status",
  ];

  for (const strategy of strategies) {
    const label = formatRollbackStrategyLabel(strategy);

    assert.notEqual(label, strategy);
    assert.doesNotMatch(label, /_/);
    assert.doesNotMatch(label, /尚未自动支持/);
  }
});
