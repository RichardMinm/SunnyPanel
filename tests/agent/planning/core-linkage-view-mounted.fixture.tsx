import assert from "node:assert/strict";

import { Window } from "happy-dom";
import { MotionConfig } from "motion/react";
import * as React from "react";
import { type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { LinkedObjectSummary } from "../../../src/lib/core-linkage/contracts";

const domWindow = new Window({
  url: "http://localhost/dashboard",
});
const requestTestFrame = (callback: FrameRequestCallback) =>
  setTimeout(
    () => callback(domWindow.performance.now()),
    16,
  ) as unknown as number;
const cancelTestFrame = (handle: number) =>
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
Object.defineProperties(domWindow, {
  cancelAnimationFrame: {
    configurable: true,
    value: cancelTestFrame,
  },
  requestAnimationFrame: {
    configurable: true,
    value: requestTestFrame,
  },
});
const domGlobals = {
  cancelAnimationFrame: cancelTestFrame,
  document: domWindow.document,
  Element: domWindow.Element,
  HTMLElement: domWindow.HTMLElement,
  MutationObserver: domWindow.MutationObserver,
  navigator: domWindow.navigator,
  Node: domWindow.Node,
  requestAnimationFrame: requestTestFrame,
  SVGElement: domWindow.SVGElement,
  window: domWindow,
};

for (const [key, value] of Object.entries(domGlobals)) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: false,
  writable: true,
});
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const planLink = {
  id: 101,
  title: "发布计划",
  type: "plan",
} satisfies LinkedObjectSummary;

const checklistLink = {
  id: 201,
  title: "发布检查清单",
  type: "checklist",
} satisfies LinkedObjectSummary;

const scheduleLink = {
  date: "2026-07-30",
  id: 301,
  status: "planned",
  title: "发布日程",
  type: "schedule",
} satisfies LinkedObjectSummary;

const timelineLink = {
  date: "2026-07-31",
  id: 401,
  status: "active",
  title: "发布里程碑",
  type: "timeline",
} satisfies LinkedObjectSummary;

async function mountView(
  element: ReactElement,
  responseFor: (url: string, init?: RequestInit) => unknown,
) {
  globalThis.fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return new Response(JSON.stringify(responseFor(url, init)), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  const container = domWindow.document.createElement("div");
  domWindow.document.body.append(container);
  const root = createRoot(
    container as unknown as Parameters<typeof createRoot>[0],
  );
  flushSync(() => {
    root.render(
      <MotionConfig isStatic skipAnimations>
        {element}
      </MotionConfig>,
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  return container;
}

async function loadViews() {
  const [
    { ChecklistView },
    { ScheduleMonthView },
    { TimelineView },
    { LinkedObjectNavigationProvider },
  ] = await Promise.all([
    import("../../../src/components/dashboard/checklist/ChecklistView"),
    import("../../../src/components/dashboard/schedule/ScheduleMonthView"),
    import("../../../src/components/dashboard/timeline/TimelineView"),
    import("../../../src/components/dashboard/linked-objects/index"),
  ]);
  return {
    ChecklistView,
    LinkedObjectNavigationProvider,
    ScheduleMonthView,
    TimelineView,
  };
}

async function checkChecklist() {
  const { ChecklistView, LinkedObjectNavigationProvider } = await loadViews();
  const container = await mountView(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <ChecklistView
        navigationGeneration={6}
        navigationTarget={{
          id: 201,
          type: "checklist",
        }}
        onBackToWorkbench={() => undefined}
        threadId={null}
      />
    </LinkedObjectNavigationProvider>,
    (url) => {
      assert.match(url, /\/api\/agent\/checklist\?/);
      return {
        checklists: [
          {
            completedItems: 1,
            id: 201,
            items: [
              {
                completed: false,
                key: "qa",
                label: "核对发布说明",
              },
            ],
            linkedObjects: [planLink, scheduleLink, timelineLink],
            relatedPlan: { id: 101, title: "发布计划" },
            status: "active",
            title: "发布检查清单",
            totalItems: 2,
          },
        ],
      };
    },
  );

  const header = container.querySelector(".sunny-checklist-card-header");
  assert.equal(header?.getAttribute("aria-expanded"), "true");
  const relationshipSection = container.querySelector(
    ".sunny-checklist-relationship-section",
  );
  assert.ok(relationshipSection);
  assert.equal(
    relationshipSection.closest(".sunny-checklist-items-list"),
    null,
  );
  for (const label of [
    "打开计划：发布计划",
    "打开日程：发布日程",
    "打开时间线：发布里程碑",
  ]) {
    assert.ok(
      relationshipSection.querySelector(`button[aria-label="${label}"]`),
    );
  }
  assert.match(container.textContent ?? "", /1\/2 项完成/);
  assert.match(container.textContent ?? "", /核对发布说明/);
  assert.equal(container.querySelectorAll("button button").length, 0);
}

async function checkChecklistEmpty() {
  const { ChecklistView, LinkedObjectNavigationProvider } = await loadViews();
  const container = await mountView(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <ChecklistView
        navigationGeneration={7}
        navigationTarget={{
          id: 202,
          type: "checklist",
        }}
        onBackToWorkbench={() => undefined}
        threadId={null}
      />
    </LinkedObjectNavigationProvider>,
    () => ({
      checklists: [
        {
          completedItems: 0,
          id: 202,
          items: [],
          linkedObjects: [],
          relatedPlan: null,
          status: "active",
          title: "独立清单",
          totalItems: 0,
        },
      ],
    }),
  );

  const header = container.querySelector(".sunny-checklist-card-header");
  assert.equal(header?.getAttribute("aria-expanded"), "true");
  assert.match(container.textContent ?? "", /暂无关联对象/);
}

async function checkSchedule() {
  const { LinkedObjectNavigationProvider, ScheduleMonthView } =
    await loadViews();
  const container = await mountView(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <ScheduleMonthView
        navigationGeneration={7}
        navigationTarget={{
          date: "2026-07-30",
          id: 301,
          type: "schedule",
        }}
        onBackToWorkbench={() => undefined}
        threadId={null}
      />
    </LinkedObjectNavigationProvider>,
    (url) => {
      assert.match(url, /\/api\/agent\/schedule\?month=2026-07/);
      return {
        items: [
          {
            category: "plan_action",
            conflictNote: "与复盘会议重叠",
            date: "2026-07-30",
            description: "完成发布准备",
            endTime: "10:00",
            id: 301,
            linkedObjects: [planLink, checklistLink, timelineLink],
            planId: 101,
            priority: "high",
            relatedChecklist: { id: 201, title: "发布检查清单" },
            relatedChecklistItemKey: "qa",
            relatedPlan: { id: 101, title: "发布计划" },
            sourceType: "plan",
            startTime: "09:00",
            status: "planned",
            title: "发布日程",
          },
        ],
      };
    },
  );

  const targetCard = container.querySelector(
    '.sunny-schedule-timeline-card[aria-current="true"]',
  );
  assert.ok(targetCard);
  const toggle = targetCard.querySelector(
    ".sunny-schedule-timeline-card-toggle",
  );
  assert.equal(toggle?.getAttribute("aria-expanded"), "true");
  for (const label of [
    "打开计划：发布计划",
    "打开清单：发布检查清单",
    "打开时间线：发布里程碑",
  ]) {
    assert.ok(targetCard.querySelector(`button[aria-label="${label}"]`));
  }
  for (const text of [
    "完成发布准备",
    "清单项：qa",
    "冲突备注：与复盘会议重叠",
    "基于计划创建",
    "完成",
    "编辑",
  ]) {
    assert.match(targetCard.textContent ?? "", new RegExp(text));
  }
  assert.equal(container.querySelectorAll("button button").length, 0);
}

async function checkTimeline() {
  const { LinkedObjectNavigationProvider, TimelineView } = await loadViews();
  const container = await mountView(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <TimelineView
        navigationGeneration={8}
        navigationTarget={{
          date: "2026-07-31",
          id: 401,
          type: "timeline",
        }}
        onBackToWorkbench={() => undefined}
        threadId={null}
      />
    </LinkedObjectNavigationProvider>,
    (url) => {
      assert.match(url, /\/api\/agent\/timeline\?month=2026-07/);
      return {
        events: [
          {
            date: "2026-07-31",
            description: "记录发布完成",
            id: 401,
            linkedObjects: [planLink, checklistLink, scheduleLink],
            sourceType: "schedule",
            title: "发布里程碑",
            type: "milestone",
          },
        ],
      };
    },
  );

  const targetCard = container.querySelector(
    '.sunny-timeline-event-card[aria-current="true"]',
  );
  assert.ok(targetCard);
  const toggle = targetCard.querySelector(".sunny-timeline-event-card-toggle");
  assert.equal(toggle?.getAttribute("aria-expanded"), "true");
  for (const label of [
    "打开计划：发布计划",
    "打开清单：发布检查清单",
    "打开日程：发布日程",
  ]) {
    assert.ok(targetCard.querySelector(`button[aria-label="${label}"]`));
  }
  assert.match(targetCard.textContent ?? "", /记录发布完成/);
  assert.match(targetCard.textContent ?? "", /来源：日程/);
  assert.match(targetCard.textContent ?? "", /里程碑/);
  assert.equal(container.querySelectorAll("button button").length, 0);
}

const mode = process.argv[2];
const checks: Record<string, () => Promise<void>> = {
  checklist: checkChecklist,
  "checklist-empty": checkChecklistEmpty,
  schedule: checkSchedule,
  timeline: checkTimeline,
};

try {
  if (mode === "all") {
    for (const [name, check] of Object.entries(checks)) {
      await check();
      console.log(`${name}: mounted contract passed`);
    }
  } else {
    const check = checks[mode];
    assert.ok(check, `unknown mounted view mode: ${String(mode)}`);
    await check();
    console.log(`${mode}: mounted contract passed`);
  }
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
