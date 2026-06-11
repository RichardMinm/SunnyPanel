import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createEmptyRichDocument } from "../../src/lib/rich-content/defaults";

describe("rich content defaults", () => {
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
});
