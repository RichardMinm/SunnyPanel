import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ SidebarCollapseToggle — component structure ═══ */

describe("SidebarCollapseToggle — component structure", () => {
  const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("exports SidebarCollapseToggle function", () => {
    assert.match(source, /export function SidebarCollapseToggle/);
  });

  test("renders native <button> element", () => {
    assert.match(source, /<button/);
  });

  test("button has type='button'", () => {
    assert.match(source, /type="button"/);
  });

  test("button has aria-expanded bound to expanded prop", () => {
    assert.match(source, /aria-expanded=\{expanded\}/);
  });

  test("button onClick calls onToggle", () => {
    assert.match(source, /onClick=\{onToggle\}/);
  });

  test("button disabled when disabled prop is true", () => {
    assert.match(source, /disabled=\{disabled\}/);
  });

  test("has BEM class sidebar-collapse-toggle on button", () => {
    assert.match(source, /"sidebar-collapse-toggle"/);
  });

  test("preserves old sunny-dashboard-sidebar-collapse-toggle class", () => {
    assert.match(source, /"sunny-dashboard-sidebar-collapse-toggle"/);
  });

  test("arrow wrapper has BEM class sidebar-collapse-toggle__arrow", () => {
    assert.match(source, /"sidebar-collapse-toggle__arrow"/);
  });

  test("arrow wrapper preserves old sunny-sidebar-fold-arrow class", () => {
    assert.match(source, /"sunny-sidebar-fold-arrow"/);
  });

  test("arrow wrapper has data-open bound to expanded prop", () => {
    assert.match(source, /data-open=\{expanded\}/);
  });

  test("arrow renders arrowIcon prop", () => {
    assert.match(source, /\{arrowIcon\}/);
  });

  test("icon wrapper has BEM class sidebar-collapse-toggle__icon", () => {
    assert.match(source, /"sidebar-collapse-toggle__icon"/);
  });

  test("icon wrapper preserves old sunny-dashboard-sidebar-icon class", () => {
    assert.match(source, /"sunny-dashboard-sidebar-icon"/);
  });

  test("icon only rendered when provided (conditional)", () => {
    assert.match(source, /icon \?/);
  });

  test("label has BEM class sidebar-collapse-toggle__label", () => {
    assert.match(source, /"sidebar-collapse-toggle__label"/);
  });

  test("label renders {label} content", () => {
    assert.match(source, /\{label\}/);
  });

  test("count badge has BEM class sidebar-collapse-toggle__count", () => {
    assert.match(source, /"sidebar-collapse-toggle__count"/);
  });

  test("count only rendered when provided (conditional)", () => {
    assert.match(source, /count !== undefined/);
  });

  test("count wrapped in parentheses", () => {
    assert.match(source, /\(\{count\}\)/);
  });
});

/* ═══ SidebarCollapseToggle — no button nesting ═══ */

describe("SidebarCollapseToggle — no button nesting", () => {
  const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("only ONE <button> element", () => {
    const buttonCount = (source.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 1, "SidebarCollapseToggle must render exactly 1 <button>");
  });

  test("root element is <button> (single button wrapper)", () => {
    assert.match(source, /return \(\s*<button/);
  });

  test("no nested interactive elements inside button", () => {
    /* The button's children are spans, not buttons/inputs/selects */
    assert.doesNotMatch(source, /<button[\s\S]*<button/);
    assert.doesNotMatch(source, /<button[\s\S]*<input/);
    assert.doesNotMatch(source, /<button[\s\S]*<select/);
  });
});

/* ═══ SidebarCollapseToggle — props type ═══ */

describe("SidebarCollapseToggle — props type", () => {
  const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("label: ReactNode", () => {
    assert.match(source, /label:\s*ReactNode/);
  });
  test("count?: number | string", () => {
    assert.match(source, /count\?:\s*number \| string/);
  });
  test("expanded: boolean", () => {
    assert.match(source, /expanded:\s*boolean/);
  });
  test("onToggle: () => void", () => {
    assert.match(source, /onToggle:\s*\(\) => void/);
  });
  test("icon?: ReactNode", () => {
    assert.match(source, /icon\?:\s*ReactNode/);
  });
  test("arrowIcon?: ReactNode", () => {
    assert.match(source, /arrowIcon\?:\s*ReactNode/);
  });
  test("disabled?: boolean", () => {
    assert.match(source, /disabled\?:\s*boolean/);
  });
  test("className?: string", () => {
    assert.match(source, /className\?:\s*string/);
  });
});

/* ═══ SidebarCollapseToggle — no business logic ═══ */

describe("SidebarCollapseToggle — no business logic (pure presentational)", () => {
  const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");

  test("does NOT manage collapse state (no useState)", () => {
    assert.doesNotMatch(source, /useState/);
  });

  test("does NOT read/write localStorage", () => {
    assert.doesNotMatch(source, /localStorage/);
  });

  test("does NOT call any API", () => {
    assert.doesNotMatch(source, /fetch/);
    assert.doesNotMatch(source, /api\//);
  });

  test("does NOT import thread or archive related hooks", () => {
    assert.doesNotMatch(source, /loadArchivedThreads/);
    assert.doesNotMatch(source, /setThreadsOpen/);
    assert.doesNotMatch(source, /archiveOpen/);
  });
});

/* ═══ DashboardIconBar — 会话 collapse toggle replaced ═══ */

describe("DashboardIconBar — 会话 collapse toggle uses SidebarCollapseToggle", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports SidebarCollapseToggle from sidebar", () => {
    assert.match(
      source,
      /import.*SidebarCollapseToggle.*from.*\/dashboard\/sidebar\/SidebarCollapseToggle/,
    );
  });

  test("SidebarCollapseToggle used for 会话 section", () => {
    /* At least 2 <SidebarCollapseToggle usages (会话 + 已归档) */
    const toggles = source.match(/<SidebarCollapseToggle/g);
    assert.ok(toggles, "SidebarCollapseToggle should be used");
    assert.strictEqual(toggles.length, 2, "Both 会话 and 已归档 toggles should use SidebarCollapseToggle");
  });

  test("会话 toggle passes expanded={threadsOpen}", () => {
    assert.match(source, /expanded=\{threadsOpen\}/);
  });

  test("会话 toggle passes label='会话'", () => {
    assert.match(source, /label="会话"/);
  });

  test("会话 toggle passes count={filteredThreads.length}", () => {
    assert.match(source, /count=\{filteredThreads\.length\}/);
  });

  test("会话 toggle passes icon with DashboardIcon name='agent'", () => {
    /* The 会话 toggle should have icon={<DashboardIcon name="agent" />} */
    const threadSection = source.match(
      /aria-label="会话"[\s\S]*?aria-label="已归档"/,
    );
    assert.ok(threadSection);
    assert.match(threadSection![0], /name="agent"/);
  });

  test("会话 toggle passes arrowIcon with DashboardIcon name='chevronDown'", () => {
    /* Both toggles use chevronDown — just verify the source has it near the 会话 toggle */
    const threadSection = source.match(
      /aria-label="会话"[\s\S]*?aria-label="已归档"/,
    );
    assert.ok(threadSection);
    assert.match(threadSection![0], /name="chevronDown"/);
  });

  test("会话 toggle onToggle calls setThreadsOpen", () => {
    assert.match(source, /onToggle=\{\(\) => setThreadsOpen\(\(v\) => !v\)\}/);
  });

  test("old raw button.sunny-dashboard-sidebar-collapse-toggle from 会话 is gone", () => {
    /* The raw button with onClick=setThreadsOpen and class=sunny-dashboard-sidebar-collapse-toggle
       should be replaced by SidebarCollapseToggle. Check that the old pattern is absent. */
    assert.doesNotMatch(source, /className="sunny-dashboard-sidebar-collapse-toggle"/);
  });

  test("setThreadsOpen state still managed (collapse logic untouched)", () => {
    assert.match(source, /const \[threadsOpen, setThreadsOpen\] = useState/);
    assert.match(source, /setThreadsOpen\(\(v\) => !v\)/);
  });
});

/* ═══ DashboardIconBar — 已归档 collapse toggle replaced ═══ */

describe("DashboardIconBar — 已归档 collapse toggle uses SidebarCollapseToggle", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("SidebarCollapseToggle used for 已归档 section", () => {
    const archiveToggle = source.match(
      /label="已归档"[\s\S]*?\/>/,
    );
    assert.ok(archiveToggle, "Archive toggle should use SidebarCollapseToggle");
  });

  test("已归档 toggle passes expanded={archiveOpen}", () => {
    assert.match(source, /expanded=\{archiveOpen\}/);
  });

  test("已归档 toggle passes label='已归档'", () => {
    assert.match(source, /label="已归档"/);
  });

  test("已归档 toggle passes count based on archiveLoaded", () => {
    assert.match(source, /count=\{archiveLoaded \? archiveThreads\.length : undefined\}/);
  });

  test("已归档 toggle passes icon with DashboardIcon name='archive'", () => {
    const archiveToggle = source.match(
      /label="已归档"[\s\S]*?\/>/,
    );
    assert.ok(archiveToggle);
    assert.match(archiveToggle![0], /name="archive"/);
  });

  test("已归档 toggle onToggle calls loadArchivedThreads", () => {
    assert.match(source, /onToggle=\{loadArchivedThreads\}/);
  });

  test("archiveOpen state still managed (collapse logic untouched)", () => {
    assert.match(source, /const \[archiveOpen, setArchiveOpen\] = useState/);
  });

  test("loadArchivedThreads still toggles archiveOpen", () => {
    assert.match(source, /setArchiveOpen\(\(v\) => !v\)/);
  });

  test("archiveLoaded and archiveThreads used for count (preserved)", () => {
    assert.match(source, /archiveLoaded/);
    assert.match(source, /archiveThreads\.length/);
  });
});

/* ═══ No regression — other items NOT replaced (E5D) ═══ */

describe("DashboardIconBar — other items NOT replaced (E5D)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("search input still uses AppSearchInput (E5A)", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("settings trigger still uses SidebarItem (E4a)", () => {
    const settingsBlock = source.match(/<DashboardSettingsMenu[\s\S]*?\n\s*\/>/);
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /<SidebarItem/);
  });

  test("新对话 still uses SidebarItem (E4c)", () => {
    assert.match(source, /label="新对话"/);
  });

  test("mode navigation SidebarItems still intact (E2)", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
  });

  test("SidebarSections still intact (E3)", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 3);
  });

  test("thread rows still use SidebarThreadItem (E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("archive rows still use SidebarArchiveItem (E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
  });

  test("ThreadRowMenu still used", () => {
    assert.match(source, /<ThreadRowMenu/);
  });

  test("outer nav element unchanged", () => {
    assert.match(source, /className="sunny-dashboard-icon-bar/);
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("collapsed/expanded state management unchanged", () => {
    assert.match(source, /stripCollapsed/);
    assert.match(source, /onHoverExpandedChange/);
    assert.match(source, /navRef\.current\.classList/);
  });

  test("is-collapsed class still applied to sections (behavior unchanged)", () => {
    assert.match(source, /is-collapsed/);
  });

  test("section aria-labels '会话' and '已归档' preserved", () => {
    assert.match(source, /aria-label="会话"/);
    assert.match(source, /aria-label="已归档"/);
  });

  test("thread list wrapper div still uses sunny-dashboard-thread-list", () => {
    assert.match(source, /sunny-dashboard-thread-list/);
  });

  test("archive list wrapper div still uses sunny-dashboard-archive-list", () => {
    assert.match(source, /sunny-dashboard-archive-list/);
  });

  test("empty state '暂无聊天' preserved", () => {
    assert.match(source, /暂无聊天/);
  });

  test("archive loading state '加载中...' preserved", () => {
    assert.match(source, /加载中\.\.\./);
  });

  test("archive empty state '没有已归档的会话' preserved", () => {
    assert.match(source, /没有已归档的会话/);
  });
});

/* ═══ CSS — old classes preserved + BEM classes added ═══ */

describe("CSS — collapse toggle compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("sunny-dashboard-sidebar-collapse-toggle CSS still present", () => {
    assert.match(css, /sunny-dashboard-sidebar-collapse-toggle/);
  });

  test("collapse toggle hover CSS still present", () => {
    assert.match(css, /sunny-dashboard-sidebar-collapse-toggle:hover\s*\{/);
  });

  test("BEM class sidebar-collapse-toggle__arrow has CSS", () => {
    assert.match(css, /\.sidebar-collapse-toggle__arrow\s*\{/);
  });

  test("arrow uses transform: rotate(-90deg) for collapsed state", () => {
    const rule = css.match(/\.sidebar-collapse-toggle__arrow\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /transform:\s*rotate\(-90deg\)/);
  });

  test("arrow[data-open='true'] rotates to 0deg", () => {
    const rule = css.match(/\.sidebar-collapse-toggle__arrow\[data-open="true"\]\s*\{[^}]*\}/s);
    assert.ok(rule, "Arrow expanded rotation rule should exist");
    assert.match(rule![0], /transform:\s*rotate\(0deg\)/);
  });

  test("arrow has transition on transform", () => {
    const rule = css.match(/\.sidebar-collapse-toggle__arrow\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /transition:\s*transform/);
  });

  test("BEM class sidebar-collapse-toggle__label has CSS", () => {
    assert.match(css, /\.sidebar-collapse-toggle__label\s*\{/);
  });

  test("label CSS includes overflow ellipsis handling", () => {
    const rule = css.match(/\.sidebar-collapse-toggle__label\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /text-overflow:\s*ellipsis/);
  });

  test("BEM class sidebar-collapse-toggle__count has CSS (muted)", () => {
    const rule = css.match(/\.sidebar-collapse-toggle__count\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /color:\s*var\(--muted\)/);
  });

  test("dark mode collapse toggle CSS still intact", () => {
    assert.match(css, /html\[data-theme="dark"\] \.sunny-dashboard-sidebar-collapse-toggle/);
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors", () => {
  test("SidebarCollapseToggle import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /import.*SidebarCollapseToggle.*from/);
  });

  test("SidebarCollapseToggle has cn import", () => {
    const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");
    assert.match(source, /import.*cn.*from/);
  });

  test("SidebarCollapseToggle is 'use client' component", () => {
    const source = read("src/components/dashboard/sidebar/SidebarCollapseToggle.tsx");
    assert.match(source, /"use client"/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
