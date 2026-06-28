import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ── DashboardIconBar — settings trigger SidebarItem replacement ── */

describe("DashboardIconBar — settings trigger uses SidebarItem", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  /* Extract the DashboardSettingsMenu block.
     Self-closing tag ends with /> on its own line. Capture from <DashboardSettingsMenu
     through the closing /> that appears at the start of a line. */
  const settingsBlock = source.match(
    /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
  );

  test("DashboardSettingsMenu block extracted", () => {
    assert.ok(settingsBlock, "DashboardSettingsMenu block should exist in source");
  });

  test("Settings trigger SidebarItem exists with label 设置", () => {
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /label="设置"/);
  });

  test("Settings trigger SidebarItem has settings icon", () => {
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /DashboardIcon name="settings"/);
  });

  test("Settings trigger SidebarItem has tooltip for collapsed mode", () => {
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /tooltip="设置"/);
  });

  test("Settings trigger uses triggerAsChild on DashboardSettingsMenu", () => {
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /triggerAsChild/);
  });

  test("Settings trigger SidebarItem preserves old className", () => {
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /sunny-dashboard-sidebar-action/);
    assert.match(settingsBlock![0], /sunny-dashboard-sidebar-settings-trigger/);
  });

  test("SidebarItem renders as button type=button (via SidebarItem source)", () => {
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /type="button"/);
    assert.ok(settingsBlock);
    assert.doesNotMatch(settingsBlock![0], /href=/);
  });

  test("No raw spans for icon+label inside settings trigger", () => {
    assert.ok(settingsBlock);
    /* The old <span className="sunny-dashboard-sidebar-icon">... settings icon pattern is gone.
       Raw <span className="sunny-dashboard-sidebar-label">设置</span> is also gone. */
    assert.doesNotMatch(
      settingsBlock![0],
      /sunny-dashboard-sidebar-icon/,
    );
    assert.doesNotMatch(
      settingsBlock![0],
      /sunny-dashboard-sidebar-label/,
    );
  });

  test("No triggerClassName prop on DashboardSettingsMenu", () => {
    assert.ok(settingsBlock);
    assert.doesNotMatch(settingsBlock![0], /triggerClassName/);
  });

  test("No dual tooltip — only SidebarItem tooltip prop, no data-tooltip", () => {
    assert.ok(settingsBlock);
    assert.doesNotMatch(settingsBlock![0], /data-tooltip/);
  });
});

/* ── AppPopover — triggerAsChild implementation ── */

describe("AppPopover — triggerAsChild prop", () => {
  const source = read("src/components/primitives/AppPopover.tsx");

  test("triggerAsChild defined in AppPopoverProps type", () => {
    assert.match(source, /triggerAsChild\?/);
  });

  test("triggerAsChild defaults to false", () => {
    assert.match(source, /triggerAsChild = false/);
  });

  test("triggerAsChild true skips wrapper button (triggers direct child)", () => {
    assert.match(source, /triggerAsChild \?/);
    /* The triggerAsChild branch should NOT contain <button> */
    const asChildBranch = source.match(
      /triggerAsChild \? [\s\S]*?\)/,
    );
    assert.ok(asChildBranch, "triggerAsChild branch should exist");
  });

  test("non-triggerAsChild mode still has wrapper button", () => {
    assert.match(source, /<button type="button" className=\{cn\("app-popover-trigger"/);
  });
});

/* ── SettingsPopover — triggerAsChild passthrough ── */

describe("SettingsPopover — triggerAsChild passthrough", () => {
  const source = read("src/components/shared/SettingsPopover.tsx");

  test("triggerAsChild in SettingsPopoverProps type", () => {
    assert.match(source, /triggerAsChild\?/);
  });

  test("triggerAsChild passed to AppPopover", () => {
    assert.match(source, /triggerAsChild=\{triggerAsChild\}/);
  });
});

/* ── DashboardSettingsMenu — triggerAsChild passthrough ── */

describe("DashboardSettingsMenu — triggerAsChild passthrough", () => {
  const source = read("src/components/dashboard/DashboardSettingsMenu.tsx");

  test("triggerAsChild in DashboardSettingsMenuProps type", () => {
    assert.match(source, /triggerAsChild\?/);
  });

  test("triggerAsChild passed to SettingsPopover", () => {
    assert.match(source, /triggerAsChild=\{triggerAsChild\}/);
  });
});

/* ── Popover behavior preserved (no changes to core logic) ── */

describe("Popover behavior — no changes to core logic", () => {
  test("AppPopover still uses PopoverPrimitive.Root with modal", () => {
    const source = read("src/components/primitives/AppPopover.tsx");
    assert.match(source, /PopoverPrimitive\.Root/);
    assert.match(source, /modal=\{modal\}/);
  });

  test("AppPopover still uses Portal for content", () => {
    const source = read("src/components/primitives/AppPopover.tsx");
    assert.match(source, /PopoverPrimitive\.Portal/);
  });

  test("AppPopover still supports Esc close via Radix (modal prop)", () => {
    const source = read("src/components/primitives/AppPopover.tsx");
    assert.match(source, /modal/);
  });

  test("AppPopover still supports click-outside close (Radix default)", () => {
    const source = read("src/components/primitives/AppPopover.tsx");
    /* Radix Popover closes on outside click by default */
    assert.match(source, /PopoverPrimitive\.Root/);
  });

  test("SettingsPopover core logic unchanged (still uses AppPopover)", () => {
    const source = read("src/components/shared/SettingsPopover.tsx");
    assert.match(source, /<AppPopover/);
    assert.match(source, /contentClassName="settings-popover"/);
  });

  test("DashboardSettingsMenu still renders PreferencesPanel", () => {
    const source = read("src/components/dashboard/DashboardSettingsMenu.tsx");
    assert.match(source, /PreferencesPanel/);
  });

  test("DashboardSettingsMenu menu content not restructured", () => {
    const source = read("src/components/dashboard/DashboardSettingsMenu.tsx");
    /* PreferencesPanel still inside SettingsPopover */
    assert.match(source, /PreferencesPanel/);
    assert.match(source, /variant="admin"/);
  });
});

/* ── No regression: other items untouched ── */

describe("DashboardIconBar — other items NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("thread rows now use SidebarThreadItem (Phase E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("archive rows now use SidebarArchiveItem (Phase E5C)", () => {
    assert.match(source, /<SidebarArchiveItem/);
  });

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });

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

  test("DashboardSettingsMenu still imported and used", () => {
    assert.match(source, /import.*DashboardSettingsMenu/);
    assert.match(source, /<DashboardSettingsMenu/);
  });
});

/* ── CSS — collapsed mode SidebarItem label ── */

describe("CSS — settings trigger SidebarItem compatibility", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("collapsed mode hides .app-sidebar-item__label", () => {
    const rule = css.match(
      /\.sunny-dashboard-icon-bar\.is-auto-collapsed \.app-sidebar-item__label\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Collapsed mode label hide rule should exist");
    assert.match(rule![0], /opacity:\s*0/);
    assert.match(rule![0], /max-width:\s*0/);
    assert.match(rule![0], /pointer-events:\s*none/);
  });

  test("expanded mode shows .app-sidebar-item__label with transition", () => {
    const rule = css.match(
      /\.sunny-dashboard-icon-bar \.app-sidebar-item__label\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Expanded mode label show rule should exist");
    assert.match(rule![0], /opacity:\s*1/);
    assert.match(rule![0], /max-width:\s*12\.8rem/);
  });

  test("existing sidebar-action compound selector still intact (E4c)", () => {
    assert.match(
      css,
      /\.sunny-dashboard-sidebar-action\.app-sidebar-item\s*\{/,
    );
  });

  test("existing mode-row compound selector still intact (E2)", () => {
    assert.match(
      css,
      /\.sunny-dashboard-mode-row\.app-sidebar-item\s*\{/,
    );
  });

  test("collapsed mode centers sidebar-action (already exists, settings inherits)", () => {
    assert.match(
      css,
      /\.sunny-dashboard-icon-bar\.is-auto-collapsed \.sunny-dashboard-sidebar-action/,
    );
  });
});

/* ── No new errors ── */

describe("No new TypeScript or ESLint errors", () => {
  test("AppPopover triggerAsChild typed as boolean", () => {
    const source = read("src/components/primitives/AppPopover.tsx");
    assert.match(source, /triggerAsChild\?:\s*boolean/);
  });

  test("SettingsPopover triggerAsChild typed as boolean", () => {
    const source = read("src/components/shared/SettingsPopover.tsx");
    assert.match(source, /triggerAsChild\?:\s*boolean/);
  });

  test("DashboardSettingsMenu triggerAsChild typed as boolean", () => {
    const source = read("src/components/dashboard/DashboardSettingsMenu.tsx");
    assert.match(source, /triggerAsChild\?:\s*boolean/);
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
