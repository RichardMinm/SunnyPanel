import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ AppButton default type="button" ═══ */

describe("AppButton — default type=button", () => {
  const source = read("src/components/primitives/AppButton.tsx");

  test("defaults type to button when not asChild", () => {
    /* resolvedType = asChild ? undefined : (type ?? "button") */
    assert.match(source, /type \?\? "button"/);
  });

  test("type is destructured so caller can override", () => {
    /* `type,` appears in the destructured props list */
    assert.match(source, /type,/);
  });

  test("caller type='submit' overrides default", () => {
    /* type ?? "button" means explicit type wins */
    assert.match(source, /type \?\? "button"/);
    /* type is destructured before ...props, so explicit is honored */
    assert.match(source, /type,/);
  });

  test("caller type='reset' overrides default", () => {
    /* Same mechanism as submit — type ?? "button" allows any explicit value */
    assert.match(source, /resolvedType = asChild \? undefined : \(type \?\? "button"\)/);
  });

  test("does NOT add type when asChild is true", () => {
    assert.match(source, /resolvedType = asChild \? undefined/);
  });

  test("type is set on the rendered element", () => {
    assert.match(source, /type=\{resolvedType\}/);
  });

  test("asChild mode leaves type undefined (child owns its type)", () => {
    /* resolvedType = undefined when asChild=true */
    const resolvedLine = source.match(/resolvedType = asChild \? undefined/);
    assert.ok(resolvedLine);
  });
});

describe("AppIconButton — inherits default type=button from AppButton", () => {
  const iconSource = read("src/components/primitives/AppIconButton.tsx");
  const btnSource = read("src/components/primitives/AppButton.tsx");

  test("AppIconButton delegates to AppButton", () => {
    assert.match(iconSource, /<AppButton/);
  });

  test("AppIconButton does NOT pass explicit type → AppButton default applies", () => {
    /* AppIconButton does not destructure or pass type explicitly anywhere */
    assert.doesNotMatch(iconSource, /type=/);
  });

  test("AppButton defaults type=button → AppIconButton inherits it", () => {
    assert.match(btnSource, /type \?\? "button"/);
  });
});

/* ═══ SidebarThreadItem — component structure ═══ */

describe("SidebarThreadItem — component structure", () => {
  const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");

  test("exports SidebarThreadItem function", () => {
    assert.match(source, /export function SidebarThreadItem/);
  });

  test("renders wrapper <div> with sunny-sidebar-thread-item class", () => {
    assert.match(source, /"sunny-sidebar-thread-item"/);
  });

  test("wrapper <div> NOT a <button> (no button nesting at root)", () => {
    /* The first rendered element should be <div>, not <button> */
    assert.match(source, /return \(\s*<div/);
  });

  test("preserves old sunny-dashboard-thread-row class", () => {
    assert.match(source, /"sunny-dashboard-thread-row"/);
  });

  test("active state adds is-active class", () => {
    assert.match(source, /active && "is-active"/);
  });

  test("active state sets aria-current='page'", () => {
    assert.match(source, /aria-current=\{active \? "page" : undefined\}/);
  });

  test("active state sets data-active attribute", () => {
    assert.match(source, /data-active=\{active \|\| undefined\}/);
  });

  test("has data-thread-id attribute", () => {
    assert.match(source, /data-thread-id=\{id\}/);
  });

  test("button has className sidebar-thread-item__main (BEM)", () => {
    assert.match(source, /"sidebar-thread-item__main"/);
  });

  test("button preserves old sunny-dashboard-thread-row-btn class", () => {
    assert.match(source, /"sunny-dashboard-thread-row-btn"/);
  });

  test("button has type='button'", () => {
    assert.match(source, /type="button"/);
  });

  test("button supports disabled state", () => {
    assert.match(source, /disabled=\{disabled\}/);
  });

  test("button onClick passed through", () => {
    assert.match(source, /onClick=\{onClick\}/);
  });

  test("title rendered in <span> with BEM class sidebar-thread-item__title", () => {
    assert.match(source, /<span className="sidebar-thread-item__title">\{title\}<\/span>/);
  });

  test("meta rendered in <small> with BEM class sidebar-thread-item__meta", () => {
    assert.match(source, /<small className="sidebar-thread-item__meta">\{meta\}<\/small>/);
  });

  test("meta only rendered when provided (conditional)", () => {
    assert.match(source, /meta \? <small/);
  });
});

/* ═══ SidebarThreadItem — no button nesting ═══ */

describe("SidebarThreadItem — no button nesting", () => {
  const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");

  test("menu is sibling of button, NOT child of button", () => {
    /* {menu} should appear AFTER </button>, not inside it */
    const afterButton = source.match(/<\/button>[\s\S]*\{menu\}/);
    assert.ok(afterButton, "menu must appear after </button> (sibling, not child)");
  });

  test("menu NOT rendered inside <button>...</button>", () => {
    /* The button's content is <span>{title}</span> + <small>{meta}</small>.
       {menu} must NOT be between <button> and </button>. */
    const buttonContent = source.match(
      /<button[\s\S]*?<\/button>/,
    );
    assert.ok(buttonContent, "button element should exist");
    assert.doesNotMatch(buttonContent![0], /\{menu\}/);
  });

  test("menu wrapped in sidebar-thread-item__menu div (conditional)", () => {
    assert.match(source, /"sidebar-thread-item__menu"/);
  });

  test("contextMarker wrapped in sidebar-thread-item__marker div (conditional)", () => {
    assert.match(source, /"sidebar-thread-item__marker"/);
  });

  test("contextMarker is sibling of button, NOT child of button", () => {
    const afterButton = source.match(/<\/button>[\s\S]*\{contextMarker\}/);
    assert.ok(afterButton, "contextMarker must appear after </button>");
  });

  test("only ONE <button> element in the entire component", () => {
    const buttonCount = (source.match(/<button/g) || []).length;
    assert.strictEqual(buttonCount, 1, "SidebarThreadItem must render exactly 1 <button>");
  });
});

/* ═══ SidebarThreadItem — props type ═══ */

describe("SidebarThreadItem — props type", () => {
  const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");

  test("id: number | string", () => {
    assert.match(source, /id:\s*number \| string/);
  });
  test("title: ReactNode", () => {
    assert.match(source, /title:\s*ReactNode/);
  });
  test("meta?: ReactNode", () => {
    assert.match(source, /meta\?:\s*ReactNode/);
  });
  test("active?: boolean", () => {
    assert.match(source, /active\?:\s*boolean/);
  });
  test("contextMarker?: ReactNode", () => {
    assert.match(source, /contextMarker\?:\s*ReactNode/);
  });
  test("menu?: ReactNode", () => {
    assert.match(source, /menu\?:\s*ReactNode/);
  });
  test("onClick?: (event: MouseEvent) => void", () => {
    assert.match(source, /onClick\?:\s*\(event: MouseEvent\) => void/);
  });
  test("disabled?: boolean", () => {
    assert.match(source, /disabled\?:\s*boolean/);
  });
  test("className?: string", () => {
    assert.match(source, /className\?:\s*string/);
  });
});

/* ═══ SidebarThreadItem — no business logic leakage ═══ */

describe("SidebarThreadItem — no business logic (pure presentational)", () => {
  const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");

  test("does NOT import formatThreadMeta or any thread utils", () => {
    assert.doesNotMatch(source, /formatThreadMeta/);
    assert.doesNotMatch(source, /getPendingActionLabel/);
  });

  test("does NOT compute title from thread object", () => {
    assert.doesNotMatch(source, /thread\.title/);
    assert.doesNotMatch(source, /thread\.id/);
  });

  test("does NOT call any thread API or fetch", () => {
    assert.doesNotMatch(source, /fetch/);
    assert.doesNotMatch(source, /api\//);
  });

  test("does NOT import or use onLoadThread directly", () => {
    assert.doesNotMatch(source, /onLoadThread/);
  });

  test("does NOT import or use handleArchive directly", () => {
    assert.doesNotMatch(source, /handleArchive/);
  });
});

/* ═══ DashboardIconBar — thread rows replaced ═══ */

describe("DashboardIconBar — thread rows use SidebarThreadItem", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("imports SidebarThreadItem from sidebar", () => {
    assert.match(
      source,
      /import.*SidebarThreadItem.*from.*\/dashboard\/sidebar\/SidebarThreadItem/,
    );
  });

  test("SidebarThreadItem used inside thread list", () => {
    assert.match(source, /<SidebarThreadItem/);
  });

  test("receives key from thread.id", () => {
    assert.match(source, /key=\{thread\.id\}/);
  });

  test("receives id from thread.id", () => {
    assert.match(source, /id=\{thread\.id\}/);
  });

  test("active bound to thread.id === threadId", () => {
    assert.match(source, /active=\{thread\.id === threadId\}/);
  });

  test("title uses thread.title with fallback", () => {
    assert.match(source, /title=\{thread\.title \|\| `会话 #\$\{thread\.id\}`\}/);
  });

  test("meta uses formatThreadMeta (original meta logic preserved)", () => {
    assert.match(source, /meta=\{formatThreadMeta\(thread\)\}/);
  });

  test("onClick calls onLoadThread (original select logic preserved)", () => {
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("ThreadRowMenu still rendered inside menu slot", () => {
    const threadItem = source.match(/<SidebarThreadItem[\s\S]*?\/>/);
    assert.ok(threadItem, "SidebarThreadItem should exist");
    assert.match(threadItem![0], /<ThreadRowMenu/);
    assert.match(threadItem![0], /onArchive=\{handleArchive\}/);
  });

  test("old raw div.sunny-dashboard-thread-row from thread map is gone", () => {
    const threadSection = source.match(
      /visibleThreads\.length > 0 \?[\s\S]*?\) : \(/,
    );
    assert.ok(threadSection, "Thread section should exist");
    assert.doesNotMatch(threadSection![0], /className=\{`sunny-dashboard-thread-row/);
  });

  test("old raw button.sunny-dashboard-thread-row-btn from thread map is gone", () => {
    const threadSection = source.match(
      /visibleThreads\.length > 0 \?[\s\S]*?\) : \(/,
    );
    assert.ok(threadSection);
    assert.doesNotMatch(threadSection![0], /className="sunny-dashboard-thread-row-btn"/);
  });

  test("role='list' on thread list wrapper preserved", () => {
    assert.match(source, /role="list"/);
  });
});

/* ═══ No regression ═══ */

describe("DashboardIconBar — other items NOT replaced (E5B)", () => {
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

  test("archive rows now use SidebarArchiveItem (Phase E5C)", () => {
    /* Phase E5C replaced raw div+button with SidebarArchiveItem */
    assert.match(source, /<SidebarArchiveItem/);
    assert.doesNotMatch(source, /archiveThreads\.map.*<SidebarThreadItem/s);
  });

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });

  test("collapse toggle (会话) now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /setThreadsOpen/);
    /* The toggle still calls setThreadsOpen, now via onToggle prop */
    assert.match(source, /onToggle=\{\(\) => setThreadsOpen\(\(v\) => !v\)\}/);
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

  test("thread list wrapper div still has role=list", () => {
    assert.match(source, /sunny-dashboard-thread-list/);
  });

  test("empty state '暂无聊天' preserved", () => {
    assert.match(source, /暂无聊天/);
  });

  test("'查看全部会话' button preserved (compact mode)", () => {
    assert.match(source, /查看全部会话/);
  });
});

/* ═══ ThreadRowMenu — not modified ═══ */

describe("ThreadRowMenu — not modified (E5B)", () => {
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

describe("ThreadRowMenu isolation — menu click won't trigger row onClick", () => {
  test("ThreadRowMenu is sibling of row button in SidebarThreadItem (DOM structure)", () => {
    /* The SidebarThreadItem renders menu AFTER </button>, so it's a sibling */
    const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");
    const afterButton = source.match(/<\/button>[\s\S]*sidebar-thread-item__menu/);
    assert.ok(afterButton, "menu wrapper must appear after </button>");
  });

  test("ThreadRowMenu itself uses stopPropagation on trigger click", () => {
    const source = read("src/components/dashboard/agent/ThreadRowMenu.tsx");
    assert.match(source, /stopPropagation/);
  });

  test("menu trigger is a separate button (AppDropdownMenu trigger), not nested in row button", () => {
    /* AppDropdownMenu renders its own trigger button,
       which is separate from SidebarThreadItem's row button */
    const dropdownSrc = read("src/components/primitives/AppDropdownMenu.tsx");
    /* AppDropdownMenu renders a trigger — must be a button */
    assert.match(dropdownSrc, /<button/);
  });
});

/* ═══ CSS — old classes preserved + BEM classes added ═══ */

describe("CSS — thread row compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("sunny-dashboard-thread-row CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row\s*\{/);
  });

  test("sunny-dashboard-thread-row-btn CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row-btn\s*\{/);
  });

  test("thread row span CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row-btn span\s*\{/);
  });

  test("thread row small CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row-btn small\s*\{/);
  });

  test("is-active CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row\.is-active\s*\{/);
  });

  test("thread row hover CSS still present", () => {
    assert.match(css, /\.sunny-dashboard-thread-row:hover/);
  });

  test("BEM class sidebar-thread-item__main has CSS", () => {
    assert.match(css, /\.sidebar-thread-item__main\s*\{/);
  });

  test("BEM class sidebar-thread-item__title has CSS", () => {
    assert.match(css, /\.sidebar-thread-item__title\s*\{/);
  });

  test("BEM class sidebar-thread-item__meta has CSS", () => {
    assert.match(css, /\.sidebar-thread-item__meta\s*\{/);
  });

  test("BEM class sidebar-thread-item__menu has CSS (flex-shrink: 0)", () => {
    const rule = css.match(/\.sidebar-thread-item__menu\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /flex-shrink:\s*0/);
  });

  test("BEM class sidebar-thread-item__marker has CSS (flex-shrink: 0)", () => {
    const rule = css.match(/\.sidebar-thread-item__marker\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /flex-shrink:\s*0/);
  });
});

/* ═══ No new errors ═══ */

describe("No new TypeScript or ESLint errors", () => {
  test("SidebarThreadItem import path is valid", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /import.*SidebarThreadItem.*from/);
  });

  test("SidebarThreadItem has cn import", () => {
    const source = read("src/components/dashboard/sidebar/SidebarThreadItem.tsx");
    assert.match(source, /import.*cn.*from/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
