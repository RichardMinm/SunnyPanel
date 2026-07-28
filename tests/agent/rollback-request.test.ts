import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeTrustedRollbackRequest } from "../../src/lib/agent/rollback-request";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
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

test("trusted rollback rejects payload-only requests even when an owned AgentRun payload matches", async () => {
  const payload = await getPayloadClient();
  let executed = false;

  setPayloadStubFindHandler(async () => ({
    docs: [{
      id: 12,
      rollbackAvailable: true,
      rollbackPayload: storedRollbackPayload,
      status: "succeeded",
      steps: [],
      title: "Agent created plan",
      user: 7,
      workflow: "planning",
    }],
    totalDocs: 1,
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
    /sourceRunId|rollbackPayload.*(?:不接受|拒绝)|只接受/i,
  );

  assert.equal(executed, false);
  assert.equal(getPayloadStubOperations().some((operation) => operation.type === "find"), false);
  assert.equal(getPayloadStubOperations().some((operation) => operation.type === "update"), false);
});

test("trusted rollback rejects source run requests that also submit executable payloads", async () => {
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
    /rollbackPayload.*(?:不接受|拒绝)|只接受/i,
  );

  assert.deepEqual(executedPayloads, []);
});

test("trusted rollback rejects invalid source run IDs before lookup", async () => {
  const payload = await getPayloadClient();

  for (const sourceRunId of [
    undefined,
    null,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(
      executeTrustedRollbackRequest({
        payload: payload as never,
        sourceRunId,
        userId: 7,
      }),
      /sourceRunId|可回滚的 AgentRun/i,
    );
  }

  assert.equal(getPayloadStubOperations().some((operation) => operation.type === "find"), false);
});

test("trusted rollback cannot resolve a foreign source run through the owner boundary", async () => {
  const payload = await getPayloadClient();

  setPayloadStubFindHandler(async (args) => {
    assert.deepEqual((args as { where?: unknown }).where, {
      and: [
        { user: { equals: 7 } },
        { id: { equals: 12 } },
      ],
    });

    return { docs: [], totalDocs: 0 };
  });

  await assert.rejects(
    executeTrustedRollbackRequest({
      payload: payload as never,
      sourceRunId: 12,
      userId: 7,
    }),
    /没有找到可回滚的 AgentRun|无权访问/,
  );

  assert.equal(
    getPayloadStubOperations().some((operation) => operation.type === "update"),
    false,
  );
});

test("trusted rollback rejects consumed or payload-unavailable source runs", async () => {
  const payload = await getPayloadClient();
  const sourceRuns = [
    {
      id: 12,
      rollbackAvailable: false,
      rollbackPayload: storedRollbackPayload,
      steps: [],
      title: "consumed run",
      workflow: "planning",
    },
    {
      id: 13,
      rollbackAvailable: true,
      steps: [],
      title: "missing payload run",
      workflow: "planning",
    },
  ];

  setPayloadStubFindHandler(async () => ({
    docs: [sourceRuns.shift()],
    totalDocs: 1,
  }));

  for (const sourceRunId of [12, 13]) {
    await assert.rejects(
      executeTrustedRollbackRequest({
        payload: payload as never,
        sourceRunId,
        userId: 7,
      }),
      /当前不可回滚/,
    );
  }

  assert.equal(
    getPayloadStubOperations().some((operation) => operation.type === "update"),
    false,
  );
});

test("trusted rollback executes the server-stored payload for an owned source run", async () => {
  const payload = await getPayloadClient();
  const executedPayloads: unknown[] = [];
  let claimed = false;

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
    claimRollbackSourceRun: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
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

test("trusted rollback default claim path uses the Payload database adapter", async () => {
  const claimQueries: unknown[] = [];
  const consumedUpdates: unknown[] = [];
  const executedPayloads: unknown[] = [];
  const payload = {
    db: {
      primaryDrizzle: {
        execute: async (query: unknown) => {
          claimQueries.push(query);
          return { rows: [{ id: 12 }] };
        },
      },
      tableNameMap: new Map([["agent_runs", "agent_runs"]]),
    },
    find: async () => ({
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
    }),
    update: async (input: unknown) => {
      consumedUpdates.push(input);
      return { id: 12 };
    },
  };

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
  assert.equal(claimQueries.length, 1);
  assert.equal(consumedUpdates.length, 1);
  assert.deepEqual(executedPayloads, [storedRollbackPayload]);
});

test("trusted rollback atomically claims a source run before concurrent execution", async () => {
  const payload = await getPayloadClient();
  let claimed = false;
  let executions = 0;

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

  const request = () => executeTrustedRollbackRequest({
    claimRollbackSourceRun: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    executeRollback: async () => {
      executions += 1;
      await Promise.resolve();

      return {
        collection: "plans",
        documentId: 42,
        strategy: "delete_created_document",
      };
    },
    payload: payload as never,
    sourceRunId: 12,
    userId: 7,
  } as Parameters<typeof executeTrustedRollbackRequest>[0] & {
    claimRollbackSourceRun: () => Promise<boolean>;
  });

  const results = await Promise.allSettled([request(), request()]);

  assert.equal(executions, 1);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("trusted rollback stays claimed when the post-effect consumed update fails", async () => {
  const payload = await getPayloadClient();
  let claimed = false;
  let executions = 0;

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
  setPayloadStubUpdateHandler(async () => {
    throw new Error("consumed audit update unavailable");
  });

  const request = () => executeTrustedRollbackRequest({
    claimRollbackSourceRun: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    executeRollback: async () => {
      executions += 1;

      return {
        collection: "plans",
        documentId: 42,
        strategy: "delete_created_document",
      };
    },
    payload: payload as never,
    sourceRunId: 12,
    userId: 7,
  } as Parameters<typeof executeTrustedRollbackRequest>[0] & {
    claimRollbackSourceRun: () => Promise<boolean>;
  });

  await assert.rejects(request(), /consumed audit update unavailable/);
  await assert.rejects(request(), /不可回滚|已被占用/);
  assert.equal(executions, 1);
});
