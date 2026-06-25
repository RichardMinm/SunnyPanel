import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RichContentRenderer } from "@/components/public/RichContentRenderer";
import { isRichContentDocument } from "@/lib/rich-content/validate";
import type { RichContentDocument } from "@/lib/rich-content/types";

describe("rich content extended block types", () => {
  test("isRichContentDocument accepts mediaEmbed, pageBreak, math, and details blocks", () => {
    const document: RichContentDocument = {
      type: "doc",
      content: [
        {
          type: "mediaEmbed",
          attrs: { id: "embed-1", src: "https://example.com/video.mp4", kind: "video", title: "Demo", filename: null },
        },
        { type: "pageBreak", attrs: { id: "break-1" } },
        { type: "blockMath", attrs: { id: "math-1", latex: "E = mc^2" } },
        {
          type: "paragraph",
          content: [{ type: "inlineMath", attrs: { latex: "x^2" } }],
        },
        {
          type: "details",
          attrs: { id: "details-1" },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Expand me" }],
            },
            {
              type: "detailsContent",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden body" }] }],
            },
          ],
        },
      ],
    };

    assert.equal(isRichContentDocument(document), true);
  });

  test("isRichContentDocument rejects mediaEmbed without src", () => {
    assert.equal(
      isRichContentDocument({
        type: "doc",
        content: [{ type: "mediaEmbed", attrs: { id: "embed-1", src: "" } }],
      }),
      false,
    );
  });

  test("RichContentRenderer renders extended block types to public markup", () => {
    const document: RichContentDocument = {
      type: "doc",
      content: [
        {
          type: "mediaEmbed",
          attrs: { id: "embed-1", src: "https://example.com/video.mp4", kind: "video", title: "Demo", filename: null },
        },
        { type: "pageBreak", attrs: { id: "break-1" } },
        { type: "blockMath", attrs: { id: "math-1", latex: "E = mc^2" } },
        {
          type: "details",
          attrs: { id: "details-1" },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Expand me" }],
            },
            {
              type: "detailsContent",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden body" }] }],
            },
          ],
        },
      ],
    };

    const html = renderToStaticMarkup(React.createElement(RichContentRenderer, { content: document }));

    assert.match(html, /sunny-rich-content-media-embed/);
    assert.match(html, /sunny-rich-content-page-break/);
    assert.match(html, /sunny-rich-content-block-math/);
    assert.match(html, /sunny-rich-content-details/);
    assert.match(html, /Hidden body/);
  });
});
