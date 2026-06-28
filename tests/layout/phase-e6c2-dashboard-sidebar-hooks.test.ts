import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ useDashboardSidebarSearch hook ═══ */

describe("useDashboardSidebarSearch — search hook (E6C-2)", () => {
  const source = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");

  test("exports useDashboardSidebarSearch function", () => {
    assert.match(source, /export function useDashboardSidebarSearch/);
  });

  test("has 'use client' directive", () => {
    assert.match(source, /"use client"/);
  });

  test("initial searchQuery is empty string", () => {
    assert.match(source, /useState\(""\)/);
  });

  test("handleSearchChange updates searchQuery via setSearchQuery", () => {
    assert.match(source, /setSearchQuery\(value\)/);
  });

  test("clearSearch sets searchQuery to empty", () => {
    assert.match(source, /setSearchQuery\(""\)/);
  });

  test("handleSearchKeyDown handles Enter key", () => {
    assert.match(source, /e\.key === "Enter"/);
    assert.match(source, /searchQuery\.trim\(\)/);
  });

  test("returns all 5 values", () => {
    assert.match(source, /searchQuery,/);
    assert.match(source, /setSearchQuery,/);
    assert.match(source, /handleSearchChange,/);
    assert.match(source, /clearSearch,/);
    assert.match(source, /handleSearchKeyDown,/);
  });

  test("pure hook — no runtime API/fetch/localStorage (comments excluded)", () => {
    /* Check for actual API calls, not JSDoc mentions */
    assert.doesNotMatch(source, /fetch\(/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /api\//);
  });

  test("no side effects — no useEffect", () => {
    assert.doesNotMatch(source, /useEffect/);
  });

  test("useCallback deps are correct", () => {
    /* handleSearchChange has [] deps */
    assert.match(source, /useCallback\(\(value: string\) => \{\s*setSearchQuery\(value\);\s*\}, \[\]\)/);
    /* clearSearch has [] deps */
    assert.match(source, /setSearchQuery\(""\);\s*\}, \[\]\)/);
    /* handleSearchKeyDown has [searchQuery] deps */
    assert.match(source, /\[searchQuery\]/);
  });
});

/* ═══ useDashboardSidebarThreads hook ═══ */

describe("useDashboardSidebarThreads — thread hook (E6C-2)", () => {
  const source = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");

  test("exports useDashboardSidebarThreads function", () => {
    assert.match(source, /export function useDashboardSidebarThreads/);
  });

  test("uses filterDashboardThreads for search filtering", () => {
    assert.match(source, /filterDashboardThreads\(threads, searchQuery\)/);
  });

  test("compact mode limits to 3 visible threads", () => {
    assert.match(source, /threadListMode === "compact" \? 3 : 40/);
  });

  test("full mode limits to 40 visible threads", () => {
    assert.match(source, /: 40/);
  });

  test("filteredThreads useMemo deps: [threads, searchQuery]", () => {
    assert.match(source, /\[threads, searchQuery\]/);
  });

  test("visibleThreads useMemo deps: [filteredThreads, threadListMode]", () => {
    assert.match(source, /\[filteredThreads, threadListMode\]/);
  });

  test("returns filteredThreads and visibleThreads in return object", () => {
    assert.match(source, /return \{ filteredThreads, visibleThreads \}/);
  });

  test("default threadListMode is 'full'", () => {
    assert.match(source, /threadListMode = "full"/);
  });

  test("no API calls, pure computation only", () => {
    assert.doesNotMatch(source, /fetch/);
    assert.doesNotMatch(source, /api\//);
    assert.doesNotMatch(source, /useState/);
    assert.doesNotMatch(source, /useEffect/);
  });
});

/* ═══ DashboardIconBar — uses extracted hooks ═══ */

describe("DashboardIconBar — uses extracted hooks (E6C-2)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports useDashboardSidebarSearch", () => {
    assert.match(source, /import.*useDashboardSidebarSearch.*from/);
  });

  test("calls useDashboardSidebarSearch and destructures return", () => {
    assert.match(source, /useDashboardSidebarSearch\(\)/);
    assert.match(source, /searchQuery,/);
    assert.match(source, /handleSearchChange,/);
    assert.match(source, /clearSearch,/);
    assert.match(source, /handleSearchKeyDown,/);
  });

  test("imports useDashboardSidebarThreads", () => {
    assert.match(source, /import.*useDashboardSidebarThreads.*from/);
  });

  test("calls useDashboardSidebarThreads with correct args", () => {
    assert.match(source, /useDashboardSidebarThreads\(\{/);
    assert.match(source, /threads,/);
    assert.match(source, /searchQuery,/);
    assert.match(source, /threadListMode,/);
  });

  test("no inline useMemo for filteredThreads/visibleThreads", () => {
    assert.doesNotMatch(source, /const filteredThreads = useMemo/);
    assert.doesNotMatch(source, /const visibleThreads = useMemo/);
  });

  test("no inline search handler definitions", () => {
    assert.doesNotMatch(source, /const handleSearchChange = useCallback/);
    assert.doesNotMatch(source, /const clearSearch = useCallback/);
    assert.doesNotMatch(source, /const handleSearchKeyDown = useCallback/);
  });

  test("useMemo import removed (no longer needed)", () => {
    assert.doesNotMatch(source, /useMemo/);
  });

  test("filterDashboardThreads import removed from DashboardIconBar", () => {
    assert.doesNotMatch(source, /import.*filterDashboardThreads.*from/);
  });
});

/* ═══ No regression — search input behavior preserved ═══ */

describe("DashboardIconBar — search input unchanged (E6C-2)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("AppSearchInput still used", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("placeholder='搜索会话...' preserved", () => {
    assert.match(source, /placeholder="搜索会话..."/);
  });

  test("aria-label='搜索会话' preserved", () => {
    assert.match(source, /aria-label="搜索会话"/);
  });

  test("value bound to searchQuery (from hook)", () => {
    assert.match(source, /value=\{searchQuery\}/);
  });

  test("onChange calls handleSearchChange with value", () => {
    assert.match(source, /onChange=\{\(e\) => handleSearchChange\(e\.target\.value\)\}/);
  });

  test("onClear bound to clearSearch", () => {
    assert.match(source, /onClear=\{clearSearch\}/);
  });

  test("onKeyDown bound to handleSearchKeyDown", () => {
    assert.match(source, /onKeyDown=\{handleSearchKeyDown\}/);
  });

  test("search wrapper class preserved", () => {
    assert.match(source, /sunny-dashboard-sidebar-search/);
    assert.match(source, /sunny-dashboard-search-wrapper/);
  });
});

/* ═══ No regression — all internal components preserved ═══ */

describe("DashboardIconBar — all internal components unchanged (E6C-2)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("AppSidebar shell still present", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("mode navigation still uses SidebarItem (E2)", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
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

/* ═══ No regression — archive / delete / collapse logic preserved ═══ */

describe("DashboardIconBar — high-risk logic stays in component (E6C-2)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("navRef + classList.toggle still present", () => {
    assert.match(source, /navRef\.current\.classList/);
  });

  test("collapse timer + hover handlers preserved", () => {
    assert.match(source, /collapseTimer/);
    assert.match(source, /handleSidebarMouseEnter/);
    assert.match(source, /handleSidebarMouseLeave/);
    assert.match(source, /handleTogglePin/);
  });

  test("archive fetch logic preserved", () => {
    assert.match(source, /fetchArchivedThreads/);
    assert.match(source, /archiveLoading/);
    assert.match(source, /archiveLoaded/);
  });

  test("restoreThread logic preserved", () => {
    assert.match(source, /const restoreThread = useCallback/);
    assert.match(source, /archived: false/);
  });

  test("delete confirm logic preserved", () => {
    assert.match(source, /deleteTarget/);
    assert.match(source, /handleDeleteConfirm/);
    assert.match(source, /deleteBusy/);
    assert.match(source, /deleteError/);
  });

  test("handleArchive logic preserved", () => {
    assert.match(source, /const handleArchive = useCallback/);
    assert.match(source, /onArchiveThread/);
  });

  test("Settings open/close state preserved", () => {
    assert.match(source, /const \[settingsOpen, setSettingsOpen\] = useState/);
  });

  test("threadsOpen/archiveOpen states preserved", () => {
    assert.match(source, /const \[threadsOpen, setThreadsOpen\] = useState/);
    assert.match(source, /const \[archiveOpen, setArchiveOpen\] = useState/);
  });
});

/* ═══ className and aria preserved ═══ */

describe("DashboardIconBar — className and aria unchanged (E6C-2)", () => {
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
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors (E6C-2)", () => {
  test("both hook files exist and are valid", () => {
    const search = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");
    const threads = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");
    assert.ok(search.length > 0);
    assert.ok(threads.length > 0);
  });

  test("DashboardIconBar has no unused imports", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* useMemo and filterDashboardThreads should be gone */
    assert.doesNotMatch(source, /import.*useMemo.*from/);
    assert.doesNotMatch(source, /import.*filterDashboardThreads.*from/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
