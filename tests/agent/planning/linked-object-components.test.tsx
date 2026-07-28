import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LinkedObjectSummary } from "../../../src/lib/core-linkage/contracts";

const loadComponents = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  return import("../../../src/components/dashboard/linked-objects/index");
};

const summaries = {
  checklist: {
    id: 876_541,
    title: "发布检查清单",
    type: "checklist",
  },
  plan: {
    id: 876_540,
    title: "发布准备",
    type: "plan",
  },
  schedule: {
    date: "2026-07-28",
    id: 876_542,
    status: "scheduled",
    title: "发布窗口",
    type: "schedule",
  },
  timeline: {
    date: "2026-07-29",
    id: 876_543,
    status: "active",
    title: "发布里程碑",
    type: "timeline",
  },
} satisfies Record<string, LinkedObjectSummary>;

test("LinkedObjectLink renders every typed variant with the shared label, icon and accessible title", async () => {
  const { LinkedObjectLink } = await loadComponents();
  const cases = [
    [summaries.plan, "计划", "plans"],
    [summaries.checklist, "清单", "checklist"],
    [summaries.schedule, "日程", "schedule"],
    [summaries.timeline, "时间线", "timeline"],
  ] as const;

  for (const [summary, label, icon] of cases) {
    const markup = renderToStaticMarkup(
      createElement(LinkedObjectLink, {
        onSelect: () => undefined,
        summary,
      }),
    );

    assert.match(markup, new RegExp(`aria-label="打开${label}：${summary.title}"`));
    assert.match(markup, new RegExp(`data-linked-object-icon="${icon}"`));
    assert.match(markup, new RegExp(`>${label}<`));
    assert.match(markup, new RegExp(`title="${summary.title}"`));
    assert.match(markup, new RegExp(`>${summary.title}<`));
    assert.doesNotMatch(markup, new RegExp(String(summary.id)));
  }
});

test("LinkedObjectLink exposes normalized date metadata only for dated summaries", async () => {
  const { LinkedObjectLink } = await loadComponents();
  const planMarkup = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      onSelect: () => undefined,
      summary: summaries.plan,
    }),
  );
  const scheduleMarkup = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      onSelect: () => undefined,
      summary: summaries.schedule,
    }),
  );
  const timelineMarkup = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      onSelect: () => undefined,
      summary: summaries.timeline,
    }),
  );

  assert.doesNotMatch(planMarkup, /linked-object-link__meta/);
  assert.match(scheduleMarkup, />2026-07-28</);
  assert.match(timelineMarkup, />2026-07-29</);
});

test("LinkedObjectLink enables a valid callback once with the same typed summary", async () => {
  const { LinkedObjectLink } = await loadComponents();
  const selected: LinkedObjectSummary[] = [];
  const element = LinkedObjectLink({
    onSelect: (summary) => selected.push(summary),
    summary: summaries.plan,
  }) as ReactElement<{
    disabled?: boolean;
    onClick?: () => void;
  }>;

  assert.equal(element.props.disabled, false);
  assert.equal(typeof element.props.onClick, "function");
  element.props.onClick?.();
  assert.deepEqual(selected, [summaries.plan]);
  assert.equal(selected[0], summaries.plan);
});

test("LinkedObjectLink is stable and disabled without navigation or when unavailable", async () => {
  const { LinkedObjectLink } = await loadComponents();
  const noCallback = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      summary: summaries.checklist,
    }),
  );
  const unavailable = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      onSelect: () => {
        throw new Error("disabled callback must not run");
      },
      summary: summaries.checklist,
      unavailable: true,
    }),
  );

  assert.match(noCallback, /disabled=""/);
  assert.match(noCallback, /aria-disabled="true"/);
  assert.match(noCallback, /aria-label="清单不可用：发布检查清单"/);
  assert.match(unavailable, /disabled=""/);
  assert.match(unavailable, /aria-label="清单不可用：发布检查清单"/);
});

test("LinkedObjectList owns empty, collapsed and expanded render states through link semantics", async () => {
  const { LinkedObjectLink, LinkedObjectList } = await loadComponents();
  const items = Object.values(summaries);

  const emptyMarkup = renderToStaticMarkup(
    createElement(LinkedObjectList, {
      items: [],
      onSelect: () => undefined,
    }),
  );
  const collapsedMarkup = renderToStaticMarkup(
    createElement(LinkedObjectList, {
      items,
      onSelect: () => undefined,
    }),
  );
  const expandedMarkup = renderToStaticMarkup(
    createElement(LinkedObjectList, {
      expanded: true,
      items,
      onSelect: () => undefined,
    }),
  );
  const defaultExpandedMarkup = renderToStaticMarkup(
    createElement(LinkedObjectList, {
      defaultExpanded: true,
      items,
      onSelect: () => undefined,
    }),
  );
  const directLinkMarkup = renderToStaticMarkup(
    createElement(LinkedObjectLink, {
      onSelect: () => undefined,
      summary: summaries.plan,
    }),
  );

  assert.match(emptyMarkup, /暂无关联对象/);
  assert.match(collapsedMarkup, /发布准备/);
  assert.match(collapsedMarkup, /发布检查清单/);
  assert.match(collapsedMarkup, /发布窗口/);
  assert.doesNotMatch(collapsedMarkup, /发布里程碑/);
  assert.match(collapsedMarkup, /展开其余 1 项/);

  assert.match(expandedMarkup, /发布里程碑/);
  assert.match(expandedMarkup, /收起关联对象/);
  assert.match(defaultExpandedMarkup, /发布里程碑/);
  assert.match(defaultExpandedMarkup, /收起关联对象/);

  assert.match(directLinkMarkup, /sunny-linked-object-link/);
  assert.equal(
    (collapsedMarkup.match(/aria-label="打开/g) ?? []).length,
    3,
  );
  assert.equal(
    (expandedMarkup.match(/aria-label="打开/g) ?? []).length,
    4,
  );
});

test("LinkedObjectBadge renders compact type, source and count modes", async () => {
  const { LinkedObjectBadge } = await loadComponents();

  const typeMarkup = renderToStaticMarkup(
    createElement(LinkedObjectBadge, {
      summary: summaries.plan,
    }),
  );
  const sourceMarkup = renderToStaticMarkup(
    createElement(LinkedObjectBadge, {
      mode: "source",
      summary: summaries.checklist,
    }),
  );
  const countMarkup = renderToStaticMarkup(
    createElement(LinkedObjectBadge, {
      count: 4,
      mode: "count",
    }),
  );

  assert.match(typeMarkup, /app-badge/);
  assert.match(typeMarkup, />计划</);
  assert.doesNotMatch(typeMarkup, /<button/);
  assert.match(sourceMarkup, />来自清单</);
  assert.match(countMarkup, />4 项关联</);
  assert.doesNotMatch(countMarkup, /<button/);
});

test("LinkedObjectBadge becomes interactive only with a valid summary and callback", async () => {
  const { LinkedObjectBadge } = await loadComponents();
  const selected: LinkedObjectSummary[] = [];
  const element = LinkedObjectBadge({
    onSelect: (summary) => selected.push(summary),
    summary: summaries.timeline,
  }) as ReactElement<{
    onClick?: () => void;
  }>;
  const unavailable = renderToStaticMarkup(
    createElement(LinkedObjectBadge, {
      onSelect: () => undefined,
      summary: summaries.timeline,
      unavailable: true,
    }),
  );

  assert.equal(typeof element.props.onClick, "function");
  element.props.onClick?.();
  assert.deepEqual(selected, [summaries.timeline]);
  assert.match(unavailable, /app-badge/);
  assert.doesNotMatch(unavailable, /<button/);
});

test("Dashboard relationship styles are bundled and preserve visual accessibility contracts", () => {
  const bundle = readFileSync("src/app/styles/sunny-dashboard.css", "utf8");
  const css = readFileSync(
    "src/app/styles/sunny-dashboard-linked-objects.css",
    "utf8",
  );

  assert.match(bundle, /@import "\.\/sunny-dashboard-linked-objects\.css";/);
  assert.match(css, /\.sunny-linked-object-link:focus-visible/);
  assert.match(css, /\.sunny-linked-object-link:disabled/);
  assert.match(css, /var\(--(?:text|bg|border|accent|surface|motion)-/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /text-overflow:\s*ellipsis/);
});
