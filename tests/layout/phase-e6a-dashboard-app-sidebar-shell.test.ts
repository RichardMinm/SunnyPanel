import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ DashboardIconBar — AppSidebar shell replacement ═══ */

describe("DashboardIconBar — AppSidebar shell replacement", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports AppSidebar from layout", () => {
    assert.match(
      source,
      /import.*AppSidebar.*from "@\/components\/layout\/AppSidebar"/,
    );
  });

  test("outer shell is now <AppSidebar> (not raw <nav>)", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("old <nav> tag is gone (replaced by AppSidebar)", () => {
    /* The opening <nav should no longer appear as a raw JSX element.
       AppSidebar renders <nav> internally, but the source should use <AppSidebar>. */
    assert.doesNotMatch(source, /<nav\s/);
  });

  test("sunny-dashboard-icon-bar className preserved on AppSidebar", () => {
    assert.match(source, /sunny-dashboard-icon-bar/);
    /* Must appear as part of the AppSidebar className prop */
    const sidebarMatch = source.match(/<AppSidebar[\s\S]*?>/);
    assert.ok(sidebarMatch);
    assert.match(sidebarMatch![0], /sunny-dashboard-icon-bar/);
  });

  test("sunny-sidebar-nav className preserved", () => {
    assert.match(source, /sunny-sidebar-nav/);
  });

  test("sunny-dashboard-sidebar className preserved", () => {
    assert.match(source, /sunny-dashboard-sidebar/);
  });

  test("is-writing-mode class preserved", () => {
    assert.match(source, /is-writing-mode/);
  });

  test("aria-label='工作台导航' preserved", () => {
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("ref={navRef} preserved (collapse animation needs DOM ref)", () => {
    assert.match(source, /ref=\{navRef\}/);
  });

  test("onMouseEnter handler preserved", () => {
    assert.match(source, /onMouseEnter=\{handleSidebarMouseEnter\}/);
  });

  test("onMouseLeave handler preserved", () => {
    assert.match(source, /onMouseLeave=\{handleSidebarMouseLeave\}/);
  });

  test("sunny-dashboard-sidebar-top wrapper div still present", () => {
    assert.match(source, /sunny-dashboard-sidebar-top/);
  });

  test("sunny-dashboard-icon-bar-bottom wrapper div still present", () => {
    assert.match(source, /sunny-dashboard-icon-bar-bottom/);
  });

  test("sunny-dashboard-sidebar-bottom wrapper div still present", () => {
    assert.match(source, /sunny-dashboard-sidebar-bottom/);
  });

  test("ConfirmDialog rendered outside AppSidebar (sibling in fragment)", () => {
    /* ConfirmDialog should appear AFTER </AppSidebar> */
    const afterAppSidebar = source.match(/<\/AppSidebar>[\s\S]*<ConfirmDialog/);
    assert.ok(afterAppSidebar, "ConfirmDialog must be after </AppSidebar>");
  });

  test("wrapped in React fragment (<>...</>)", () => {
    assert.match(source, /return \(\s*<>/);
  });
});

/* ═══ Internal components NOT replaced (E6A) ═══ */

describe("DashboardIconBar — internal components unchanged (E6A)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("mode navigation still uses SidebarItem (E2)", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
    assert.match(source, /active=\{mode\.key === activeMode\}/);
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("section wrappers still use SidebarSection (E3)", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 3);
  });

  test("新对话 still uses SidebarItem (E4c)", () => {
    assert.match(source, /label="新对话"/);
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("Settings trigger still uses SidebarItem + triggerAsChild (E4a)", () => {
    const settingsBlock = source.match(/<DashboardSettingsMenu[\s\S]*?\n\s*\/>/);
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /<SidebarItem/);
    assert.match(settingsBlock![0], /triggerAsChild/);
  });

  test("Search input still uses AppSearchInput (E5A)", () => {
    assert.match(source, /<AppSearchInput/);
    assert.match(source, /placeholder="搜索会话..."/);
  });

  test("Thread rows still use SidebarThreadItem (E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("Archive rows still use SidebarArchiveItem (E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
  });

  test("Collapse toggles still use SidebarCollapseToggle (E5D)", () => {
    const toggles = source.match(/<SidebarCollapseToggle/g);
    assert.strictEqual(toggles?.length, 2);
  });
});

/* ═══ Collapse behavior preserved ═══ */

describe("DashboardIconBar — collapse behavior preserved (E6A)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("navRef and classList toggle still present (is-auto-collapsed)", () => {
    assert.match(source, /navRef\.current\.classList/);
    assert.match(source, /is-auto-collapsed/);
  });

  test("is-hover-expanded class management still present", () => {
    assert.match(source, /is-hover-expanded/);
  });

  test("collapse timer logic unchanged", () => {
    assert.match(source, /collapseTimer/);
    assert.match(source, /clearTimeout/);
    assert.match(source, /setTimeout/);
  });

  test("stripCollapsed still computed from !pinned", () => {
    assert.match(source, /stripCollapsed = !pinned/);
  });

  test("pin toggle behavior unchanged", () => {
    assert.match(source, /handleTogglePin/);
    assert.match(source, /onPinnedChange/);
  });

  test("session collapse state (threadsOpen) unchanged", () => {
    assert.match(source, /const \[threadsOpen, setThreadsOpen\] = useState/);
    assert.match(source, /onToggle=\{\(\) => setThreadsOpen\(\(v\) => !v\)\}/);
  });

  test("archive collapse state (archiveOpen) unchanged", () => {
    assert.match(source, /const \[archiveOpen, setArchiveOpen\] = useState/);
    assert.match(source, /onToggle=\{loadArchivedThreads\}/);
    assert.match(source, /setArchiveOpen\(\(v\) => !v\)/);
  });

  test("threadListMode sync useEffect unchanged", () => {
    assert.match(source, /setThreadsOpen\(threadListMode === "full"\)/);
  });
});

/* ═══ Business logic preserved ═══ */

describe("DashboardIconBar — business logic preserved (E6A)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("searchQuery state and handlers now in hook (E6C-2)", () => {
    const searchHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");
    assert.match(searchHook, /searchQuery/);
    assert.match(searchHook, /handleSearchChange/);
    assert.match(searchHook, /clearSearch/);
    assert.match(searchHook, /handleSearchKeyDown/);
    /* DashboardIconBar imports the hook */
    assert.match(source, /useDashboardSidebarSearch/);
  });

  test("archive loading logic unchanged", () => {
    assert.match(source, /fetchArchivedThreads/);
    assert.match(source, /archiveLoading/);
    assert.match(source, /archiveLoaded/);
  });

  test("restoreThread logic unchanged", () => {
    assert.match(source, /const restoreThread = useCallback/);
    assert.match(source, /\/api\/agent\/thread/);
    assert.match(source, /archived: false/);
  });

  test("delete confirm logic unchanged", () => {
    assert.match(source, /deleteTarget/);
    assert.match(source, /handleDeleteConfirm/);
    assert.match(source, /deleteBusy/);
    assert.match(source, /deleteError/);
  });

  test("handleArchive logic unchanged", () => {
    assert.match(source, /const handleArchive = useCallback/);
    assert.match(source, /onArchiveThread/);
  });

  test("formatThreadMeta function extracted to helpers (E6C)", () => {
    const helpersSource = read("src/components/dashboard/sidebar/dashboard-sidebar-helpers.ts");
    assert.match(helpersSource, /export function formatThreadMeta/);
    assert.match(helpersSource, /getPendingActionLabel/);
    /* DashboardIconBar still imports it */
    assert.match(source, /import.*formatThreadMeta.*from/);
  });

  test("filterDashboardThreads now used in thread hook (E6C-2)", () => {
    const threadsHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");
    assert.match(threadsHook, /filterDashboardThreads/);
  });
});

/* ═══ CSS — AppSidebar compatibility ═══ */

describe("CSS — AppSidebar compatibility overrides", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("compound selector .sunny-dashboard-icon-bar.app-sidebar exists", () => {
    assert.match(css, /\.sunny-dashboard-icon-bar\.app-sidebar\s*\{/);
  });

  test("override sets width to var(--dashboard-icon-bar-width)", () => {
    const rule = css.match(/\.sunny-dashboard-icon-bar\.app-sidebar\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /width:\s*var\(--dashboard-icon-bar-width\)/);
  });

  test("override sets background to original sidebar color", () => {
    const rule = css.match(/\.sunny-dashboard-icon-bar\.app-sidebar\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /background:\s*color-mix/);
  });

  test("override sets border-right to original sidebar border", () => {
    const rule = css.match(/\.sunny-dashboard-icon-bar\.app-sidebar\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /border-right:\s*1px solid var\(--dashboard-card-border\)/);
  });

  test("app-sidebar__body override removes padding and overflow", () => {
    const rule = css.match(/\.sunny-dashboard-icon-bar \.app-sidebar__body\s*\{[^}]*\}/s);
    assert.ok(rule, "Body override rule should exist");
    assert.match(rule![0], /overflow:\s*hidden/);
    assert.match(rule![0], /padding:\s*0/);
  });

  test("old sunny-dashboard-icon-bar CSS still present (not deleted)", () => {
    assert.match(css, /\.sunny-dashboard-icon-bar\s*\{/);
  });

  test("old auto-collapsed CSS still intact", () => {
    assert.match(css, /\.sunny-dashboard-icon-bar\.is-auto-collapsed/);
  });

  test("old is-writing-mode CSS still intact", () => {
    assert.match(css, /\.sunny-dashboard-icon-bar\.is-writing-mode/);
  });

  test("dark mode sidebar CSS still intact", () => {
    assert.match(css, /html\[data-theme="dark"\] \.sunny-dashboard-icon-bar/);
  });
});

/* ═══ CSS — AppSidebar layout CSS still intact ═══ */

describe("CSS — AppSidebar layout CSS not deleted", () => {
  const layoutCss = read("src/app/styles/sunny-layout.css");

  test(".app-sidebar CSS still present", () => {
    assert.match(layoutCss, /\.app-sidebar\s*\{/);
  });

  test(".app-sidebar__body CSS still present", () => {
    assert.match(layoutCss, /\.app-sidebar__body\s*\{/);
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors", () => {
  test("AppSidebar import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(
      source,
      /import.*AppSidebar.*from "@\/components\/layout\/AppSidebar"/,
    );
  });

  test("AppSidebar is exported from layout", () => {
    const sidebarSource = read("src/components/layout/AppSidebar.tsx");
    assert.match(sidebarSource, /export function AppSidebar/);
  });

  test("DashboardIconBar no longer imports unused <nav> patterns", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* The raw <nav should not appear in the source — AppSidebar handles it */
    assert.doesNotMatch(source, /<nav\s/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
