import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import {
  DOMAIN_REFRESH_EVENT,
  buildDomainRefreshDetail,
  notifyDomainRefresh,
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

test("mapping deduplicates valid IDs and ignores irrelevant or malformed values", () => {
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
      domains: ["plans", "checklists"],
      ids: [9],
      reason: "completion",
    },
  );
  assert.equal(
    buildDomainRefreshDetail(
      [{ collection: "notes", documentId: 1 }, { collection: "plans", documentId: 0 }],
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

test("failed, pending-only or irrelevant Agent results cannot dispatch", () => {
  const target = new EventTarget();
  let calls = 0;
  target.addEventListener(DOMAIN_REFRESH_EVENT, () => {
    calls += 1;
  });

  assert.equal(
    notifyDomainRefresh({
      affectedDocuments: undefined,
      reason: "agent_execute",
      target,
    }),
    false,
  );
  assert.equal(
    notifyDomainRefresh({
      affectedDocuments: [],
      reason: "agent_execute",
      target,
    }),
    false,
  );
  assert.equal(
    notifyDomainRefresh({
      affectedDocuments: [{ collection: "agent-memories", documentId: 7 }],
      reason: "agent_execute",
      target,
    }),
    false,
  );
  assert.equal(calls, 0);
});

test("rollback notification maps normalized documents and bounded legacy fallback", () => {
  const target = new EventTarget();
  const details: DomainRefreshDetail[] = [];
  target.addEventListener(DOMAIN_REFRESH_EVENT, (event) => {
    details.push((event as Event & { detail: DomainRefreshDetail }).detail);
  });

  assert.equal(
    notifyDomainRefresh({
      affectedDocuments: [
        { collection: "timeline-events", documentId: 51 },
        { collection: "plans", documentId: 10 },
      ],
      fallback: {
        collection: "checklists",
        documentId: 99,
      },
      reason: "rollback",
      target,
    }),
    true,
  );
  assert.equal(
    notifyDomainRefresh({
      fallback: {
        collection: "schedule-items",
        documentId: 71,
      },
      reason: "rollback",
      target,
    }),
    true,
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

test("Agent, both rollback paths and direct completion each notify once after success", () => {
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
    sendMessageBody.match(/notifyDomainRefresh\(/g)?.length,
    1,
    "a completed Agent turn must notify once, not per stream event/document",
  );
  assert.ok(
    sendMessageBody.indexOf("if (!response.ok || !assistantMessage)")
      < sendMessageBody.indexOf("notifyDomainRefresh("),
    "Agent notification must be after terminal success validation",
  );

  const artifactsRollbackBody = messaging.slice(
    messaging.indexOf("const runArtifactsRollback"),
    messaging.indexOf("return {", messaging.indexOf("const runArtifactsRollback")),
  );
  assert.equal(artifactsRollbackBody.match(/notifyDomainRefresh\(/g)?.length, 1);
  assert.match(artifactsRollbackBody, /reason:\s*"rollback"/);
  assert.match(artifactsRollbackBody, /fallback:/);

  const selectedRollbackBody = dashboardChat.slice(
    dashboardChat.indexOf("const rollbackSelectedRun"),
    dashboardChat.indexOf("const tokenCountStr"),
  );
  assert.equal(selectedRollbackBody.match(/notifyDomainRefresh\(/g)?.length, 1);
  assert.match(selectedRollbackBody, /reason:\s*"rollback"/);
  assert.match(selectedRollbackBody, /fallback:/);

  const completionBody = schedule.slice(
    schedule.indexOf("const completeScheduleItem"),
    schedule.indexOf("/* ── Calendar Helpers"),
  );
  assert.equal(completionBody.match(/notifyDomainRefresh\(/g)?.length, 1);
  assert.match(completionBody, /affectedDocuments:\s*data\.affectedDocuments/);
  assert.match(completionBody, /reason:\s*"completion"/);
  assert.ok(
    completionBody.indexOf("if (!response.ok")
      < completionBody.indexOf("notifyDomainRefresh("),
    "completion notification must be after bounded success validation",
  );
});

test("all four views subscribe only to their domain and mount/refetch through one loader", () => {
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
      new RegExp(`useEffect\\(\\(\\) => \\{[\\s\\S]*?return ${loader}\\(\\);[\\s\\S]*?\\}, \\[${loader}\\]\\)`),
    );
    assert.equal(
      source.match(/useDomainRefresh\(/g)?.length,
      1,
      `${path} must have one domain subscription`,
    );
  }
});

test("a failed background plan refresh keeps the last successful data visible", async () => {
  const { Window } = await import("happy-dom");
  const domWindow = new Window({ url: "http://localhost/dashboard" });
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: domWindow.document },
    Element: { configurable: true, value: domWindow.Element },
    HTMLElement: { configurable: true, value: domWindow.HTMLElement },
    navigator: { configurable: true, value: domWindow.navigator },
    Node: { configurable: true, value: domWindow.Node },
    SVGElement: { configurable: true, value: domWindow.SVGElement },
    window: { configurable: true, value: domWindow },
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: false,
  });
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(
        JSON.stringify({
          plans: [
            {
              checklists: [],
              id: 101,
              linkedObjects: [],
              progress: 25,
              scheduleItems: [],
              state: "active",
              status: "published",
              title: "保留的计划",
              updatedAt: "2026-07-28T08:00:00.000Z",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }
    throw new Error("refresh unavailable");
  }) as typeof fetch;

  const { PersistedPlanListPanel } = await import(
    "../../../src/components/dashboard/agent/PersistedPlanListPanel"
  );
  const container = domWindow.document.createElement("div");
  domWindow.document.body.append(container);
  const root = createRoot(
    container as unknown as Parameters<typeof createRoot>[0],
  );
  flushSync(() => {
    root.render(<PersistedPlanListPanel />);
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.match(container.textContent ?? "", /保留的计划/);

  notifyDomainRefresh({
    affectedDocuments: [{ collection: "plans", documentId: 101 }],
    reason: "manual_update",
    target: domWindow as unknown as EventTarget,
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(requestCount, 2);
  assert.match(container.textContent ?? "", /保留的计划/);
  assert.match(container.textContent ?? "", /刷新失败/);
  flushSync(() => root.unmount());
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
