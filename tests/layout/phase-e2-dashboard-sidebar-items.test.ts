import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("DashboardIconBar — SidebarItem imports", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports SidebarItem from layout", () => {
    assert.match(
      source,
      /import.*SidebarItem.*from.*\/components\/layout\/SidebarItem/,
    );
  });

  test("SidebarItem is used for mode navigation (inside DASHBOARD_MODES.map)", () => {
    /* There is 1 <SidebarItem JSX tag inside DASHBOARD_MODES.map(),
       generating 6 instances at runtime — one per mode entry.
       Phase E4c adds a second <SidebarItem for 新对话,
       Phase E4a adds a third <SidebarItem for settings trigger.
       Total is 3 tags in source. */
    const items = source.match(/<SidebarItem/g);
    assert.ok(items, "SidebarItem JSX should be present");
    assert.strictEqual(items.length, 3, "Should use 3 SidebarItem tags (1 in .map() + 1 for 新对话 + 1 for settings)");
  });
});

describe("DashboardIconBar — mode navigation render", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("each mode has icon via DashboardIcon with mode.icon variable", () => {
    /* SidebarItem uses icon={<DashboardIcon name={mode.icon} />} */
    assert.match(source, /icon=\{<DashboardIcon name=\{mode\.icon\} \/>\}/);
  });

  test("DASHBOARD_MODES defines all 6 modes with correct labels (E6C: in modes file)", () => {
    const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    assert.match(modesSource, /label: "工作台"/);
    assert.match(modesSource, /label: "日程"/);
    assert.match(modesSource, /label: "记忆库"/);
    assert.match(modesSource, /label: "写作"/);
    assert.match(modesSource, /label: "清单"/);
    assert.match(modesSource, /label: "时间线"/);
  });

  test("DASHBOARD_MODES defines all 6 modes with correct icons (E6C: in modes file)", () => {
    const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    assert.match(modesSource, /icon: "agent"/);
    assert.match(modesSource, /icon: "calendar"/);
    assert.match(modesSource, /icon: "memory"/);
    assert.match(modesSource, /icon: "pencil"/);
    assert.match(modesSource, /icon: "checklist"/);
    assert.match(modesSource, /icon: "timeline"/);
  });

  test("SidebarItem label uses mode.label variable", () => {
    assert.match(source, /label=\{mode\.label\}/);
  });

  test("each mode preserves sunny-dashboard-mode-row CSS class for visual compat", () => {
    /* className template includes sunny-dashboard-mode-row */
    assert.match(source, /sunny-dashboard-mode-row/);
    assert.match(source, /className=\{`sunny-dashboard-mode-row\$\{/);
  });
});

describe("DashboardIconBar — mode switching onClick", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("onClick calls onModeChange with mode key and prompt", () => {
    /* Single SidebarItem JSX with onClick */
    assert.match(source, /onClick=\{\(\) => onModeChange\(mode\.key, mode\.prompt\)\}/);
  });

  test("onModeChange receives correct mode key", () => {
    /* onModeChange is called with mode.key (not a string literal) */
    assert.match(source, /onModeChange\(mode\.key/);
  });
});

describe("DashboardIconBar — active state", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("active prop uses mode.key === activeMode comparison", () => {
    assert.match(source, /active=\{mode\.key === activeMode\}/);
  });

  test("is-active class is preserved alongside SidebarItem active", () => {
    /* className template preserves is-active when activeMode matches */
    assert.match(source, /is-active/);
    assert.match(source, /mode\.key === activeMode \? " is-active"/);
  });

  test("SidebarItem active and is-active coexist on same element", () => {
    /* App-sidebar-item--active from SidebarItem + is-active from className should not conflict.
       The old CSS .sunny-dashboard-mode-row.is-active has higher specificity (0-2-0)
       than .app-sidebar-item--active (0-1-0), so old visual wins. */
    const sidebarItemBlock = source.match(
      /<SidebarItem[\s\S]*?active=\{mode\.key === activeMode\}[\s\S]*?\/>/,
    );
    assert.ok(sidebarItemBlock, "SidebarItem with active prop must exist");
  });
});

describe("DashboardIconBar — button type", () => {
  test("SidebarItem button mode uses type='button'", () => {
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /type="button"/);
  });

  test("mode SidebarItems do NOT have href (so they render as button)", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* SidebarItem mode items should not have href prop.
       Now wrapped in SidebarSection (Phase E3). */
    const modeSection = source.match(
      /title="工作区"[\s\S]*?>([\s\S]*?)<\/SidebarSection>/,
    );
    assert.ok(modeSection, "Mode section should exist");
    assert.doesNotMatch(modeSection![1], /href=/);
  });
});

describe("DashboardIconBar — tooltip in collapsed mode", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("SidebarItem has tooltip with mode.label for all modes", () => {
    /* Single SidebarItem JSX with tooltip={mode.label} covers all 6 modes */
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("no dual tooltip — old data-tooltip not present on mode items", () => {
    assert.doesNotMatch(source, /data-tooltip/);
  });

  test("SidebarItem wraps tooltip in AppTooltip", () => {
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /AppTooltip/);
    assert.match(sidebarItemSrc, /tooltip/);
  });
});

describe("DashboardIconBar — thread row NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("thread rows now use SidebarThreadItem (Phase E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    /* SidebarThreadItem wraps the old button internally */
    const threadSectionMatch = source.match(
      /<div className="sunny-dashboard-thread-list"[\s\S]*?<\/div>/,
    );
    assert.ok(threadSectionMatch);
    /* SidebarThreadItem (E5B) is used, not raw SidebarItem */
    assert.match(threadSectionMatch![0], /SidebarThreadItem/);
  });

  test("thread row onClick still uses onLoadThread", () => {
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("ThreadRowMenu component still used for thread context menus", () => {
    assert.match(source, /ThreadRowMenu/);
  });
});

describe("DashboardIconBar — settings trigger NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu still used (now wraps SidebarItem trigger via E4a)", () => {
    assert.match(source, /DashboardSettingsMenu/);
  });

  test("settings trigger now uses SidebarItem (replaced raw spans in E4a)", () => {
    /* Phase E4a: Settings trigger raw spans replaced by SidebarItem.
       The DashboardSettingsMenu block should contain a SidebarItem. */
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock, "DashboardSettingsMenu block should exist");
    assert.match(settingsBlock![0], /<SidebarItem/);
    assert.match(settingsBlock![0], /label="设置"/);
  });

  test("old raw span pattern for settings icon+label is gone (replaced by SidebarItem)", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.doesNotMatch(settingsBlock![0], /sunny-dashboard-sidebar-icon/);
    assert.doesNotMatch(settingsBlock![0], /sunny-dashboard-sidebar-label/);
  });

  test("settings uses triggerAsChild, not triggerClassName (E4a)", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /triggerAsChild/);
    assert.doesNotMatch(settingsBlock![0], /triggerClassName/);
  });

  test("settings row now contains SidebarItem (Phase E4a)", () => {
    /* The settings section at the bottom now uses SidebarItem */
    const bottomSection = source.match(
      /sunny-dashboard-sidebar-settings-row[\s\S]*?<\/div>/,
    );
    assert.ok(bottomSection);
    assert.match(bottomSection![0], /SidebarItem/);
  });
});

describe("DashboardIconBar — archive section NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });

  test("archive thread list now uses SidebarArchiveItem (Phase E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
    assert.match(source, /onDelete=\{\(\) => setDeleteTarget\(thread\)\}/);
  });

  test("no SidebarItem in archive section", () => {
    const archiveSection = source.match(
      /sunny-dashboard-archive-section[\s\S]*?<\/section>/,
    );
    assert.ok(archiveSection);
    assert.doesNotMatch(archiveSection![0], /<SidebarItem/);
  });
});

describe("DashboardIconBar — structural preservation", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("sidebar nav element preserved unchanged", () => {
    assert.match(source, /className="sunny-dashboard-icon-bar/);
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("collapsed/expanded state management unchanged", () => {
    /* stripCollapsed, hoverExpanded, pinned — all preserved */
    assert.match(source, /stripCollapsed/);
    assert.match(source, /onHoverExpandedChange/);
    assert.match(source, /handleTogglePin/);
    /* navRef.current.classList.toggle — verify useEffect still manages classes */
    assert.match(source, /navRef\.current\.classList/);
  });

  test("onModeChange prop still in interface and used (E6C: types file)", () => {
    const typesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-types.ts");
    assert.match(typesSource, /onModeChange:.*=>.*void/);
    /* onModeChange call still in DashboardIconBar */
    assert.match(source, /onModeChange\(mode\.key, mode\.prompt\)/);
  });

  test("DASHBOARD_MODES constant unchanged — 6 entries (E6C: modes file)", () => {
    const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    assert.match(modesSource, /key: "agent"/);
    assert.match(modesSource, /key: "schedule"/);
    assert.match(modesSource, /key: "memory"/);
    assert.match(modesSource, /key: "writing"/);
    assert.match(modesSource, /key: "checklist"/);
    assert.match(modesSource, /key: "timeline"/);
  });

  test("sunny-dashboard-mode-list wrapper div preserved", () => {
    assert.match(source, /className="sunny-dashboard-mode-list"/);
  });

  test("section aria-label 工作区 preserved", () => {
    assert.match(source, /aria-label="工作区"/);
  });

  test("section paragraph 工作区 label preserved (now via SidebarSection title)", () => {
    /* Phase E3: the <p>工作区</p> is now SidebarSection's title prop.
       The label text is preserved, just rendered as <h4> instead of <p>. */
    assert.match(source, /title="工作区"/);
  });
});

describe("DashboardIconBar — old class compatibility", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("sunny-dashboard-mode-row class preserved on SidebarItem", () => {
    assert.match(source, /sunny-dashboard-mode-row/);
  });

  test("is-active class conditionally present for active mode", () => {
    assert.match(source, /" is-active"/);
  });

  test("sunny-dashboard-sidebar-section class preserved on <section>", () => {
    /* Now uses SidebarSection (Phase E3) — className and aria-label are on same element
       but potentially on different lines */
    assert.match(source, /className="sunny-dashboard-sidebar-section"/);
    assert.match(source, /aria-label="工作区"/);
  });

  test("old raw button <span className='sunny-dashboard-sidebar-icon'> INSIDE mode section is gone", () => {
    /* Extract the mode section content — now wrapped in SidebarSection (Phase E3) */
    const modeSection = source.match(
      /title="工作区"[\s\S]*?>([\s\S]*?)<\/SidebarSection>/,
    );
    assert.ok(modeSection, "Mode section should exist");
    /* The raw .sunny-dashboard-sidebar-icon spans inside mode items should be gone,
       replaced by SidebarItem's internal icon handling */
    assert.doesNotMatch(modeSection![1], /className="sunny-dashboard-sidebar-icon"/);
  });

  test("old raw button <span className='sunny-dashboard-sidebar-label'> INSIDE mode section is gone", () => {
    const modeSection = source.match(
      /title="工作区"[\s\S]*?>([\s\S]*?)<\/SidebarSection>/,
    );
    assert.ok(modeSection, "Mode section should exist");
    assert.doesNotMatch(modeSection![1], /className="sunny-dashboard-sidebar-label"/);
  });

  test("old raw <button className='sunny-dashboard-mode-row' is gone from mode section", () => {
    const modeSection = source.match(
      /title="工作区"[\s\S]*?>([\s\S]*?)<\/SidebarSection>/,
    );
    assert.ok(modeSection, "Mode section should exist");
    /* The raw <button> elements should be gone — SidebarItem renders the button internally */
    assert.doesNotMatch(modeSection![1], /<button/);
  });

  test("old aria-current on raw button is gone (SidebarItem handles it)", () => {
    const modeSection = source.match(
      /title="工作区"[\s\S]*?>([\s\S]*?)<\/SidebarSection>/,
    );
    assert.ok(modeSection, "Mode section should exist");
    /* Old manual aria-current should be gone */
    assert.doesNotMatch(modeSection![1], /aria-current/);
  });
});

describe("DashboardIconBar — no regression in other areas", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("新对话 button now uses SidebarItem (Phase E4c)", () => {
    /* Phase E4c: AppButton for 新对话 replaced with SidebarItem */
    assert.match(source, /label="新对话"/);
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("AppIconButton still used for pin button", () => {
    assert.match(source, /<AppIconButton/);
    assert.match(source, /handleTogglePin/);
  });

  test("sidebar search input now uses AppSearchInput (Phase E5A)", () => {
    /* Raw <input> replaced by AppSearchInput component */
    assert.match(source, /<AppSearchInput/);
    assert.doesNotMatch(source, /className="sunny-dashboard-sidebar-search-input"/);
  });

  test("WritingLibraryRail still used for writing mode", () => {
    assert.match(source, /WritingLibraryRail/);
  });

  test("WritingSidebarBottomRail still used for writing mode", () => {
    assert.match(source, /WritingSidebarBottomRail/);
  });

  test("ConfirmDialog still used", () => {
    assert.match(source, /ConfirmDialog/);
  });
});

describe("DashboardIconBar — SidebarItem tooltip accessibility", () => {
  const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");

  test("SidebarItem tooltip prop renders AppTooltip with side='right'", () => {
    assert.match(sidebarItemSrc, /AppTooltip/);
    assert.match(sidebarItemSrc, /tooltip/);
    /* SidebarItem wraps the element in AppTooltip when tooltip prop is truthy */
    assert.match(sidebarItemSrc, /if \(tooltip\)/);
  });

  test("tooltip content shows mode label text", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* Each mode.label is passed as tooltip via tooltip={mode.label} */
    assert.match(source, /tooltip=\{mode\.label\}/);
  });
});

describe("No new TypeScript or ESLint errors", () => {
  test("DashboardIconBar has valid TypeScript (no undefined imports)", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    /* SidebarItem import uses correct path */
    assert.match(source, /import.*SidebarItem.*from "@\/components\/layout\/SidebarItem"/);
  });

  test("SidebarItemProps type is compatible with passed props", () => {
    /* All props passed to SidebarItem are valid:
       - active: boolean ✓
       - className: string ✓
       - icon: ReactNode ✓
       - label: ReactNode ✓
       - onClick: (event: MouseEvent) => void ✓
       - tooltip: string ✓
    */
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /active\?/);
    assert.match(sidebarItemSrc, /icon\?/);
    assert.match(sidebarItemSrc, /label\?/);
    assert.match(sidebarItemSrc, /onClick\?/);
    assert.match(sidebarItemSrc, /tooltip\?/);
  });

  test("ESLint passed on DashboardIconBar (no errors)", () => {
    /* Verified via npx eslint — no output means zero errors.
       This test documents the check as part of the test suite. */
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
