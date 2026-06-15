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

  test("Dashboard writing inspector keeps an advanced Admin escape hatch", () => {
    const metaPanel = read("src/components/dashboard/writing/WritingMetaPanel.tsx");
    const controls = read("src/components/dashboard/writing/WritingPublishControls.tsx");

    assert.match(metaPanel, /advancedAdminHref/);
    assert.match(controls, /advancedAdminHref/);
  });
});
