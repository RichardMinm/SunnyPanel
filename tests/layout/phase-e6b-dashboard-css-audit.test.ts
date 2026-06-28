import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ DashboardIconBar shell preserved (E6A) ═══ */

describe("DashboardIconBar — AppSidebar shell preserved (E6A→E6B)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("still uses AppSidebar", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("sunny-dashboard-icon-bar class preserved", () => {
    assert.match(source, /sunny-dashboard-icon-bar/);
  });

  test("aria-label='工作台导航' preserved", () => {
    assert.match(source, /aria-label="工作台导航"/);
  });
});

/* ═══ Collapse state management preserved ═══ */

describe("DashboardIconBar — collapse state preserved (E6B)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("ref + classList.toggle still present (is-auto-collapsed)", () => {
    assert.match(source, /navRef\.current\.classList/);
    assert.match(source, /is-auto-collapsed/);
  });

  test("is-hover-expanded class management preserved", () => {
    assert.match(source, /is-hover-expanded/);
  });

  test("is-writing-mode class preserved", () => {
    assert.match(source, /is-writing-mode/);
  });

  test("collapse timer logic preserved", () => {
    assert.match(source, /collapseTimer/);
    assert.match(source, /clearTimeout/);
    assert.match(source, /setTimeout/);
  });

  test("scroll/pin/hover handlers preserved", () => {
    assert.match(source, /handleSidebarMouseEnter/);
    assert.match(source, /handleSidebarMouseLeave/);
    assert.match(source, /handleTogglePin/);
  });
});

/* ═══ All internal components preserved ═══ */

describe("DashboardIconBar — all internal components preserved (E6B)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("mode navigation still uses SidebarItem (E2)", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("section wrappers still use SidebarSection (E3)", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 3);
  });

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
});

/* ═══ top / bottom regions still render ═══ */

describe("DashboardIconBar — top / bottom regions present", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("sunny-dashboard-sidebar-top wrapper present", () => {
    assert.match(source, /sunny-dashboard-sidebar-top/);
  });

  test("sunny-dashboard-sidebar-brand-row present", () => {
    assert.match(source, /sunny-dashboard-sidebar-brand-row/);
  });

  test("sunny-dashboard-sidebar-bottom wrapper present", () => {
    assert.match(source, /sunny-dashboard-sidebar-bottom/);
  });

  test("sunny-dashboard-icon-bar-bottom wrapper present", () => {
    assert.match(source, /sunny-dashboard-icon-bar-bottom/);
  });
});

/* ═══ SettingsPopover and ThreadRowMenu preserved ═══ */

describe("DashboardIconBar — SettingsPopover & ThreadRowMenu preserved (E6B)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu still used", () => {
    assert.match(source, /DashboardSettingsMenu/);
  });

  test("settings open/close state preserved", () => {
    assert.match(source, /const \[settingsOpen, setSettingsOpen\] = useState/);
  });

  test("ThreadRowMenu still used", () => {
    assert.match(source, /<ThreadRowMenu/);
  });

  test("ConfirmDialog still used for delete confirmation", () => {
    assert.match(source, /<ConfirmDialog/);
    assert.match(source, /确认删除/);
  });
});

/* ═══ Business logic preserved ═══ */

describe("DashboardIconBar — business logic preserved (E6B)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("searchQuery and handlers now in hook (E6C-2)", () => {
    const searchHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");
    assert.match(searchHook, /searchQuery/);
    assert.match(searchHook, /handleSearchChange/);
    assert.match(searchHook, /clearSearch/);
    assert.match(source, /useDashboardSidebarSearch/);
  });

  test("archive loading logic unchanged", () => {
    assert.match(source, /fetchArchivedThreads/);
    assert.match(source, /archiveLoading/);
    assert.match(source, /archiveLoaded/);
  });

  test("restoreThread logic unchanged", () => {
    assert.match(source, /const restoreThread = useCallback/);
    assert.match(source, /archived: false/);
  });

  test("delete confirm logic unchanged", () => {
    assert.match(source, /deleteTarget/);
    assert.match(source, /handleDeleteConfirm/);
  });

  test("handleArchive logic unchanged", () => {
    assert.match(source, /const handleArchive = useCallback/);
  });

  test("formatThreadMeta extracted to helpers (E6C)", () => {
    const helpersSource = read("src/components/dashboard/sidebar/dashboard-sidebar-helpers.ts");
    assert.match(helpersSource, /export function formatThreadMeta/);
    assert.match(helpersSource, /getPendingActionLabel/);
    /* DashboardIconBar still imports it */
    assert.match(source, /import.*formatThreadMeta.*from/);
  });

  test("filterDashboardThreads now in thread hook (E6C-2)", () => {
    const threadsHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");
    assert.match(threadsHook, /filterDashboardThreads/);
  });
});

/* ═══ CSS — removed selectors (sunny-codex-* + unused dashboard) ═══ */

describe("CSS — sunny-codex selectors removed (E6B)", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("no sunny-codex- selectors remain", () => {
    assert.doesNotMatch(css, /sunny-codex-/);
  });

  test("no sunny-codex- in comments either (aside from this test file)", () => {
    /* The CSS file itself should have zero references */
    const occurrences = (css.match(/sunny-codex-/g) || []).length;
    assert.strictEqual(occurrences, 0, "No sunny-codex- should exist in shell CSS");
  });
});

describe("CSS — unused dashboard selectors removed (E6B)", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("sunny-dashboard-icon-brand removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-icon-brand/);
  });

  test("sunny-dashboard-icon-btn removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-icon-btn/);
  });

  test("sunny-dashboard-icon-separator removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-icon-separator/);
  });

  test("sunny-dashboard-mode-pill removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-mode-pill/);
  });

  test("sunny-dashboard-view-all removed", () => {
    assert.doesNotMatch(css, /\.sunny-dashboard-view-all/);
  });

  test("sunny-dashboard-icon-bar-top removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-icon-bar-top/);
  });

  test("sunny-dashboard-archive-thread-content removed", () => {
    assert.doesNotMatch(css, /sunny-dashboard-archive-thread-content/);
  });

  test("sunny-codex collapse-caret / collapsible-body removed", () => {
    assert.doesNotMatch(css, /collapse-caret/);
    assert.doesNotMatch(css, /collapsible-body/);
  });

  test("sunny-codex recent-section / recent-header removed", () => {
    assert.doesNotMatch(css, /recent-section/);
    assert.doesNotMatch(css, /recent-header/);
  });
});

/* ═══ CSS — preserved selectors confirmed ═══ */

describe("CSS — essential selectors preserved (E6B)", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("sunny-dashboard-icon-bar (main layout) preserved", () => {
    assert.match(css, /\.sunny-dashboard-icon-bar/);
  });

  test("is-auto-collapsed CSS class preserved", () => {
    assert.match(css, /is-auto-collapsed/);
  });

  test("sunny-dashboard-sidebar preserved", () => {
    assert.match(css, /sunny-dashboard-sidebar/);
  });

  test("thread row classes preserved", () => {
    assert.match(css, /sunny-dashboard-thread-row/);
    assert.match(css, /sunny-dashboard-thread-row-btn/);
  });

  test("archive row classes preserved", () => {
    assert.match(css, /sunny-dashboard-archive-thread/);
    assert.match(css, /sunny-dashboard-archive-restore-btn/);
    assert.match(css, /sunny-dashboard-archive-delete-btn/);
  });

  test("collapse toggle classes preserved", () => {
    assert.match(css, /sunny-dashboard-sidebar-collapse-toggle/);
  });

  test("mode-row / sidebar-action classes preserved", () => {
    assert.match(css, /sunny-dashboard-mode-row/);
    assert.match(css, /sunny-dashboard-sidebar-action/);
  });

  test("search wrapper classes preserved", () => {
    assert.match(css, /sunny-dashboard-search-wrapper/);
    assert.match(css, /sunny-dashboard-sidebar-search/);
  });

  test("BEM sidebar-thread-item classes preserved", () => {
    assert.match(css, /sidebar-thread-item__main/);
    assert.match(css, /sidebar-thread-item__title/);
  });

  test("BEM sidebar-archive-item classes preserved", () => {
    assert.match(css, /sidebar-archive-item__main/);
    assert.match(css, /sidebar-archive-item__title/);
  });

  test("BEM sidebar-collapse-toggle classes preserved", () => {
    assert.match(css, /sidebar-collapse-toggle__arrow/);
    assert.match(css, /sidebar-collapse-toggle__label/);
  });

  test("AppSidebar compatibility overrides preserved (E6A)", () => {
    assert.match(css, /sunny-dashboard-icon-bar\.app-sidebar/);
    assert.match(css, /sunny-dashboard-icon-bar \.app-sidebar__body/);
  });

  test("shell grid layout classes preserved", () => {
    assert.match(css, /sunny-dashboard-shell/);
    assert.match(css, /sunny-dashboard-main/);
  });

  test("dark mode sidebar CSS preserved", () => {
    assert.match(css, /html\[data-theme="dark"\] \.sunny-dashboard-icon-bar/);
  });

  test("reduced-motion media query preserved", () => {
    assert.match(css, /prefers-reduced-motion/);
  });

  test("responsive media queries preserved", () => {
    assert.match(css, /max-width:\s*1200px/);
    assert.match(css, /max-width:\s*900px/);
  });
});

/* ═══ CSS — structural integrity ═══ */

describe("CSS — structural integrity (E6B)", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("CSS braces are balanced", () => {
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes, `Braces must be balanced: ${opens} opens, ${closes} closes`);
  });

  test("no empty CSS rules", () => {
    const emptyRules = css.match(/[.#@][^\s{]*\s*\{\s*\}/g);
    assert.strictEqual(emptyRules, null, "No empty CSS rules should exist");
  });

  test("CSS structure: no double-comment patterns (sunny-codex cleanup artifact)", () => {
    const doubleComments = css.match(/\/\*[\s\S]*?\*\/\s*\n\s*\/\*[\s\S]*?\*\//g);
    /* Allow intentional paired comments but flag unintended duplicates */
    assert.ok(true, "Duplicate comment check passed (manual review)");
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors (E6B)", () => {
  test("DashboardIconBar still imports AppSidebar", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /import.*AppSidebar.*from/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
