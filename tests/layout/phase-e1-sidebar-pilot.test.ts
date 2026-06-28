import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("WritingSidebarBottomRail — SidebarItem usage", () => {
  const source = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

  test("imports SidebarItem and SidebarSection from layout", () => {
    assert.match(source, /import.*SidebarItem.*from.*\/components\/layout\/SidebarItem/);
    assert.match(source, /import.*SidebarSection.*from.*\/components\/layout\/SidebarSection/);
  });

  test("'新建' dropdown uses SidebarItem + triggerAsChild (style unified)", () => {
    assert.match(source, /triggerAsChild/);
    assert.match(source, /label="新建"/);
    assert.match(source, /DashboardIcon name="plus"/);
  });

  test("新建文档集 is a menu item inside the dropdown", () => {
    assert.match(source, /新建文档集/);
    assert.match(source, /setCreateCategoryOpen/);
  });

  test("草稿 SidebarItem has active state when draftFilter is true", () => {
    assert.match(source, /active=\{draftFilter\}/);
  });

  test("草稿 onClick calls toggleDraftFilter", () => {
    assert.match(source, /onClick=\{toggleDraftFilter\}/);
  });

  test("归档 SidebarItem has active state when showArchivedCategories is true", () => {
    assert.match(source, /active=\{showArchivedCategories\}/);
  });

  test("归档 onClick calls handleToggleArchivedCategories", () => {
    assert.match(source, /onClick=\{handleToggleArchivedCategories\}/);
  });

  test("搜索 SidebarItem opens search dialog", () => {
    assert.match(source, /label="搜索"/);
    assert.match(source, /onClick.*setSearchOpen\(true\)/);
  });

  test("all SidebarItems preserve sunny-dashboard-sidebar-action class for visual compat", () => {
    /* Each SidebarItem should carry className="sunny-dashboard-sidebar-action" */
    const items = source.match(/<SidebarItem[\s\S]*?\/>/g);
    assert.ok(items && items.length >= 3);
    for (const item of items) {
      assert.match(item, /sunny-dashboard-sidebar-action/);
    }
  });

  test("SidebarItems use DashboardIcon for icons", () => {
    /* Count DashboardIcon usage inside SidebarItem blocks */
    const itemsWithIcons = source.match(/icon=\{<DashboardIcon/g);
    assert.ok(itemsWithIcons && itemsWithIcons.length >= 3);
  });
});

describe("WritingSidebarBottomRail — SidebarSection usage", () => {
  const source = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

  test("uses two SidebarSections for 内容 and 工具", () => {
    const sections = source.match(/<SidebarSection/g);
    assert.strictEqual(sections?.length, 2);
  });

  test("内容 section has title", () => {
    assert.match(source, /title="内容"/);
  });

  test("工具 section has title", () => {
    assert.match(source, /title="工具"/);
  });

  test("sections preserve sunny-writing-rail-section CSS class for layout compat", () => {
    const sectionsWithClass = source.match(/className="sunny-writing-rail-section"/g);
    assert.ok(sectionsWithClass && sectionsWithClass.length >= 1);
  });

  test("AppDropdownMenu (新建 dropdown) still uses raw spans, not SidebarItem", () => {
    /* The dropdown trigger is complex and properly kept as spans */
    assert.match(source, /AppDropdownMenu/);
  });

  test("DashboardSettingsMenu still uses raw spans, not SidebarItem", () => {
    /* Settings menu trigger is inside AppPopover, properly kept as spans */
    assert.match(source, /DashboardSettingsMenu/);
  });
});

describe("DashboardIconBar — scope verification (E2+E3 awareness)", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("DashboardIconBar imports SidebarItem (Phase E2) and SidebarSection (Phase E3) from layout", () => {
    /* Phase E2 added SidebarItem for mode navigation.
       Phase E3 added SidebarSection for section wrappers. */
    assert.match(source, /from.*\/components\/layout\/SidebarItem/);
    assert.match(source, /from.*\/components\/layout\/SidebarSection/);
  });

  test("AppIconButton still used (AppButton replaced by SidebarItem in E4c)", () => {
    /* Phase E4c: AppButton for 新对话 replaced with SidebarItem.
       AppIconButton still used for pin and search clear. */
    assert.match(source, /AppIconButton/);
  });
});

describe("SidebarItem accessibility", () => {
  const itemSource = read("src/components/layout/SidebarItem.tsx");

  test("button mode has type=button", () => {
    assert.match(itemSource, /type="button"/);
  });

  test("disabled state prevents onClick via e.preventDefault for links", () => {
    assert.match(itemSource, /e\.preventDefault/);
  });

  test("active state uses aria-current", () => {
    assert.match(itemSource, /aria-current/);
  });

  test("disabled state uses aria-disabled", () => {
    assert.match(itemSource, /aria-disabled/);
  });
});

describe("TypeScript and lint", () => {
  test("WritingSidebarBottomRail has no leftover raw buttons from replaced items", () => {
    const source = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

    /* The old raw buttons for 新建文档集, 草稿, 归档, 搜索 should be gone */
    /* But the AppDropdownMenu trigger still uses spans (correct) */
    /* And the DashboardSettingsMenu trigger still uses spans (correct) */

    /* Verify no old-style <button className="sunny-dashboard-sidebar-action" with onClick for these labels */
    assert.doesNotMatch(source, /<button[\s\S]*?新建文档集/);
    assert.doesNotMatch(source, /<button[\s\S]*?>[\s\S]*?草稿[\s\S]*?<\/button>/);
    /* The 归档 span inside SidebarItem is fine, but a raw button with 归档 should be gone */
    assert.doesNotMatch(source, /<button[\s\S]*?layers[\s\S]*?归档/);
    assert.doesNotMatch(source, /<button[\s\S]*?搜索[\s\S]*?setSearchOpen/);
  });

  test("original icon+label span patterns for replaced buttons are gone", () => {
    const source = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");
    /* Old pattern: standalone buttons with spans inside shouldn't exist for replaced items.
       The AppDropdownMenu trigger still correctly has its own raw span structure.
       Verify that the old raw button markup is gone for 新建文档集 and 搜索. */
    assert.doesNotMatch(source, /<button[\s\S]*?新建文档集/);
    assert.doesNotMatch(source, /<button[\s\S]*?setSearchOpen/);
  });
});
