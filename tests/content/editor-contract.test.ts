import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("content editor contracts", () => {
  test("ContentEditor uses Tiptap and wires paste/drop upload", () => {
    const editor = read("src/components/content-editor/ContentEditor.tsx");
    const extensions = read("src/components/content-editor/editor-extensions.ts");
    assert.match(editor, /useEditor/);
    assert.match(editor, /buildContentEditorExtensions/);
    assert.match(editor, /SlashCommandList/);
    assert.match(extensions, /PasteImageUpload/);
  });

  test("slash commands include required blocks", () => {
    const slash = read("src/components/content-editor/slash-commands.ts");
    for (const label of [
      "正文",
      "标题 1",
      "任务列表",
      "无序列表",
      "有序列表",
      "图片",
      "视频",
      "PDF",
      "附件",
      "表格",
      "引用",
      "数学块",
      "切换块",
      "分割线",
      "分页符",
      "当前日期",
      "提示信息",
      "成功通知",
      "警告信息",
      "代码块",
    ]) {
      assert.match(slash, new RegExp(label));
    }
  });

  test("image upload helper posts to editor media API", () => {
    const helper = read("src/lib/editor/upload-dashboard-image.ts");
    assert.match(helper, /\/api\/editor\/upload-media/);
    assert.match(helper, /FormData/);
  });

  test("publish route accepts visibility in request body", () => {
    const route = read("src/app/api/dashboard/content/[collection]/[id]/publish/route.ts");
    assert.match(route, /visibility/);
    assert.match(route, /parsePublishBody/);
  });
});
