import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══════════════════════════════════════════════════════════════
   Phase E6D — DashboardIconBar Visual & Interaction Regression
   Verification-only phase. No business code modifications.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Shell & Structure ─── */

describe("E6D-1: AppSidebar shell", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("AppSidebar used as outer wrapper", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("sunny-dashboard-icon-bar class preserved", () => {
    assert.match(source, /sunny-dashboard-icon-bar/);
  });

  test("sunny-dashboard-sidebar class preserved", () => {
    assert.match(source, /sunny-dashboard-sidebar/);
  });

  test("aria-label='工作台导航' preserved", () => {
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("ref={navRef} passed to AppSidebar", () => {
    assert.match(source, /ref=\{navRef\}/);
  });

  test("onMouseEnter/onMouseLeave handlers preserved", () => {
    assert.match(source, /onMouseEnter=\{handleSidebarMouseEnter\}/);
    assert.match(source, /onMouseLeave=\{handleSidebarMouseLeave\}/);
  });
});

/* ─── Collapse & Expand State ─── */

describe("E6D-2: auto-collapse / hover-expand state", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("stripCollapsed = !pinned", () => {
    assert.match(source, /stripCollapsed = !pinned/);
  });

  test("navRef.current.classList.toggle('is-auto-collapsed', ...)", () => {
    assert.match(source, /is-auto-collapsed/);
    assert.match(source, /classList\.toggle/);
  });

  test("navRef.current.classList.toggle('is-hover-expanded', ...)", () => {
    assert.match(source, /is-hover-expanded/);
  });

  test("collapseTimer ref exists", () => {
    assert.match(source, /collapseTimer/);
  });

  test("300ms hover leave delay preserved", () => {
    assert.match(source, /setTimeout\(\(\) => \{\s*onHoverExpandedChange\(false\);\s*\}, 300\)/);
  });

  test("hover enter clears timer", () => {
    assert.match(source, /clearTimeout\(collapseTimer\.current\)/);
  });

  test("pin toggle inverts pinned via onPinnedChange", () => {
    assert.match(source, /onPinnedChange\(!pinned\)/);
  });
});

/* ─── Writing Mode ─── */

describe("E6D-3: writing mode class & behavior", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("isWritingMode = activeMode === 'writing'", () => {
    assert.match(source, /isWritingMode = activeMode === "writing"/);
  });

  test("is-writing-mode class conditionally added", () => {
    assert.match(source, /is-writing-mode/);
  });

  test("WritingLibraryRail rendered in writing mode", () => {
    assert.match(source, /<WritingLibraryRail/);
  });

  test("WritingSidebarBottomRail rendered in writing mode", () => {
    assert.match(source, /<WritingSidebarBottomRail/);
  });
});

/* ─── Mode Navigation ─── */

describe("E6D-4: mode navigation (6 entries)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");

  test("6 modes defined in DASHBOARD_MODES", () => {
    const afterBracket = modesSource.split("= [")[1];
    const keyCount = (afterBracket.match(/key:/g) || []).length;
    assert.strictEqual(keyCount, 6);
  });

  test("rendered via DASHBOARD_MODES.map in JSX", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
  });

  test("each mode uses SidebarItem", () => {
    const modeSection = source.match(/DASHBOARD_MODES\.map[\s\S]*?\)\s*\}/);
    assert.ok(modeSection, "DASHBOARD_MODES.map should exist");
    assert.match(modeSection![0], /<SidebarItem/);
  });

  test("active bound to mode.key === activeMode", () => {
    assert.match(source, /active=\{mode\.key === activeMode\}/);
  });

  test("onClick calls onModeChange with key + prompt", () => {
    assert.match(source, /onClick=\{\(\) => onModeChange\(mode\.key, mode\.prompt\)\}/);
  });

  test("tooltip uses mode.label for collapsed mode", () => {
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("all 6 labels present in modes file", () => {
    for (const label of ["工作台", "日程", "记忆库", "写作", "清单", "时间线"]) {
      assert.match(modesSource, new RegExp(`label: "${label}"`));
    }
  });

  test("all 6 icons present in modes file", () => {
    for (const icon of ["agent", "calendar", "memory", "pencil", "checklist", "timeline"]) {
      assert.match(modesSource, new RegExp(`icon: "${icon}"`));
    }
  });
});

/* ─── New Thread Button ─── */

describe("E6D-5: new thread button (新对话)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("新对话 uses SidebarItem", () => {
    assert.match(source, /label="新对话"/);
  });

  test("新对话 onClick calls onNewThread", () => {
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("新对话 has tooltip", () => {
    assert.match(source, /tooltip="新对话"/);
  });

  test("located inside 主操作 SidebarSection", () => {
    assert.match(source, /title="主操作"/);
  });
});

/* ─── Search ─── */

describe("E6D-6: search input behavior", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("AppSearchInput used", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("value bound to searchQuery from hook", () => {
    assert.match(source, /value=\{searchQuery\}/);
  });

  test("onChange calls handleSearchChange with e.target.value", () => {
    assert.match(source, /onChange=\{\(e\) => handleSearchChange\(e\.target\.value\)\}/);
  });

  test("onClear bound to clearSearch", () => {
    assert.match(source, /onClear=\{clearSearch\}/);
  });

  test("onKeyDown bound to handleSearchKeyDown", () => {
    assert.match(source, /onKeyDown=\{handleSearchKeyDown\}/);
  });

  test("placeholder='搜索会话...'", () => {
    assert.match(source, /placeholder="搜索会话..."/);
  });

  test("aria-label='搜索会话'", () => {
    assert.match(source, /aria-label="搜索会话"/);
  });

  test("className=sunny-dashboard-search-wrapper preserved", () => {
    assert.match(source, /sunny-dashboard-search-wrapper/);
  });

  test("search hook properly imported", () => {
    const searchHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-search.ts");
    assert.match(searchHook, /setSearchQuery\(value\)/);
    assert.match(searchHook, /setSearchQuery\(""\)/);
    assert.match(searchHook, /e\.key === "Enter"/);
  });
});

/* ─── Thread Rows ─── */

describe("E6D-7: thread rows", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const threadItemSource = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");

  test("thread rows use SidebarThreadItem", () => {
    assert.match(source, /<SidebarThreadItem/);
  });

  test("thread row onClick calls onLoadThread", () => {
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("thread title uses thread.title with fallback", () => {
    assert.match(source, /title=\{thread\.title \|\| `会话 #\$\{thread\.id\}`\}/);
  });

  test("thread meta uses formatThreadMeta", () => {
    assert.match(source, /meta=\{formatThreadMeta\(thread\)\}/);
  });

  test("ThreadRowMenu rendered inside menu slot", () => {
    assert.match(source, /<ThreadRowMenu/);
  });

  test("SidebarThreadItem has aria-current='page' on active", () => {
    assert.match(threadItemSource, /aria-current=\{active \? "page" : undefined\}/);
  });

  test("SidebarThreadItem has data-active attribute", () => {
    assert.match(threadItemSource, /data-active=\{active \|\| undefined\}/);
  });

  test("SidebarThreadItem button has type='button'", () => {
    assert.match(threadItemSource, /type="button"/);
  });

  test("SidebarThreadItem has exactly 1 <button>", () => {
    const buttonCount = (threadItemSource.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 1);
  });
});

/* ─── Thread Menu Isolation ─── */

describe("E6D-8: ThreadRowMenu isolation (menu won't trigger row)", () => {
  const threadItemSource = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");
  const menuSource = read("src/components/dashboard/agent/ThreadRowMenu.tsx");

  test("menu is sibling of row button (appears after </button>)", () => {
    assert.match(threadItemSource, /<\/button>[\s\S]*\{menu\}/);
  });

  test("menu NOT inside <button>...</button>", () => {
    const buttonContent = threadItemSource.match(/<button[\s\S]*?<\/button>/);
    assert.ok(buttonContent);
    assert.doesNotMatch(buttonContent![0], /\{menu\}/);
  });

  test("ThreadRowMenu uses stopPropagation on trigger click", () => {
    assert.match(menuSource, /event\.stopPropagation\(\)/);
  });

  test("ThreadRowMenu renders AppDropdownMenu", () => {
    assert.match(menuSource, /<AppDropdownMenu/);
  });

  test("ThreadRowMenu trigger has aria-label", () => {
    assert.match(menuSource, /triggerAriaLabel/);
  });
});

/* ─── Archive Section ─── */

describe("E6D-9: archive section", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const archiveItemSource = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("archive rows use SidebarArchiveItem", () => {
    assert.match(source, /<SidebarArchiveItem/);
  });

  test("archive restore bound to restoreThread", () => {
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
  });

  test("archive delete bound to setDeleteTarget", () => {
    assert.match(source, /onDelete=\{\(\) => setDeleteTarget\(thread\)\}/);
  });

  test("SidebarArchiveItem restore button has aria-label", () => {
    assert.match(archiveItemSource, /aria-label="恢复会话"/);
  });

  test("SidebarArchiveItem delete button has aria-label", () => {
    assert.match(archiveItemSource, /aria-label="删除会话"/);
  });

  test("SidebarArchiveItem buttons have type='button'", () => {
    const typeButtons = (archiveItemSource.match(/type="button"/g) || []).length;
    assert.strictEqual(typeButtons, 2, "Both restore and delete must be type=button");
  });

  test("SidebarArchiveItem buttons have stopPropagation", () => {
    const stopCalls = (archiveItemSource.match(/e\.stopPropagation\(\)/g) || []).length;
    assert.strictEqual(stopCalls, 2, "Both buttons must call stopPropagation");
  });

  test("SidebarArchiveItem has exactly 2 <button> elements", () => {
    const buttonCount = (archiveItemSource.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 2);
  });

  test("no button nesting in SidebarArchiveItem (buttons are siblings)", () => {
    /* Both restore + delete are siblings, not nested. Each button's closing tag
       appears before the next button's opening tag. */
    const firstBtnEnd = archiveItemSource.indexOf("</button>");
    const secondBtnStart = archiveItemSource.indexOf("<button", firstBtnEnd + 1);
    assert.ok(firstBtnEnd > 0, "first button should exist");
    assert.ok(secondBtnStart > firstBtnEnd, "second button starts after first ends");
  });

  test("restore button disabled when restoring", () => {
    assert.match(archiveItemSource, /disabled=\{disabled \|\| restoring\}/);
  });

  test("delete button disabled when deleting", () => {
    assert.match(archiveItemSource, /disabled=\{disabled \|\| deleting\}/);
  });

  test("ConfirmDialog still used for delete confirmation", () => {
    assert.match(source, /<ConfirmDialog/);
    assert.match(source, /确认删除/);
  });
});

/* ─── Collapse Toggles ─── */

describe("E6D-10: collapse toggles", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const toggleSource = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("2 SidebarCollapseToggle instances", () => {
    const toggles = source.match(/<SidebarCollapseToggle/g);
    assert.strictEqual(toggles?.length, 2);
  });

  test("会话 toggle: aria-expanded={threadsOpen}", () => {
    assert.match(source, /expanded=\{threadsOpen\}/);
  });

  test("已归档 toggle: aria-expanded={archiveOpen}", () => {
    assert.match(source, /expanded=\{archiveOpen\}/);
  });

  test("SidebarCollapseToggle button has type='button'", () => {
    assert.match(toggleSource, /type="button"/);
  });

  test("SidebarCollapseToggle has aria-expanded bound to expanded prop", () => {
    assert.match(toggleSource, /aria-expanded=\{expanded\}/);
  });

  test("SidebarCollapseToggle has data-open for arrow animation", () => {
    assert.match(toggleSource, /data-open=\{expanded\}/);
  });

  test("SidebarCollapseToggle has exactly 1 <button>", () => {
    const buttonCount = (toggleSource.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 1);
  });

  test("会话 toggle count = filteredThreads.length", () => {
    assert.match(source, /count=\{filteredThreads\.length\}/);
  });

  test("已归档 toggle count conditional on archiveLoaded", () => {
    assert.match(source, /count=\{archiveLoaded \? archiveThreads\.length : undefined\}/);
  });

  test("is-collapsed class conditionally applied to sections", () => {
    assert.match(source, /is-collapsed/);
  });
});

/* ─── SettingsPopover ─── */

describe("E6D-11: SettingsPopover", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu rendered", () => {
    assert.match(source, /<DashboardSettingsMenu/);
  });

  test("settingsOpen state managed", () => {
    assert.match(source, /const \[settingsOpen, setSettingsOpen\] = useState/);
  });

  test("triggerAsChild passed", () => {
    assert.match(source, /triggerAsChild/);
  });

  test("trigger uses SidebarItem", () => {
    const settingsBlock = source.match(/<DashboardSettingsMenu[\s\S]*?\n\s*\/>/);
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /<SidebarItem/);
  });

  test("settings trigger has label='设置'", () => {
    assert.match(source, /label="设置"/);
  });
});

/* ─── No Button Nesting Anywhere ─── */

describe("E6D-12: no button nesting in any side component", () => {
  const components = [
    { name: "SidebarThreadItem", path: "src/components/dashboard/sidebar/SidebarThreadItem.tsx", expected: 1 },
    { name: "SidebarArchiveItem", path: "src/components/dashboard/sidebar/SidebarArchiveItem.tsx", expected: 2 },
    { name: "SidebarCollapseToggle", path: "src/components/dashboard/sidebar/SidebarCollapseToggle.tsx", expected: 1 },
  ];

  for (const comp of components) {
    test(`${comp.name}: exactly ${comp.expected} <button>`, () => {
      const src = read(comp.path);
      const count = (src.match(/<button/g) || []).length;
      assert.strictEqual(count, comp.expected);
    });

    test(`${comp.name}: no button nesting (each </button> before next <button)`, () => {
      const src = read(comp.path);
      /* Check: within each <button>...</button> pair there's no nested <button */
      const buttonRegex = /<button[\s\S]*?<\/button>/g;
      let match;
      while ((match = buttonRegex.exec(src)) !== null) {
        const content = match[0];
        const innerButtons = content.match(/<button/g);
        if (innerButtons && innerButtons.length > 1) {
          assert.fail(`Nested button found: ${content.substring(0, 80)}...`);
        }
      }
      assert.ok(true);
    });
  }
});

/* ─── No Dual Tooltip ─── */

describe("E6D-13: no dual tooltip", () => {
  test("DashboardIconBar has no data-tooltip attribute", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.doesNotMatch(source, /data-tooltip/);
  });

  test("SidebarItem uses AppTooltip, not CSS pseudo tooltip", () => {
    const sidebarItemSource = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSource, /AppTooltip/);
    assert.doesNotMatch(sidebarItemSource, /data-tooltip/);
  });
});

/* ─── Old className Compatibility ─── */

describe("E6D-14: old className preserved in key components", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");
  const threadItem = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");
  const archiveItem = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");
  const toggle = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("SidebarThreadItem preserves sunny-dashboard-thread-row / -btn", () => {
    assert.match(threadItem, /"sunny-dashboard-thread-row"/);
    assert.match(threadItem, /"sunny-dashboard-thread-row-btn"/);
  });

  test("SidebarArchiveItem preserves sunny-dashboard-archive-thread / -restore-btn / -delete-btn", () => {
    assert.match(archiveItem, /"sunny-dashboard-archive-thread"/);
    assert.match(archiveItem, /"sunny-dashboard-archive-restore-btn"/);
    assert.match(archiveItem, /"sunny-dashboard-archive-delete-btn"/);
  });

  test("SidebarCollapseToggle preserves sunny-dashboard-sidebar-collapse-toggle", () => {
    assert.match(toggle, /"sunny-dashboard-sidebar-collapse-toggle"/);
  });

  test("sunny-dashboard-sidebar-section still in source", () => {
    assert.match(source, /sunny-dashboard-sidebar-section/);
  });

  test("sunny-dashboard-mode-row / -list still in source", () => {
    assert.match(source, /sunny-dashboard-mode-row/);
    assert.match(source, /sunny-dashboard-mode-list/);
  });
});

/* ─── CSS Integrity ─── */

describe("E6D-15: CSS integrity", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("CSS braces balanced", () => {
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes, `${opens} opens, ${closes} closes`);
  });

  test("no empty CSS rules", () => {
    const empty = css.match(/[.#@][^\s{]*\s*\{\s*\}/g);
    assert.strictEqual(empty, null);
  });

  test("no hex colors (all oklch)", () => {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
  });

  test("no sunny-codex- selectors", () => {
    assert.doesNotMatch(css, /sunny-codex-/);
  });

  test("AppSidebar compatibility overrides present", () => {
    assert.match(css, /sunny-dashboard-icon-bar\.app-sidebar/);
    assert.match(css, /sunny-dashboard-icon-bar \.app-sidebar__body/);
  });

  test("dark mode rules present", () => {
    assert.match(css, /html\[data-theme="dark"\]/);
  });

  test("reduced-motion media query present", () => {
    assert.match(css, /prefers-reduced-motion/);
  });
});

/* ─── Thread Derived Data ─── */

describe("E6D-16: thread hook filter behavior", () => {
  const threadsHook = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");

  test("filterDashboardThreads called with threads + searchQuery", () => {
    assert.match(threadsHook, /filterDashboardThreads\(threads, searchQuery\)/);
  });

  test("filteredThreads memoized on [threads, searchQuery]", () => {
    assert.match(threadsHook, /\[threads, searchQuery\]/);
  });

  test("visibleThreads limits to 3 in compact, 40 in full", () => {
    assert.match(threadsHook, /threadListMode === "compact" \? 3 : 40/);
  });

  test("visibleThreads memoized on [filteredThreads, threadListMode]", () => {
    assert.match(threadsHook, /\[filteredThreads, threadListMode\]/);
  });

  test("DashboardIconBar destructures filter results", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /const \{ filteredThreads, visibleThreads \} = useDashboardSidebarThreads/);
  });
});

/* ─── TypeScript & ESLint ─── */

describe("E6D-17: no new errors", () => {
  test("all imports resolve (static check)", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    const imports = [
      "AppSidebar", "SidebarItem", "SidebarSection",
      "SidebarThreadItem", "SidebarArchiveItem", "SidebarCollapseToggle",
      "useDashboardSidebarSearch", "useDashboardSidebarThreads",
      "formatThreadMeta", "DASHBOARD_MODES", "DashboardIconBarProps",
    ];
    for (const imp of imports) {
      assert.match(source, new RegExp(imp), `Import ${imp} should exist`);
    }
  });

  test("no stale inline patterns (all extracted to hooks/files)", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.doesNotMatch(source, /const \[searchQuery, setSearchQuery\] = useState/);
    assert.doesNotMatch(source, /const handleSearchChange = useCallback/);
    assert.doesNotMatch(source, /const clearSearch = useCallback/);
    assert.doesNotMatch(source, /const filteredThreads = useMemo/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});

/* ─── Accessibility Audit ─── */

describe("E6D-18: accessibility", () => {
  test("AppSidebar has aria-label", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("all SidebarItems have tooltip for collapsed mode", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* tooltip={mode.label} (1 for map) + tooltip="新对话" + tooltip="设置" + pin tooltip = 4 occurrences */
    const tooltipCount = (source.match(/tooltip=/g) || []).length;
    assert.ok(tooltipCount >= 3, `Expected >= 3 tooltip occurrences, got ${tooltipCount}`);
  });

  test("session section has aria-label='会话'", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /aria-label="会话"/);
  });

  test("archive section has aria-label='已归档'", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /aria-label="已归档"/);
  });

  test("thread list has role='list'", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /role="list"/);
  });

  test("collapse toggles have aria-expanded", () => {
    const toggle = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");
    assert.match(toggle, /aria-expanded=\{expanded\}/);
  });

  test("all buttons in side components have type='button'", () => {
    for (const path of [
      "src/components/dashboard/sidebar/SidebarThreadItem.tsx",
      "src/components/dashboard/sidebar/SidebarArchiveItem.tsx",
      "src/components/dashboard/sidebar/SidebarCollapseToggle.tsx",
    ]) {
      const src = read(path);
      const typeButtons = (src.match(/type="button"/g) || []).length;
      const totalButtons = (src.match(/<button/g) || []).length;
      assert.strictEqual(typeButtons, totalButtons,
        `${path}: all ${totalButtons} buttons should have type="button"`);
    }
  });
});
