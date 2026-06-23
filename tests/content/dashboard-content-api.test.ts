import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { buildDashboardHref } from "../../src/lib/dashboard/dashboard-href";
import { dashboardContentCollections, getDashboardEditHref } from "../../src/lib/dashboard/content/config";
import { validateDashboardContentCollection } from "../../src/lib/dashboard/content/validation";

const read = (path: string) => readFileSync(path, "utf8");

describe("dashboard content API contracts", () => {
  test("only the four writing collections are allowed", () => {
    assert.deepEqual(dashboardContentCollections, ["posts", "notes", "updates", "pages"]);
    assert.equal(validateDashboardContentCollection("posts"), "posts");
    assert.equal(validateDashboardContentCollection("timeline-events"), null);
  });

  test("Dashboard edit href encodes collection and id", () => {
    assert.equal(getDashboardEditHref("posts", 12), "/dashboard?mode=writing&collection=posts&id=12");
  });

  test("writing document context menu copies the canonical Dashboard edit href", () => {
    const row = read("src/components/dashboard/writing/WritingDocumentRow.tsx");

    assert.match(row, /getDashboardEditHref/);
    assert.match(row, /AppContextMenu/);
    assert.match(row, /AppDropdownMenu/);
    assert.doesNotMatch(row, /content=\$\{document\.collection\}:\$\{document\.id\}/);
    assert.doesNotMatch(row, /role="menu"/);
    assert.doesNotMatch(row, /addEventListener\("mousedown"/);
  });

  test("writing sidebar bottom rail uses AppDropdownMenu for create actions", () => {
    const bottomRail = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

    assert.match(bottomRail, /AppDropdownMenu/);
    assert.doesNotMatch(bottomRail, /role="menu"/);
    assert.doesNotMatch(bottomRail, /addEventListener\("mousedown"/);
  });

  test("dashboard auth redirect preserves writing workspace query params", () => {
    const page = read("src/app/(site)/dashboard/page.tsx");
    const workspace = read("src/lib/payload/workspace.ts");

    assert.match(page, /buildDashboardRedirectPath/);
    assert.match(page, /redirectPath/);
    assert.match(workspace, /redirectPath/);
    assert.doesNotMatch(workspace, /const dashboardPath = "\/dashboard"/);
  });

  test("Dashboard href preserves non-agent workspace modes while syncing threads", () => {
    assert.equal(buildDashboardHref({ mode: "writing", threadId: 16 }), "/dashboard?mode=writing&threadId=16");
  });

  test("API routes use Payload auth and local API", () => {
    const route = read("src/app/api/dashboard/content/route.ts");
    const detailRoute = read("src/app/api/dashboard/content/[collection]/[id]/route.ts");

    assert.match(route, /getPayloadAuthResult/);
    assert.match(route, /getPayloadClient/);
    assert.match(detailRoute, /lastKnownUpdatedAt/);
    assert.match(detailRoute, /status: 409/);
  });

  test("Dashboard-created post drafts satisfy required Payload fields", () => {
    const route = read("src/app/api/dashboard/content/route.ts");

    assert.doesNotMatch(route, /data\.summary\s*=\s*""/);
    assert.match(route, /data\.summary\s*=\s*"[^"]+"/);
  });
});
