import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

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
});
