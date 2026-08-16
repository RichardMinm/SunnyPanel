import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { dashboardContentCollections, getDashboardEditHref } from "../../src/lib/dashboard/content/config";
import { isStaleDashboardContentUpdate, validateDashboardContentCollection } from "../../src/lib/dashboard/content/validation";

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

  test("API routes use Payload auth and local API", () => {
    const route = read("src/app/api/dashboard/content/route.ts");
    const detailRoute = read("src/app/api/dashboard/content/[collection]/[id]/route.ts");
    const versionsRoute = read("src/app/api/dashboard/content/[collection]/[id]/versions/route.ts");

    assert.match(route, /getPayloadAuthResult/);
    assert.match(route, /getPayloadClient/);
    assert.match(detailRoute, /lastKnownUpdatedAt/);
    assert.match(detailRoute, /isStaleDashboardContentUpdate/);
    assert.match(versionsRoute, /lastKnownUpdatedAt/);
    assert.match(versionsRoute, /isStaleDashboardContentUpdate/);
  });

  test("version restore requires an up-to-date document snapshot before restoring", () => {
    const versionsRoute = read("src/app/api/dashboard/content/[collection]/[id]/versions/route.ts");
    const postRoute = versionsRoute.slice(versionsRoute.indexOf("export async function POST"));
    const currentDocumentRead = postRoute.indexOf(".findByID({");
    const staleCheck = postRoute.indexOf("isStaleDashboardContentUpdate(");
    const versionOwnershipRead = postRoute.indexOf("payload.findVersionByID({");
    const restoreCall = postRoute.indexOf("payload.restoreVersion({");

    assert.ok(currentDocumentRead >= 0, "restore must re-read the current document");
    assert.ok(staleCheck > currentDocumentRead, "restore must compare the persisted update time");
    assert.ok(versionOwnershipRead > staleCheck, "a stale restore must return before version lookup");
    assert.ok(restoreCall > versionOwnershipRead, "version ownership must be checked before restore");
    assert.match(postRoute, /findByID\(\{[\s\S]*?disableErrors:\s*true[\s\S]*?overrideAccess:\s*false/);
    assert.match(
      postRoute,
      /if \(!lastKnownUpdatedAt\)[\s\S]*?status:\s*400/,
      "restore must reject requests without the caller's current document version",
    );
    assert.match(
      postRoute,
      /if \(isStaleDashboardContentUpdate\([\s\S]*?return NextResponse\.json\(\{ message: "内容已在其他位置更新" \}, \{ status: 409 \}\);[\s\S]*?payload\.findVersionByID/,
      "a stale request must terminate with 409 before any restore path",
    );
  });

  test("isStaleDashboardContentUpdate detects autosave conflicts", () => {
    assert.equal(isStaleDashboardContentUpdate("2026-06-08T10:00:00.000Z", "2026-06-08T09:00:00.000Z"), true);
    assert.equal(isStaleDashboardContentUpdate("2026-06-08T10:00:00.000Z", "2026-06-08T10:00:00.000Z"), false);
    assert.equal(isStaleDashboardContentUpdate("2026-06-08T10:00:00.000Z", null), false);
    assert.equal(isStaleDashboardContentUpdate("2026-06-08T10:00:00.000Z", undefined), false);
  });

  test("Dashboard-created post drafts satisfy required Payload fields", () => {
    const route = read("src/app/api/dashboard/content/route.ts");

    assert.match(route, /if \(collection === "posts"\)[\s\S]*data\.summary\s*=\s*"待补充摘要"/);
    assert.match(route, /if \(collection === "pages"\)[\s\S]*data\.summary\s*=\s*""/);
  });

  test("detail PATCH validates contentRich and relationships", () => {
    const detailRoute = read("src/app/api/dashboard/content/[collection]/[id]/route.ts");
    const patchValidation = read("src/lib/dashboard/content/patch-validation.ts");

    assert.match(detailRoute, /parsePatchContentRich/);
    assert.match(detailRoute, /validatePatchRelationships/);
    assert.match(detailRoute, /mapPayloadError/);
    assert.match(detailRoute, /summary/);
    assert.match(patchValidation, /validateWritingCategoryId/);
    assert.match(patchValidation, /validateCoverImageId/);
  });

  test("Page collection exposes summary field in Payload schema", () => {
    const pageCollection = read("src/collections/Page.ts");

    assert.match(pageCollection, /name:\s*"summary"/);
  });
});
