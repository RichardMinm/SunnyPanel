import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeAgentIntentsTransactional,
  type AgentIntentExecutionResult,
} from "../../src/lib/agent/executor";
import { executeTrustedRollbackRequest } from "../../src/lib/agent/rollback-request";
import type { AgentIntent } from "../../src/lib/agent/schemas";

type AnswerIntent = Extract<AgentIntent, { intent: "answer_question" }>;

const makeAnswerIntent = (answer: string): AnswerIntent => ({
  args: { answer },
  intent: "answer_question",
});

test("transactional batch rolls back completed executable actions in reverse order when a later intent fails", async () => {
  const intents = [makeAnswerIntent("step one"), makeAnswerIntent("step two"), makeAnswerIntent("step three")];
  const rollbackCalls: unknown[] = [];
  const executed: string[] = [];
  const rollbackPayloads = [
    {
      strategy: "delete_created_document",
      target: { collection: "plans", documentId: 101 },
    },
    {
      strategy: "delete_created_timeline_event",
      target: { collection: "timeline-events", documentId: 202 },
    },
  ];

  const result = await executeAgentIntentsTransactional(intents, undefined, {
    executeIntent: async (intent: AgentIntent): Promise<AgentIntentExecutionResult> => {
      if (intent.intent !== "answer_question") {
        throw new Error(`unexpected intent ${intent.intent}`);
      }

      executed.push(intent.args.answer);

      if (intent.args.answer === "step three") {
        throw new Error("第三步写入失败");
      }

      const index = executed.length - 1;

      return {
        assistantMessage: `完成：${intent.args.answer}`,
        pendingAction: null,
        rollbackPayload: rollbackPayloads[index],
      };
    },
    executeRollback: async (rollbackPayload: unknown) => {
      rollbackCalls.push(rollbackPayload);

      return {
        collection: (rollbackPayload as { target: { collection: string } }).target.collection,
        documentId: (rollbackPayload as { target: { documentId: number } }).target.documentId,
        strategy: (rollbackPayload as { strategy: string }).strategy,
      };
    },
  });

  assert.deepEqual(executed, ["step one", "step two", "step three"]);
  assert.deepEqual(rollbackCalls, [rollbackPayloads[1], rollbackPayloads[0]]);
  assert.equal(result.status, "failed");
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /批量执行在第 3\/3 步失败/);
  assert.match(result.assistantMessage, /第三步写入失败/);
  assert.match(result.assistantMessage, /已自动回滚 2 项/);
  assert.match(result.assistantMessage, /timeline-events#202/);
  assert.match(result.assistantMessage, /plans#101/);
});

test("transactional batch keeps successful messages and the latest pending action", async () => {
  const intents = [makeAnswerIntent("step one"), makeAnswerIntent("step two")];

  const result = await executeAgentIntentsTransactional(intents, undefined, {
    executeIntent: async (intent: AgentIntent): Promise<AgentIntentExecutionResult> => {
      if (intent.intent !== "answer_question") {
        throw new Error(`unexpected intent ${intent.intent}`);
      }

      return {
        assistantMessage: `完成：${intent.args.answer}`,
        pendingAction:
          intent.args.answer === "step two"
            ? {
                checklistTitle: "测试清单",
                itemTitle: "第二步",
                type: "await_completion_note",
              }
            : null,
      };
    },
  });

  assert.equal(result.assistantMessage, "完成：step one\n\n完成：step two");
  assert.equal(result.pendingAction?.type, "await_completion_note");
});

test("transactional batch preserves effects even when a child has no assistant message", async () => {
  const result = await executeAgentIntentsTransactional([makeAnswerIntent("silent"), makeAnswerIntent("visible")], undefined, {
    executeIntent: async (intent): Promise<AgentIntentExecutionResult> => ({
      affectedDocuments: [{ collection: "plans", documentId: (intent as AnswerIntent).args.answer === "silent" ? 1 : 2, operation: "update", visibility: "private" }],
      assistantMessage: (intent as AnswerIntent).args.answer === "silent" ? "" : "visible",
      pendingAction: null,
    }),
  });

  assert.deepEqual(result.affectedDocuments?.map((document) => document.documentId), [1, 2]);
});

test("transactional batch propagates the latest executable child source run ID", async () => {
  const result = await executeAgentIntentsTransactional(
    [makeAnswerIntent("first"), makeAnswerIntent("second")],
    undefined,
    {
      executeIntent: async (intent) => ({
        assistantMessage: (intent as AnswerIntent).args.answer,
        pendingAction: null,
        rollbackPayload: {
          strategy: "delete_created_document",
          target: {
            collection: "plans",
            documentId: (intent as AnswerIntent).args.answer === "first" ? 1 : 2,
          },
        },
        rollbackSourceRunId: (intent as AnswerIntent).args.answer === "first" ? 81 : 82,
      }) as AgentIntentExecutionResult,
    },
  );

  assert.equal((result as AgentIntentExecutionResult & { rollbackSourceRunId?: number }).rollbackSourceRunId, 82);
});

test("transactional batch never pairs a previous source run with a later executable payload", async () => {
  const result = await executeAgentIntentsTransactional(
    [makeAnswerIntent("first"), makeAnswerIntent("second")],
    undefined,
    {
      executeIntent: async (intent) => ({
        assistantMessage: (intent as AnswerIntent).args.answer,
        pendingAction: null,
        rollbackPayload: {
          strategy: "delete_created_document",
          target: {
            collection: "plans",
            documentId: (intent as AnswerIntent).args.answer === "first" ? 1 : 2,
          },
        },
        ...((intent as AnswerIntent).args.answer === "first"
          ? { rollbackSourceRunId: 81 }
          : {}),
      }) as AgentIntentExecutionResult,
    },
  );

  assert.equal(result.rollbackSourceRunId, undefined);
});

test("transactional batch treats a returned failed receipt as terminal and compensates prior successes", async () => {
  const executed: string[] = [];
  const rollbackCalls: unknown[] = [];
  const firstRollback = {
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: 101 },
  };

  const result = await executeAgentIntentsTransactional(
    [
      makeAnswerIntent("first"),
      makeAnswerIntent("failed"),
      makeAnswerIntent("must not run"),
    ],
    undefined,
    {
      executeIntent: async (intent): Promise<AgentIntentExecutionResult> => {
        const answer = (intent as AnswerIntent).args.answer;
        executed.push(answer);

        if (answer === "first") {
          return {
            assistantMessage: "第一步已完成",
            pendingAction: null,
            rollbackPayload: firstRollback,
          };
        }

        return {
          assistantMessage: "第二步返回失败回执",
          pendingAction: null,
          status: "failed",
        };
      },
      executeRollback: async (rollbackPayload) => {
        rollbackCalls.push(rollbackPayload);
        return {
          collection: "plans",
          documentId: 101,
          strategy: "delete_created_document",
        };
      },
    },
  );

  assert.deepEqual(executed, ["first", "failed"]);
  assert.deepEqual(rollbackCalls, [firstRollback]);
  assert.equal(result.status, "failed");
  assert.match(result.assistantMessage, /第 2\/3 步失败/);
  assert.match(result.assistantMessage, /第二步返回失败回执/);
  assert.match(result.assistantMessage, /已完整补偿|已自动回滚 1 项/);
});

test("transactional batch compensates a failed child's trusted effects before prior successes", async () => {
  const executed: string[] = [];
  const rollbackCalls: unknown[] = [];
  const previousRollback = {
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: 101 },
  };
  const failedChildRollback = {
    strategy: "restore_schedule_completion",
    target: { itemId: 81, timelineEventId: 82 },
    beforeSnapshot: { schedule: { status: "planned" } },
    afterSnapshot: {
      schedule: { status: "done" },
      timelineEvent: { title: "完成日程" },
    },
  };

  const result = await executeAgentIntentsTransactional(
    [makeAnswerIntent("first"), makeAnswerIntent("failed"), makeAnswerIntent("must not run")],
    undefined,
    {
      executeIntent: async (intent): Promise<AgentIntentExecutionResult> => {
        const answer = (intent as AnswerIntent).args.answer;
        executed.push(answer);

        if (answer === "first") {
          return {
            assistantMessage: "第一步已完成",
            pendingAction: null,
            rollbackPayload: previousRollback,
          };
        }

        if (answer === "failed") {
          return {
            assistantMessage: "日程已完成，但审计失败",
            pendingAction: null,
            rollbackPayload: failedChildRollback,
            status: "failed",
          };
        }

        throw new Error("later child must not execute");
      },
      executeRollback: async (rollbackPayload) => {
        rollbackCalls.push(rollbackPayload);
        const payload = rollbackPayload as {
          strategy: string;
          target: { documentId?: number; itemId?: number };
        };

        return {
          collection: payload.strategy === "restore_schedule_completion"
            ? "schedule-items"
            : "plans",
          documentId: payload.target.itemId ?? payload.target.documentId ?? 0,
          strategy: payload.strategy,
        };
      },
      userId: 7,
    },
  );

  assert.deepEqual(executed, ["first", "failed"]);
  assert.deepEqual(rollbackCalls, [failedChildRollback, previousRollback]);
  assert.equal(result.status, "failed");
  assert.match(result.assistantMessage, /日程已完成，但审计失败/);
});

test("transactional batch reports incomplete compensation without claiming success", async () => {
  const rollbackPayload = {
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: 101 },
  };

  const result = await executeAgentIntentsTransactional(
    [makeAnswerIntent("first"), makeAnswerIntent("failed")],
    undefined,
    {
      executeIntent: async (intent): Promise<AgentIntentExecutionResult> => {
        if ((intent as AnswerIntent).args.answer === "first") {
          return {
            assistantMessage: "第一步已完成",
            pendingAction: null,
            rollbackPayload,
          };
        }

        return {
          assistantMessage: "第二步失败",
          pendingAction: null,
          status: "failed",
        };
      },
      executeRollback: async () => {
        throw new Error("rollback outcome unknown");
      },
    },
  );

  assert.equal(result.status, "failed");
  assert.match(result.assistantMessage, /补偿未完整|补偿结果不确定/);
  assert.doesNotMatch(result.assistantMessage, /已完整补偿/);
});

test("default Schedule batch compensation is owner-bound, receives the authenticated user, and consumes its AgentRun", async () => {
  const storedScheduleRollback = {
    afterSnapshot: {
      schedule: { status: "done" },
      timelineEvent: { title: "完成日程" },
    },
    beforeSnapshot: {
      schedule: { status: "planned" },
      timelineEvent: null,
    },
    strategy: "restore_schedule_completion",
    target: { itemId: 81, timelineEventId: 82 },
  };
  let rollbackAvailable = true;
  let lifecycle = "available";
  let databaseMutations = 0;
  const auditUpdates: unknown[] = [];
  const executedPayloads: unknown[] = [];
  const receivedUserIds: Array<number | undefined> = [];
  const rollbackStore = {
    db: {
      primaryDrizzle: {
        execute: async () => {
          databaseMutations += 1;

          if (databaseMutations === 1) {
            if (!rollbackAvailable) return { rows: [] };
            rollbackAvailable = false;
            lifecycle = "in_progress";
            return { rows: [{ id: 91 }] };
          }

          if (databaseMutations === 2 && lifecycle === "in_progress") {
            lifecycle = "consumed";
            rollbackAvailable = false;
            return { rows: [{ id: 91 }] };
          }

          return { rows: [] };
        },
      },
      tableNameMap: new Map([["agent_runs", "agent_runs"]]),
    },
    find: async () => ({
      docs: [{
        id: 91,
        rollbackAvailable,
        rollbackPayload: storedScheduleRollback,
        status: "succeeded",
        steps: [],
        title: "Agent completed schedule",
        user: 7,
        workflow: "sync",
      }],
      totalDocs: 1,
    }),
    update: async (input: unknown) => {
      auditUpdates.push(input);
      return { id: 91 };
    },
  };

  const result = await executeAgentIntentsTransactional(
    [makeAnswerIntent("schedule"), makeAnswerIntent("failed")],
    undefined,
    {
      executeIntent: async (intent): Promise<AgentIntentExecutionResult> => {
        if ((intent as AnswerIntent).args.answer === "schedule") {
          return {
            assistantMessage: "日程已完成",
            pendingAction: null,
            rollbackPayload: storedScheduleRollback,
            rollbackSourceRunId: 91,
          };
        }

        return {
          assistantMessage: "后续操作失败",
          pendingAction: null,
          status: "failed",
        };
      },
      executeRollback: async (rollbackPayload, rollbackOptions) => {
        executedPayloads.push(rollbackPayload);
        receivedUserIds.push(rollbackOptions?.userId);

        return {
          collection: "schedule-items",
          documentId: 81,
          strategy: "restore_schedule_completion",
        };
      },
      rollbackPayloadStore: rollbackStore as never,
      userId: 7,
    },
  );

  assert.equal(result.status, "failed");
  assert.match(result.assistantMessage, /已完整补偿/);
  assert.deepEqual(executedPayloads, [storedScheduleRollback]);
  assert.deepEqual(receivedUserIds, [7]);
  assert.equal(databaseMutations, 2);
  assert.equal(auditUpdates.length, 1);
  assert.equal(rollbackAvailable, false);
  assert.equal(lifecycle, "consumed");

  let laterManualExecutions = 0;
  await assert.rejects(
    executeTrustedRollbackRequest({
      executeRollback: async () => {
        laterManualExecutions += 1;
        throw new Error("must not execute a consumed rollback");
      },
      payload: rollbackStore as never,
      sourceRunId: 91,
      userId: 7,
    }),
    /不可回滚/,
  );
  assert.equal(laterManualExecutions, 0);
  assert.equal(databaseMutations, 2);
});
