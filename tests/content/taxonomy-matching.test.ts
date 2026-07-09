import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeTag, slugify } from "@/lib/taxonomy-helpers";

describe("Taxonomy matching helpers", () => {
  /* ── normalizeTag ── */

  describe("normalizeTag", () => {
    test("lowercases input", () => {
      assert.equal(normalizeTag("AI"), "ai");
      assert.equal(normalizeTag("JavaScript"), "javascript");
      assert.equal(normalizeTag("TypeScript"), "typescript");
    });

    test("trims whitespace", () => {
      assert.equal(normalizeTag("  tag  "), "tag");
      assert.equal(normalizeTag("\tleading"), "leading");
      assert.equal(normalizeTag("trailing\n"), "trailing");
    });

    test("preserves internal spaces and punctuation", () => {
      assert.equal(normalizeTag("c++"), "c++");
      assert.equal(normalizeTag("dot.net"), "dot.net");
      assert.equal(normalizeTag("ai ml"), "ai ml");
    });
  });

  /* ── slugify ── */

  describe("slugify", () => {
    test("converts spaces to hyphens and lowercases", () => {
      assert.equal(slugify("Java Security"), "java-security");
      assert.equal(slugify("Hello World"), "hello-world");
      assert.equal(slugify("Writing & Blogging"), "writing--blogging");
    });

    test("strips non-alphanumeric characters (underscores, punctuation)", () => {
      assert.equal(slugify("AI & ML"), "ai--ml");
      assert.equal(slugify("C++ Projects"), "c-projects");
      assert.equal(slugify("hello_world"), "helloworld");
    });

    test("trims leading and trailing whitespace", () => {
      assert.equal(slugify("  Java Security  "), "java-security");
    });

    test("collapses multiple spaces into a single hyphen", () => {
      assert.equal(slugify("Java   Security"), "java-security");
    });
  });

  /* ── Tag exact match logic ── */

  describe("tag exact match", () => {
    const tagMatches = (candidate: string, target: string): boolean =>
      normalizeTag(candidate) === normalizeTag(target);

    test("matches same tag regardless of case", () => {
      assert.ok(tagMatches("AI", "ai"));
      assert.ok(tagMatches("ai", "AI"));
      assert.ok(tagMatches("Ai", "ai"));
      assert.ok(tagMatches("ai", "ai"));
      assert.ok(tagMatches("JavaScript", "javascript"));
      assert.ok(tagMatches("JAVASCRIPT", "javascript"));
    });

    test("does not match different tags or substrings", () => {
      assert.ok(!tagMatches("daily", "ai"));
      assert.ok(!tagMatches("rain", "ai"));
      assert.ok(!tagMatches("painting", "ai"));
      assert.ok(!tagMatches("maintain", "ai"));
      assert.ok(!tagMatches("typescript", "javascript"));
      assert.ok(!tagMatches("tailwind", "ai"));
    });

    test("does not match when one tag contains another as substring", () => {
      assert.ok(!tagMatches("machine-learning", "learning"));
      assert.ok(!tagMatches("deep-learning", "learning"));
    });

    test("trims whitespace before comparison", () => {
      assert.ok(tagMatches("  ai  ", "ai"));
      assert.ok(tagMatches("ai", "  AI  "));
    });
  });

  /* ── Category slug match logic ── */

  describe("category slug match", () => {
    const categorySlugMatches = (
      categoryTitle: string,
      routeSlug: string,
    ): boolean => slugify(categoryTitle) === routeSlug;

    test("Java Security matches /categories/java-security", () => {
      assert.ok(categorySlugMatches("Java Security", "java-security"));
    });

    test("multi-word titles produce hyphenated slugs", () => {
      assert.ok(categorySlugMatches("Deep Learning", "deep-learning"));
      assert.ok(categorySlugMatches("Personal Growth", "personal-growth"));
    });

    test("titles with special characters match stripped slugs", () => {
      assert.ok(categorySlugMatches("AI & ML", "ai--ml"));
      assert.ok(categorySlugMatches("C++ Notes", "c-notes"));
    });

    test("does not match when titles differ", () => {
      assert.ok(!categorySlugMatches("Java Security", "python-security"));
      assert.ok(!categorySlugMatches("Frontend", "front-end"));
    });

    test("case-insensitive match", () => {
      assert.ok(categorySlugMatches("JAVA SECURITY", "java-security"));
      assert.ok(categorySlugMatches("java security", "java-security"));
    });

    test("slugify produces idempotent result for already-slugified input", () => {
      assert.equal(slugify("java-security"), "java-security");
      assert.equal(slugify("hello-world"), "hello-world");
    });
  });

  /* ── Regression: tag page uses exact match not contains ── */

  test("tag page uses normalizeTag not bare string contains", () => {
    /* "daily" normalizes to "daily" which is !== "ai" — confirms
     * substring-is-not-match behavior that the old `contains` operator
     * would have allowed. */
    assert.notEqual(normalizeTag("daily"), normalizeTag("ai"));
    assert.notEqual(normalizeTag("painting"), normalizeTag("ai"));
  });
});
