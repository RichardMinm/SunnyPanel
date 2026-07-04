import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RichContentRenderer } from "@/components/public/RichContentRenderer";
import type { RichContentDocument } from "@/lib/rich-content/types";

const read = (path: string) => readFileSync(path, "utf8");

const sampleDocument: RichContentDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Heading" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A paragraph with " },
        {
          type: "text",
          marks: [{ attrs: { href: "/blog" }, type: "link" }],
          text: "a link",
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted note" }] }],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const ok = true;" }],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }],
            },
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Phase" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "M4" }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("sunny-prose public content rendering", () => {
  test("rich content renders heading paragraph link blockquote code and table wrapper", () => {
    const html = renderToStaticMarkup(React.createElement(RichContentRenderer, { content: sampleDocument }));

    assert.match(html, /<h2>Heading<\/h2>/);
    assert.match(html, /<p>A paragraph with <a href="\/blog"[^>]*>a link<\/a>\.<\/p>/);
    assert.match(html, /<blockquote>/);
    assert.match(html, /sunny-rich-content-code-block/);
    assert.match(html, /sunny-prose-table-scroll/);
    assert.match(html, /<table>/);
  });

  test("sunny-prose CSS supports readable links code blocks blockquotes tables and images", () => {
    const css = read("src/app/styles/sunny-prose.css");

    assert.match(css, /\.sunny-prose :where\(a:focus-visible\)/);
    assert.match(css, /\.sunny-prose-table-scroll/);
    assert.match(css, /overflow-x:\s*auto/);
    assert.match(css, /\.sunny-prose :where\(pre\)/);
    assert.match(css, /\.sunny-prose :where\(blockquote\)/);
    assert.match(css, /\.sunny-prose :where\(img\)/);
  });

  test("dark mode prose tables keep body text readable", () => {
    const css = read("src/app/styles/sunny-prose.css");

    assert.match(css, /html\[data-theme="dark"\] \.sunny-prose :where\(table td\)/);
    assert.doesNotMatch(css, /html\[data-theme="dark"\] \.sunny-prose table td\s*\{[^}]*color:\s*var\(--border\)/);
  });

  test("sunny-prose CSS uses design tokens instead of literal colors", () => {
    const css = read("src/app/styles/sunny-prose.css");

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|rgb\(/);
    assert.doesNotMatch(css, /--agent-control-bg/);
  });
});
