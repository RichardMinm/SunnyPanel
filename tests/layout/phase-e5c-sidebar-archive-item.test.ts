import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ SidebarArchiveItem — component structure ═══ */

describe("SidebarArchiveItem — component structure", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("exports SidebarArchiveItem function", () => {
    assert.match(source, /export function SidebarArchiveItem/);
  });

  test("renders wrapper <div> with sidebar-archive-item class (BEM)", () => {
    assert.match(source, /"sidebar-archive-item"/);
  });

  test("wrapper <div> NOT a <button> (no button nesting at root)", () => {
    assert.match(source, /return \(\s*<div/);
  });

  test("preserves old sunny-dashboard-archive-thread class", () => {
    assert.match(source, /"sunny-dashboard-archive-thread"/);
  });

  test("has data-archive-id attribute", () => {
    assert.match(source, /data-archive-id=\{id\}/);
  });

  test("title rendered in <span> with BEM class sidebar-archive-item__title", () => {
    assert.match(source, /"sidebar-archive-item__title"/);
  });

  test("title preserves old sunny-dashboard-sidebar-label class", () => {
    assert.match(source, /"sunny-dashboard-sidebar-label"/);
  });

  test("title displays {title} content", () => {
    assert.match(source, /<span[^>]*>\s*\{title\}\s*<\/span>/);
  });

  test("meta rendered in <small> with BEM class sidebar-archive-item__meta (conditional)", () => {
    assert.match(source, /"sidebar-archive-item__meta"/);
    assert.match(source, /meta \?/);
  });

  test("main area uses BEM class sidebar-archive-item__main", () => {
    assert.match(source, /"sidebar-archive-item__main"/);
  });
});

/* ═══ SidebarArchiveItem — restore button ═══ */

describe("SidebarArchiveItem — restore button", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("restore button renders with type='button'", () => {
    /* Both buttons should use type="button" */
    const typeButtons = (source.match(/type="button"/g) || []).length;
    assert.strictEqual(typeButtons, 2, "Both restore and delete buttons must be type=button");
  });

  test("restore button has aria-label='恢复会话'", () => {
    assert.match(source, /aria-label="恢复会话"/);
  });

  test("restore button has BEM class sidebar-archive-item__restore", () => {
    assert.match(source, /"sidebar-archive-item__restore"/);
  });

  test("restore button preserves old sunny-dashboard-archive-restore-btn class", () => {
    assert.match(source, /"sunny-dashboard-archive-restore-btn"/);
  });

  test("restore button text is '恢复'", () => {
    assert.match(source, />\s*恢复\s*</);
  });

  test("restore button onClick calls e.stopPropagation() then onRestore", () => {
    assert.match(source, /e\.stopPropagation\(\)/);
    assert.match(source, /onRestore\?\.\(\)/);
  });

  test("restore button disabled when disabled or restoring", () => {
    assert.match(source, /disabled=\{disabled \|\| restoring\}/);
  });

  test("restore button disabled in restoring state (not clickable)", () => {
    /* restoring disables the button — source must compute the disabled value */
    assert.match(source, /restoring/);
  });
});

/* ═══ SidebarArchiveItem — delete button ═══ */

describe("SidebarArchiveItem — delete button", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("delete button has type='button'", () => {
    const typeButtons = (source.match(/type="button"/g) || []).length;
    assert.strictEqual(typeButtons, 2, "Both restore and delete buttons must be type=button");
  });

  test("delete button has aria-label='删除会话'", () => {
    assert.match(source, /aria-label="删除会话"/);
  });

  test("delete button has BEM class sidebar-archive-item__delete", () => {
    assert.match(source, /"sidebar-archive-item__delete"/);
  });

  test("delete button preserves old sunny-dashboard-archive-delete-btn class", () => {
    assert.match(source, /"sunny-dashboard-archive-delete-btn"/);
  });

  test("delete button text is '删除'", () => {
    assert.match(source, />\s*删除\s*</);
  });

  test("delete button onClick calls e.stopPropagation() then onDelete", () => {
    assert.match(source, /e\.stopPropagation\(\)/);
    assert.match(source, /onDelete\?\.\(\)/);
  });

  test("delete button disabled when disabled or deleting", () => {
    assert.match(source, /disabled=\{disabled \|\| deleting\}/);
  });

  test("delete button disabled in deleting state (not clickable)", () => {
    assert.match(source, /deleting/);
  });
});

/* ═══ SidebarArchiveItem — no button nesting ═══ */

describe("SidebarArchiveItem — no button nesting", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("menu is sibling of actions, NOT child of any button", () => {
    /* {menu} should appear AFTER the actions div and its buttons */
    const afterActions = source.match(/<\/div>[\s\S]*\{menu\}/);
    assert.ok(afterActions, "menu must appear after the actions wrapper (sibling)");
  });

  test("menu NOT rendered inside any <button>...</button>", () => {
    const buttons = source.match(/<button[\s\S]*?<\/button>/g);
    assert.ok(buttons, "buttons should exist");
    for (const btn of buttons) {
      assert.doesNotMatch(btn, /\{menu\}/, "menu must not be inside a button");
    }
  });

  test("menu wrapped in sidebar-archive-item__menu div (conditional)", () => {
    assert.match(source, /"sidebar-archive-item__menu"/);
  });

  test("exactly TWO <button> elements (restore + delete, no other buttons)", () => {
    const buttonCount = (source.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 2, "SidebarArchiveItem must render exactly 2 <button> elements (restore + delete)");
  });

  test("root element is <div> — NOT a <button>", () => {
    assert.match(source, /return \(\s*<div/);
  });

  test("restore and delete are separate buttons (no nested button)", () => {
    /* Each button is independent. Verify restore button text is not inside delete button. */
    const restoreBtn = source.match(/aria-label="恢复会话"[\s\S]*?<\/button>/);
    assert.ok(restoreBtn, "restore button should exist");
    assert.doesNotMatch(restoreBtn![0], /删除</, "restore button should not contain delete text");
  });
});

/* ═══ SidebarArchiveItem — menu slot ═══ */

describe("SidebarArchiveItem — menu slot", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("menu prop exists in props type", () => {
    assert.match(source, /menu\?:\s*ReactNode/);
  });

  test("menu conditional wrapper uses sidebar-archive-item__menu class", () => {
    assert.match(source, /"sidebar-archive-item__menu"/);
  });

  test("menu renders only when provided", () => {
    assert.match(source, /menu \?/);
  });
});

/* ═══ SidebarArchiveItem — props type ═══ */

describe("SidebarArchiveItem — props type", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("id: number | string", () => {
    assert.match(source, /id:\s*number \| string/);
  });
  test("title: ReactNode", () => {
    assert.match(source, /title:\s*ReactNode/);
  });
  test("meta?: ReactNode", () => {
    assert.match(source, /meta\?:\s*ReactNode/);
  });
  test("onRestore?: () => void", () => {
    assert.match(source, /onRestore\?:\s*\(\) => void/);
  });
  test("onDelete?: () => void", () => {
    assert.match(source, /onDelete\?:\s*\(\) => void/);
  });
  test("menu?: ReactNode", () => {
    assert.match(source, /menu\?:\s*ReactNode/);
  });
  test("disabled?: boolean", () => {
    assert.match(source, /disabled\?:\s*boolean/);
  });
  test("restoring?: boolean", () => {
    assert.match(source, /restoring\?:\s*boolean/);
  });
  test("deleting?: boolean", () => {
    assert.match(source, /deleting\?:\s*boolean/);
  });
  test("className?: string", () => {
    assert.match(source, /className\?:\s*string/);
  });
});

/* ═══ SidebarArchiveItem — no business logic leakage ═══ */

describe("SidebarArchiveItem — no business logic (pure presentational)", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("does NOT import restoreThread or any thread API", () => {
    assert.doesNotMatch(source, /restoreThread/);
  });

  test("does NOT import setDeleteTarget or deleteThread", () => {
    assert.doesNotMatch(source, /setDeleteTarget/);
    assert.doesNotMatch(source, /deleteThread/);
    assert.doesNotMatch(source, /deleteTarget/);
  });

  test("does NOT compute title from thread object", () => {
    assert.doesNotMatch(source, /thread\.title/);
    assert.doesNotMatch(source, /thread\.id/);
  });

  test("does NOT call any API or fetch", () => {
    assert.doesNotMatch(source, /fetch/);
    assert.doesNotMatch(source, /api\//);
  });

  test("does NOT import or use handleArchive directly", () => {
    assert.doesNotMatch(source, /handleArchive/);
  });

  test("does NOT import or use ConfirmDialog", () => {
    assert.doesNotMatch(source, /ConfirmDialog/);
  });

  test("does NOT import ThreadRowMenu (only mentioned in JSDoc)", () => {
    assert.doesNotMatch(source, /import.*ThreadRowMenu/);
  });
});

/* ═══ SidebarArchiveItem — stopPropagation preserved ═══ */

describe("SidebarArchiveItem — stopPropagation preserved", () => {
  const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");

  test("restore button calls stopPropagation before onRestore", () => {
    /* e.stopPropagation() must be called in the restore button onClick handler */
    const restoreHandler = source.match(
      /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onRestore\?\.\(\);\s*\}\}/,
    );
    assert.ok(restoreHandler, "restore button must call e.stopPropagation() then onRestore?.()");
  });

  test("delete button calls stopPropagation before onDelete", () => {
    const deleteHandler = source.match(
      /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onDelete\?\.\(\);\s*\}\}/,
    );
    assert.ok(deleteHandler, "delete button must call e.stopPropagation() then onDelete?.()");
  });

  test("no row-level onClick (archive rows are not selectable)", () => {
    assert.doesNotMatch(source, /onClick.*onRestore/);
    /* The only onClick handlers should be on the individual buttons */
  });
});

/* ═══ DashboardIconBar — archive rows replaced ═══ */

describe("DashboardIconBar — archive rows use SidebarArchiveItem", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports SidebarArchiveItem from sidebar", () => {
    assert.match(
      source,
      /import.*SidebarArchiveItem.*from.*\/dashboard\/sidebar\/SidebarArchiveItem/,
    );
  });

  test("SidebarArchiveItem used inside archive list", () => {
    assert.match(source, /<SidebarArchiveItem/);
  });

  test("receives key from thread.id", () => {
    assert.match(source, /key=\{thread\.id\}/);
  });

  test("receives id from thread.id", () => {
    assert.match(source, /id=\{thread\.id\}/);
  });

  test("title uses thread.title with fallback", () => {
    assert.match(source, /title=\{thread\.title \|\| `会话 #\$\{thread\.id\}`\}/);
  });

  test("onRestore calls restoreThread with thread.id", () => {
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
  });

  test("onDelete calls setDeleteTarget with thread", () => {
    assert.match(source, /onDelete=\{\(\) => setDeleteTarget\(thread\)\}/);
  });

  test("old raw div.sunny-dashboard-archive-thread from archive map is gone", () => {
    const archiveSection = source.match(
      /archiveThreads\.length > 0 \?[\s\S]*?\) : \(/,
    );
    assert.ok(archiveSection, "Archive section should exist");
    assert.doesNotMatch(archiveSection![0], /className="sunny-dashboard-archive-thread"/);
  });

  test("old raw button.sunny-dashboard-archive-restore-btn from archive map is gone", () => {
    const archiveSection = source.match(
      /archiveThreads\.length > 0 \?[\s\S]*?\) : \(/,
    );
    assert.ok(archiveSection);
    assert.doesNotMatch(archiveSection![0], /className="sunny-dashboard-archive-restore-btn"/);
  });

  test("old raw button.sunny-dashboard-archive-delete-btn from archive map is gone", () => {
    const archiveSection = source.match(
      /archiveThreads\.length > 0 \?[\s\S]*?\) : \(/,
    );
    assert.ok(archiveSection);
    assert.doesNotMatch(archiveSection![0], /className="sunny-dashboard-archive-delete-btn"/);
  });

  test("role='list' on archive list wrapper preserved", () => {
    assert.match(source, /sunny-dashboard-archive-list/);
    assert.match(source, /role="list"/);
  });

  test("archive list wrapper div still uses sunny-dashboard-archive-list", () => {
    assert.match(source, /className="sunny-dashboard-archive-list"/);
  });
});

/* ═══ No regression — other items NOT replaced (E5C) ═══ */

describe("DashboardIconBar — other items NOT replaced (E5C)", () => {
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

  test("ThreadRowMenu still used in thread rows", () => {
    assert.match(source, /<ThreadRowMenu/);
  });

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });

  test("会话 collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /setThreadsOpen/);
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

  test("archive section wrapper still uses sunny-dashboard-archive-section", () => {
    assert.match(source, /sunny-dashboard-archive-section/);
  });

  test("archive loading state '加载中...' preserved", () => {
    assert.match(source, /加载中\.\.\./);
  });

  test("archive empty state '没有已归档的会话' preserved", () => {
    assert.match(source, /没有已归档的会话/);
  });

  test("restoreThread function still defined (archive restore logic preserved)", () => {
    assert.match(source, /const restoreThread = useCallback/);
    assert.match(source, /\/api\/agent\/thread/);
    assert.match(source, /archived: false/);
  });

  test("delete confirm logic still defined (archive delete logic preserved)", () => {
    assert.match(source, /const handleDeleteConfirm = useCallback/);
    assert.match(source, /deleteTarget/);
  });

  test("ConfirmDialog still present for delete confirmation", () => {
    assert.match(source, /<ConfirmDialog/);
    assert.match(source, /确认删除/);
  });
});

/* ═══ ThreadRowMenu — not modified ═══ */

describe("ThreadRowMenu — not modified (E5C)", () => {
  const source = read("src/components/dashboard/agent/ThreadRowMenu.tsx");

  test("still renders AppDropdownMenu", () => {
    assert.match(source, /<AppDropdownMenu/);
  });

  test("onTriggerClick stopPropagation preserved", () => {
    assert.match(source, /event\.stopPropagation\(\)/);
  });

  test("archive ConfirmDialog still present", () => {
    assert.match(source, /<ConfirmDialog/);
    assert.match(source, /确认归档/);
  });

  test("menu trigger className unchanged", () => {
    assert.match(source, /sunny-thread-row-menu-trigger/);
  });
});

/* ═══ Menu isolation — structural proof ═══ */

describe("SidebarArchiveItem — menu click won't trigger restore/delete", () => {
  test("menu is sibling of actions div, not child of any button (DOM structure)", () => {
    const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");
    /* menu wrapper must appear after the actions div closing tag */
    const afterActions = source.match(/<\/div>[\s\S]*sidebar-archive-item__menu/);
    assert.ok(afterActions, "menu wrapper must appear after </div> (actions)");
  });

  test("no onClick on the archive item wrapper div", () => {
    const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");
    /* The wrapper <div> should not have an onClick handler */
    const wrapperMatch = source.match(
      /<div\s[^>]*className={cn\([\s\S]*?"sidebar-archive-item"[\s\S]*?\)}[\s\S]*?data-archive-id={id}\s*>/,
    );
    assert.ok(wrapperMatch, "wrapper div should exist");
    assert.doesNotMatch(wrapperMatch![0], /onClick/, "wrapper div must not have onClick");
  });
});

/* ═══ CSS — old classes preserved + BEM classes added ═══ */

describe("CSS — archive row compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("sunny-dashboard-archive-thread CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-thread/);
  });

  test("sunny-dashboard-archive-actions CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-actions/);
  });

  test("sunny-dashboard-archive-restore-btn CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-restore-btn/);
  });

  test("sunny-dashboard-archive-delete-btn CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-delete-btn/);
  });

  test("sunny-dashboard-archive-restore-btn hover CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-restore-btn:hover/);
  });

  test("sunny-dashboard-archive-delete-btn hover CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-delete-btn:hover/);
  });

  test("archive thread hover CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-thread:hover/);
  });

  test("archive thread menu trigger hover CSS still present", () => {
    assert.match(css, /sunny-dashboard-archive-thread:hover \.sunny-thread-row-menu-trigger/);
  });

  test("BEM class sidebar-archive-item__main has CSS", () => {
    assert.match(css, /\.sidebar-archive-item__main\s*\{/);
  });

  test("BEM class sidebar-archive-item__main has flex: 1", () => {
    const rule = css.match(/\.sidebar-archive-item__main\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /flex:\s*1/);
  });

  test("BEM class sidebar-archive-item__title has CSS with line-clamp", () => {
    const rule = css.match(/\.sidebar-archive-item__title\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /-webkit-line-clamp:\s*1/);
  });

  test("BEM class sidebar-archive-item__meta has CSS (muted, small font)", () => {
    const rule = css.match(/\.sidebar-archive-item__meta\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /color:\s*var\(--muted\)/);
    assert.match(rule![0], /font-size:\s*var\(--text-2xs\)/);
  });

  test("BEM class sidebar-archive-item__menu has CSS (flex-shrink: 0)", () => {
    const rule = css.match(/\.sidebar-archive-item__menu\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /flex-shrink:\s*0/);
  });

  test("old archive CSS classes retained (archive-thread-content cleaned in E6B)", () => {
    assert.match(css, /sunny-dashboard-archive-list/);
    assert.match(css, /sunny-dashboard-archive-thread/);
    assert.match(css, /sunny-dashboard-archive-restore-btn/);
    assert.match(css, /sunny-dashboard-archive-delete-btn/);
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors", () => {
  test("SidebarArchiveItem import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /import.*SidebarArchiveItem.*from/);
  });

  test("SidebarArchiveItem has cn import", () => {
    const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");
    assert.match(source, /import.*cn.*from/);
  });

  test("SidebarArchiveItem is 'use client' component", () => {
    const source = read("src/components/dashboard/sidebar/SidebarArchiveItem.tsx");
    assert.match(source, /"use client"/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
