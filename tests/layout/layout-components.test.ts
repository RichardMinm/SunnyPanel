import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("AppSidebar", () => {
  const source = read("src/components/layout/AppSidebar.tsx");

  test("exports AppSidebar function", () => {
    assert.match(source, /export function AppSidebar/);
  });

  test("renders as nav element", () => {
    assert.match(source, /<nav/);
  });

  test("has top / children / bottom slots", () => {
    assert.match(source, /top/);
    assert.match(source, /bottom/);
    assert.match(source, /children/);
    assert.match(source, /app-sidebar__top/);
    assert.match(source, /app-sidebar__body/);
    assert.match(source, /app-sidebar__bottom/);
  });

  test("collapsed state adds app-sidebar--collapsed class", () => {
    assert.match(source, /collapsed && "app-sidebar--collapsed"/);
  });

  test("iconOnly state adds app-sidebar--icon-only class", () => {
    assert.match(source, /iconOnly && "app-sidebar--icon-only"/);
  });

  test("accepts aria-label via spread props", () => {
    assert.match(source, /\{\.\.\.props\}/);
  });

  test("CSS uses --sidebar-width and --sidebar-collapsed-width tokens", () => {
    const css = read("src/app/styles/sunny-layout.css");
    assert.match(css, /var\(--sidebar-width\)/);
    assert.match(css, /var\(--sidebar-collapsed-width\)/);
  });

  test("CSS uses --bg-panel for background", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const sidebarBlock = css.match(/\.app-sidebar\s*\{[^}]*\}/s);
    assert.ok(sidebarBlock);
    assert.match(sidebarBlock![0], /var\(--bg-panel\)/);
  });
});

describe("SidebarSection", () => {
  const source = read("src/components/layout/SidebarSection.tsx");

  test("exports SidebarSection function", () => {
    assert.match(source, /export function SidebarSection/);
  });

  test("has title, description, actions props", () => {
    assert.match(source, /title/);
    assert.match(source, /description/);
    assert.match(source, /actions/);
    assert.match(source, /app-sidebar-section__title/);
    assert.match(source, /app-sidebar-section__actions/);
  });

  test("supports collapsible with persistKey", () => {
    assert.match(source, /collapsible/);
    assert.match(source, /persistKey/);
    assert.match(source, /CollapsiblePrimitive/);
  });

  test("persistKey uses sunny.sidebar.section. prefix", () => {
    assert.match(source, /sunny\.sidebar\.section\./);
  });

  test("avoids SSR localStorage access", () => {
    /* The initializer uses typeof window check */
    assert.match(source, /typeof window !== "undefined"/);
  });

  test("supports empty state via empty prop", () => {
    assert.match(source, /empty/);
    assert.match(source, /app-sidebar-section__empty/);
  });

  test("title uses muted 12px via CSS token", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const titleBlock = css.match(/\.app-sidebar-section__title\s*\{[^}]*\}/s);
    assert.ok(titleBlock);
    assert.match(titleBlock![0], /var\(--text-muted\)/);
  });
});

describe("SidebarItem", () => {
  const source = read("src/components/layout/SidebarItem.tsx");

  test("exports SidebarItem with forwardRef", () => {
    assert.match(source, /export const SidebarItem = forwardRef/);
  });

  test("supports icon and label props", () => {
    assert.match(source, /icon/);
    assert.match(source, /label/);
    assert.match(source, /app-sidebar-item__icon/);
    assert.match(source, /app-sidebar-item__label/);
  });

  test("supports href for link rendering", () => {
    assert.match(source, /href/);
    assert.match(source, /import Link from "next\/link"/);
  });

  test("active state adds app-sidebar-item--active class", () => {
    assert.match(source, /active && "app-sidebar-item--active"/);
  });

  test("disabled state adds app-sidebar-item--disabled and prevents click", () => {
    assert.match(source, /disabled && "app-sidebar-item--disabled"/);
    /* onClick should prevent default when disabled with href */
    assert.match(source, /e\.preventDefault/);
  });

  test("supports badge / count", () => {
    assert.match(source, /badge/);
    assert.match(source, /app-sidebar-item__badge/);
  });

  test("badge supports accent tone", () => {
    assert.match(source, /badgeTone/);
    assert.match(source, /app-sidebar-item__badge--accent/);
  });

  test("supports tooltip via AppTooltip", () => {
    assert.match(source, /tooltip/);
    assert.match(source, /AppTooltip/);
  });

  test("supports nested level via data-nested attribute", () => {
    assert.match(source, /nested/);
    assert.match(source, /data-nested/);
  });

  test("renders as button with type='button' when no href", () => {
    assert.match(source, /type="button"/);
  });

  test("icon size 16px-18px via CSS", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const iconBlock = css.match(/\.app-sidebar-item__icon\s*\{[^}]*\}/s);
    assert.ok(iconBlock);
    assert.match(iconBlock![0], /1\.125rem/);
  });

  test("item min-height 32px-40px range via CSS", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const itemBlock = css.match(/\.app-sidebar-item\s*\{[^}]*\}/s);
    assert.ok(itemBlock);
    assert.match(itemBlock![0], /min-height:\s*2\.25rem/);
  });

  test("hover uses light background", () => {
    const css = read("src/app/styles/sunny-layout.css");
    assert.match(css, /\.app-sidebar-item:hover/);
    assert.match(css, /color-mix.*accent.*transparent/);
  });

  test("focus-visible uses accent ring", () => {
    const css = read("src/app/styles/sunny-layout.css");
    assert.match(css, /\.app-sidebar-item:focus-visible/);
    assert.match(css, /var\(--accent-soft\)/);
  });
});

describe("InspectorPanel", () => {
  const source = read("src/components/layout/InspectorPanel.tsx");

  test("exports InspectorPanel function", () => {
    assert.match(source, /export function InspectorPanel/);
  });

  test("renders as aside element by default", () => {
    assert.match(source, /<aside/);
  });

  test("renders as div in bare mode", () => {
    /* bare mode should use <div> instead of <aside> */
    assert.match(source, /if \(bare\)/);
    /* Should render a <div> in the bare branch */
    const bareBranch = source.match(/if \(bare\) \{[\s\S]*?return/);
    assert.ok(bareBranch, "bare branch should exist");
  });

  test("bare prop defined in InspectorPanelProps", () => {
    assert.match(source, /bare\?/);
  });

  test("bare mode omits app-inspector-panel class", () => {
    /* Bare branch uses cn(className) — no hardcoded app-inspector-panel.
       Non-bare branch uses cn("app-inspector-panel", ...). */
    assert.match(source, /cn\(className\)/);
    assert.match(source, /"app-inspector-panel"/); /* exists in non-bare branch */
  });

  test("supports title, subtitle, actions props", () => {
    assert.match(source, /title/);
    assert.match(source, /subtitle/);
    assert.match(source, /actions/);
    assert.match(source, /app-inspector-panel__title/);
    assert.match(source, /app-inspector-panel__subtitle/);
    assert.match(source, /app-inspector-panel__head-actions/);
  });

  test("supports tabs slot", () => {
    assert.match(source, /tabs/);
    assert.match(source, /app-inspector-panel__tabs/);
  });

  test("supports footer slot", () => {
    assert.match(source, /footer/);
    assert.match(source, /app-inspector-panel__footer/);
  });

  test("supports collapsed state", () => {
    assert.match(source, /collapsed/);
    assert.match(source, /app-inspector-panel--collapsed/);
  });

  test("supports width prop via inline style", () => {
    assert.match(source, /width/);
    assert.match(source, /style=/);
  });

  test("CSS default width in 320px-380px range", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const panelBlock = css.match(/\.app-inspector-panel\s*\{[^}]*\}/s);
    assert.ok(panelBlock);
    assert.match(panelBlock![0], /width:\s*340px/);
  });

  test("collapsed state hides panel via CSS", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const collapsedBlock = css.match(/\.app-inspector-panel--collapsed\s*\{[^}]*\}/s);
    assert.ok(collapsedBlock);
    assert.match(collapsedBlock![0], /width:\s*0/);
  });

  test("CSS uses design tokens not hardcoded colors", () => {
    const css = read("src/app/styles/sunny-layout.css");
    const panelBlock = css.match(/\.app-inspector-panel\s*\{[^}]*\}/s);
    assert.ok(panelBlock);
    /* Should use tokens, not hex */
    assert.doesNotMatch(panelBlock![0], /#[0-9a-fA-F]{3,8}/);
  });
});

describe("Layout Index", () => {
  const source = read("src/components/layout/index.ts");

  test("exports AppSidebar", () => assert.match(source, /AppSidebar/));
  test("exports SidebarSection", () => assert.match(source, /SidebarSection/));
  test("exports SidebarItem", () => assert.match(source, /SidebarItem/));
  test("exports InspectorPanel", () => assert.match(source, /InspectorPanel/));
});

describe("Design Tokens", () => {
  const tokens = read("src/app/styles/sunny-tokens.css");

  test("--sidebar-width is defined", () => {
    assert.match(tokens, /--sidebar-width:\s*15rem/);
  });

  test("--sidebar-collapsed-width is defined", () => {
    assert.match(tokens, /--sidebar-collapsed-width:\s*3\.5rem/);
  });
});

describe("CSS Bundle", () => {
  test("sunny-layout.css is imported in sunny-core.css", () => {
    const core = read("src/app/styles/sunny-core.css");
    assert.match(core, /sunny-layout\.css/);
  });
});

describe("Dark mode safety", () => {
  test("layout CSS does not use hardcoded hex as primary colors", () => {
    const css = read("src/app/styles/sunny-layout.css");
    /* Count hex color occurrences in property values */
    const hexInValues = css.match(/:\s*#[0-9a-fA-F]{3,8}/g);
    /* Zero hardcoded hex colors expected */
    assert.strictEqual(hexInValues, null, "No hardcoded hex colors should be used");
  });
});
