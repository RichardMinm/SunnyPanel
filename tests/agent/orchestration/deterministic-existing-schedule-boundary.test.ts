import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveExactScheduleCompletionIntent } from "../../../src/lib/agent/orchestration/deterministic-existing-schedule-boundary";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-07-28T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
  schedules: [
    {
      id: 41,
      status: "planned",
      title: "完成核心链路验收",
    },
  ],
  workbenchMode: "execute",
};

test("resolves an exact actor-authorized planned schedule completion", () => {
  const intent = resolveExactScheduleCompletionIntent({
    authenticatedActor: { collection: "users", id: 7 },
    context,
    originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
  });

  assert.deepEqual(intent, {
    args: {
      changeDescription: "标记为完成",
      entityName: "完成核心链路验收",
      entityType: "schedule",
      patch: { status: "done" },
      targetId: 41,
    },
    confidence: 1,
    intent: "modify_record",
  });
});

test("resolves the same exact mutation from the default ask surface", () => {
  const intent = resolveExactScheduleCompletionIntent({
    authenticatedActor: { collection: "users", id: 7 },
    context: { ...context, workbenchMode: "ask" },
    originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
  });

  assert.equal(intent?.intent, "modify_record");
  assert.equal(intent?.args.targetId, 41);
});

test("accepts NFKC-equivalent syntax without weakening the exact title contract", () => {
  const intent = resolveExactScheduleCompletionIntent({
    authenticatedActor: { collection: "users", id: 7 },
    context,
    originalRequest: "把日程 ＃41「完成核心链路验收」设为完成。",
  });

  assert.equal(intent?.intent, "modify_record");
  assert.equal(intent?.args.targetId, 41);
});

test("rejects unknown IDs and title conflicts", () => {
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 7 },
      context,
      originalRequest: "将日程 #99「完成核心链路验收」标记为完成",
    }),
    null,
  );
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 7 },
      context,
      originalRequest: "将日程 #41「另一个日程」标记为完成",
    }),
    null,
  );
});

test("rejects non-action workbench modes and unauthenticated actors", () => {
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 7 },
      context: { ...context, workbenchMode: "today" },
      originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
    }),
    null,
  );
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 7 },
      context: { ...context, workbenchMode: "answer" },
      originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
    }),
    null,
  );
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 0 },
      context,
      originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
    }),
    null,
  );
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "admins", id: 7 },
      context,
      originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
    }),
    null,
  );
});

test("rejects completed, canceled, and skipped schedules", () => {
  for (const status of ["done", "canceled", "skipped"] as const) {
    assert.equal(
      resolveExactScheduleCompletionIntent({
        authenticatedActor: { collection: "users", id: 7 },
        context: {
          ...context,
          schedules: [{ ...context.schedules![0], status }],
        },
        originalRequest: "将日程 #41「完成核心链路验收」标记为完成",
      }),
      null,
    );
  }
});

test("rejects advice, query, ambiguous, and compound text", () => {
  for (const originalRequest of [
    "我该如何完成日程 #41「完成核心链路验收」？",
    "查看日程 #41「完成核心链路验收」",
    "把核心链路验收标记为完成",
    "将日程 #41「完成核心链路验收」标记为完成，然后删除计划",
  ]) {
    assert.equal(
      resolveExactScheduleCompletionIntent({
        authenticatedActor: { collection: "users", id: 7 },
        context,
        originalRequest,
      }),
      null,
    );
  }
});
