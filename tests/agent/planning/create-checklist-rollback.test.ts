import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { isRollbackPayloadExecutable } from "../../../src/lib/agent/rollback-parse";
import { buildCreateChecklistRollbackPayload } from "../../../src/lib/agent/tools/checklist-create";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubDeleteHandler,
} from "../../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

test("create checklist rollback payload is executable", () => {
  assert.equal(isRollbackPayloadExecutable(buildCreateChecklistRollbackPayload(501)), true);
});

test("delete_created_document deletes a created checklist", async () => {
  const payload = await getPayloadClient();
  const result = await executeRollbackFromPayload(
    buildCreateChecklistRollbackPayload(501),
    {
      payload: payload as never,
      persistAudit: false,
    },
  );

  assert.equal(result.collection, "checklists");
  assert.equal(result.documentId, 501);
  assert.equal(result.strategy, "delete_created_document");
  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "delete")?.args,
    {
      collection: "checklists",
      id: 501,
      overrideAccess: true,
    },
  );
});

test("delete_created_document checklist rollback is idempotent when target is already gone", async () => {
  const payload = await getPayloadClient();
  setPayloadStubDeleteHandler(async () => {
    const error = new Error("Not Found") as Error & { status?: number };
    error.status = 404;
    throw error;
  });

  const result = await executeRollbackFromPayload(
    buildCreateChecklistRollbackPayload(501),
    {
      payload: payload as never,
      persistAudit: false,
    },
  );

  assert.equal(result.collection, "checklists");
  assert.equal(result.documentId, 501);
  assert.equal(result.strategy, "delete_created_document");
  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "delete")?.args,
    {
      collection: "checklists",
      id: 501,
      overrideAccess: true,
    },
  );
});
