import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("writing library tree outline layout", () => {
  test("library uses category groups, uncategorized bucket, and sidebar bottom actions", () => {
    const library = read("src/components/dashboard/writing/WritingLibrary.tsx");
    const header = read("src/components/dashboard/writing/WritingLibraryHeader.tsx");
    const bottomRail = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

    assert.match(header, /文档集/);
    assert.doesNotMatch(header, /AppDropdownMenu/);
    assert.doesNotMatch(library, /WritingLibrarySearch/);
    assert.doesNotMatch(library, /WritingLibraryFooter/);
    assert.match(library, /WritingCategoryGroup/);
    assert.match(library, /WritingUncategorizedGroup/);
    assert.match(library, /useWritingLibraryFiltersContext/);
    assert.match(bottomRail, /新建文档集/);
    assert.match(bottomRail, /AppDropdownMenu/);
    assert.match(bottomRail, /草稿/);
    assert.match(bottomRail, /归档/);
    assert.match(bottomRail, /搜索/);
    assert.match(bottomRail, /WritingLibrarySearchDialog/);
  });

  test("category groups render user icon and tint metadata", () => {
    const group = read("src/components/dashboard/writing/WritingCategoryGroup.tsx");
    const meta = read("src/components/dashboard/writing/writing-collection-meta.ts");

    assert.match(group, /getWritingCategoryTintVar/);
    assert.match(group, /isWritingCategoryIconName/);
    assert.match(meta, /WRITING_CATEGORY_ICON_PRESETS/);
    assert.match(meta, /WRITING_CATEGORY_TINT_PRESETS/);
  });

  test("document rows show content type icon and move-to-category actions", () => {
    const row = read("src/components/dashboard/writing/WritingDocumentRow.tsx");
    const actions = read("src/components/dashboard/writing/WritingDocumentActions.tsx");
    const css = read("src/app/styles/sunny-dashboard-writing.css");

    assert.match(row, /sunny-writing-document-type-icon/);
    assert.match(row, /getWritingCollectionMeta/);
    assert.match(actions, /移动到文档集/);
    assert.match(css, /\.sunny-writing-category-group/);
    assert.match(css, /--writing-category-tint-accent/);
    assert.match(css, /\.sunny-writing-create-category-dialog/);
  });
});
