import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { modifyRecordFromIntent } from "../../../src/lib/agent/tools/modify-record";
import { isRollbackPayloadExecutable } from "../../../src/lib/agent/rollback-parse";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
} from "../../stubs/payload-client";

beforeEach(() => resetPayloadStub());

test("confirmed schedule completion uses the shared completion operation once and includes scalar fields", async () => {
  setPayloadStubFindByIDHandler(async () => ({ id: 81, priority: "medium", status: "planned", title: "晨间复习" }));
  setPayloadStubCreateHandler(async () => ({ id: 900 }));
  const payload = await getPayloadClient();
  const calls: unknown[] = [];

  const result = await modifyRecordFromIntent(
    {
      changeDescription: "完成并设为高优先级",
      entityName: "晨间复习",
      entityType: "schedule",
      patch: { priority: "high", status: "done" },
      targetId: 81,
    },
    undefined,
    {
      completeSchedule: async (input) => {
        calls.push(input);
        return {
          affectedDocuments: [
            { collection: "schedule-items", documentId: 81, operation: "update", visibility: "private" },
            { collection: "timeline-events", documentId: 82, operation: "create", visibility: "private" },
          ],
          ok: true,
          rollbackPayload: { beforeSnapshot: { schedule: { priority: "medium", status: "planned" } }, strategy: "restore_schedule_completion", target: { itemId: 81 } },
          schedule: { id: 81, status: "done", title: "晨间复习" },
          timelineEvent: { id: 82 },
        };
      },
      payload: payload as never,
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { additionalPatch: { priority: "high" }, itemId: 81 });
  assert.equal(getPayloadStubOperations().filter((operation) => operation.type === "update").length, 0);
  assert.deepEqual(result.affectedDocuments?.map((document) => document.collection), ["schedule-items", "timeline-events"]);
  assert.equal((result.rollbackPayload as { strategy?: string } | undefined)?.strategy, "restore_schedule_completion");
});

test("schedule completion rollback payload is executable without exposing its snapshot", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      beforeSnapshot: { schedule: { status: "planned" } },
      strategy: "restore_schedule_completion",
      target: { itemId: 81, timelineEventId: 82 },
    }),
    true,
  );
});
