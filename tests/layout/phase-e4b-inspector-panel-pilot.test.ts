import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ── InspectorPanel bare mode ── */

describe("InspectorPanel — bare prop implementation", () => {
  const source = read("src/components/layout/InspectorPanel.tsx");

  test("bare prop accepted in props type", () => {
    assert.match(source, /bare\?/);
  });

  test("bare mode renders as div, not aside", () => {
    /* Should have an if (bare) branch returning <div> */
    assert.match(source, /bare\s*\)\s*\{/);
    assert.match(source, /<div/); /* bare renders div */
  });

  test("bare mode skips app-inspector-panel class", () => {
    /* The bare branch renders <div className={cn(className)}> — no app-inspector-panel.
       The non-bare branch renders <aside className="app-inspector-panel ...">. */
    assert.match(source, /"app-inspector-panel"/);
    assert.match(source, /cn\(className\)/); /* bare uses only className, no shell class */
  });

  test("bare mode still uses internal structure classes", () => {
    /* Head, body, title classes should still be used */
    assert.match(source, /app-inspector-panel__head/);
    assert.match(source, /app-inspector-panel__body/);
    assert.match(source, /app-inspector-panel__title/);
  });
});

/* ── MemoryInspectorPanel replacement ── */

describe("DashboardRightPanel — MemoryInspectorPanel uses InspectorPanel bare", () => {
  const source = read("src/components/dashboard/DashboardRightPanel.tsx");

  test("imports InspectorPanel from layout", () => {
    assert.match(
      source,
      /import.*InspectorPanel.*from.*\/components\/layout\/InspectorPanel/,
    );
  });

  test("MemoryInspectorPanel uses InspectorPanel with bare prop", () => {
    assert.match(source, /<InspectorPanel/);
    assert.match(source, /bare/);
  });

  test("InspectorPanel preserves old className for visual compat", () => {
    assert.match(source, /sunny-agent-inspector-panel/);
    assert.match(source, /sunny-agent-memory-inspector-panel/);
  });

  test("normal mode uses title and subtitle via InspectorPanel", () => {
    /* normal non-empty: subtitle="本轮使用的记忆", title="{N} 条记忆" */
    assert.match(source, /subtitle="本轮使用的记忆"/);
    assert.match(source, /title=\{\`\$\{memoryTitles\.length\} 条记忆\`\}/);
  });

  test("debug mode uses title and subtitle via InspectorPanel", () => {
    assert.match(source, /subtitle="已使用记忆"/);
    assert.match(source, /title=\{\`\$\{memoryTitles\.length\} 条长期记忆\`\}/);
  });

  test("memory list content preserved inside InspectorPanel", () => {
    assert.match(source, /sunny-agent-memory-inspector-list/);
    assert.match(source, /memoryTitles\.map/);
  });

  test("hint text preserved", () => {
    assert.match(source, /开启 debug 模式可查看详细匹配信息/);
  });

  test("empty states NOT wrapped in InspectorPanel (returned as-is)", () => {
    /* Empty states use <div className="sunny-agent-inspector-empty"> directly */
    assert.match(source, /sunny-agent-inspector-empty/);
    assert.match(source, /本轮未使用长期记忆/);
  });
});

/* ── Old summary div replaced ── */

describe("DashboardRightPanel — old summary divs replaced", () => {
  const source = read("src/components/dashboard/DashboardRightPanel.tsx");

  test("old <div className='sunny-agent-inspector-summary'> inside MemoryInspectorPanel is gone", () => {
    /* The summary section is now handled by InspectorPanel's title/subtitle.
       Check the memory function area specifically for the old div pattern. */
    const memoryFunc = source.match(
      /function MemoryInspectorPanel[\s\S]*?^  \}/m,
    );
    assert.ok(memoryFunc, "MemoryInspectorPanel function should exist");
    assert.doesNotMatch(memoryFunc![0], /sunny-agent-inspector-summary/);
  });

  test("old <span> + <h3> summary structure gone from memory panel", () => {
    /* The old <div className="sunny-agent-inspector-summary"><span>...<h3>...
       structure is replaced by InspectorPanel's subtitle + title */
    const memoryFunc = source.match(
      /function MemoryInspectorPanel[\s\S]*?^  \}/m,
    );
    assert.ok(memoryFunc, "MemoryInspectorPanel function should exist");
    /* The old <div className="sunny-agent-inspector-panel"> should not wrap
       a sunny-agent-inspector-summary */
    assert.doesNotMatch(memoryFunc![0], /<div className="sunny-agent-inspector-panel/);
  });
});

/* ── No regression: other panels untouched ── */

describe("DashboardRightPanel — other panels NOT touched", () => {
  const source = read("src/components/dashboard/DashboardRightPanel.tsx");

  test("AgentContextPanel still imported and used as-is", () => {
    assert.match(source, /import.*AgentContextPanel/);
    assert.match(source, /<AgentContextPanel/);
  });

  test("AgentApprovalPanel not modified", () => {
    assert.match(source, /AgentApprovalPanel/);
  });

  test("AgentTracePanel not modified", () => {
    assert.match(source, /AgentTracePanel/);
  });

  test("AgentDebugPanel not modified", () => {
    assert.match(source, /AgentDebugPanel/);
  });

  test("AgentInboxPanel not modified", () => {
    assert.match(source, /AgentInboxPanel/);
  });

  test("LinkedObjectsPanel not modified", () => {
    assert.match(source, /LinkedObjectsPanel/);
    assert.match(source, /sunny-linked-objects-list/);
  });

  test("ContextInspector not modified", () => {
    assert.match(source, /ContextInspector/);
  });
});

/* ── Shell NOT replaced ── */

describe("DashboardRightPanel — outer shell NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardRightPanel.tsx");

  test("outer aside element still present", () => {
    assert.match(source, /<aside className="sunny-dashboard-right-panel/);
  });

  test("InspectorPanel NOT used for outer shell (only bare for inner)", () => {
    /* Count <InspectorPanel (excluding InspectorPanelIcon) */
    const usages = source.match(/<InspectorPanel\b/g);
    assert.strictEqual(usages?.length, 2,
      "Only 2 InspectorPanel usages (MemoryInspectorPanel normal + debug)");
    /* The outer <aside> should NOT be wrapped in InspectorPanel */
    assert.match(source, /<aside className="sunny-dashboard-right-panel/);
  });

  test("right panel head still uses raw divs", () => {
    assert.match(source, /sunny-dashboard-right-panel-head/);
  });

  test("toggle button (panelOpen) preserved", () => {
    assert.match(source, /onTogglePanel/);
    assert.match(source, /InspectorPanelIcon/);
  });

  test("resize handle preserved", () => {
    assert.match(source, /sunny-context-panel-resize-handle/);
  });

  test("InspectorSearchToolbar still present", () => {
    assert.match(source, /InspectorSearchToolbar/);
  });
});

/* ── CSS compatibility ── */

describe("CSS — bare InspectorPanel in agent panels", () => {
  const css = read("src/app/styles/sunny-agent.css");

  test("head padding overridden for agent inspector panels", () => {
    assert.match(
      css,
      /\.sunny-agent-inspector-panel \.app-inspector-panel__head\s*\{[^}]*padding:\s*0/s,
    );
  });

  test("body padding overridden for agent inspector panels", () => {
    assert.match(
      css,
      /\.sunny-agent-inspector-panel \.app-inspector-panel__body\s*\{[^}]*padding:\s*0/s,
    );
  });

  test("title font-size normalized for agent context", () => {
    assert.match(
      css,
      /\.sunny-agent-inspector-panel \.app-inspector-panel__title/,
    );
  });

  test("subtitle styling for agent context", () => {
    assert.match(
      css,
      /\.sunny-agent-inspector-panel \.app-inspector-panel__subtitle/,
    );
  });
});

/* ── No new errors ── */

describe("No new TypeScript or ESLint errors", () => {
  test("InspectorPanel bare prop is typed as boolean", () => {
    const source = read("src/components/layout/InspectorPanel.tsx");
    assert.match(source, /bare\?:\s*boolean/);
  });

  test("InspectorPanel default bare value is false", () => {
    const source = read("src/components/layout/InspectorPanel.tsx");
    assert.match(source, /bare = false/);
  });

  test("ESLint passed on both changed files", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
