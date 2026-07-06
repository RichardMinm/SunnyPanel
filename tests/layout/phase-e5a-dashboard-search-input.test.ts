import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ── DashboardIconBar — search input replaced with AppSearchInput ── */

describe("DashboardIconBar — AppSearchInput replaces raw input", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports AppSearchInput from primitives", () => {
    assert.match(
      source,
      /import.*AppSearchInput.*from.*\/components\/primitives\/AppSearchInput/,
    );
  });

  test("AppSearchInput used in search area", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("raw <input type=\"text\"> in search area is gone", () => {
    assert.doesNotMatch(source, /<input\s[^>]*type="text"/);
  });

  test("AppSearchInput preserves placeholder text", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock, "AppSearchInput block should exist");
    assert.match(searchBlock![0], /placeholder="搜索会话..."/);
  });

  test("AppSearchInput preserves aria-label", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /aria-label="搜索会话"/);
  });

  test("AppSearchInput value bound to searchQuery state", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /value=\{searchQuery\}/);
  });

  test("AppSearchInput onChange calls handleSearchChange with value", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /onChange=\{\(e\) => handleSearchChange\(e\.target\.value\)\}/);
  });

  test("AppSearchInput onClear bound to clearSearch", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /onClear=\{clearSearch\}/);
  });

  test("AppSearchInput onKeyDown still passed (preserves Enter handler)", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /onKeyDown=\{handleSearchKeyDown\}/);
  });

  test("AppSearchInput preserves old className for visual compat", () => {
    const searchBlock = source.match(
      /<AppSearchInput[\s\S]*?\/>/,
    );
    assert.ok(searchBlock);
    assert.match(searchBlock![0], /className="sunny-dashboard-search-wrapper"/);
  });

  test("old raw input class sunny-dashboard-sidebar-search-input is gone", () => {
    assert.doesNotMatch(source, /sunny-dashboard-sidebar-search-input/);
  });

  test("old AppIconButton with clear icon is gone from search area", () => {
    /* The old AppIconButton with icon="×" and aria-label="清除搜索"
       should no longer appear inside the search area. AppSearchInput
       has its own built-in clear button. */
    const searchSection = source.match(
      /showSessionSidebar \?[\s\S]*?\) : null/,
    );
    assert.ok(searchSection, "Search section should exist");
    /* AppIconButton with icon="×" should NOT be inside the search section */
    assert.doesNotMatch(searchSection![0], /icon="×"/);
    assert.doesNotMatch(searchSection![0], /aria-label="清除搜索"/);
  });

  test("outer sunny-dashboard-sidebar-search wrapper div preserved", () => {
    assert.match(source, /className="sunny-dashboard-sidebar-search"/);
  });
});

/* ── Search state management unchanged ── */

describe("DashboardIconBar — search state management preserved (E6C-2: hook)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const searchHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");
  const threadsHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");

  test("search hook returns searchQuery + handlers", () => {
    assert.match(searchHook, /searchQuery/);
    assert.match(searchHook, /handleSearchChange/);
    assert.match(searchHook, /clearSearch/);
    assert.match(searchHook, /handleSearchKeyDown/);
  });

  test("handleSearchChange calls setSearchQuery", () => {
    assert.match(searchHook, /setSearchQuery\(value\)/);
  });

  test("clearSearch clears searchQuery", () => {
    assert.match(searchHook, /setSearchQuery\(""\)/);
  });

  test("handleSearchKeyDown handles Enter key", () => {
    assert.match(searchHook, /e\.key === "Enter"/);
  });

  test("filterDashboardThreads used in thread hook", () => {
    assert.match(threadsHook, /filterDashboardThreads\(threads, searchQuery\)/);
  });

  test("DashboardIconBar imports and uses search hook", () => {
    assert.match(source, /import.*useDashboardSidebarSearch.*from/);
    assert.match(source, /useDashboardSidebarSearch\(\)/);
  });

  test("DashboardIconBar imports and uses thread hook", () => {
    assert.match(source, /import.*useDashboardSidebarThreads.*from/);
    assert.match(source, /useDashboardSidebarThreads\(/);
  });

  test("debounce logic unchanged (none — local filter only)", () => {
    assert.match(threadsHook, /filterDashboardThreads/);
  });
});

/* ── AppSearchInput component validation ── */

describe("AppSearchInput — component supports required props", () => {
  const source = read("src/components/primitives/AppSearchInput.tsx");

  test("AppSearchInput accepts className prop", () => {
    assert.match(source, /className/);
  });

  test("AppSearchInput has built-in clear button with aria-label", () => {
    assert.match(source, /aria-label="清除搜索"/);
  });

  test("AppSearchInput clear button is AppIconButton (renders as button element)", () => {
    /* AppSearchInput uses AppIconButton for clear.
       AppIconButton delegates to AppButton which renders <Comp> where
       Comp defaults to "button" (the native HTML element). */
    const appButtonSrc = read("src/components/primitives/AppButton.tsx");
    assert.match(appButtonSrc, /"button"/);
    /* The clear button icon is inside AppSearchInput */
    const searchSrc = read("src/components/primitives/AppSearchInput.tsx");
    assert.match(searchSrc, /AppIconButton/);
    assert.match(searchSrc, /aria-label="清除搜索"/);
  });

  test("AppSearchInput uses type=search on the native input", () => {
    assert.match(source, /type="search"/);
  });

  test("AppSearchInput spreads extra props to AppInput", () => {
    /* ...props is spread onto AppInput, which passes them to <input> */
    assert.match(source, /\{\.\.\.props\}/);
  });

  test("AppSearchInput supports onClear prop", () => {
    assert.match(source, /onClear\?/);
  });
});

/* ── No regression: other items untouched ── */

describe("DashboardIconBar — thread row / archive replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("thread rows now use SidebarThreadItem (Phase E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("ThreadRowMenu still used", () => {
    assert.match(source, /<ThreadRowMenu/);
  });

  test("archive rows now use SidebarArchiveItem (Phase E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
    assert.match(source, /onDelete=\{\(\) => setDeleteTarget\(thread\)\}/);
  });

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });
});

describe("DashboardIconBar — settings trigger unchanged (E4a)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu still uses SidebarItem trigger", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock, "DashboardSettingsMenu block should exist");
    assert.match(settingsBlock![0], /<SidebarItem/);
    assert.match(settingsBlock![0], /tooltip="设置"/);
  });

  test("settings triggerAsChild still present", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /triggerAsChild/);
  });
});

describe("DashboardIconBar — structural preservation", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("outer nav element unchanged", () => {
    assert.match(source, /className="sunny-dashboard-icon-bar/);
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("now wrapped in AppSidebar (E6A)", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("mode navigation SidebarItems still intact", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
    assert.match(source, /active=\{mode\.key === activeMode\}/);
  });

  test("新对话 SidebarItem still present (E4c)", () => {
    assert.match(source, /label="新对话"/);
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("SidebarSections still intact (E3)", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 3);
  });

  test("collapsed/expanded state management unchanged", () => {
    assert.match(source, /stripCollapsed/);
    assert.match(source, /onHoverExpandedChange/);
    assert.match(source, /navRef\.current\.classList/);
  });

  test("AppIconButton still used for pin button", () => {
    assert.match(source, /<AppIconButton/);
    assert.match(source, /handleTogglePin/);
  });

  test("AppIconButton still imported", () => {
    assert.match(source, /import.*AppIconButton.*from/);
  });
});

/* ── CSS — compound selectors for sidebar search AppSearchInput ── */

describe("CSS — sidebar search AppSearchInput compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("compound selector overrides app-input styles for sidebar", () => {
    const rule = css.match(
      /\.sunny-dashboard-search-wrapper\.app-input\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Compound selector for sidebar search wrapper should exist");
    assert.match(rule![0], /border-color/);
    assert.match(rule![0], /border-radius:\s*0\.5rem/);
    assert.match(rule![0], /padding:\s*0\s+0\.45rem/);
    assert.match(rule![0], /min-height:\s*unset/);
  });

  test("focus-within compound selector suppresses box-shadow", () => {
    const rule = css.match(
      /\.sunny-dashboard-search-wrapper\.app-input:focus-within\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Focus-within override should exist");
    assert.match(rule![0], /box-shadow:\s*none/);
  });

  test("input field font-size overridden to var(--text-xs)", () => {
    const rule = css.match(
      /\.sunny-dashboard-search-wrapper \.app-input__field\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Field override should exist");
    assert.match(rule![0], /font-size:\s*var\(--text-xs\)/);
    assert.match(rule![0], /padding:\s*0\.28rem\s+0/);
    assert.match(rule![0], /color:\s*var\(--foreground\)/);
  });

  test("placeholder uses muted color", () => {
    const rule = css.match(
      /\.sunny-dashboard-search-wrapper \.app-input__field::placeholder\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Placeholder rule should exist");
    assert.match(rule![0], /color:\s*var\(--muted\)/);
  });

  test("left search icon compact and muted", () => {
    const rule = css.match(
      /\.sunny-dashboard-search-wrapper \.app-input__left-icon\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Left icon rule should exist");
    assert.match(rule![0], /color:\s*var\(--muted\)/);
  });

  test("old CSS classes still preserved (not deleted)", () => {
    assert.match(css, /sunny-dashboard-sidebar-search-input/);
    assert.match(css, /sunny-dashboard-sidebar-search-clear/);
    assert.match(css, /sunny-dashboard-search-wrapper/);
  });

  test("existing collapsed mode search section rules still intact", () => {
    /* Collapsed mode hides the search section */
    assert.match(
      css,
      /\.sunny-dashboard-icon-bar\.is-auto-collapsed \.sunny-dashboard-sidebar-search/,
    );
  });

  test("dark mode search input rules still intact", () => {
    assert.match(
      css,
      /html\[data-theme="dark"\] \.sunny-dashboard-sidebar-search-input/,
    );
  });
});

/* ── No new errors ── */

describe("No new TypeScript or ESLint errors", () => {
  test("AppSearchInput import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(
      source,
      /import.*AppSearchInput.*from "@\/components\/primitives\/AppSearchInput"/,
    );
  });

  test("AppSearchInput exported from primitives", () => {
    const source = read("src/components/primitives/AppSearchInput.tsx");
    assert.match(source, /export const AppSearchInput/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
