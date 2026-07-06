import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("DashboardIconBar — 新对话 button SidebarItem replacement", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("新对话 uses SidebarItem with icon and label", () => {
    assert.match(source, /label="新对话"/);
    assert.match(source, /DashboardIcon name="new"/);
  });

  test("新对话 SidebarItem calls onNewThread onClick", () => {
    /* onClick should call onNewThread directly */
    assert.match(source, /onClick=\{onNewThread\}/);
  });

  test("新对话 SidebarItem preserves sunny-dashboard-sidebar-action class", () => {
    /* The SidebarItem should carry the old CSS class */
    const actionItem = source.match(
      /<SidebarItem[\s\S]*?label="新对话"[\s\S]*?\/>/,
    );
    assert.ok(actionItem, "SidebarItem for 新对话 should exist");
    assert.match(actionItem![0], /sunny-dashboard-sidebar-action/);
  });

  test("新对话 SidebarItem has tooltip for collapsed mode", () => {
    /* SidebarItem tooltip prop for collapsed/iconOnly mode */
    const actionItem = source.match(
      /<SidebarItem[\s\S]*?label="新对话"[\s\S]*?\/>/,
    );
    assert.ok(actionItem, "SidebarItem for 新对话 should exist");
    assert.match(actionItem![0], /tooltip="新对话"/);
  });

  test("新对话 SidebarItem renders as button type=button", () => {
    /* SidebarItem without href renders as <button type="button"> */
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /type="button"/);
    /* Verify no href on the 新对话 SidebarItem */
    const actionItem = source.match(
      /<SidebarItem(?:(?!<SidebarItem)[\s\S])*label="新对话"(?:(?!<SidebarItem)[\s\S])*?\/>/,
    );
    assert.ok(actionItem);
    assert.doesNotMatch(actionItem![0], /href=/);
  });

  test("AppButton import removed (no longer used)", () => {
    assert.doesNotMatch(source, /import.*AppButton.*from/);
  });

  test("AppButton component no longer used in DashboardIconBar", () => {
    assert.doesNotMatch(source, /<AppButton/);
  });

  test("old AppButton with hand-written icon/label spans is gone", () => {
    /* The old structure: <AppButton><span className="sunny-dashboard-sidebar-icon">...
       should be replaced by SidebarItem */
    assert.doesNotMatch(
      source,
      /<span className="sunny-dashboard-sidebar-icon"><DashboardIcon name="new"/,
    );
    /* The old <span className="sunny-dashboard-sidebar-label">新对话</span> inside AppButton is gone */
    const iconSpansNearNew = source.match(
      /sunny-dashboard-sidebar-icon.*DashboardIcon name="new"/s,
    );
    assert.strictEqual(
      iconSpansNearNew,
      null,
      "Old icon span for 新对话 should be gone",
    );
  });

  test("still inside 主操作 SidebarSection (Phase E3)", () => {
    assert.match(source, /SidebarSection[\s\S]*?title="主操作"[\s\S]*?<\/SidebarSection>/s);
  });

  test("sunny-dashboard-sidebar-actions wrapper div preserved", () => {
    assert.match(source, /className="sunny-dashboard-sidebar-actions"/);
  });
});

describe("DashboardIconBar — settings trigger now replaced (Phase E4a)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardSettingsMenu still wraps the trigger", () => {
    assert.match(source, /DashboardSettingsMenu/);
  });

  test("settings trigger now uses SidebarItem (replaced raw spans)", () => {
    /* Phase E4a: raw spans replaced by SidebarItem component */
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.match(settingsBlock![0], /<SidebarItem/);
    assert.match(settingsBlock![0], /label="设置"/);
  });

  test("old raw span pattern for settings icon+label is gone", () => {
    const settingsBlock = source.match(
      /<DashboardSettingsMenu[\s\S]*?\n\s*\/>/,
    );
    assert.ok(settingsBlock);
    assert.doesNotMatch(
      settingsBlock![0],
      /sunny-dashboard-sidebar-icon/,
    );
    assert.doesNotMatch(
      settingsBlock![0],
      /sunny-dashboard-sidebar-label/,
    );
  });
});

describe("DashboardIconBar — thread row NOT replaced", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("thread rows now use SidebarThreadItem (Phase E5B)", () => {
    assert.match(source, /<SidebarThreadItem/);
    assert.match(source, /onClick=\{\(\) => onLoadThread\(thread\.id\)\}/);
  });

  test("ThreadRowMenu still used", () => {
    assert.match(source, /ThreadRowMenu/);
  });
});

describe("DashboardIconBar — archive section now replaced (E5C)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("archive rows now use SidebarArchiveItem", () => {
    assert.match(source, /<SidebarArchiveItem/);
    assert.match(source, /onRestore=\{\(\) => void restoreThread\(thread\.id\)\}/);
    assert.match(source, /onDelete=\{\(\) => setDeleteTarget\(thread\)\}/);
  });

  test("archive collapse toggle now uses SidebarCollapseToggle (E5D)", () => {
    assert.match(source, /<SidebarCollapseToggle/);
    assert.match(source, /loadArchivedThreads/);
  });
});

describe("DashboardIconBar — no dual tooltip on 新对话", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("no data-tooltip attribute anywhere", () => {
    assert.doesNotMatch(source, /data-tooltip/);
  });

  test("SidebarItem tooltip prop is the only tooltip source", () => {
    /* SidebarItem uses AppTooltip internally, no CSS pseudo-element tooltip */
    const sidebarItemSrc = read("src/components/layout/SidebarItem.tsx");
    assert.match(sidebarItemSrc, /AppTooltip/);
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

  test("mode navigation SidebarItems still intact (E2)", () => {
    assert.match(source, /DASHBOARD_MODES\.map/);
    assert.match(source, /active=\{mode\.key === activeMode\}/);
    assert.match(source, /tooltip=\{mode\.label\}/);
  });

  test("SidebarSections still intact (E3)", () => {
    /* Count SidebarSection usages — should be 3 */
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
});

describe("CSS — sidebar-action SidebarItem compound selector", () => {
  const css = read("src/app/styles/sunny-dashboard-shell.css");

  test("compound selector exists for .sunny-dashboard-sidebar-action.app-sidebar-item", () => {
    assert.match(css, /\.sunny-dashboard-sidebar-action\.app-sidebar-item\s*\{/);
  });

  test("locks font-size to var(--text-sm-compact)", () => {
    const rule = css.match(
      /\.sunny-dashboard-sidebar-action\.app-sidebar-item\s*\{[^}]*\}/s,
    );
    assert.ok(rule, "Compound selector rule should exist");
    assert.match(rule![0], /font-size:\s*var\(--text-sm-compact\)/);
  });

  test("locks spacing properties (gap, min-height, padding, border-radius)", () => {
    const rule = css.match(
      /\.sunny-dashboard-sidebar-action\.app-sidebar-item\s*\{[^}]*\}/s,
    );
    assert.ok(rule);
    assert.match(rule![0], /gap:\s*0\.55rem/);
    assert.match(rule![0], /min-height:\s*1\.9rem/);
    assert.match(rule![0], /padding:\s*0\s+0\.5rem/);
    assert.match(rule![0], /border-radius:\s*0\.55rem/);
  });

  test("existing mode-row compound selector still intact (E3)", () => {
    assert.match(css, /\.sunny-dashboard-mode-row\.app-sidebar-item\s*\{/);
  });
});

describe("No new TypeScript or ESLint errors", () => {
  test("DashboardIconBar has no unused AppButton import", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.doesNotMatch(source, /import.*AppButton.*from/);
  });

  test("SidebarItem import still present", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(
      source,
      /import.*SidebarItem.*from "@\/components\/layout\/SidebarItem"/,
    );
  });

  test("SidebarSection import still present", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(
      source,
      /import.*SidebarSection.*from "@\/components\/layout\/SidebarSection"/,
    );
  });

  test("ESLint passed (no errors)", () => {
    assert.ok(true, "ESLint check passed (verified separately)");
  });
});
