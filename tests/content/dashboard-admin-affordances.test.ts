import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Dashboard and Admin writing affordances", () => {
  test("Admin navigation links directly back to the Dashboard writing studio", () => {
    const nav = read("src/components/admin/SunnyAdminNav.tsx");
    const copy = read("src/lib/site-copy.ts");

    assert.match(nav, /\/dashboard\?mode=writing/);
    assert.match(copy, /writingStudio/);
  });

  test("Dashboard writing inspector keeps advanced Admin in advanced settings only", () => {
    const metaPanel = read("src/components/dashboard/writing/WritingMetaPanel.tsx");
    const controls = read("src/components/dashboard/writing/WritingPublishControls.tsx");

    assert.match(metaPanel, /advancedAdminHref/);
    assert.doesNotMatch(controls, /advancedAdminHref/);
  });

  test("Admin header uses a focused product bridge instead of the public site navigation", () => {
    const header = read("src/components/admin/SunnyAdminHeader.tsx");

    assert.doesNotMatch(header, /PublicSiteHeader/);
    assert.match(header, /sunny-admin-header-brand/);
    assert.match(header, /advancedManagement/);
    assert.match(header, /advancedDescription/);
    assert.match(header, /\/dashboard\?mode=writing/);
    assert.match(header, /href="\/dashboard"/);
  });

  test("writing inspector keeps internal IDs and unfinished placeholders out of the product UI", () => {
    const metaPanel = read("src/components/dashboard/writing/WritingMetaPanel.tsx");

    assert.doesNotMatch(metaPanel, /#\{document\.id\}/);
    assert.doesNotMatch(metaPanel, /高级 Admin/);
    assert.doesNotMatch(metaPanel, /即将推出/);
    assert.match(metaPanel, /在高级管理中打开/);
  });

  test("Admin providers read locale and palette from server cookies", () => {
    const providers = read("src/components/admin/SunnyAdminProviders.tsx");

    assert.match(providers, /getSiteLocale/);
    assert.match(providers, /getSitePalette/);
    assert.doesNotMatch(providers, /"use client"/);
  });

  test("Admin layout imports admin-globals.css with core and admin bundles", () => {
    const layout = read("src/app/(payload)/layout.tsx");
    const adminGlobals = read("src/app/admin-globals.css");

    assert.match(layout, /admin-globals\.css/);
    assert.doesNotMatch(layout, /sunny-chrome\.css/);
    assert.match(adminGlobals, /sunny-core\.css/);
    assert.match(adminGlobals, /sunny-admin\.css/);
    assert.doesNotMatch(adminGlobals, /sunny-dashboard\.css/);
    assert.doesNotMatch(adminGlobals, /sunny-agent\.css/);
  });

  test("DashboardSettingsMenu delegates to shared PreferencesPanel", () => {
    const menu = read("src/components/dashboard/DashboardSettingsMenu.tsx");
    const panel = read("src/components/shared/PreferencesPanel.tsx");

    assert.match(menu, /PreferencesPanel/);
    assert.match(menu, /advancedManagementHref="\/admin"/);
    assert.match(panel, /ThemeToggle/);
    assert.match(panel, /settings-popover-advanced-link/);
    assert.doesNotMatch(menu, /ThemeCycleButton/);
  });
});
