import assert from "node:assert/strict";
import test from "node:test";

import { deriveRichContentFields } from "../../src/lib/rich-content/derive";
import { getReadingMinutesFromContent } from "../../src/lib/markdown/reading-time";

test("getReadingMinutesFromContent accepts markdown strings only", () => {
  const markdown = "# Title\n\nThis is a short paragraph with enough words to estimate reading time.";
  assert.ok(getReadingMinutesFromContent(markdown) >= 1);
  assert.equal(getReadingMinutesFromContent({ root: {} }), 0);
  assert.equal(getReadingMinutesFromContent(""), 0);
});

test("markdown reading time stays consistent with rich content derive for plain text", () => {
  const plainText = "word ".repeat(250).trim();
  const markdown = `# Title\n\n${plainText}`;
  const derived = deriveRichContentFields({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: plainText }] }],
  });

  assert.equal(getReadingMinutesFromContent(markdown), derived.readingMinutes);
});
