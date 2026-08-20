import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentActionReceiptBlockedError,
  buildAgentActionReceiptKey,
  createPayloadActionReceiptStore,
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../src/lib/agent/action-receipts";
import type { AgentChatResponse } from "../../src/lib/agent/schemas";

const response: AgentChatResponse = {
  assistantMessage: "计划已创建",
  engine: "workflow",
  intent: "create_plan",
  pendingAction: null,
};

test("action receipt key is stable per thread and proposed action", () => {
  assert.equal(
    buildAgentActionReceiptKey({
      actionId: "action-1",
      operation: "execute",
      threadId: 42,
    }),
    "agent-thread:42:action:action-1:operation:execute",
  );
});

test("execute and rollback receipts use isolated keys", () => {
  const executeKey = buildAgentActionReceiptKey({
    actionId: "action-1",
    operation: "execute",
    threadId: 42,
  });
  const rollbackKey = buildAgentActionReceiptKey({
    actionId: "action-1",
    operation: "rollback",
    threadId: 42,
  });

  assert.notEqual(executeKey, rollbackKey);
});

test("idempotent action records the first result and replays it later", async () => {
  let savedResponse: unknown = null;
  let executeCount = 0;
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
    complete: async (_receiptId, value) => {
      savedResponse = value;
    },
    markIndeterminate: async () => undefined,
  };
  const execute = async () => {
    executeCount += 1;
    return response;
  };

  assert.deepEqual(
    await runIdempotentAgentAction({
      actionId: "action-1",
      execute,
      intent: "create_plan",
      store,
      threadId: 42,
      userId: 7,
    }),
    response,
  );
  assert.deepEqual(
    await runIdempotentAgentAction({
      actionId: "action-1",
      execute,
      intent: "create_plan",
      store,
      threadId: 42,
      userId: 7,
    }),
    response,
  );
  assert.equal(executeCount, 1);
});

test("an unfinished receipt blocks automatic re-execution", async () => {
  let executeCount = 0;
  const store: AgentActionReceiptStore = {
    claim: async () => ({
      status: "blocked",
    }),
    complete: async () => undefined,
    markIndeterminate: async () => undefined,
  };

  await assert.rejects(
    runIdempotentAgentAction({
      actionId: "action-2",
      execute: async () => {
        executeCount += 1;
        return response;
      },
      intent: "create_plan",
      store,
      threadId: 42,
      userId: 7,
    }),
    AgentActionReceiptBlockedError,
  );
  assert.equal(executeCount, 0);
});

test("failed execution marks the receipt indeterminate", async () => {
  let marked = false;
  const store: AgentActionReceiptStore = {
    claim: async () => ({
      receiptId: 9,
      status: "claimed",
    }),
    complete: async () => undefined,
    markIndeterminate: async () => {
      marked = true;
    },
  };

  await assert.rejects(
    runIdempotentAgentAction({
      actionId: "action-3",
      execute: async () => {
        throw new Error("write failed");
      },
      intent: "create_plan",
      store,
      threadId: 42,
      userId: 7,
    }),
    /write failed/,
  );
  assert.equal(marked, true);
});

test("payload receipt persists only a typed safe failure reason", async () => {
  let updateData: Record<string, unknown> | undefined;
  const store = createPayloadActionReceiptStore({
    create: async () => ({ id: 1 }),
    find: async () => ({ docs: [] }),
    update: async (input) => {
      updateData = input.data;
      return { id: input.id, ...input.data };
    },
  });

  await store.markIndeterminate(
    9,
    new Error("postgres://user:password@10.0.0.1/private?token=secret"),
  );

  assert.equal(
    updateData?.error,
    "runtime_failed: Agent 运行未完成，会话状态已保留。",
  );
  assert.doesNotMatch(JSON.stringify(updateData), /postgres|password|10\.0\.0\.1|secret/u);
});
