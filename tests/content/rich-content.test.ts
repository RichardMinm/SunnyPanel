import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createEmptyRichDocument, getDashboardContentProfile } from "../../src/lib/rich-content/defaults";
import { deriveRichContentFields } from "../../src/lib/rich-content/derive";
import { ensureRichContentBlockIds } from "../../src/lib/rich-content/ids";
import { markdownToRichContent } from "../../src/lib/rich-content/markdown-to-rich";
import { normalizeRichContentDocument } from "../../src/lib/rich-content/validate";
import type { RichContentDocument } from "../../src/lib/rich-content/types";

describe("rich content utilities", () => {
  test("createEmptyRichDocument returns a stable Tiptap doc", () => {
    assert.deepEqual(createEmptyRichDocument(), {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "root-paragraph",
          },
        },
      ],
    });
  });

  test("profiles describe all Dashboard-owned content kinds", () => {
    assert.equal(getDashboardContentProfile("posts").summaryMode, "required");
    assert.equal(getDashboardContentProfile("pages").supportsSlug, true);
    assert.equal(getDashboardContentProfile("notes").titleMode, "derived");
    assert.equal(getDashboardContentProfile("updates").supportsUpdateType, true);
  });

  test("ensureRichContentBlockIds adds deterministic ids to block nodes", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hello" }] },
        { type: "paragraph", content: [{ type: "text", text: "World" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "heading-1");
    assert.equal(withIds.content?.[1]?.attrs?.id, "paragraph-2");
  });

  test("ensureRichContentBlockIds avoids generated id collisions", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { id: "heading-1", level: 2 }, content: [{ type: "text", text: "Hello" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Again" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "heading-1");
    assert.notEqual(withIds.content?.[1]?.attrs?.id, "heading-1");
    assert.equal(withIds.content?.[1]?.attrs?.id, "heading-2");
  });

  test("deriveRichContentFields generates text, excerpt, outline, and reading time", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        { type: "heading", attrs: { id: "intro", level: 1 }, content: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "A clear opening paragraph." }] },
      ],
    });

    assert.equal(derived.contentText, "Intro\nA clear opening paragraph.");
    assert.equal(derived.contentExcerpt, "Intro A clear opening paragraph.");
    assert.deepEqual(derived.contentOutline, [{ id: "intro", level: 1, order: 0, text: "Intro" }]);
    assert.equal(derived.readingMinutes, 1);
  });

  test("deriveRichContentFields keeps nested block text readable", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { id: "list-1" },
          content: [
            {
              type: "listItem",
              attrs: { id: "item-1" },
              content: [{ type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "First" }] }],
            },
            {
              type: "listItem",
              attrs: { id: "item-2" },
              content: [{ type: "paragraph", attrs: { id: "p2" }, content: [{ type: "text", text: "Second" }] }],
            },
          ],
        },
      ],
    });

    assert.equal(derived.contentText, "First\nSecond");
    assert.equal(derived.contentExcerpt, "First Second");
  });

  test("normalizeRichContentDocument returns empty doc for invalid input", () => {
    assert.deepEqual(normalizeRichContentDocument(null), createEmptyRichDocument());
    assert.deepEqual(normalizeRichContentDocument({ type: "doc", content: [] }), {
      type: "doc",
      content: [],
    });
  });

  test("markdownToRichContent converts common Markdown blocks", () => {
    const doc = markdownToRichContent("# Title\n\nParagraph text\n\n- First\n- Second\n\n> Quote");

    assert.equal(doc.type, "doc");
    assert.equal(doc.content?.[0]?.type, "heading");
    assert.equal(doc.content?.[0]?.attrs?.level, 1);
    assert.equal(doc.content?.[1]?.type, "paragraph");
    assert.equal(doc.content?.[2]?.type, "bulletList");
    assert.equal(doc.content?.[3]?.type, "blockquote");
  });
});
