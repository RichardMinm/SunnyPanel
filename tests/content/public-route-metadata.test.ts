import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const staticPublicRoutes = [
  ["home", "src/app/(site)/page.tsx"],
  ["blog", "src/app/(site)/blog/page.tsx"],
  ["notes", "src/app/(site)/notes/page.tsx"],
  ["updates", "src/app/(site)/updates/page.tsx"],
  ["timeline", "src/app/(site)/timeline/page.tsx"],
  ["checklists", "src/app/(site)/checklists/page.tsx"],
] as const;

describe("Public route metadata", () => {
  test("public list routes expose basic metadata", () => {
    for (const [name, path] of staticPublicRoutes) {
      const source = read(path);

      assert.match(source, /Metadata/, `${name} should type route metadata`);
      assert.match(source, /title:/, `${name} should set title`);
      assert.match(source, /description:/, `${name} should set description`);
      assert.match(source, /openGraph:/, `${name} should set openGraph metadata`);
      assert.match(source, /alternates:/, `${name} should set canonical metadata`);
    }
  });

  test("blog detail metadata includes canonical article metadata", () => {
    const source = read("src/app/(site)/blog/[slug]/page.tsx");

    assert.match(source, /generateMetadata/);
    assert.match(source, /type:\s*"article"/);
    assert.match(source, /alternates:/);
    assert.match(source, /canonical:/);
  });

  test("site layout metadata has open graph defaults", () => {
    const source = read("src/app/(site)/layout.tsx");

    assert.match(source, /openGraph:/);
    assert.match(source, /SunnyPanel/);
    assert.match(source, /personal/i);
  });
});
