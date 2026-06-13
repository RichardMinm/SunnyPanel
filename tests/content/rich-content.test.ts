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

  test("deriveRichContentFields collects nested headings in document preorder", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        { type: "heading", attrs: { id: "intro", level: 1 }, content: [{ type: "text", text: "Intro" }] },
        {
          type: "callout",
          attrs: { id: "callout-1" },
          content: [
            {
              type: "heading",
              attrs: { id: "callout-heading", level: 2 },
              content: [{ type: "text", text: "Callout Head" }],
            },
          ],
        },
        {
          type: "blockquote",
          attrs: { id: "quote-1" },
          content: [
            {
              type: "heading",
              attrs: { id: "quote-heading", level: 3 },
              content: [{ type: "text", text: "Quote Head" }],
            },
          ],
        },
        {
          type: "table",
          attrs: { id: "table-1" },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "heading",
                      attrs: { id: "cell-heading", level: 2 },
                      content: [{ type: "text", text: "Cell Head" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    assert.deepEqual(derived.contentOutline, [
      { id: "intro", level: 1, order: 0, text: "Intro" },
      { id: "callout-heading", level: 2, order: 1, text: "Callout Head" },
      { id: "quote-heading", level: 3, order: 2, text: "Quote Head" },
      { id: "cell-heading", level: 2, order: 3, text: "Cell Head" },
    ]);
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

  test("deriveRichContentFields includes image alt text in text, excerpt, and reading time", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/architecture.png", alt: "Architecture diagram" },
        },
      ],
    });

    assert.equal(derived.contentText, "Architecture diagram");
    assert.equal(derived.contentExcerpt, "Architecture diagram");
    assert.equal(derived.readingMinutes, 1);
  });

  test("deriveRichContentFields prefers image alt text and falls back to title", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/alt.png", alt: "Alt label", title: "Ignored title" },
        },
        {
          type: "image",
          attrs: { src: "/title.png", title: "Title only label" },
        },
      ],
    });

    assert.equal(derived.contentText, "Alt label\nTitle only label");
    assert.equal(derived.contentExcerpt, "Alt label Title only label");
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
    assert.equal(isRichContentDocument({ type: "doc", content: [null] }), false);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "paragraph", content: [null] }] }), false);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "text", text: "inline" }] }), false);
  });

  test("isRichContentDocument rejects headings with unsupported levels", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 99 }, content: [{ type: "text", text: "Bad" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument accepts heading levels one through three", () => {
    for (const level of [1, 2, 3]) {
      assert.equal(
        isRichContentDocument({
          type: "doc",
          content: [{ type: "heading", attrs: { level }, content: [{ type: "text", text: `Heading ${level}` }] }],
        }),
        true,
      );
    }
  });

  test("isRichContentDocument accepts generated block id attrs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          { type: "heading", attrs: { id: "intro", level: 2 }, content: [{ type: "text", text: "Intro" }] },
          { type: "paragraph", attrs: { id: "paragraph-1" }, content: [{ type: "text", text: "Body" }] },
          {
            type: "bulletList",
            attrs: { id: "list-1" },
            content: [
              {
                type: "listItem",
                attrs: { id: "item-1" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
              },
            ],
          },
          { type: "horizontalRule", attrs: { id: "rule-1" } },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument rejects unsupported node attrs", () => {
    const paragraph = { type: "paragraph", content: [{ type: "text", text: "Text" }] };

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ ...paragraph, attrs: { id: "paragraph-1", dataUnsafe: "nope" } }],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: "ts", meta: "nope" }, content: [{ type: "text", text: "code" }] }],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 1, class: "nope" }, content: [{ type: "listItem", content: [paragraph] }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument validates image src and optional text attrs", () => {
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "image" }] }), false);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "image", attrs: { src: "" } }] }), false);
    assert.equal(
      isRichContentDocument({ type: "doc", content: [{ type: "image", attrs: { src: "/cover.png", alt: 12 } }] }),
      false,
    );
    assert.equal(
      isRichContentDocument({ type: "doc", content: [{ type: "image", attrs: { src: "/cover.png", width: 320 } }] }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "image", attrs: { src: "/cover.png", alt: "Cover", title: "Hero image" } }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "image", attrs: { src: "images/cover.png", alt: "Cover" } }],
      }),
      true,
    );
  });

  test("isRichContentDocument rejects unsafe image src values", () => {
    for (const src of ["javascript:alert(1)", "data:image/svg+xml,<svg></svg>", "//cdn.example.com/image.png", "mailto:hi@example.com"]) {
      assert.equal(
        isRichContentDocument({
          type: "doc",
          content: [{ type: "image", attrs: { src, alt: "Unsafe" } }],
        }),
        false,
        src,
      );
    }
  });

  test("isRichContentDocument accepts image nodes with nullable optional Tiptap attrs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "/image.png", alt: null, title: null, width: null, height: null },
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument validates code block language attrs", () => {
    const codeBlockWithInvalidLanguage = {
      type: "doc",
      content: [{ type: "codeBlock", attrs: { language: 42 }, content: [{ type: "text", text: "bad" }] }],
    };

    assert.equal(isRichContentDocument(codeBlockWithInvalidLanguage), false);
    assert.deepEqual(normalizeRichContentDocument(codeBlockWithInvalidLanguage), createEmptyRichDocument());
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "codeBlock", content: [{ type: "text", text: "valid" }] }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "valid" }] }],
      }),
      true,
    );
  });

  test("isRichContentDocument accepts code block nodes with nullable language attrs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "valid" }] }],
      }),
      true,
    );
  });

  test("isRichContentDocument validates ordered list start attrs", () => {
    const validListItem = { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] };

    assert.equal(
      isRichContentDocument({ type: "doc", content: [{ type: "orderedList", content: [validListItem] }] }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 2 }, content: [validListItem] }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: "2" }, content: [validListItem] }],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 0 }, content: [validListItem] }],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 1, type: 1 }, content: [validListItem] }],
      }),
      false,
    );
  });

  test("isRichContentDocument accepts ordered list nodes with nullable type attrs", () => {
    const validListItem = { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] };

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "orderedList", attrs: { start: 1, type: null }, content: [validListItem] }],
      }),
      true,
    );
  });

  test("isRichContentDocument validates task item checked attrs", () => {
    const validTask = { type: "paragraph", content: [{ type: "text", text: "Task" }] };

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "taskList", content: [{ type: "taskItem", content: [validTask] }] }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [validTask] }] }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: "true" }, content: [validTask] }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects stray text on non-text nodes", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "paragraph", text: "bad", content: [{ type: "text", text: "Good" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects text nodes with missing text", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects text nodes with empty text", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects text nodes with attrs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", attrs: { id: "text-1" }, text: "Bad attrs" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects unknown text marks", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Marked", marks: [{ type: "unknownMark" }] }],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument accepts supported text marks", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bold", marks: [{ type: "bold" }] },
              { type: "text", text: "Italic", marks: [{ type: "italic" }] },
              { type: "text", text: "Strike", marks: [{ type: "strike" }] },
              { type: "text", text: "Code", marks: [{ type: "code" }] },
              { type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument validates link href protocols", () => {
    for (const href of ["https://example.com", "http://example.com", "/docs/intro", "#section", "mailto:hi@example.com"]) {
      assert.equal(
        isRichContentDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: { href } }] }],
            },
          ],
        }),
        true,
      );
    }

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects links without hrefs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: {} }] }],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects unsupported mark attrs", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Bold", marks: [{ type: "bold", attrs: { class: "nope" } }] }],
          },
        ],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Link",
                marks: [{ type: "link", attrs: { href: "https://example.com", onclick: "alert(1)" } }],
              },
            ],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects marks on non-text nodes", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "paragraph", marks: [{ type: "bold" }], content: [{ type: "text", text: "Marked" }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects invalid paragraph nesting", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects invalid list nesting", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "bulletList", content: [{ type: "paragraph", content: [{ type: "text", text: "Nope" }] }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument accepts list items with paragraph followed by a code block", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Item intro" }] },
                  { type: "codeBlock", content: [{ type: "text", text: "const value = true;" }] },
                ],
              },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument accepts task items with paragraph followed by normal blocks", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Review details" }] },
                  {
                    type: "blockquote",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Context" }] }],
                  },
                  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Next section" }] },
                ],
              },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument rejects list and task items whose first child is not a paragraph", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  { type: "codeBlock", content: [{ type: "text", text: "not first" }] },
                  { type: "paragraph", content: [{ type: "text", text: "Too late" }] },
                ],
              },
            ],
          },
        ],
      }),
      false,
    );

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                content: [
                  {
                    type: "blockquote",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "not first" }] }],
                  },
                  { type: "paragraph", content: [{ type: "text", text: "Too late" }] },
                ],
              },
            ],
          },
        ],
      }),
      false,
    );
  });

  test("isRichContentDocument rejects empty containers that require child content", () => {
    const invalidRootContainers = ["bulletList", "orderedList", "taskList", "table", "blockquote", "callout"];

    for (const type of invalidRootContainers) {
      assert.equal(isRichContentDocument({ type: "doc", content: [{ type }] }), false, `${type} missing content`);
      assert.equal(isRichContentDocument({ type: "doc", content: [{ type, content: [] }] }), false, `${type} empty content`);
    }

    for (const tableRow of [{ type: "tableRow" }, { type: "tableRow", content: [] }]) {
      assert.equal(
        isRichContentDocument({ type: "doc", content: [{ type: "table", content: [tableRow] }] }),
        false,
        "tableRow must contain cells",
      );
    }

    for (const tableCell of [{ type: "tableCell" }, { type: "tableCell", content: [] }]) {
      assert.equal(
        isRichContentDocument({
          type: "doc",
          content: [{ type: "table", content: [{ type: "tableRow", content: [tableCell] }] }],
        }),
        false,
        "tableCell must contain blocks",
      );
    }

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "table",
            content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [] }] }],
          },
        ],
      }),
      false,
      "tableHeader must contain blocks",
    );
  });

  test("isRichContentDocument rejects list items that start with nested lists", () => {
    const nestedBulletList = {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    };
    const nestedTaskList = {
      type: "taskList",
      content: [{ type: "taskItem", content: [{ type: "paragraph" }] }],
    };

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "bulletList", content: [{ type: "listItem", content: [nestedBulletList] }] }],
      }),
      false,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "taskList", content: [{ type: "taskItem", content: [nestedTaskList] }] }],
      }),
      false,
    );
  });

  test("isRichContentDocument accepts empty text-capable block content", () => {
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "paragraph" }] }), true);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] }), true);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "codeBlock" }] }), true);
  });

  test("isRichContentDocument accepts valid nested lists", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
              },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument accepts valid container structures", () => {
    const paragraph = { type: "paragraph", content: [{ type: "text", text: "Text" }] };
    const listItem = { type: "listItem", content: [paragraph] };
    const taskItem = { type: "taskItem", content: [paragraph] };

    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          { type: "bulletList", content: [listItem] },
          { type: "orderedList", content: [listItem] },
          { type: "taskList", content: [taskItem] },
          { type: "blockquote", content: [paragraph] },
          { type: "callout", content: [paragraph] },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableHeader", content: [paragraph] },
                  { type: "tableCell", content: [paragraph] },
                ],
              },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument accepts valid table nesting", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
      true,
    );
  });

  test("isRichContentDocument rejects structural child nodes at the document root", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }],
      }),
      true,
    );
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
              },
            ],
          },
        ],
      }),
      true,
    );
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "listItem", content: [] }] }), false);
    assert.equal(isRichContentDocument({ type: "doc", content: [{ type: "tableRow", content: [] }] }), false);
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

  test("normalizeRichContentDocument preserves valid editor docs with nullable optional attrs", () => {
    const editorDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/image.png", alt: null, title: null, width: null, height: null },
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "const value = true;" }],
        },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }],
        },
      ],
    };

    const normalized = normalizeRichContentDocument(editorDocument);

    assert.notDeepEqual(normalized, createEmptyRichDocument());
    assert.deepEqual(normalized.content?.[0]?.attrs, {
      id: "image-1",
      src: "/image.png",
      alt: null,
      title: null,
      width: null,
      height: null,
    });
    assert.deepEqual(normalized.content?.[1]?.attrs, { id: "codeBlock-2", language: null });
    assert.deepEqual(normalized.content?.[2]?.attrs, { id: "orderedList-3", start: 1, type: null });
  });

  test("markdownToRichContent converts common Markdown blocks", () => {
    const doc = markdownToRichContent("# Title\n\nParagraph text\n\n- First\n- Second\n\n> Quote");

    assert.equal(doc.type, "doc");
    assert.equal(doc.content?.[0]?.type, "heading");
    assert.equal(doc.content?.[0]?.attrs?.level, 1);
    assert.equal(doc.content?.[1]?.type, "paragraph");
    assert.equal(doc.content?.[2]?.type, "bulletList");
    assert.equal(doc.content?.[3]?.type, "blockquote");
    assert.equal(doc.content?.[3]?.content?.[0]?.type, "paragraph");
    assert.equal(doc.content?.[3]?.content?.[0]?.content?.[0]?.text, "Quote");
    assert.equal(isRichContentDocument(doc), true);
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

  test("markdownToRichContent converts tilde fenced code blocks", () => {
    const doc = markdownToRichContent("~~~ts\nconst x = 1;\n~~~");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "ts");
    assert.equal(doc.content?.[0]?.content?.[0]?.text, "const x = 1;");
  });

  test("markdownToRichContent keeps shorter same-marker fences inside longer code blocks", () => {
    const doc = markdownToRichContent("````ts\n```\nconst x = 1;\n````");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "ts");
    assert.equal(doc.content?.[0]?.content?.[0]?.text, "```\nconst x = 1;");
  });

  test("markdownToRichContent omits empty text nodes from empty fenced code blocks", () => {
    const doc = markdownToRichContent("```ts\n```");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "ts");
    assert.deepEqual(doc.content?.[0]?.content ?? [], []);
  });

  test("markdownToRichContent defaults fenced code language to text", () => {
    const doc = markdownToRichContent("```\nplain text\n```");

    assert.equal(doc.content?.[0]?.type, "codeBlock");
    assert.equal(doc.content?.[0]?.attrs?.language, "text");
  });

  test("markdownToRichContent skips bare blockquotes with no meaningful content", () => {
    const doc = markdownToRichContent(">");

    assert.deepEqual(doc.content, []);
    assert.equal(isRichContentDocument(doc), true);
  });

  test("markdownToRichContent converts standalone Markdown images into image nodes", () => {
    const doc = markdownToRichContent("![Diagram](https://example.com/diagram.png)");

    assert.equal(doc.content?.[0]?.type, "image");
    assert.equal(doc.content?.[0]?.attrs?.src, "https://example.com/diagram.png");
    assert.equal(doc.content?.[0]?.attrs?.alt, "Diagram");
  });

  test("markdownToRichContent converts standalone Markdown images with parentheses in destinations", () => {
    const doc = markdownToRichContent("![x](/uploads/image-(1).png)");

    assert.equal(doc.content?.[0]?.type, "image");
    assert.equal(doc.content?.[0]?.attrs?.src, "/uploads/image-(1).png");
    assert.equal(doc.content?.[0]?.attrs?.alt, "x");
  });
});
