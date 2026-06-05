import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeTrustedRollbackRequest } from "../../src/lib/agent/rollback-request";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubFindHandler,
} from "../stubs/payload-client";

const storedRollbackPayload = {
  strategy: "delete_created_document",
  target: {
    collection: "plans",
    documentId: 42,
  },
};

beforeEach(() => {
  resetPayloadStub();
});

test("trusted rollback rejects arbitrary client payloads when no owned AgentRun matches", async () => {
  const payload = await getPayloadClient();
  let executed = false;

  setPayloadStubFindHandler(async () => ({
    docs: [],
    totalDocs: 0,
  }));

  await assert.rejects(
    executeTrustedRollbackRequest({
      executeRollback: async () => {
        executed = true;
        throw new Error("should not execute");
      },
      payload: payload as never,
      rollbackPayload: storedRollbackPayload,
      userId: 7,
    }),
    /没有找到可回滚的 AgentRun|无权访问/,
  );

  assert.equal(executed, false);
  assert.equal(getPayloadStubOperations().some((operation) => operation.type === "update"), false);
});

test("trusted rollback rejects a source run request when the client payload does not match", async () => {
  const payload = await getPayloadClient();
  const executedPayloads: unknown[] = [];

  setPayloadStubFindHandler(async (args) => {
    assert.deepEqual((args as { where?: unknown }).where, {
      and: [
        { user: { equals: 7 } },
        { id: { equals: 12 } },
      ],
    });

    return {
      docs: [
        {
          id: 12,
          rollbackAvailable: true,
          rollbackPayload: storedRollbackPayload,
          status: "succeeded",
          steps: [],
          title: "Agent created plan",
          user: 7,
          workflow: "planning",
        },
      ],
      totalDocs: 1,
    };
  });

  await assert.rejects(
    executeTrustedRollbackRequest({
      executeRollback: async (rollbackPayload) => {
        executedPayloads.push(rollbackPayload);

        return {
          collection: "plans",
          documentId: 42,
          strategy: "delete_created_document",
        };
      },
      payload: payload as never,
      rollbackPayload: {
        strategy: "delete_created_document",
        target: {
          collection: "plans",
          documentId: 999,
        },
      },
      sourceRunId: 12,
      userId: 7,
    }),
    /不一致/,
  );

  assert.deepEqual(executedPayloads, []);
});

test("trusted rollback executes the server-stored payload for an owned source run", async () => {
  const payload = await getPayloadClient();
  const executedPayloads: unknown[] = [];

  setPayloadStubFindHandler(async () => ({
    docs: [
      {
        id: 12,
        rollbackAvailable: true,
        rollbackPayload: storedRollbackPayload,
        status: "succeeded",
        steps: [],
        title: "Agent created plan",
        user: 7,
        workflow: "planning",
      },
    ],
    totalDocs: 1,
  }));

  const result = await executeTrustedRollbackRequest({
    executeRollback: async (rollbackPayload) => {
      executedPayloads.push(rollbackPayload);

      return {
        collection: "plans",
        documentId: 42,
        strategy: "delete_created_document",
      };
    },
    payload: payload as never,
    sourceRunId: 12,
    userId: 7,
  });

  assert.equal(result.sourceRunId, 12);
  assert.deepEqual(executedPayloads, [storedRollbackPayload]);
  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "update")?.args,
    {
      collection: "agent-runs",
      context: {
        skipAgentRunPlanSync: true,
      },
      data: {
        nextAction: "已执行撤销：已执行回滚 delete_created_document",
        rollbackAvailable: false,
        steps: [
          {
            level: "warn",
            message: "ROLLBACK_CONSUMED sourceRun#12 strategy=delete_created_document",
            recordedAt: result.recordedAt,
          },
        ],
      },
      id: 12,
      overrideAccess: true,
    },
  );
});
