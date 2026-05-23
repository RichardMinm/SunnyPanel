import assert from "node:assert/strict";
import test from "node:test";

import { getReadingMinutesFromContent } from "../../src/lib/markdown/reading-time";

test("getReadingMinutesFromContent accepts markdown strings only", () => {
  const markdown = "# Title\n\nThis is a short paragraph with enough words to estimate reading time.";
  assert.ok(getReadingMinutesFromContent(markdown) >= 1);
  assert.equal(getReadingMinutesFromContent({ root: {} }), 0);
});
