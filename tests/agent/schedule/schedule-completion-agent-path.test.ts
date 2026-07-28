import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  executeAgentIntentsTransactional,
  type AgentIntentExecutionResult,
} from "../../../src/lib/agent/executor";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
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
            {
              collection: "schedule-items",
              documentId: 81,
              operation: "update",
              visibility: "private",
              internalSnapshot: "must-not-persist",
            },
            { collection: "timeline-events", documentId: 82, operation: "create", visibility: "private" },
            {
              collection: "users",
              documentId: 7,
              operation: "update",
              visibility: "private",
            },
          ],
          ok: true,
          rollbackPayload: {
            afterSnapshot: {
              checklistGroups: null,
              checklistTimelineEvent: null,
              schedule: { priority: "high", status: "done" },
              timelineEvent: { title: "完成日程：晨间复习" },
            },
            beforeSnapshot: {
              checklistGroups: null,
              schedule: { priority: "medium", status: "planned" },
              timelineEvent: null,
            },
            strategy: "restore_schedule_completion",
            target: { checklistId: null, itemId: 81, planId: null, timelineEventId: 82 },
          },
          schedule: { id: 81, status: "done", title: "晨间复习" },
          timelineEvent: { id: 82 },
        } as never;
      },
      payload: payload as never,
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { additionalPatch: { priority: "high" }, itemId: 81 });
  assert.equal(getPayloadStubOperations().filter((operation) => operation.type === "update").length, 0);
  assert.equal(
    getPayloadStubOperations().filter(
      (operation) =>
        operation.type === "create"
        && (operation.args as { collection?: string }).collection === "agent-runs",
    ).length,
    1,
  );
  const agentRunCreate = getPayloadStubOperations().find(
    (operation) =>
      operation.type === "create"
      && (operation.args as { collection?: string }).collection === "agent-runs",
  );
  assert.deepEqual(
    (agentRunCreate?.args as {
      data?: { affectedDocuments?: unknown };
    }).data?.affectedDocuments,
    [
      {
        collection: "schedule-items",
        documentId: 81,
        operation: "update",
        visibility: "private",
      },
      {
        collection: "timeline-events",
        documentId: 82,
        operation: "create",
        visibility: "private",
      },
    ],
  );
  assert.deepEqual(result.affectedDocuments?.map((document) => document.collection), ["schedule-items", "timeline-events"]);
  assert.equal((result.rollbackPayload as { strategy?: string } | undefined)?.strategy, "restore_schedule_completion");
  assert.equal(result.rollbackSourceRunId, 900);
});

test("confirmed Schedule completion does not rerun business execution when AgentRun creation fails", async () => {
  setPayloadStubFindByIDHandler(async () => ({
    id: 81,
    priority: "medium",
    status: "planned",
    title: "晨间复习",
  }));
  setPayloadStubCreateHandler(async () => {
    throw new Error("audit unavailable");
  });
  const payload = await getPayloadClient();
  let completionCalls = 0;

  const result = await modifyRecordFromIntent(
    {
      changeDescription: "完成",
      entityName: "晨间复习",
      entityType: "schedule",
      patch: { status: "done" },
      targetId: 81,
    },
    undefined,
    {
      completeSchedule: async () => {
        completionCalls += 1;
        return {
          affectedDocuments: [
            {
              collection: "schedule-items",
              documentId: 81,
              operation: "update",
              visibility: "private",
            },
          ],
          ok: true,
          rollbackPayload: {
            afterSnapshot: {
              checklistGroups: null,
              checklistTimelineEvent: null,
              schedule: { status: "done" },
              timelineEvent: { title: "完成日程：晨间复习" },
            },
            beforeSnapshot: {
              checklistGroups: null,
              schedule: { status: "planned" },
              timelineEvent: null,
            },
            strategy: "restore_schedule_completion",
            target: {
              checklistId: null,
              itemId: 81,
              planId: null,
              timelineEventId: 82,
            },
          },
        };
      },
      payload: payload as never,
    },
  );

  assert.equal(completionCalls, 1);
  assert.equal(result.status, "failed");
  assert.equal(result.rollbackSourceRunId, undefined);
  assert.equal(
    (result.rollbackPayload as { strategy?: string } | undefined)?.strategy,
    "restore_schedule_completion",
  );
  assert.match(result.assistantMessage, /审计|执行记录/);
});

test("Schedule audit-failed-after-commit receipt is compensated once and terminates its batch", async () => {
  setPayloadStubFindByIDHandler(async () => ({
    id: 81,
    priority: "medium",
    status: "planned",
    title: "晨间复习",
  }));
  setPayloadStubCreateHandler(async () => {
    throw new Error("audit unavailable");
  });
  const payload = await getPayloadClient();
  let completionCalls = 0;
  let compensationCalls = 0;
  let laterExecutions = 0;
  const receivedUserIds: Array<number | undefined> = [];
  const completionRollbackPayload = {
    afterSnapshot: {
      checklistGroups: null,
      checklistTimelineEvent: null,
      schedule: { status: "done" },
      timelineEvent: { title: "完成日程：晨间复习" },
    },
    beforeSnapshot: {
      checklistGroups: null,
      schedule: { status: "planned" },
      timelineEvent: null,
    },
    strategy: "restore_schedule_completion",
    target: {
      checklistId: null,
      itemId: 81,
      planId: null,
      timelineEventId: 82,
    },
  };
  const intents: AgentIntent[] = [
    { args: { answer: "schedule completion" }, intent: "answer_question" },
    { args: { answer: "must not run" }, intent: "answer_question" },
  ];

  const result = await executeAgentIntentsTransactional(intents, undefined, {
    executeIntent: async (intent): Promise<AgentIntentExecutionResult> => {
      if (
        intent.intent === "answer_question"
        && intent.args.answer === "schedule completion"
      ) {
        return modifyRecordFromIntent(
          {
            changeDescription: "完成",
            entityName: "晨间复习",
            entityType: "schedule",
            patch: { status: "done" },
            targetId: 81,
          },
          undefined,
          {
            completeSchedule: async () => {
              completionCalls += 1;
              return {
                affectedDocuments: [{
                  collection: "schedule-items",
                  documentId: 81,
                  operation: "update",
                  visibility: "private",
                }],
                ok: true,
                rollbackPayload: completionRollbackPayload,
              };
            },
            payload: payload as never,
          },
        );
      }

      laterExecutions += 1;
      return {
        assistantMessage: "unexpected later execution",
        pendingAction: null,
      };
    },
    executeRollback: async (rollbackPayload, rollbackOptions) => {
      compensationCalls += 1;
      receivedUserIds.push(rollbackOptions?.userId);
      assert.deepEqual(rollbackPayload, completionRollbackPayload);

      return {
        collection: "schedule-items",
        documentId: 81,
        strategy: "restore_schedule_completion",
      };
    },
    userId: 7,
  });

  assert.equal(result.status, "failed");
  assert.equal(completionCalls, 1);
  assert.equal(compensationCalls, 1);
  assert.equal(laterExecutions, 0);
  assert.deepEqual(receivedUserIds, [7]);
  assert.match(result.assistantMessage, /已完整补偿/);
});

test("schedule completion rollback payload requires bounded reconciliation snapshots", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      afterSnapshot: {
        checklistGroups: null,
        checklistTimelineEvent: null,
        schedule: { status: "done" },
        timelineEvent: { title: "完成日程：晨间复习" },
      },
      beforeSnapshot: { schedule: { status: "planned" } },
      strategy: "restore_schedule_completion",
      target: { itemId: 81, timelineEventId: 82 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      beforeSnapshot: { schedule: { status: "planned" } },
      strategy: "restore_schedule_completion",
      target: { itemId: 81, timelineEventId: 82 },
    }),
    false,
  );
});
