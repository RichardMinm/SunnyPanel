import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveExactScheduleCompletionIntent } from "../../../src/lib/agent/orchestration/deterministic-existing-schedule-boundary";
import { hydrateExactScheduleCompletionContext } from "../../../src/lib/agent/orchestration/exact-schedule-context";
import { buildAgentContext } from "../../../src/lib/agent/context-builder";
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

test("hydrates an exact planned schedule outside the ordinary calendar window", async () => {
  let requestedId: number | null = null;
  const hydrated = await hydrateExactScheduleCompletionContext({
    loadSchedule: async (scheduleId) => {
      requestedId = scheduleId;
      return {
        date: "2026-09-30T00:00:00.000Z",
        id: scheduleId,
        status: "planned",
        title: "完成核心链路验收",
      };
    },
    message: "将日程 #41「完成核心链路验收」标记为完成",
    source: { schedules: [] },
  });

  assert.equal(requestedId, 41);
  assert.deepEqual(hydrated.schedules, [
    {
      date: "2026-09-30T00:00:00.000Z",
      id: 41,
      status: "planned",
      title: "完成核心链路验收",
    },
  ]);
});

test("keeps the exact schedule inside the final prompt budget", async () => {
  const target = {
    date: "2027-12-31T00:00:00.000Z",
    id: 99,
    status: "planned",
    title: "完成核心链路验收",
  };
  const source = await hydrateExactScheduleCompletionContext({
    loadSchedule: async () => target,
    message: "将日程 #99「完成核心链路验收」标记为完成",
    source: {
      schedules: Array.from({ length: 25 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        id: index + 1,
        status: "planned",
        title: `普通日程 ${index + 1}`,
      })),
    },
  });
  const promptContext = buildAgentContext({
    message: "将日程 #99「完成核心链路验收」标记为完成",
    pendingAction: null,
    pinnedScheduleIds: [99],
    source,
    workbenchMode: "ask",
  });

  assert.equal(promptContext.schedules?.length, 20);
  assert.equal(promptContext.schedules?.[0]?.id, 99);
  assert.equal(
    resolveExactScheduleCompletionIntent({
      authenticatedActor: { collection: "users", id: 7 },
      context: promptContext,
      originalRequest: "将日程 #99「完成核心链路验收」标记为完成",
    })?.args.targetId,
    99,
  );
});

test("does not hydrate title conflicts, completed schedules, or ambiguous text", async () => {
  const source = { schedules: [] };
  for (const [message, schedule] of [
    [
      "将日程 #41「完成核心链路验收」标记为完成",
      { id: 41, status: "planned", title: "另一个日程" },
    ],
    [
      "将日程 #41「完成核心链路验收」标记为完成",
      { id: 41, status: "done", title: "完成核心链路验收" },
    ],
    [
      "把核心链路验收标记为完成",
      { id: 41, status: "planned", title: "完成核心链路验收" },
    ],
  ] as const) {
    const hydrated = await hydrateExactScheduleCompletionContext({
      loadSchedule: async () => schedule,
      message,
      source,
    });
    assert.equal(hydrated, source);
  }
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
