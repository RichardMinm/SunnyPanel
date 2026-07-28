import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { RollbackExecutionError } from "../../src/lib/agent/rollback";
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

type TestClaimInput = {
  claimToken: string;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
};

type TestTransitionInput = TestClaimInput & {
  expectedState: string;
  nextAction: string;
  nextState: string;
  rollbackAvailable: boolean;
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

test("trusted rollback bounds owner lookup failures without exposing database internals", async () => {
  let claimed = false;
  const payload = {
    db: {},
    find: async () => {
      throw new Error("postgres://secret-user:secret-password lookup failed");
    },
    update: async () => ({ id: 12 }),
  };

  await assert.rejects(
    executeTrustedRollbackRequest({
      claimRollbackSourceRun: async () => {
        claimed = true;
        return true;
      },
      payload: payload as never,
      sourceRunId: 12,
      userId: 7,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /暂时无法安全处理|稍后重试/);
      assert.doesNotMatch(error.message, /postgres|secret-user|secret-password/i);
      return true;
    },
  );

  assert.equal(claimed, false);
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
    transitionRollbackSourceRun: async () => true,
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
  assert.equal(claimQueries.length, 2);
  assert.equal(consumedUpdates.length, 1);
  assert.deepEqual(executedPayloads, [storedRollbackPayload]);
});

test("trusted rollback atomically claims a source run before concurrent execution", async () => {
  const payload = await getPayloadClient();
  const claimTokens: string[] = [];
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
    claimRollbackSourceRun: async (input: TestClaimInput) => {
      claimTokens.push(input.claimToken);
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
    transitionRollbackSourceRun: async () => true,
    userId: 7,
  } as never);

  const results = await Promise.allSettled([request(), request()]);

  assert.equal(executions, 1);
  assert.equal(claimTokens.length, 2);
  assert.equal(claimTokens.every((token) => typeof token === "string" && token.length > 0), true);
  assert.equal(new Set(claimTokens).size, 2);
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
    transitionRollbackSourceRun: async () => true,
    userId: 7,
  } as never);

  await assert.rejects(request(), /不确定|人工核查/);
  await assert.rejects(request(), /不可回滚|已被占用/);
  assert.equal(executions, 1);
});

test("guaranteed-zero-effect rollback failure records a safe step, releases availability, and permits retry", async () => {
  let available = true;
  let executions = 0;
  let lifecycle = "available";
  const lifecycleTransitions: TestTransitionInput[] = [];
  const updates: unknown[] = [];
  const payload = {
    db: {},
    find: async () => ({
      docs: [{
        id: 12,
        rollbackAvailable: available,
        rollbackPayload: storedRollbackPayload,
        status: "succeeded",
        steps: [],
        title: "Agent created plan",
        user: 7,
        workflow: "planning",
      }],
      totalDocs: 1,
    }),
    update: async (input: unknown) => {
      updates.push(input);
      return { id: 12 };
    },
  };
  const claimRollbackSourceRun = async () => {
    if (!available) return false;
    available = false;
    lifecycle = "in_progress";
    return true;
  };
  const transitionRollbackSourceRun = async (input: TestTransitionInput) => {
    lifecycleTransitions.push(input);
    if (lifecycle !== input.expectedState) return false;
    lifecycle = input.nextState;
    available = input.rollbackAvailable;
    return true;
  };
  const request = () => executeTrustedRollbackRequest({
    claimRollbackSourceRun,
    executeRollback: async () => {
      executions += 1;
      if (executions === 1) {
        throw new RollbackExecutionError(
          "sensitive database validation detail",
          "zero_effect",
        );
      }

      return {
        collection: "plans",
        documentId: 42,
        strategy: "delete_created_document",
      };
    },
    payload: payload as never,
    sourceRunId: 12,
    transitionRollbackSourceRun,
    userId: 7,
  } as never);

  await assert.rejects(
    request(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /未执行|重试/);
      assert.doesNotMatch(error.message, /sensitive|database validation/i);
      return true;
    },
  );
  assert.equal(available, true);
  assert.equal(lifecycle, "failed");
  assert.equal(
    JSON.stringify(updates).includes("ROLLBACK_FAILED_ZERO_EFFECT"),
    true,
  );
  assert.equal(JSON.stringify(updates).includes("sensitive database"), false);

  const retried = await request();
  assert.equal(retried.sourceRunId, 12);
  assert.equal(executions, 2);
  assert.equal(available, false);
  assert.equal(lifecycle, "consumed");
  assert.deepEqual(
    lifecycleTransitions.map((transition) => transition.nextState),
    ["failed", "consumed"],
  );
});

test("indeterminate rollback failure stays unavailable and cannot execute again", async () => {
  let available = true;
  let executions = 0;
  let lifecycle = "available";
  const transitions: TestTransitionInput[] = [];
  const payload = {
    db: {},
    find: async () => ({
      docs: [{
        id: 12,
        rollbackAvailable: available,
        rollbackPayload: storedRollbackPayload,
        status: "succeeded",
        steps: [],
        title: "Agent created plan",
        user: 7,
        workflow: "planning",
      }],
      totalDocs: 1,
    }),
    update: async () => ({ id: 12 }),
  };
  const request = () => executeTrustedRollbackRequest({
    claimRollbackSourceRun: async () => {
      if (!available) return false;
      available = false;
      lifecycle = "in_progress";
      return true;
    },
    executeRollback: async () => {
      executions += 1;
      throw new Error("sensitive possibly-partial write detail");
    },
    payload: payload as never,
    sourceRunId: 12,
    transitionRollbackSourceRun: async (input: TestTransitionInput) => {
      transitions.push(input);
      if (lifecycle !== input.expectedState) return false;
      lifecycle = input.nextState;
      available = input.rollbackAvailable;
      return true;
    },
    userId: 7,
  } as never);

  await assert.rejects(
    request(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /不确定|人工核查/);
      assert.doesNotMatch(error.message, /sensitive|possibly-partial/i);
      return true;
    },
  );
  await assert.rejects(request(), /不可回滚|占用/);

  assert.equal(executions, 1);
  assert.equal(available, false);
  assert.equal(lifecycle, "indeterminate");
  assert.deepEqual(
    transitions.map((transition) => transition.nextState),
    ["indeterminate"],
  );
});

test("post-effect success-audit failure stays unavailable and is best-effort marked indeterminate", async () => {
  let available = true;
  let executions = 0;
  let lifecycle = "available";
  const transitions: TestTransitionInput[] = [];
  const payload = {
    db: {},
    find: async () => ({
      docs: [{
        id: 12,
        rollbackAvailable: available,
        rollbackPayload: storedRollbackPayload,
        status: "succeeded",
        steps: [],
        title: "Agent created plan",
        user: 7,
        workflow: "planning",
      }],
      totalDocs: 1,
    }),
    update: async () => {
      throw new Error("sensitive consumed audit detail");
    },
  };
  const request = () => executeTrustedRollbackRequest({
    claimRollbackSourceRun: async () => {
      if (!available) return false;
      available = false;
      lifecycle = "in_progress";
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
    transitionRollbackSourceRun: async (input: TestTransitionInput) => {
      transitions.push(input);
      if (lifecycle !== input.expectedState) return false;
      lifecycle = input.nextState;
      available = input.rollbackAvailable;
      return true;
    },
    userId: 7,
  } as never);

  await assert.rejects(
    request(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /不确定|人工核查/);
      assert.doesNotMatch(error.message, /sensitive|audit detail/i);
      return true;
    },
  );
  await assert.rejects(request(), /不可回滚|占用/);

  assert.equal(executions, 1);
  assert.equal(available, false);
  assert.equal(lifecycle, "indeterminate");
  assert.deepEqual(
    transitions.map((transition) => transition.nextState),
    ["consumed", "indeterminate"],
  );
});
