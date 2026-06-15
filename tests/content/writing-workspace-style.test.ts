import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Dashboard Writing workspace styling", () => {
  test("global styles import the writing workspace stylesheet", () => {
    const globals = read("src/app/globals.css");

    assert.match(globals, /sunny-dashboard-writing\.css/);
  });

  test("writing stylesheet defines a Mac-first three column editor surface", () => {
    const css = read("src/app/styles/sunny-dashboard-writing.css");

    assert.match(css, /\.sunny-writing-workspace/);
    assert.match(css, /grid-template-columns:\s*280px\s*minmax\(0,\s*1fr\)\s*300px/);
    assert.match(css, /\.sunny-writing-editor-canvas/);
    assert.match(css, /\.sunny-rich-editor-content/);
    assert.match(css, /@media\s*\(max-width:\s*1180px\)/);
  });
});
