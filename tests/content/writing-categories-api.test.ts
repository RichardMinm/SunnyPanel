import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  isWritingCategoryIcon,
  isWritingCategoryTint,
  normalizeWritingCategoryListItem,
  resolveWritingCategoryId,
} from "../../src/lib/dashboard/writing-categories/normalize";

const read = (path: string) => readFileSync(path, "utf8");

describe("writing categories API contracts", () => {
  test("writing categories routes use Payload auth", () => {
    const listRoute = read("src/app/api/dashboard/writing-categories/route.ts");
    const detailRoute = read("src/app/api/dashboard/writing-categories/[id]/route.ts");

    assert.match(listRoute, /getPayloadAuthResult/);
    assert.match(listRoute, /writing-categories/);
    assert.match(detailRoute, /getPayloadAuthResult/);
    assert.match(detailRoute, /clearCategoryFromDocuments/);
  });

  test("content normalize and patch include writing category assignment", () => {
    const normalize = read("src/lib/dashboard/content/normalize.ts");
    const detailRoute = read("src/app/api/dashboard/content/[collection]/[id]/route.ts");
    const createRoute = read("src/app/api/dashboard/content/route.ts");

    assert.match(normalize, /categoryId/);
    assert.match(normalize, /writingCategory/);
    assert.match(detailRoute, /writingCategory/);
    assert.match(createRoute, /writingCategoryId/);
  });

  test("writing documents hook exposes category CRUD and move helpers", () => {
    const categoriesHook = read("src/components/dashboard/writing/use-writing-categories.ts");
    const documentsHook = read("src/components/dashboard/writing/use-writing-documents.ts");
    const context = read("src/components/dashboard/writing/WritingDocumentsContext.tsx");

    assert.match(categoriesHook, /createCategory/);
    assert.match(categoriesHook, /archiveCategory/);
    assert.match(documentsHook, /moveDocumentToCategory/);
    assert.match(context, /useWritingCategories/);
  });

  test("normalizeWritingCategoryListItem falls back to safe defaults", () => {
    assert.deepEqual(
      normalizeWritingCategoryListItem({
        archived: false,
        icon: "unknown-icon",
        id: 3,
        sortOrder: "bad" as never,
        tint: "unknown-tint",
        title: "  ",
        updatedAt: "2026-06-08T10:00:00.000Z",
      } as never),
      {
        archived: false,
        icon: "layers",
        id: 3,
        sortOrder: 0,
        tint: "accent",
        title: "未命名文档集",
        updatedAt: "2026-06-08T10:00:00.000Z",
      },
    );
    assert.equal(isWritingCategoryIcon("post"), true);
    assert.equal(isWritingCategoryIcon("nope"), false);
    assert.equal(isWritingCategoryTint("warning"), true);
    assert.equal(resolveWritingCategoryId({ id: 12 }), 12);
    assert.equal(resolveWritingCategoryId("bad"), null);
  });
});
