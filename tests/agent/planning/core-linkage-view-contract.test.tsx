import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import type {
  LinkedObjectSummary,
  PlanSummary,
} from "../../../src/lib/core-linkage/contracts";

const read = (path: string) => readFileSync(path, "utf8");

const linkedObjects = [
  {
    id: 201,
    title: "发布检查清单",
    type: "checklist",
  },
  {
    date: "2026-07-30",
    id: 301,
    status: "scheduled",
    title: "发布日程",
    type: "schedule",
  },
  {
    date: "2026-07-31",
    id: 401,
    status: "active",
    title: "发布里程碑",
    type: "timeline",
  },
] satisfies LinkedObjectSummary[];

const plan = {
  checklists: [
    {
      completedItems: 1,
      id: 201,
      title: "发布检查清单",
      totalItems: 2,
    },
  ],
  id: 101,
  linkedObjects,
  progress: 50,
  scheduleItems: [
    {
      id: 301,
      startsAt: "2026-07-30T09:00:00.000Z",
      status: "planned",
      title: "发布日程",
    },
  ],
  state: "active",
  status: "published",
  title: "发布计划",
  updatedAt: "2026-07-28T08:00:00.000Z",
} satisfies PlanSummary;

const loadPlanComponents = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const [{ PersistedPlanSnapshotCard }, { LinkedObjectNavigationProvider }] =
    await Promise.all([
      import(
        "../../../src/components/dashboard/agent/PersistedPlanSnapshotCard"
      ),
      import("../../../src/components/dashboard/linked-objects/index"),
    ]);
  return { LinkedObjectNavigationProvider, PersistedPlanSnapshotCard };
};

test("Plan card renders complete counts, shared links and preserved status/progress detail", async () => {
  const { LinkedObjectNavigationProvider, PersistedPlanSnapshotCard } =
    await loadPlanComponents();
  const markup = renderToStaticMarkup(
    <LinkedObjectNavigationProvider onNavigate={() => undefined}>
      <PersistedPlanSnapshotCard isNavigationTarget plan={plan} />
    </LinkedObjectNavigationProvider>,
  );

  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, />发布计划</);
  assert.match(markup, />进行中</);
  assert.match(markup, />已发布</);
  assert.match(markup, />进度 50%</);
  assert.match(markup, />关联清单 1</);
  assert.match(markup, />关联日程 1</);
  assert.match(markup, />关联时间线 1</);
  assert.match(markup, /aria-label="打开清单：发布检查清单"/);
  assert.match(markup, /aria-label="打开日程：发布日程"/);
  assert.match(markup, /aria-label="打开时间线：发布里程碑"/);
});

test("Plan card delegates an empty linkedObjects array to the shared safe empty state", async () => {
  const { PersistedPlanSnapshotCard } = await loadPlanComponents();
  const markup = renderToStaticMarkup(
    createElement(PersistedPlanSnapshotCard, {
      isNavigationTarget: true,
      plan: {
        ...plan,
        checklists: [],
        linkedObjects: [],
        scheduleItems: [],
      },
    }),
  );

  assert.match(markup, />关联清单 0</);
  assert.match(markup, />关联日程 0</);
  assert.match(markup, />关联时间线 0</);
  assert.match(markup, />暂无关联对象</);
});

test("Checklist, Schedule and Timeline consume complete linkedObjects through shared view contracts", () => {
  const checklist = read("src/components/dashboard/checklist/ChecklistView.tsx");
  const schedule = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");
  const timeline = read("src/components/dashboard/timeline/TimelineView.tsx");

  assert.match(checklist, /ChecklistViewSummary/);
  assert.doesNotMatch(checklist, /type ChecklistSummary\s*=/);
  assert.match(checklist, /<LinkedObjectList[\s\S]*?items=\{cl\.linkedObjects\}/);
  assert.doesNotMatch(checklist, /cl\.relatedPlan\.title/);
  assert.match(checklist, /cl\.items\.slice\(0, 20\)\.map/);
  assert.match(checklist, /cl\.completedItems/);
  assert.match(checklist, /cl\.totalItems/);

  assert.match(schedule, /ScheduleViewSummary/);
  assert.doesNotMatch(schedule, /type ScheduleItemSummary\s*=/);
  assert.match(schedule, /<LinkedObjectList[\s\S]*?items=\{item\.linkedObjects\}/);
  assert.doesNotMatch(schedule, /item\.relatedPlan\.title/);
  assert.doesNotMatch(schedule, /item\.relatedChecklist\.title/);
  for (const preserved of [
    "formatTimeRange(item)",
    "statusLabel(item.status)",
    "item.priority",
    "item.description",
    "item.relatedChecklistItemKey",
    "item.conflictNote",
    "item.sourceType",
    "completeScheduleItem(item.id)",
    "编辑",
  ]) {
    assert.ok(schedule.includes(preserved), `Schedule must preserve ${preserved}`);
  }

  assert.match(timeline, /TimelineViewSummary/);
  assert.doesNotMatch(timeline, /type TimelineEventSummary\s*=/);
  assert.match(timeline, /<LinkedObjectList[\s\S]*?items=\{event\.linkedObjects\}/);
  assert.match(timeline, /getTypeConfig\(event\.type\)/);
  assert.match(timeline, /event\.sourceType/);
  assert.match(timeline, /event\.description/);
});

test("all relationship titles in the four views flow through shared relationship components", () => {
  const planCard = read(
    "src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx",
  );
  const checklist = read("src/components/dashboard/checklist/ChecklistView.tsx");
  const schedule = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");
  const timeline = read("src/components/dashboard/timeline/TimelineView.tsx");

  for (const [name, source, owner] of [
    ["Plan", planCard, "plan"],
    ["Checklist", checklist, "cl"],
    ["Schedule", schedule, "item"],
    ["Timeline", timeline, "event"],
  ] as const) {
    assert.ok(
      source.includes("LinkedObjectList"),
      `${name} must import and render LinkedObjectList`,
    );
    assert.match(
      source,
      new RegExp(`items=\\{${owner}\\.linkedObjects\\}`),
      `${name} must pass every authorized linkedObjects summary`,
    );
  }

  assert.doesNotMatch(planCard, /plan\.(?:checklists|scheduleItems)\.map\(/);
  assert.doesNotMatch(checklist, /cl\.relatedPlan\.title/);
  assert.doesNotMatch(schedule, /item\.related(?:Plan|Checklist)\.title/);
});

function assertNoInteractiveDescendantOfButton(
  filePath: string,
  componentName: string,
) {
  const source = read(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const interactiveTags = new Set([
    "AppButton",
    "LinkedObjectLink",
    "LinkedObjectList",
    "button",
  ]);
  const violations: string[] = [];

  const visit = (node: ts.Node, insideButton: boolean) => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sourceFile);
      if (insideButton && interactiveTags.has(tag)) {
        violations.push(tag);
      }
      const nextInsideButton = insideButton || tag === "button";
      for (const child of node.children) {
        visit(child, nextInsideButton);
      }
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      if (insideButton && interactiveTags.has(tag)) {
        violations.push(tag);
      }
      return;
    }
    ts.forEachChild(node, (child) => visit(child, insideButton));
  };

  visit(sourceFile, false);
  assert.deepEqual(
    violations,
    [],
    `${componentName} must keep relationship and action controls outside native buttons`,
  );
}

test("Schedule and Timeline keep relationship/action controls outside expand buttons", () => {
  assertNoInteractiveDescendantOfButton(
    "src/components/dashboard/schedule/ScheduleMonthView.tsx",
    "ScheduleMonthView",
  );
  assertNoInteractiveDescendantOfButton(
    "src/components/dashboard/timeline/TimelineView.tsx",
    "TimelineView",
  );

  for (const source of [
    read("src/components/dashboard/schedule/ScheduleMonthView.tsx"),
    read("src/components/dashboard/timeline/TimelineView.tsx"),
  ]) {
    assert.match(source, /aria-expanded=\{isExpanded\}/);
    assert.match(source, /navigationFocusRef/);
    assert.match(source, /aria-current=/);
  }
});
