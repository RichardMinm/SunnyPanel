import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("rich content block validation", () => {
  test("validate supports new editor block types", () => {
    const validate = read("src/lib/rich-content/validate.ts");
    for (const type of [
      "mediaEmbed",
      "pageBreak",
      "blockMath",
      "inlineMath",
      "details",
      "detailsContent",
      "detailsSummary",
    ]) {
      assert.match(validate, new RegExp(`"${type}"`));
    }
  });

  test("RichContentRenderer renders new block types", () => {
    const renderer = read("src/components/public/RichContentRenderer.tsx");
    assert.match(renderer, /mediaEmbed/);
    assert.match(renderer, /pageBreak/);
    assert.match(renderer, /blockMath/);
    assert.match(renderer, /highlightCodeHtml/);
  });
});
