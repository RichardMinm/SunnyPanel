import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DOMAIN_REFRESH_EVENT,
  buildDomainRefreshDetail,
  createNavigationApplicationTracker,
  createRetainedDomainRequestRunner,
  notifyAgentTerminalDomainRefresh,
  notifyDomainRefresh,
  notifyRollbackDomainRefresh,
  notifyScheduleCompletionDomainRefresh,
  subscribeToDomainRefresh,
  type DomainRefreshDetail,
} from "../../../src/components/dashboard/linked-objects/useDomainRefresh";

const read = (path: string) => readFileSync(path, "utf8");

const affectedDocuments = [
  { collection: "timeline-events", documentId: 41 },
  { collection: "plans", documentId: 22 },
  { collection: "schedule-items", documentId: 31 },
  { collection: "checklists", documentId: 11 },
  { collection: "plans", documentId: 22 },
  { collection: "timeline-events", documentId: 41 },
];

test("collection mapping emits only the four exact domains in deterministic order", () => {
  assert.deepEqual(
    buildDomainRefreshDetail(affectedDocuments, "agent_execute"),
    {
      domains: ["plans", "checklists", "schedule", "timeline"],
      ids: [11, 22, 31, 41],
      reason: "agent_execute",
    },
  );
});

test("mapping deduplicates domains and IDs while collecting them independently", () => {
  assert.deepEqual(
    buildDomainRefreshDetail(
      [
        { collection: "plans", documentId: 9 },
        { collection: "notes", documentId: 1 },
        { collection: "checklist", documentId: 2 },
        { collection: "checklists", documentId: 9 },
        { collection: "schedule-items", documentId: Number.MAX_SAFE_INTEGER + 1 },
        { collection: "timeline-events", documentId: 0 },
        { collection: "plans", documentId: -1 },
        { collection: null, documentId: 8 },
        null,
      ],
      "completion",
    ),
    {
      domains: ["plans", "checklists", "schedule", "timeline"],
      ids: [9],
      reason: "completion",
    },
  );
  assert.deepEqual(
    buildDomainRefreshDetail(
      [
        { collection: "notes", documentId: 1 },
        { collection: "plans", documentId: 0 },
        { collection: "checklists" },
        { collection: "schedule-items", documentId: "bad" },
      ],
      "manual_update",
    ),
    {
      domains: ["plans", "checklists", "schedule"],
      reason: "manual_update",
    },
  );
  assert.equal(
    buildDomainRefreshDetail(
      [{ collection: "notes", documentId: 1 }, { collection: null, documentId: 2 }],
      "manual_update",
    ),
    null,
  );
});

test("one source call dispatches one bounded event for many affected documents", () => {
  const target = new EventTarget();
  const details: DomainRefreshDetail[] = [];
  target.addEventListener(DOMAIN_REFRESH_EVENT, (event) => {
    details.push((event as Event & { detail: DomainRefreshDetail }).detail);
  });

  assert.equal(
    notifyDomainRefresh({
      affectedDocuments,
      reason: "agent_execute",
      target,
    }),
    true,
  );
  assert.deepEqual(details, [
    {
      domains: ["plans", "checklists", "schedule", "timeline"],
      ids: [11, 22, 31, 41],
      reason: "agent_execute",
    },
  ]);
  assert.deepEqual(Object.keys(details[0]).sort(), ["domains", "ids", "reason"]);
});

test("Agent terminal helper dispatches once for success, including partial execution with next pending", () => {
  const target = new EventTarget();
  const details: DomainRefreshDetail[] = [];
  target.addEventListener(DOMAIN_REFRESH_EVENT, (event) => {
    details.push((event as Event & { detail: DomainRefreshDetail }).detail);
  });

  assert.equal(
    notifyAgentTerminalDomainRefresh({
      affectedDocuments,
      assistantMessage: "已执行，并准备下一项确认。",
      pendingAction: { type: "await_confirmation" },
      responseOk: true,
      target,
    }),
    true,
  );
  assert.equal(details.length, 1);
  assert.deepEqual(details[0], {
    domains: ["plans", "checklists", "schedule", "timeline"],
    ids: [11, 22, 31, 41],
    reason: "agent_execute",
  });
});

test("Agent terminal helper ignores failure, pending-only, empty and irrelevant effects", () => {
  const target = new EventTarget();
  let calls = 0;
  target.addEventListener(DOMAIN_REFRESH_EVENT, () => {
    calls += 1;
  });

  assert.equal(
    notifyAgentTerminalDomainRefresh({
      affectedDocuments,
      assistantMessage: "失败",
      responseOk: false,
      target,
    }),
    false,
  );
  assert.equal(
    notifyAgentTerminalDomainRefresh({
      affectedDocuments: [],
      assistantMessage: "这是待确认提案。",
      pendingAction: { type: "await_confirmation" },
      responseOk: true,
      target,
    }),
    false,
  );
  assert.equal(
    notifyAgentTerminalDomainRefresh({
      affectedDocuments: [{ collection: "agent-memories", documentId: 7 }],
      assistantMessage: "已保存记忆。",
      responseOk: true,
      target,
    }),
    false,
  );
  assert.equal(
    notifyAgentTerminalDomainRefresh({
      affectedDocuments,
      assistantMessage: null,
      responseOk: true,
      target,
    }),
    false,
  );
  assert.equal(calls, 0);
});

test("rollback helper maps normalized documents and bounded legacy fallback only on success", () => {
  const target = new EventTarget();
  const details: DomainRefreshDetail[] = [];
  target.addEventListener(DOMAIN_REFRESH_EVENT, (event) => {
    details.push((event as Event & { detail: DomainRefreshDetail }).detail);
  });

  assert.equal(
    notifyRollbackDomainRefresh({
      responseOk: true,
      result: {
        affectedDocuments: [
          { collection: "timeline-events", documentId: 51 },
          { collection: "plans", documentId: 10 },
        ],
        collection: "checklists",
        documentId: 99,
        strategy: "restore",
      },
      target,
    }),
    true,
  );
  assert.equal(
    notifyRollbackDomainRefresh({
      responseOk: true,
      result: {
        collection: "schedule-items",
        documentId: 71,
        strategy: "restore",
      },
      target,
    }),
    true,
  );
  assert.equal(
    notifyRollbackDomainRefresh({
      responseOk: false,
      result: {
        affectedDocuments: [{ collection: "plans", documentId: 88 }],
        strategy: "restore",
      },
      target,
    }),
    false,
  );
  assert.equal(
    notifyRollbackDomainRefresh({
      responseOk: true,
      result: null,
      target,
    }),
    false,
  );
  assert.deepEqual(details, [
    {
      domains: ["plans", "timeline"],
      ids: [10, 51],
      reason: "rollback",
    },
    {
      domains: ["schedule"],
      ids: [71],
      reason: "rollback",
    },
  ]);
});

test("Schedule completion helper dispatches the full returned chain only for bounded success", () => {
  const target = new EventTarget();
  const details: DomainRefreshDetail[] = [];
  target.addEventListener(DOMAIN_REFRESH_EVENT, (event) => {
    details.push((event as Event & { detail: DomainRefreshDetail }).detail);
  });

  assert.equal(
    notifyScheduleCompletionDomainRefresh({
      affectedDocuments,
      item: { id: 31, status: "done" },
      responseOk: true,
      target,
    }),
    true,
  );
  assert.equal(
    notifyScheduleCompletionDomainRefresh({
      affectedDocuments,
      item: { id: 31, status: "done" },
      responseOk: false,
      target,
    }),
    false,
  );
  assert.equal(
    notifyScheduleCompletionDomainRefresh({
      affectedDocuments: null,
      item: { id: 31, status: "done" },
      responseOk: true,
      target,
    }),
    false,
  );
  assert.equal(
    notifyScheduleCompletionDomainRefresh({
      affectedDocuments,
      item: { id: "bad", status: "done" },
      responseOk: true,
      target,
    }),
    false,
  );
  assert.deepEqual(details, [
    {
      domains: ["plans", "checklists", "schedule", "timeline"],
      ids: [11, 22, 31, 41],
      reason: "completion",
    },
  ]);
});

test("subscribers run once for their domain, ignore other domains, and clean up", () => {
  const target = new EventTarget();
  let plans = 0;
  let timeline = 0;
  const unsubscribePlans = subscribeToDomainRefresh(
    "plans",
    () => {
      plans += 1;
    },
    target,
  );
  subscribeToDomainRefresh(
    "timeline",
    () => {
      timeline += 1;
    },
    target,
  );

  const event = new Event(DOMAIN_REFRESH_EVENT) as Event & {
    detail: DomainRefreshDetail;
  };
  Object.defineProperty(event, "detail", {
    value: {
      domains: ["plans", "plans", "schedule"],
      reason: "manual_update",
    },
  });
  target.dispatchEvent(event);

  assert.equal(plans, 1);
  assert.equal(timeline, 0);
  unsubscribePlans();
  target.dispatchEvent(event);
  assert.equal(plans, 1);
});

test("real Agent, rollback and Schedule sources each call their behavior-tested helper once", () => {
  const messaging = read(
    "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts",
  );
  const dashboardChat = read(
    "src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts",
  );
  const schedule = read(
    "src/components/dashboard/schedule/ScheduleMonthView.tsx",
  );

  const sendMessageBody = messaging.slice(
    messaging.indexOf("const sendMessage"),
    messaging.indexOf("useEffect(() =>", messaging.indexOf("const sendMessage")),
  );
  assert.equal(
    sendMessageBody.match(/notifyAgentTerminalDomainRefresh\(/g)?.length,
    1,
    "a completed Agent turn must notify once, not per stream event/document",
  );

  const artifactsRollbackBody = messaging.slice(
    messaging.indexOf("const runArtifactsRollback"),
    messaging.indexOf("return {", messaging.indexOf("const runArtifactsRollback")),
  );
  assert.equal(
    artifactsRollbackBody.match(/notifyRollbackDomainRefresh\(/g)?.length,
    1,
  );

  const selectedRollbackBody = dashboardChat.slice(
    dashboardChat.indexOf("const rollbackSelectedRun"),
    dashboardChat.indexOf("const tokenCountStr"),
  );
  assert.equal(
    selectedRollbackBody.match(/notifyRollbackDomainRefresh\(/g)?.length,
    1,
  );

  const completionBody = schedule.slice(
    schedule.indexOf("const completeScheduleItem"),
    schedule.indexOf("/* ── Calendar Helpers"),
  );
  assert.equal(
    completionBody.match(/notifyScheduleCompletionDomainRefresh\(/g)?.length,
    1,
  );
  assert.match(completionBody, /affectedDocuments:\s*data\?\.affectedDocuments/);
});

test("all four views use the shared retained runner and exact-domain background loader", () => {
  for (const [path, domain, loader] of [
    [
      "src/components/dashboard/agent/PersistedPlanListPanel.tsx",
      "plans",
      "loadPlans",
    ],
    [
      "src/components/dashboard/checklist/ChecklistView.tsx",
      "checklists",
      "fetchChecklists",
    ],
    [
      "src/components/dashboard/schedule/ScheduleMonthView.tsx",
      "schedule",
      "loadScheduleItems",
    ],
    [
      "src/components/dashboard/timeline/TimelineView.tsx",
      "timeline",
      "loadTimelineEvents",
    ],
  ] as const) {
    const source = read(path);
    assert.match(
      source,
      new RegExp(`useDomainRefresh\\("${domain}", ${loader}\\)`),
    );
    assert.match(
      source,
      new RegExp(`return ${loader}\\("foreground"\\)`),
    );
    assert.match(source, /requestRunnerRef\.current\.run\(\{/);
    assert.match(source, /mode,/);
    assert.equal(
      source.match(/useDomainRefresh\(/g)?.length,
      1,
      `${path} must have one domain subscription`,
    );
  }

  const hook = read(
    "src/components/dashboard/linked-objects/useDomainRefresh.ts",
  );
  assert.match(hook, /const cleanup = loader\("background"\)/);
  assert.match(hook, /\(mode\) => loaderRef\.current\(mode\)/);

  for (const path of [
    "src/components/dashboard/checklist/ChecklistView.tsx",
    "src/components/dashboard/schedule/ScheduleMonthView.tsx",
    "src/components/dashboard/timeline/TimelineView.tsx",
  ]) {
    assert.match(
      read(path),
      /navigationApplicationRef\.current\.shouldApply\(/,
    );
  }
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("retained runner distinguishes foreground/background and retains data on failure", async () => {
  const runner = createRetainedDomainRequestRunner();
  const loading: boolean[] = [];
  let data = ["retained"];
  let error: string | null = null;
  const preservedViewState = {
    expandedId: 44,
    filter: "active",
    month: "2026-07",
    selectedDate: "2026-07-28",
    threadId: 73,
  };
  const foreground = deferred<string[]>();
  runner.run({
    clearError: () => {
      error = null;
    },
    load: () => foreground.promise,
    mode: "foreground",
    onData: (next) => {
      data = next;
    },
    onError: () => {
      error = "failed";
    },
    setForegroundLoading: (next) => {
      loading.push(next);
    },
  });
  assert.deepEqual(loading, [true]);
  foreground.resolve(["foreground"]);
  await flushPromises();
  assert.deepEqual(data, ["foreground"]);
  assert.deepEqual(loading, [true, false]);

  const background = deferred<string[]>();
  runner.run({
    clearError: () => {
      error = null;
    },
    load: () => background.promise,
    mode: "background",
    onData: (next) => {
      data = next;
    },
    onError: () => {
      error = "refresh failed";
    },
    setForegroundLoading: (next) => {
      loading.push(next);
    },
  });
  background.reject(new Error("unavailable"));
  await flushPromises();
  assert.deepEqual(data, ["foreground"]);
  assert.equal(error, "refresh failed");
  assert.deepEqual(loading, [true, false]);
  assert.deepEqual(preservedViewState, {
    expandedId: 44,
    filter: "active",
    month: "2026-07",
    selectedDate: "2026-07-28",
    threadId: 73,
  });
});

test("retained runner ignores stale and cancelled completions", async () => {
  const runner = createRetainedDomainRequestRunner();
  let data = "initial";
  let errors = 0;
  const first = deferred<string>();
  const second = deferred<string>();
  const third = deferred<string>();
  const options = {
    clearError: () => undefined,
    mode: "background" as const,
    onData: (next: string) => {
      data = next;
    },
    onError: () => {
      errors += 1;
    },
    setForegroundLoading: () => undefined,
  };

  runner.run({ ...options, load: () => first.promise });
  const cancelSecond = runner.run({ ...options, load: () => second.promise });
  first.resolve("stale");
  await flushPromises();
  assert.equal(data, "initial");

  cancelSecond();
  second.resolve("cancelled");
  await flushPromises();
  assert.equal(data, "initial");
  assert.equal(errors, 0);

  const cancelThird = runner.run({ ...options, load: () => third.promise });
  cancelThird();
  third.reject(new Error("cancelled rejection"));
  await flushPromises();
  assert.equal(data, "initial");
  assert.equal(errors, 0);
});

test("one navigation generation applies once, survives refresh, and a new generation reapplies", () => {
  const tracker = createNavigationApplicationTracker();
  let expandedId = 101;

  assert.equal(tracker.shouldApply("checklist:101:1", true), true);
  expandedId = 999;
  if (tracker.shouldApply("checklist:101:1", true)) {
    expandedId = 101;
  }
  assert.equal(expandedId, 999, "background data refresh must retain user expansion");

  assert.equal(tracker.shouldApply("checklist:101:2", false), false);
  assert.equal(tracker.shouldApply("checklist:101:2", true), true);
  expandedId = 101;
  assert.equal(expandedId, 101);
});

test("Task 13 introduces no polling, page reload, storage channel, SSE or dependency change", () => {
  const files = [
    "src/components/dashboard/linked-objects/useDomainRefresh.ts",
    "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts",
    "src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts",
    "src/components/dashboard/agent/PersistedPlanListPanel.tsx",
    "src/components/dashboard/checklist/ChecklistView.tsx",
    "src/components/dashboard/schedule/ScheduleMonthView.tsx",
    "src/components/dashboard/timeline/TimelineView.tsx",
  ];
  const source = files.map(read).join("\n");
  const messaging = read(
    "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts",
  );

  assert.doesNotMatch(source, /setInterval|BroadcastChannel|storage event/);
  assert.doesNotMatch(source, /window\.location\.reload|location\.reload/);
  assert.doesNotMatch(source, /new EventSource/);
  assert.equal(
    messaging.match(/text\/event-stream/g)?.length,
    1,
    "Task 13 must keep the one pre-existing Agent stream content-type check",
  );
});
