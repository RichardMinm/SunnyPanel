import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LinkedObjectSummary } from "../../../src/lib/core-linkage/contracts";
import {
  LinkedObjectNavigationProvider,
  createLatestRequestGuard,
  createLinkedObjectFocusController,
  createLinkedObjectNavigationRequest,
  findExactNavigationTarget,
  getLinkedObjectNavigationDestination,
  replaceDashboardModeInSearch,
  resolveLinkedObjectSelectHandler,
  startLinkedObjectFocus,
  toLinkedObjectNavigationTarget,
  type LinkedObjectNavigationTarget,
} from "../../../src/components/dashboard/linked-objects/LinkedObjectNavigationContext";
import { resolveDashboardNavigationDestination } from "../../../src/components/dashboard/dashboard-navigation";

const read = (path: string) => readFileSync(path, "utf8");
const loadLinkedObjectLink = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  return import(
    "../../../src/components/dashboard/linked-objects/LinkedObjectLink"
  ).then((module) => module.LinkedObjectLink);
};

const summaries = {
  checklist: {
    id: 22,
    title: "发布清单",
    type: "checklist",
  },
  plan: {
    id: 11,
    title: "发布计划",
    type: "plan",
  },
  schedule: {
    date: "2026-09-07",
    id: 33,
    status: "scheduled",
    title: "发布窗口",
    type: "schedule",
  },
  timeline: {
    date: "2026-10-08",
    id: 44,
    status: "active",
    title: "发布里程碑",
    type: "timeline",
  },
} satisfies Record<string, LinkedObjectSummary>;

test("only valid linked summaries become exact typed navigation targets", () => {
  assert.deepEqual(toLinkedObjectNavigationTarget(summaries.plan), {
    id: 11,
    type: "plan",
  });
  assert.deepEqual(toLinkedObjectNavigationTarget(summaries.checklist), {
    id: 22,
    type: "checklist",
  });
  assert.deepEqual(toLinkedObjectNavigationTarget(summaries.schedule), {
    date: "2026-09-07",
    id: 33,
    type: "schedule",
  });
  assert.deepEqual(toLinkedObjectNavigationTarget(summaries.timeline), {
    date: "2026-10-08",
    id: 44,
    type: "timeline",
  });

  for (const invalid of [
    null,
    { id: 1, title: "仅标题" },
    { id: 0, title: "坏 ID", type: "plan" },
    { id: 1.5, title: "坏 ID", type: "checklist" },
    { date: "09/07/2026", id: 33, status: null, title: "坏日期", type: "schedule" },
    { date: "2026-02-30", id: 44, status: null, title: "坏日期", type: "timeline" },
    { id: 55, title: "未知类型", type: "memory" },
  ]) {
    assert.equal(toLinkedObjectNavigationTarget(invalid), null);
  }
});

test("all target types map to the existing Dashboard destination without losing exact identity", () => {
  const cases: Array<
    [
      LinkedObjectNavigationTarget,
      ReturnType<typeof getLinkedObjectNavigationDestination>,
    ]
  > = [
    [
      { id: 11, type: "plan" },
      {
        activeInspectorTab: "plans",
        activeMode: "agent",
        panelOpen: true,
        target: { id: 11, type: "plan" },
      },
    ],
    [
      { id: 22, type: "checklist" },
      {
        activeMode: "checklist",
        target: { id: 22, type: "checklist" },
      },
    ],
    [
      { date: "2026-09-07", id: 33, type: "schedule" },
      {
        activeMode: "schedule",
        month: "2026-09",
        target: { date: "2026-09-07", id: 33, type: "schedule" },
      },
    ],
    [
      { date: "2026-10-08", id: 44, type: "timeline" },
      {
        activeMode: "timeline",
        month: "2026-10",
        target: { date: "2026-10-08", id: 44, type: "timeline" },
      },
    ],
  ];

  for (const [target, expected] of cases) {
    assert.deepEqual(getLinkedObjectNavigationDestination(target), expected);
  }
});

test("same-target navigation receives a fresh monotonically increasing generation", () => {
  const target = { id: 11, type: "plan" } as const;
  const first = createLinkedObjectNavigationRequest(0, target);
  const second = createLinkedObjectNavigationRequest(
    first.generation,
    target,
  );

  assert.deepEqual(first, { generation: 1, target });
  assert.deepEqual(second, { generation: 2, target });
  assert.notEqual(first, second);
  assert.equal(second.target, target);
});

test("latest-request guard rejects out-of-order and cleaned-up request commits", () => {
  const guard = createLatestRequestGuard();
  const first = guard.begin();
  const second = guard.begin();
  const committed: string[] = [];

  assert.equal(first.commit(() => committed.push("stale")), false);
  assert.equal(second.commit(() => committed.push("latest")), true);
  second.cancel();
  assert.equal(second.commit(() => committed.push("after-cleanup")), false);
  assert.deepEqual(committed, ["latest"]);
});

test("explicit LinkedObjectLink callbacks take precedence and callback identity is preserved", () => {
  const contextual = () => undefined;
  const explicit = () => undefined;

  assert.equal(resolveLinkedObjectSelectHandler(undefined, contextual), contextual);
  assert.equal(resolveLinkedObjectSelectHandler(explicit, contextual), explicit);
  assert.equal(resolveLinkedObjectSelectHandler(undefined, undefined), undefined);
});

test("shared provider enables links while provider-absent links remain unavailable", async () => {
  const LinkedObjectLink = await loadLinkedObjectLink();
  const withoutProvider = renderToStaticMarkup(
    createElement(LinkedObjectLink, { summary: summaries.plan }),
  );
  const withProvider = renderToStaticMarkup(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <LinkedObjectLink summary={summaries.plan} />
    </LinkedObjectNavigationProvider>,
  );

  assert.match(withoutProvider, /disabled=""/);
  assert.match(withoutProvider, /aria-label="计划不可用：发布计划"/);
  assert.doesNotMatch(withProvider, /disabled=""/);
  assert.match(withProvider, /aria-label="打开计划：发布计划"/);
});

test("exact target lookup never falls back to title or another record", () => {
  const records = [
    { id: 1, title: "同名计划" },
    { id: 2, title: "同名计划" },
  ];

  assert.equal(findExactNavigationTarget(records, 2), records[1]);
  assert.equal(findExactNavigationTarget(records, 99), null);
  assert.equal(findExactNavigationTarget(records, Number.NaN), null);
});

test("focus scheduling scrolls once, highlights temporarily and is cleanup-safe", () => {
  const calls: string[] = [];
  let frame: (() => void) | undefined;
  let timeout: (() => void) | undefined;
  const classes = new Set<string>();
  const element = {
    classList: {
      add: (value: string) => {
        classes.add(value);
        calls.push(`add:${value}`);
      },
      remove: (value: string) => {
        classes.delete(value);
        calls.push(`remove:${value}`);
      },
    },
    scrollIntoView: (options: ScrollIntoViewOptions) => {
      calls.push(`scroll:${options.block}:${options.behavior}`);
    },
  } as unknown as HTMLElement;

  const cleanup = startLinkedObjectFocus(element, {
    cancelFrame: () => calls.push("cancel-frame"),
    clearDelay: () => calls.push("clear-delay"),
    requestFrame: (callback) => {
      frame = callback;
      return 17;
    },
    setDelay: (callback) => {
      timeout = callback;
      return 23;
    },
  });

  assert.deepEqual(calls, []);
  frame?.();
  assert.deepEqual(calls, [
    "scroll:center:smooth",
    "add:is-linked-object-target",
  ]);
  assert.equal(classes.has("is-linked-object-target"), true);
  timeout?.();
  assert.equal(classes.has("is-linked-object-target"), false);
  cleanup();
  assert.deepEqual(calls.slice(-3), [
    "cancel-frame",
    "clear-delay",
    "remove:is-linked-object-target",
  ]);
});

test("missing or throwing scrollIntoView does not prevent safe highlighting", () => {
  for (const scrollIntoView of [
    undefined,
    () => {
      throw new Error("unsupported scroll");
    },
  ]) {
    const classes = new Set<string>();
    let highlighted = false;
    const element = {
      classList: {
        add: (value: string) => {
          classes.add(value);
          highlighted = true;
        },
        remove: (value: string) => classes.delete(value),
      },
      scrollIntoView,
    } as unknown as HTMLElement;
    const cleanup = startLinkedObjectFocus(element, {
      cancelFrame: () => undefined,
      clearDelay: () => undefined,
      requestFrame: (callback) => {
        callback();
        return 1;
      },
      setDelay: () => 2,
    });

    assert.equal(highlighted, true);
    assert.equal(classes.has("is-linked-object-target"), true);
    assert.doesNotThrow(cleanup);
    assert.doesNotThrow(cleanup);
    assert.equal(classes.has("is-linked-object-target"), false);
  }
});

test("focus controller waits for an actually mounted element and cleans replacements", () => {
  const calls: string[] = [];
  const controller = createLinkedObjectFocusController<HTMLElement>(
    (element) => {
      calls.push(`focus:${element.dataset.target}`);
      return () => calls.push(`cleanup:${element.dataset.target}`);
    },
  );
  const first = { dataset: { target: "first" } } as unknown as HTMLElement;
  const delayed = { dataset: { target: "delayed" } } as unknown as HTMLElement;

  controller.attach(null);
  assert.deepEqual(calls, []);
  controller.attach(first);
  controller.attach(null);
  controller.attach(delayed);
  controller.attach(null);

  assert.deepEqual(calls, [
    "focus:first",
    "cleanup:first",
    "focus:delayed",
    "cleanup:delayed",
  ]);
});

test("Dashboard mode query replacement preserves threadId and unrelated current query", () => {
  assert.equal(
    replaceDashboardModeInSearch("?threadId=33&debug=1", "schedule"),
    "/dashboard?threadId=33&debug=1&mode=schedule",
  );
  assert.equal(
    replaceDashboardModeInSearch("?threadId=33&mode=timeline", "agent"),
    "/dashboard?threadId=33",
  );
});

test("Dashboard workspace navigation resolves plan links to the plan inspector", () => {
  assert.deepEqual(resolveDashboardNavigationDestination("plans"), {
    activeMode: "agent",
    inspectorTab: "plans",
    panelOpen: true,
  });
  assert.deepEqual(resolveDashboardNavigationDestination("memory"), {
    activeMode: "memory",
    inspectorTab: null,
    panelOpen: false,
  });
  assert.deepEqual(resolveDashboardNavigationDestination("unknown"), {
    activeMode: "agent",
    inspectorTab: null,
    panelOpen: false,
  });
});

test("DashboardShell owns navigation provider without route, tab or thread side effects", () => {
  const shell = read("src/components/dashboard/DashboardShell.tsx");
  const handler = shell.match(
    /const handleLinkedObjectNavigate[\s\S]*?\n\s*\},\s*\[[^\]]*\],\s*\);/,
  );

  assert.ok(handler, "DashboardShell should expose the linked-object navigation controller");
  assert.match(shell, /<LinkedObjectNavigationProvider[\s\S]*<AppShell/);
  assert.match(handler[0], /getLinkedObjectNavigationDestination/);
  assert.match(handler[0], /createLinkedObjectNavigationRequest/);
  assert.match(handler[0], /navigationGenerationRef\.current/);
  assert.doesNotMatch(
    handler[0],
    /setThreadId|onLoadThread|onNewThread|window\.location|router\.push|history\.pushState|window\.open|reload/,
  );
});

test("all destinations receive typed target props and wire exact ID/date focus", () => {
  const shell = read("src/components/dashboard/DashboardShell.tsx");
  const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
  const planList = read("src/components/dashboard/agent/PersistedPlanListPanel.tsx");
  const planCard = read("src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx");
  const checklist = read("src/components/dashboard/checklist/ChecklistView.tsx");
  const schedule = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");
  const timeline = read("src/components/dashboard/timeline/TimelineView.tsx");

  assert.match(shell, /<ChecklistView[\s\S]*navigationTarget=/);
  assert.match(shell, /<ScheduleMonthView[\s\S]*navigationTarget=/);
  assert.match(shell, /<TimelineView[\s\S]*navigationTarget=/);
  assert.match(shell, /<DashboardRightPanel[\s\S]*linkedObjectNavigationTarget=/);
  assert.match(rightPanel, /<PersistedPlanListPanel[\s\S]*navigationTarget=/);
  assert.match(rightPanel, /navigationGeneration=/);

  assert.match(planList, /findExactNavigationTarget\(\s*plans,\s*navigationTarget\?\.id/);
  assert.match(planList, /isNavigationTarget=\{isNavigationTarget\}/);
  assert.match(planCard, /setIsExpanded\(true\)/);
  assert.match(planCard, /navigationGeneration/);
  assert.match(planCard, /aria-expanded=\{isExpanded\}/);
  assert.match(checklist, /findExactNavigationTarget\(\s*checklists,\s*navigationTarget\?\.id/);
  assert.match(checklist, /createRetainedDomainRequestRunner/);
  assert.match(checklist, /createNavigationApplicationTracker/);
  assert.match(checklist, /navigationGeneration/);
  assert.match(checklist, /return fetchChecklists\("foreground"\)/);
  assert.match(schedule, /navigationTarget\.date/);
  assert.match(schedule, /findExactNavigationTarget\(\s*items,\s*navigationTarget\?\.id/);
  assert.match(schedule, /navigationGeneration/);
  assert.match(timeline, /navigationTarget\.date/);
  assert.match(timeline, /findExactNavigationTarget\(\s*events,\s*navigationTarget\?\.id/);
  assert.match(timeline, /navigationGeneration/);
  assert.match(
    read("src/components/dashboard/linked-objects/LinkedObjectNavigationContext.tsx"),
    /const focusRef = useCallback\(/,
  );
  for (const source of [planCard, checklist, schedule, timeline]) {
    assert.match(source, /navigationGeneration \?\? 0/);
  }

  for (const source of [planList, checklist, schedule, timeline]) {
    assert.doesNotMatch(source, /find\([^)]*title\s*===/);
  }
  for (const source of [checklist, schedule, timeline]) {
    assert.doesNotMatch(
      source,
      /onClick=\{[\s\S]{0,160}if \(!navigationTarget\)/,
    );
  }
});

test("linked list toggle and focused destinations expose accessible motion-safe styles", () => {
  const list = read("src/components/dashboard/linked-objects/LinkedObjectList.tsx");
  const css = read("src/app/styles/sunny-dashboard-linked-objects.css");

  assert.match(list, /aria-expanded=\{false\}/);
  assert.match(list, /aria-expanded=\{true\}/);
  assert.match(css, /\.is-linked-object-target/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.is-linked-object-target/,
  );
});
