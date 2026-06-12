import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createEmptyRichDocument, getDashboardContentProfile } from "../../src/lib/rich-content/defaults";
import { deriveRichContentFields } from "../../src/lib/rich-content/derive";
import { ensureRichContentBlockIds } from "../../src/lib/rich-content/ids";
import { markdownToRichContent } from "../../src/lib/rich-content/markdown-to-rich";
import { isRichContentDocument, normalizeRichContentDocument } from "../../src/lib/rich-content/validate";
import type { RichContentDocument, RichContentNode } from "../../src/lib/rich-content/types";

const collectNodeIds = (node: RichContentNode): string[] => {
  const ownId = typeof node.attrs?.id === "string" ? [node.attrs.id] : [];
  const childIds = node.content?.flatMap(collectNodeIds) ?? [];

  return [...ownId, ...childIds];
};

const collectDocumentIds = (document: RichContentDocument): string[] => document.content?.flatMap(collectNodeIds) ?? [];

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

  test("ensureRichContentBlockIds adds deterministic ids to callout and table blocks", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "callout" },
        { type: "table" },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "callout-1");
    assert.equal(withIds.content?.[1]?.attrs?.id, "table-2");
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

  test("ensureRichContentBlockIds regenerates duplicate existing ids", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { id: "dup", level: 2 }, content: [{ type: "text", text: "Hello" }] },
        { type: "paragraph", attrs: { id: "dup" }, content: [{ type: "text", text: "Again" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "dup");
    assert.notEqual(withIds.content?.[1]?.attrs?.id, "dup");
    assert.equal(withIds.content?.[1]?.attrs?.id, "paragraph-1");
  });

  test("ensureRichContentBlockIds regenerates whitespace-only ids", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "   " }, content: [{ type: "text", text: "Needs id" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "paragraph-1");
  });

  test("ensureRichContentBlockIds preserves the first nested duplicate id in preorder", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { id: "dup" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { id: "dup" },
                  content: [{ type: "text", text: "Nested duplicate" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);
    const outerList = withIds.content?.[0];
    const nestedParagraph = outerList?.content?.[0]?.content?.[0];
    const blockIds = collectDocumentIds(withIds);

    assert.equal(outerList?.attrs?.id, "dup");
    assert.notEqual(nestedParagraph?.attrs?.id, "dup");
    assert.equal(new Set(blockIds).size, blockIds.length);
  });

  test("ensureRichContentBlockIds reserves later existing ids", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", attrs: { id: "paragraph-1" }, content: [{ type: "text", text: "B" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);
    const firstId = withIds.content?.[0]?.attrs?.id;
    const secondId = withIds.content?.[1]?.attrs?.id;

    assert.equal(secondId, "paragraph-1");
    assert.notEqual(firstId, "paragraph-1");
    assert.equal(new Set([firstId, secondId]).size, 2);
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

  test("deriveRichContentFields preserves hard breaks in text and normalizes excerpt spacing", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [{ type: "text", text: "Hello" }, { type: "hardBreak" }, { type: "text", text: "World" }],
        },
      ],
    });

    assert.equal(derived.contentText, "Hello\nWorld");
    assert.equal(derived.contentExcerpt, "Hello World");
  });

  test("deriveRichContentFields counts long CJK text beyond one minute", () => {
    const chineseText = "中".repeat(1000);
    const derived = deriveRichContentFields({
      type: "doc",
      content: [{ type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: chineseText }] }],
    });

    assert.equal(derived.readingMinutes, 2);
  });

  test("isRichContentDocument recognizes doc-shaped content", () => {
    assert.equal(isRichContentDocument({ type: "doc", content: [] }), true);
    assert.equal(isRichContentDocument({ type: "doc" }), true);
    assert.equal(isRichContentDocument(null), false);
    assert.equal(isRichContentDocument({ type: "paragraph", content: [] }), false);
  });

  test("normalizeRichContentDocument returns empty doc for invalid input", () => {
    assert.deepEqual(normalizeRichContentDocument(null), createEmptyRichDocument());
    assert.deepEqual(normalizeRichContentDocument({ type: "doc", content: [] }), {
      type: "doc",
      content: [],
    });
    assert.deepEqual(normalizeRichContentDocument({ type: "doc" }), {
      type: "doc",
      content: [],
    });
  });

  test("normalizeRichContentDocument assigns deterministic ids to valid block nodes", () => {
    const normalized = normalizeRichContentDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Needs id" }] }],
    });

    assert.equal(normalized.content?.[0]?.attrs?.id, "paragraph-1");
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

  test("markdownToRichContent preserves ordered list start number", () => {
    const doc = markdownToRichContent("3. Third\n4. Fourth");

    assert.equal(doc.content?.[0]?.type, "orderedList");
    assert.equal(doc.content?.[0]?.attrs?.start, 3);
  });

  test("markdownToRichContent preserves fenced code language metadata", () => {
    const doc = markdownToRichContent("```ts\nconst x = 1;\n```");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "ts");
    assert.equal(doc.content?.[0]?.content?.[0]?.text, "const x = 1;");
  });

  test("markdownToRichContent defaults fenced code language to text", () => {
    const doc = markdownToRichContent("```\nplain text\n```");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "text");
  });

  test("markdownToRichContent converts standalone Markdown images into image nodes", () => {
    const doc = markdownToRichContent("![Diagram](https://example.com/diagram.png)");

    assert.equal(doc.content?.[0]?.type, "image");
    assert.equal(doc.content?.[0]?.attrs?.src, "https://example.com/diagram.png");
    assert.equal(doc.content?.[0]?.attrs?.alt, "Diagram");
  });
});
