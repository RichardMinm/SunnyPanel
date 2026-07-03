import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { buildCreateScheduleItemsRollbackPayload } from "../../../src/lib/agent/tools/schedule-create-items";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
} from "../../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

test("buildCreateScheduleItemsRollbackPayload targets created schedule item ids", () => {
  assert.deepEqual(buildCreateScheduleItemsRollbackPayload([801, 802]), {
    strategy: "delete_created_documents",
    target: {
      collection: "schedule-items",
      documentIds: [801, 802],
    },
  });
});

test("rollback deletes created schedule items", async () => {
  const payload = await getPayloadClient();
  const result = await executeRollbackFromPayload(
    buildCreateScheduleItemsRollbackPayload([801, 802]),
    { payload: payload as never, persistAudit: false },
  );

  assert.equal(result.strategy, "delete_created_documents");
  assert.deepEqual(result.documentIds, [801, 802]);
  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .map((operation) => operation.args),
    [
      { collection: "schedule-items", id: 801, overrideAccess: true },
      { collection: "schedule-items", id: 802, overrideAccess: true },
    ],
  );
});

test("rollback is idempotent when repeated", async () => {
  const payload = await getPayloadClient();
  const rollbackPayload = buildCreateScheduleItemsRollbackPayload([801]);

  await executeRollbackFromPayload(rollbackPayload, { payload: payload as never, persistAudit: false });
  await executeRollbackFromPayload(rollbackPayload, { payload: payload as never, persistAudit: false });

  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .map((operation) => (operation.args as { id?: number }).id),
    [801, 801],
  );
});

test("rollback does not target unrelated schedule items", async () => {
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    buildCreateScheduleItemsRollbackPayload([801, 802]),
    { payload: payload as never, persistAudit: false },
  );

  assert.equal(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .some((operation) => (operation.args as { id?: number }).id === 999),
    false,
  );
});
