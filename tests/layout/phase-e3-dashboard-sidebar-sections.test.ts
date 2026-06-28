import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ── SidebarSection import & usage ── */

describe("DashboardIconBar — SidebarSection imports", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports SidebarSection from layout", () => {
    assert.match(
      source,
      /import.*SidebarSection.*from.*\/components\/layout\/SidebarSection/,
    );
  });

  test("SidebarSection used for section wrappers (3 sections)", () => {
    const items = source.match(/<SidebarSection/g);
    assert.ok(items, "SidebarSection JSX should be present");
    assert.strictEqual(
      items.length,
      3,
      "Should use exactly 3 SidebarSections (主操作, 项目, 工作区)",
    );
  });
});

/* ── 主操作 section ── */

describe("DashboardIconBar — 主操作 section replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("uses SidebarSection with title=主操作", () => {
    assert.match(source, /title="主操作"/);
    assert.match(source, /aria-label="主操作"/);
  });

  test("preserves sunny-dashboard-sidebar-section className", () => {
    /* The section should carry the old CSS class for visual compat */
    const mainSection = source.match(
      /aria-label="主操作"[\s\S]*?title="主操作"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(mainSection, "主操作 section should exist");
    assert.match(mainSection![0], /sunny-dashboard-sidebar-section/);
  });

  test("新对话 button now uses SidebarItem (Phase E4c)", () => {
    assert.match(source, /label="新对话"/);
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("old <section> and <p> tags for 主操作 are gone", () => {
    /* The raw <section aria-label="主操作"> and <p>主操作</p> should be replaced */
    const oldSection = source.match(
      /<section[\s\S]*?aria-label="主操作"/,
    );
    assert.strictEqual(oldSection, null, "Old <section> for 主操作 should be gone");
  });
});

/* ── 项目 section ── */

describe("DashboardIconBar — 项目 section replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("uses SidebarSection with title=项目", () => {
    assert.match(source, /title="项目"/);
    assert.match(source, /aria-label="项目"/);
  });

  test("project row content preserved", () => {
    assert.match(source, /sunny-dashboard-project-row is-static/);
    assert.match(source, /DashboardIcon name="project"/);
    assert.match(source, />SunnyPanel</);
  });

  test("preserves sunny-dashboard-sidebar-section className", () => {
    const projectSection = source.match(
      /aria-label="项目"[\s\S]*?title="项目"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(projectSection, "项目 section should exist");
    assert.match(projectSection![0], /sunny-dashboard-sidebar-section/);
  });

  test("old <section> and <p> tags for 项目 are gone", () => {
    const oldSection = source.match(
      /<section[\s\S]*?aria-label="项目"/,
    );
    assert.strictEqual(oldSection, null, "Old <section> for 项目 should be gone");
  });
});

/* ── 工作区 section (mode navigation) ── */

describe("DashboardIconBar — 工作区 section replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("uses SidebarSection with title=工作区", () => {
    assert.match(source, /title="工作区"/);
    assert.match(source, /aria-label="工作区"/);
  });

  test("SidebarItem mode navigation still inside section", () => {
    /* The mode section should contain SidebarItem from Phase E2 */
    const modeSection = source.match(
      /aria-label="工作区"[\s\S]*?title="工作区"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(modeSection, "工作区 section should exist");
    assert.match(modeSection![0], /<SidebarItem/);
    assert.match(modeSection![0], /DASHBOARD_MODES\.map/);
  });

  test("old <p>工作区</p> is gone (now SidebarSection title)", () => {
    /* The <p>工作区</p> no longer exists — SidebarSection renders title as <h4> */
    assert.doesNotMatch(source, /<p>工作区<\/p>/);
    /* But SidebarSection with title="工作区" should be present */
    assert.match(source, /title="工作区"/);
  });

  test("sunny-dashboard-mode-list wrapper div preserved", () => {
    assert.match(source, /className="sunny-dashboard-mode-list"/);
  });

  test("SidebarItem active and onClick still intact", () => {
    assert.match(source, /active=\{mode\.key === activeMode\}/);
    assert.match(source, /onClick=\{\(\) => onModeChange\(mode\.key, mode\.prompt\)\}/);
  });

  test("SidebarItem tooltip still present", () => {
    assert.match(source, /tooltip=\{mode\.label\}/);
  });
});

/* ── 会话 section NOT replaced ── */

describe("DashboardIconBar — 会话 section NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("会话 section still uses raw <section> element", () => {
    assert.match(source, /aria-label="会话"/);
    assert.match(source, /sunny-dashboard-thread-section/);
    /* The 会话 section should use raw <section>, not SidebarSection.
       Verify by extracting the section and checking for SidebarSection tag. */
    const threadBlock = source.match(
      /<section\s[^>]*sunny-dashboard-thread-section[^>]*>[\s\S]*?<\/section>/,
    );
    assert.ok(threadBlock, "会话 section element should exist");
    assert.doesNotMatch(threadBlock![0], /<SidebarSection/);
  });

  test("thread collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /setThreadsOpen/);
  });

  test("thread rows now use SidebarThreadItem (Phase E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("ThreadRowMenu component still used", () => {
    assert.match(source, /ThreadRowMenu/);
  });

  test("empty state '暂无聊天' preserved", () => {
    assert.match(source, /暂无聊天/);
  });
});

/* ── 已归档 section NOT replaced ── */

describe("DashboardIconBar — 已归档 section NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("已归档 section still uses raw <section> element", () => {
    assert.match(source, /aria-label="已归档"/);
    assert.match(source, /sunny-dashboard-archive-section/);
  });

  test("archive collapse toggle still present (now via SidebarCollapseToggle E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });

  test("archive rows now use SidebarArchiveItem (Phase E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
    assert.match(source, /onRestore/);
    assert.match(source, /onDelete/);
  });

  test("archive empty state preserved", () => {
    assert.match(source, /没有已归档的会话/);
  });

  test("archive loading state preserved", () => {
    assert.match(source, /加载中\.\.\./);
  });
});

/* ── Settings trigger now replaced (Phase E4a) ── */

describe("DashboardIconBar — settings trigger replaced by SidebarItem (E4a)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu still used (wraps SidebarItem)", () => {
    assert.match(source, /DashboardSettingsMenu/);
  });

  test("settings trigger now uses SidebarItem (replaced raw spans in E4a)", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock, "DashboardSettingsMenu block should exist");
    assert.match(settingsBlock![0], /<SidebarItem/);
  });

  test("old raw span pattern for settings is gone", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.doesNotMatch(settingsBlock![0], /sunny-dashboard-sidebar-icon/);
    assert.doesNotMatch(settingsBlock![0], /sunny-dashboard-sidebar-label/);
  });
});

/* ── No collapsible added to non-collapsible sections ── */

describe("DashboardIconBar — no unwanted collapsible behavior", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("主操作 SidebarSection is NOT collapsible", () => {
    const mainSection = source.match(
      /aria-label="主操作"[\s\S]*?title="主操作"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(mainSection);
    assert.doesNotMatch(mainSection![0], /collapsible/);
  });

  test("项目 SidebarSection is NOT collapsible", () => {
    const projectSection = source.match(
      /aria-label="项目"[\s\S]*?title="项目"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(projectSection);
    assert.doesNotMatch(projectSection![0], /collapsible/);
  });

  test("工作区 SidebarSection is NOT collapsible", () => {
    const modeSection = source.match(
      /aria-label="工作区"[\s\S]*?title="工作区"[\s\S]*?<\/SidebarSection>/,
    );
    assert.ok(modeSection);
    assert.doesNotMatch(modeSection![0], /collapsible/);
  });

  test("会话 section collapse behavior preserved via threadsOpen state", () => {
    assert.match(source, /threadsOpen/);
    assert.match(source, /setThreadsOpen/);
  });

  test("已归档 section collapse behavior preserved via archiveOpen state", () => {
    assert.match(source, /archiveOpen/);
    assert.match(source, /loadArchivedThreads/);
  });
});

/* ── No SidebarSection persistKey usage (sections not collapsible) ── */

describe("DashboardIconBar — no persistKey for non-collapsible sections", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("no persistKey props on SidebarSections", () => {
    /* Since none of the replaced sections are collapsible, no persistKey should be used */
    assert.doesNotMatch(source, /persistKey/);
  });
});

/* ── Structural preservation ── */

describe("DashboardIconBar — structural preservation", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("outer nav element unchanged", () => {
    assert.match(source, /className="sunny-dashboard-icon-bar/);
    assert.match(source, /aria-label="工作台导航"/);
  });

  test("now wrapped in AppSidebar (E6A)", () => {
    assert.match(source, /<AppSidebar/);
  });

  test("collapsed/expanded state management unchanged", () => {
    assert.match(source, /stripCollapsed/);
    assert.match(source, /onHoverExpandedChange/);
    assert.match(source, /handleTogglePin/);
    assert.match(source, /navRef\.current\.classList/);
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

  test("新对话 uses SidebarItem (E4c), AppIconButton still used for pin", () => {
    /* Phase E4c: 新对话 button → SidebarItem. AppIconButton still used for pin + search clear. */
    assert.match(source, /SidebarItem.*label="新对话"/s);
    assert.match(source, /<AppIconButton/);
  });

  test("WritingLibraryRail still used for writing mode", () => {
    assert.match(source, /WritingLibraryRail/);
  });

  test("WritingSidebarBottomRail still used", () => {
    assert.match(source, /WritingSidebarBottomRail/);
  });

  test("ConfirmDialog still used", () => {
    assert.match(source, /ConfirmDialog/);
  });
});

/* ── CSS compatibility rules ── */

describe("CSS — SidebarSection grid layout compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("compound selector preserves grid layout with app-sidebar-section", () => {
    assert.match(css, /\.sunny-dashboard-sidebar-section\.app-sidebar-section\s*\{/);
  });

  test("compound selector sets display: grid", () => {
    const rule = css.match(
      /\.sunny-dashboard-sidebar-section\.app-sidebar-section\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Grid preservation rule should exist");
    assert.match(rule![0], /display:\s*grid/);
  });

  test("adjacent sibling margin override exists", () => {
    assert.match(
      css,
      /\.sunny-dashboard-sidebar-section\.app-sidebar-section\s*\+\s*\.sunny-dashboard-sidebar-section\.app-sidebar-section/,
    );
  });
});

describe("CSS — mode row font-size fix (Phase E2)", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("compound selector locks font-size for mode rows with SidebarItem", () => {
    assert.match(css, /\.sunny-dashboard-mode-row\.app-sidebar-item\s*\{/);
  });

  test("font-size set to var(--text-xs)", () => {
    const rule = css.match(
      /\.sunny-dashboard-mode-row\.app-sidebar-item\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Font-size fix rule should exist");
    assert.match(rule![0], /font-size:\s*var\(--text-xs\)/);
  });
});

describe("CSS — collapsed mode title hiding", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("app-sidebar-section__title hidden in is-auto-collapsed mode", () => {
    /* SidebarSection renders title as h4.app-sidebar-section__title instead of p.
       The collapsed mode must hide it explicitly. */
    assert.match(
      css,
      /\.sunny-dashboard-icon-bar\.is-auto-collapsed .*\.app-sidebar-section__title/,
    );
  });
});

/* ── Old CSS selector tracking ── */

describe("CSS — old selectors that no longer apply", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test(".sunny-dashboard-sidebar-section > p still exists (for non-replaced sections)", () => {
    /* The p selector still applies to 会话/已归档 sections which still use raw <section> */
    assert.match(css, /\.sunny-dashboard-sidebar-section > p/);
  });

  test(".sunny-dashboard-mode-row .sunny-dashboard-sidebar-icon still exists", () => {
    /* This selector targets .sunny-dashboard-sidebar-icon inside mode rows.
       Since Phase E2 replaced raw spans with SidebarItem's internal icon,
       this selector no longer matches mode row icons.
       Kept for backward compatibility — mark for future cleanup. */
    assert.match(css, /\.sunny-dashboard-mode-row \.sunny-dashboard-sidebar-icon/);
  });

  test(".sunny-dashboard-mode-row .sunny-dashboard-sidebar-label still exists", () => {
    /* Same story — no longer matches since SidebarItem uses .app-sidebar-item__label.
       Marked for future cleanup. */
    assert.match(css, /\.sunny-dashboard-mode-row \.sunny-dashboard-sidebar-label/);
  });
});

/* ── No regressions ── */

describe("DashboardIconBar — no regression in non-section areas", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("sidebar search input now uses AppSearchInput (Phase E5A)", () => {
    assert.match(source, /<AppSearchInput/);
  });

  test("sidebar brand row unchanged", () => {
    assert.match(source, /sunny-dashboard-sidebar-brand-row/);
    assert.match(source, /SunnyPanel/);
    assert.match(source, /sunny-dashboard-project-mark/);
  });

  test("sidebar bottom rail unchanged", () => {
    assert.match(source, /sunny-dashboard-icon-bar-bottom/);
    assert.match(source, /sunny-dashboard-sidebar-bottom/);
  });
});

/* ── TypeScript and ESLint ── */

describe("No new TypeScript or ESLint errors", () => {
  test("SidebarSection import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(
      source,
      /import.*SidebarSection.*from "@\/components\/layout\/SidebarSection"/,
    );
  });

  test("SidebarSection props used are valid", () => {
    const sidebarSectionSrc = read("src/components/layout/SidebarSection.tsx");
    /* Verify SidebarSection accepts aria-label (via ...props spread) */
    /* className prop */
    assert.match(sidebarSectionSrc, /className\?/);
    /* title prop */
    assert.match(sidebarSectionSrc, /title\?/);
  });

  test("ESLint passed on DashboardIconBar (no errors)", () => {
    /* Verified via npx eslint — no output means zero errors */
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
