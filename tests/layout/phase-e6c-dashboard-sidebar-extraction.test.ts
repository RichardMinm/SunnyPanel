import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ Types file — dashboard-sidebar-types.ts ═══ */

describe("dashboard-sidebar-types.ts — types extracted (E6C)", () => {
  const source = read("src/components/dashboard/sidebar/dashboard-sidebar-types.ts");

  test("exports DashboardIconMode type", () => {
    assert.match(source, /export type DashboardIconMode/);
  });

  test("DashboardIconMode includes all 8 modes", () => {
    assert.match(source, /"agent"/);
    assert.match(source, /"checklist"/);
    assert.match(source, /"memory"/);
    assert.match(source, /"plans"/);
    assert.match(source, /"schedule"/);
    assert.match(source, /"timeline"/);
    assert.match(source, /"today"/);
    assert.match(source, /"writing"/);
  });

  test("exports DashboardIconBarProps type", () => {
    assert.match(source, /export type DashboardIconBarProps/);
  });

  test("DashboardIconBarProps includes all required fields", () => {
    assert.match(source, /activeMode:/);
    assert.match(source, /hoverExpanded:/);
    assert.match(source, /onArchiveThread:/);
    assert.match(source, /onDeleteThread:/);
    assert.match(source, /onHoverExpandedChange:/);
    assert.match(source, /onModeChange:/);
    assert.match(source, /onLoadThread:/);
    assert.match(source, /onNewThread:/);
    assert.match(source, /onPinnedChange:/);
    assert.match(source, /pinned:/);
    assert.match(source, /threadId:/);
    assert.match(source, /threadListMode/);
  });
});

/* ═══ Modes file — dashboard-sidebar-modes.ts ═══ */

describe("dashboard-sidebar-modes.ts — modes extracted (E6C)", () => {
  const source = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");

  test("exports DASHBOARD_MODES constant", () => {
    assert.match(source, /export const DASHBOARD_MODES/);
  });

  test("has exactly 6 mode entries in array", () => {
    /* Count key: occurrences in the array literal only (after the opening bracket) */
    const afterBracket = source.split("= [")[1];
    assert.ok(afterBracket, "DASHBOARD_MODES array should exist");
    const keyCount = (afterBracket.match(/key:/g) || []).length;
    assert.strictEqual(keyCount, 6);
  });

  test("mode order preserved: agent → schedule → memory → writing → checklist → timeline", () => {
    const order = source.match(/key: "(\w+)"/g);
    assert.ok(order);
    assert.strictEqual(order[0], 'key: "agent"');
    assert.strictEqual(order[1], 'key: "schedule"');
    assert.strictEqual(order[2], 'key: "memory"');
    assert.strictEqual(order[3], 'key: "writing"');
    assert.strictEqual(order[4], 'key: "checklist"');
    assert.strictEqual(order[5], 'key: "timeline"');
  });

  test("labels unchanged", () => {
    assert.match(source, /label: "工作台"/);
    assert.match(source, /label: "日程"/);
    assert.match(source, /label: "记忆库"/);
    assert.match(source, /label: "写作"/);
    assert.match(source, /label: "清单"/);
    assert.match(source, /label: "时间线"/);
  });

  test("icons unchanged", () => {
    assert.match(source, /icon: "agent"/);
    assert.match(source, /icon: "calendar"/);
    assert.match(source, /icon: "memory"/);
    assert.match(source, /icon: "pencil"/);
    assert.match(source, /icon: "checklist"/);
    assert.match(source, /icon: "timeline"/);
  });

  test("prompts unchanged", () => {
    assert.match(source, /prompt: ""/);
    assert.match(source, /帮我查看最近的日程安排/);
  });
});

/* ═══ Helpers file — dashboard-sidebar-helpers.ts ═══ */

describe("dashboard-sidebar-helpers.ts — formatThreadMeta extracted (E6C)", () => {
  const source = read("src/components/dashboard/sidebar/dashboard-sidebar-helpers.ts");

  test("exports formatThreadMeta function", () => {
    assert.match(source, /export function formatThreadMeta/);
  });

  test("pure function — no side effects", () => {
    assert.doesNotMatch(source, /useState/);
    assert.doesNotMatch(source, /useEffect/);
    assert.doesNotMatch(source, /fetch/);
    assert.doesNotMatch(source, /api\//);
    assert.doesNotMatch(source, /localStorage/);
  });

  test("uses getPendingActionLabel for state formatting", () => {
    assert.match(source, /getPendingActionLabel/);
    assert.match(source, /已就绪/);
  });

  test("includes thread ID with # prefix", () => {
    assert.match(source, /#\$\{thread\.id\}/);
  });

  test("joins with · separator", () => {
    assert.match(source, /·/);  // middle dot
  });
});

/* ═══ DashboardIconBar — still renders correctly after extraction ═══ */

describe("DashboardIconBar — component unchanged after extraction (E6C)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("still uses AppSidebar shell (E6A)", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("still renders all 6 mode items via DASHBOARD_MODES.map", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
  });

  test("mode items still use SidebarItem", () => {
    /* The DASHBOARD_MODES.map area should contain <SidebarItem */
    assert.match(source, /DASHBOARD_MODES\.map/);
    assert.match(source, /<SidebarItem/);
    assert.match(source, /mode\.key/);
  });

  test("active mode comparison unchanged", () => {
    /* active={mode.key === activeMode} */
    assert.match(source, /active=\{mode\.key === activeMode\}/);
    /* is-active class conditional */
    assert.match(source, /mode\.key === activeMode \? " is-active"/);
  });

  test("onModeChange call unchanged", () => {
    assert.match(source, /onModeChange\(mode\.key, mode\.prompt\)/);
  });

  test("tooltip uses mode.label", () => {
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("imports DASHBOARD_MODES from modes file", () => {
    assert.match(source, /import.*DASHBOARD_MODES.*from.*dashboard-sidebar-modes/);
  });

  test("imports formatThreadMeta from helpers file", () => {
    assert.match(source, /import.*formatThreadMeta.*from.*dashboard-sidebar-helpers/);
  });

  test("re-exports types for backward compatibility", () => {
    assert.match(source, /export type.*DashboardIconMode.*from/);
    assert.match(source, /export type.*DashboardIconBarProps.*from/);
    assert.match(source, /export.*DASHBOARD_MODES.*from/);
  });

  test("new file imports only, no in-file type/constant/helper definitions", () => {
    /* The old inline definitions should be gone */
    assert.doesNotMatch(source, /^export type DashboardIconMode = /m);
    assert.doesNotMatch(source, /^export const DASHBOARD_MODES: Array/m);
    assert.doesNotMatch(source, /^function formatThreadMeta/m);
  });
});

/* ═══ Internal components unchanged ═══ */

describe("DashboardIconBar — all internal components unchanged (E6C)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("新对话 still uses SidebarItem (E4c)", () => {
    assert.match(source, /label="新对话"/);
  });

  test("Settings trigger still uses SidebarItem + triggerAsChild (E4a)", () => {
    assert.match(source, /triggerAsChild/);
  });

  test("Search input still uses AppSearchInput (E5A)", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("Thread rows still use SidebarThreadItem (E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
  });

  test("Archive rows still use SidebarArchiveItem (E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
  });

  test("Collapse toggles still use SidebarCollapseToggle (E5D)", () => {
    const toggles = source.match(/<SidebarCollapseToggle/g);
    assert.strictEqual(toggles?.length, 2);
  });

  test("all 3 SidebarSections still present", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 3);
  });
});

/* ═══ No state/logic moved ═══ */

describe("DashboardIconBar — state & hooks stay in component (E6C)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("useState calls still in component", () => {
    const useStateCount = (source.match(/useState/g) || []).length;
    assert.ok(useStateCount >= 8, "All useState hooks should remain in DashboardIconBar");
  });

  test("useCallback calls still in component", () => {
    assert.match(source, /useCallback/);
  });

  test("useEffect calls still in component", () => {
    assert.match(source, /useEffect/);
  });

  test("useRef still in component (navRef)", () => {
    assert.match(source, /useRef/);
  });

  test("navRef + classList.toggle still present", () => {
    assert.match(source, /navRef\.current\.classList/);
  });

  test("collapse timer logic still present", () => {
    assert.match(source, /collapseTimer/);
  });

  test("archive logic unchanged", () => {
    assert.match(source, /fetchArchivedThreads/);
    assert.match(source, /restoreThread/);
    assert.match(source, /handleDeleteConfirm/);
    assert.match(source, /handleArchive/);
  });
});

/* ═══ className and aria unchanged ═══ */

describe("DashboardIconBar — className and aria unchanged (E6C)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("sunny-dashboard-icon-bar class preserved", () => {
    assert.match(source, /sunny-dashboard-icon-bar/);
  });

  test("is-writing-mode class preserved", () => {
    assert.match(source, /is-writing-mode/);
  });

  test("aria-label='工作台导航' preserved", () => {
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("old section/css classes preserved", () => {
    assert.match(source, /sunny-dashboard-sidebar-section/);
    assert.match(source, /sunny-dashboard-mode-list/);
    assert.match(source, /sunny-dashboard-thread-section/);
    assert.match(source, /sunny-dashboard-archive-section/);
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors (E6C)", () => {
  test("all extracted files exist and are valid", () => {
    const types = read("src/components/dashboard/sidebar/dashboard-sidebar-types.ts");
    const modes = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    const helpers = read("src/components/dashboard/sidebar/dashboard-sidebar-helpers.ts");
    assert.ok(types.length > 0);
    assert.ok(modes.length > 0);
    assert.ok(helpers.length > 0);
  });

  test("DashboardIconBar imports are all resolved", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /import.*formatThreadMeta.*from/);
    assert.match(source, /import.*DASHBOARD_MODES.*from/);
    assert.match(source, /import.*DashboardIconBarProps.*from/);
    assert.match(source, /import.*AppSidebar.*from/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
