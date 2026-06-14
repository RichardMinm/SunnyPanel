import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("content editor contracts", () => {
  test("ContentEditor uses Tiptap and wires paste/drop upload", () => {
    const editor = read("src/components/content-editor/ContentEditor.tsx");
    assert.match(editor, /useEditor/);
    assert.match(editor, /SlashCommandMenu/);
    assert.match(editor, /FloatingFormatMenu/);
    assert.match(editor, /PasteImageUpload/);
  });

  test("slash menu includes required blocks", () => {
    const slash = read("src/components/content-editor/SlashCommandMenu.tsx");
    for (const label of ["文本", "标题 1", "标题 2", "标题 3", "项目列表", "有序列表", "任务列表", "引用", "代码块", "分割线", "图片", "表格", "Callout"]) {
      assert.match(slash, new RegExp(label));
    }
  });

  test("image upload helper posts to editor media API", () => {
    const helper = read("src/lib/editor/upload-dashboard-image.ts");
    assert.match(helper, /\/api\/editor\/upload-media/);
    assert.match(helper, /FormData/);
  });
});
