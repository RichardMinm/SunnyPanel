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
      attrs: { id: "intro", level: 2 },
      content: [{ type: "text", text: "Intro" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        {
          type: "text",
          marks: [{ type: "bold" }, { attrs: { href: "https://example.com" }, type: "link" }],
          text: "world",
        },
      ],
    },
    {
      type: "callout",
      attrs: { tone: "note" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Remember this" }] }],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Ship renderer" }] }],
        },
      ],
    },
    {
      type: "image",
      attrs: { alt: "Diagram", src: "/api/media/file/diagram.png", title: "System map" },
    },
  ],
};

describe("RichContentRenderer", () => {
  test("renders supported rich content nodes to public markup", () => {
    const html = renderToStaticMarkup(React.createElement(RichContentRenderer, { content: sampleDocument }));

    assert.match(html, /<h2 id="intro">Intro<\/h2>/);
    assert.match(html, /<p>Hello <a href="https:\/\/example.com"[^>]*><strong>world<\/strong><\/a><\/p>/);
    assert.match(html, /sunny-rich-content-callout/);
    assert.match(html, /type="checkbox" checked=""/);
    assert.match(html, /<img src="\/api\/media\/file\/diagram.png" alt="Diagram"/);
    assert.match(html, /<figcaption>Diagram<\/figcaption>/);
  });

  test("public content entry points prefer contentRich with Markdown fallback", () => {
    const contentRenderer = read("src/components/public/ContentRenderer.tsx");
    const blogPage = read("src/app/(site)/blog/[slug]/page.tsx");
    const pageRoute = read("src/app/(site)/[slug]/page.tsx");
    const livePreview = read("src/components/public/DocumentLivePreview.tsx");

    assert.match(contentRenderer, /RichContentRenderer/);
    assert.match(contentRenderer, /fallbackMarkdown/);
    assert.match(blogPage, /content=\{post\.contentRich\}/);
    assert.match(pageRoute, /content=\{page\.contentRich\}/);
    assert.match(livePreview, /content=\{post\.contentRich\}/);
    assert.match(livePreview, /content=\{page\.contentRich\}/);
    assert.match(livePreview, /content=\{note\.contentRich\}/);
    assert.match(livePreview, /content=\{update\.contentRich\}/);
  });
});
