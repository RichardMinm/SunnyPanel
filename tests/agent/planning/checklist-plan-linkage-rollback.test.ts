import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { isRollbackPayloadExecutable } from "../../../src/lib/agent/rollback-parse";
import { buildCreateChecklistPlanLinkRollbackPayload } from "../../../src/lib/agent/tools/checklist-create";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubDeleteHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

test("rollback parser recognizes delete_created_checklist_and_restore_plan_links", () => {
  assert.equal(
    isRollbackPayloadExecutable(
      buildCreateChecklistPlanLinkRollbackPayload({
        beforeLinkedContent: [],
        checklistId: 501,
        planId: 88,
      }),
    ),
    true,
  );
});

test("plan linkage rollback deletes checklist and removes only the expected plan link", async () => {
  const payload = await getPayloadClient();
  setPayloadStubFindByIDHandler(async () => ({
    id: 88,
    linkedContent: [
      { relationTo: "posts", value: 11 },
      { relationTo: "checklists", value: 501 },
      { relationTo: "notes", value: 33 },
    ],
    title: "SunnyPanel 第一版上线计划",
  }));
  setPayloadStubUpdateHandler(async (input) => ({ id: 88, ...(input as { data: Record<string, unknown> }).data }));

  const result = await executeRollbackFromPayload(
    buildCreateChecklistPlanLinkRollbackPayload({
      beforeLinkedContent: [{ relationTo: "posts", value: 11 }],
      checklistId: 501,
      planId: 88,
    }),
    {
      payload: payload as never,
      persistAudit: false,
    },
  );

  assert.equal(result.strategy, "delete_created_checklist_and_restore_plan_links");
  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete" || operation.type === "update")
      .map((operation) => operation.args),
    [
      {
        collection: "checklists",
        id: 501,
        overrideAccess: true,
      },
      {
        collection: "plans",
        data: {
          linkedContent: [
            { relationTo: "posts", value: 11 },
            { relationTo: "notes", value: 33 },
          ],
        },
        depth: 0,
        id: 88,
        overrideAccess: true,
      },
    ],
  );
});

test("plan linkage rollback is idempotent when checklist link is already absent", async () => {
  const payload = await getPayloadClient();
  setPayloadStubDeleteHandler(async () => {
    const error = new Error("Not Found") as Error & { status?: number };
    error.status = 404;
    throw error;
  });
  setPayloadStubFindByIDHandler(async () => ({
    id: 88,
    linkedContent: [{ relationTo: "posts", value: 11 }],
    title: "SunnyPanel 第一版上线计划",
  }));
  setPayloadStubUpdateHandler(async (input) => ({ id: 88, ...(input as { data: Record<string, unknown> }).data }));

  await executeRollbackFromPayload(
    buildCreateChecklistPlanLinkRollbackPayload({
      beforeLinkedContent: [],
      checklistId: 501,
      planId: 88,
    }),
    {
      payload: payload as never,
      persistAudit: false,
    },
  );

  const planUpdate = getPayloadStubOperations().find((operation) => operation.type === "update");
  assert.equal(planUpdate, undefined);
});

test("plan linkage rollback fails clearly when current linkedContent is malformed", async () => {
  const payload = await getPayloadClient();
  setPayloadStubFindByIDHandler(async () => ({
    id: 88,
    linkedContent: "not-an-array",
    title: "SunnyPanel 第一版上线计划",
  }));

  await assert.rejects(
    executeRollbackFromPayload(
      buildCreateChecklistPlanLinkRollbackPayload({
        beforeLinkedContent: [],
        checklistId: 501,
        planId: 88,
      }),
      {
        payload: payload as never,
        persistAudit: false,
      },
    ),
    /linkedContent|人工|manual/i,
  );

  assert.equal(
    getPayloadStubOperations().some((operation) => operation.type === "update"),
    false,
  );
});
