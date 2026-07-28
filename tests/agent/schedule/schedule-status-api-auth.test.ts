import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createScheduleStatusHandler,
  type ScheduleStatusDependencies,
} from "../../../src/lib/schedule/schedule-status-handler";

type CallState = {
  atomicUpdates: unknown[];
  completionCalls: unknown[];
  factoryCalls: unknown[];
  payloadCalls: number;
  reads: number;
};

const request = (body: string) => new Request("http://localhost/api/agent/schedule", {
  body,
  headers: { "Content-Type": "application/json" },
  method: "PUT",
});

const successCompletion = {
  affectedDocuments: [{ collection: "schedule-items", documentId: 11, operation: "update" as const, visibility: "private" as const }],
  ok: true as const,
  schedule: { id: 11, status: "done" as const },
};

const createDependencies = (overrides: Partial<ScheduleStatusDependencies> = {}) => {
  const calls: CallState = { atomicUpdates: [], completionCalls: [], factoryCalls: [], payloadCalls: 0, reads: 0 };
  const payload = { label: "payload" };
  const dependencies: ScheduleStatusDependencies = {
    atomicUpdateStatus: async (input) => {
      calls.atomicUpdates.push(input);
      return { id: input.itemId, status: input.data.status };
    },
    completeScheduleItem: async (input) => {
      calls.completionCalls.push(input);
      return successCompletion;
    },
    createTransactionalScheduleCompletionPayload: (input) => {
      calls.factoryCalls.push(input);
      return { label: "transactional-payload" };
    },
    getPayloadAuthResult: async () => ({ user: { id: 9 } }),
    getPayloadClient: async () => {
      calls.payloadCalls += 1;
      return payload;
    },
    readCurrentScheduleStatus: async () => {
      calls.reads += 1;
      return { item: { id: 11, status: "planned" }, ok: true };
    },
    ...overrides,
  };
  return { calls, dependencies, payload };
};

test("schedule status handler rejects unauthenticated forged authority", async () => {
  const { calls, dependencies } = createDependencies({
    getPayloadAuthResult: async () => ({ user: null }),
  });

  const response = await createScheduleStatusHandler(dependencies)(request(JSON.stringify({
    actor: { id: 999, role: "admin" },
    createdBy: 999,
    id: 11,
    role: "admin",
    status: "planned",
  })));

  assert.equal(response.status, 401);
  assert.equal(calls.payloadCalls, 0);
  assert.equal(calls.atomicUpdates.length, 0);
});

test("schedule status handler rejects malformed request bodies before mutation", async () => {
  for (const body of ["null", "[]", "1", "{", JSON.stringify({ id: 0, status: "planned" }), JSON.stringify({ id: 11, status: "unknown" })]) {
    const { calls, dependencies } = createDependencies();
    const response = await createScheduleStatusHandler(dependencies)(request(body));
    assert.equal(response.status, 400, body);
    assert.equal(calls.payloadCalls, 0, body);
    assert.equal(calls.atomicUpdates.length, 0, body);
  }
});

test("authenticated manual and agent Schedule items use the atomic non-done predicate", async () => {
  for (const createdBy of ["manual", "agent"]) {
    const { calls, dependencies, payload } = createDependencies();
    const response = await createScheduleStatusHandler(dependencies)(request(JSON.stringify({
      createdBy,
      id: 11,
      role: "admin",
      status: "planned",
    })));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      affectedDocuments: [{ collection: "schedule-items", documentId: 11, operation: "update", visibility: "private" }],
      item: { id: 11, status: "planned" },
      success: true,
    });
    assert.deepEqual(calls.atomicUpdates, [{
      data: { status: "planned" },
      itemId: 11,
      payload,
      user: { id: 9 },
      where: { and: [{ id: { equals: 11 } }, { status: { not_equals: "done" } }] },
    }]);
    assert.equal(calls.reads, 0);
  }
});

test("done invokes the shared transactional completion with only the authenticated actor", async () => {
  const { calls, dependencies, payload } = createDependencies();
  const response = await createScheduleStatusHandler(dependencies)(request(JSON.stringify({
    actor: { id: 500 },
    createdBy: "agent",
    id: 11,
    role: "admin",
    status: "done",
  })));

  assert.equal(response.status, 200);
  assert.deepEqual(calls.factoryCalls, [{ payload }]);
  assert.deepEqual(calls.completionCalls, [{
    actor: { isAdministrator: true, userId: 9 },
    itemId: 11,
    payload: { label: "transactional-payload" },
  }]);
  assert.equal(calls.atomicUpdates.length, 0);
});

test("atomic no-match reads only to return conflict for a completed Schedule item", async () => {
  const { calls, dependencies } = createDependencies({
    atomicUpdateStatus: async (input) => {
      calls.atomicUpdates.push(input);
      return null;
    },
    readCurrentScheduleStatus: async () => {
      calls.reads += 1;
      return { item: { id: 11, status: "done" }, ok: true };
    },
  });

  const response = await createScheduleStatusHandler(dependencies)(request(JSON.stringify({ id: 11, status: "planned" })));

  assert.equal(response.status, 409);
  assert.equal(calls.atomicUpdates.length, 1);
  assert.equal(calls.reads, 1);
});

test("atomic no-match returns not found without a second mutation", async () => {
  const { calls, dependencies } = createDependencies({
    atomicUpdateStatus: async (input) => {
      calls.atomicUpdates.push(input);
      return null;
    },
    readCurrentScheduleStatus: async () => {
      calls.reads += 1;
      return { item: null, ok: true };
    },
  });

  const response = await createScheduleStatusHandler(dependencies)(request(JSON.stringify({ id: 11, status: "planned" })));

  assert.equal(response.status, 404);
  assert.equal(calls.atomicUpdates.length, 1);
  assert.equal(calls.reads, 1);
});
