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

  test("Admin header reuses PublicSiteHeader with admin variant", () => {
    const header = read("src/components/admin/SunnyAdminHeader.tsx");
    const publicHeader = read("src/components/public/site-chrome/PublicSiteHeader.tsx");

    assert.match(header, /PublicSiteHeader/);
    assert.match(header, /variant="admin"/);
    assert.doesNotMatch(header, /sunny-chrome-header/);
    assert.match(publicHeader, /variant\?: "site" \| "admin"/);
    assert.match(publicHeader, /inAdmin: true/);
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
    assert.match(panel, /ThemeToggle/);
    assert.doesNotMatch(menu, /ThemeCycleButton/);
  });
});
