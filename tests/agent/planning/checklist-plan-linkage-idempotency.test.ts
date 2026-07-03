import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../../src/lib/agent/action-receipts";
import type { CreateChecklistArgs } from "../../../src/lib/agent/schemas";
import { createChecklistFromIntent } from "../../../src/lib/agent/tools/checklist-create";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const args: CreateChecklistArgs = {
  groups: [
    {
      items: [
        {
          description: null,
          isCompleted: false,
          title: "修复登录页",
        },
      ],
      title: "上线收尾",
    },
  ],
  sourcePlanId: 88,
  sourceText: "从清单草案准备创建正式清单。",
  title: "SunnyPanel 第一版上线任务清单",
};

beforeEach(() => {
  resetPayloadStub();
});

test("action receipt replay prevents duplicate checklist creation and duplicate plan links", async () => {
  let savedResponse: unknown = null;
  const store: AgentActionReceiptStore = {
    claim: async () =>
      savedResponse
        ? {
            response: savedResponse,
            status: "replay",
          }
        : {
            receiptId: 1,
            status: "claimed",
          },
    complete: async (_receiptId, response) => {
      savedResponse = response;
    },
    markIndeterminate: async () => undefined,
  };

  setPayloadStubFindByIDHandler(async () => ({
    id: 88,
    linkedContent: [],
    title: "SunnyPanel 第一版上线计划",
  }));
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const createInput = input as { collection: string; data: Record<string, unknown> };

    if (createInput.collection === "checklists") {
      return {
        id: 701,
        ...createInput.data,
      };
    }

    return {
      id: 1701,
      ...createInput.data,
    };
  });
  setPayloadStubUpdateHandler(async (input) => ({ id: 88, ...(input as { data: Record<string, unknown> }).data }));

  const execute = () => createChecklistFromIntent(args, undefined, { userId: 7 });
  const first = await runIdempotentAgentAction({
    actionId: "create-linked-checklist-action",
    execute,
    intent: "create_checklist",
    store,
    threadId: 42,
    userId: 7,
  });
  const replayed = await runIdempotentAgentAction({
    actionId: "create-linked-checklist-action",
    execute,
    intent: "create_checklist",
    store,
    threadId: 42,
    userId: 7,
  });

  assert.deepEqual(replayed, first);
  assert.equal(first.checklistId, 701);
  assert.equal(first.linkedPlanId, 88);
  assert.deepEqual(first.afterLinkedContent, [{ relationTo: "checklists", value: 701 }]);
  assert.equal(
    getPayloadStubOperations().filter(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "checklists",
    ).length,
    1,
  );
  assert.equal(
    getPayloadStubOperations().filter(
      (operation) =>
        operation.type === "update" &&
        (operation.args as { collection?: string }).collection === "plans",
    ).length,
    1,
  );
  assert.deepEqual((savedResponse as { linkedPlanId?: unknown }).linkedPlanId, 88);
  assert.deepEqual(
    (savedResponse as { afterLinkedContent?: unknown }).afterLinkedContent,
    [{ relationTo: "checklists", value: 701 }],
  );
});
