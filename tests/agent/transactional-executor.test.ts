import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeAgentIntentsTransactional,
  type AgentIntentExecutionResult,
} from "../../src/lib/agent/executor";
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
