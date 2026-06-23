import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const literalColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|rgb\(/;

const collectSourceFiles = (dir: string, extensions: string[]): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath, extensions));
      continue;
    }

    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
};

describe("UI primitives guard", () => {
  test("primitive components avoid literal colors", () => {
    const primitiveFiles = collectSourceFiles("src/components/primitives", [".tsx", ".ts"]);
    const offenders: string[] = [];

    for (const file of primitiveFiles) {
      if (!statSync(file).isFile()) continue;
      const source = read(file);
      if (literalColorPattern.test(source)) {
        offenders.push(file);
      }
    }

    assert.deepEqual(offenders, [], `literal colors in primitives: ${offenders.join(", ")}`);
  });

  test("sunny-primitives.css uses role tokens instead of literal colors", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    assert.doesNotMatch(css, literalColorPattern);
    assert.match(css, /--bg-elevated/);
    assert.match(css, /--border-default/);
    assert.match(css, /\.app-menu-item/);
    assert.match(css, /\.app-button/);
  });

  test("primitives index exports core App components", () => {
    const index = read("src/components/primitives/index.ts");
    for (const exportName of [
      "AppButton",
      "AppPopover",
      "AppDropdownMenu",
      "AppContextMenu",
      "AppTooltip",
      "AppTabs",
      "AppDialog",
      "AppInspectorSection",
    ]) {
      assert.match(index, new RegExp(exportName));
    }
  });
});
