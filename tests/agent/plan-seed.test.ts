import assert from "node:assert/strict";
import test from "node:test";

import {
  decomposePlanRuleBased,
  normalizeComposePlanArgs,
  parseDateFromText,
  parsePlanSeedFromText,
} from "../../src/lib/agent/workflows/plan-seed";

test("parseDateFromText parses Chinese month-day", () => {
  const ref = new Date(2026, 4, 19);
  assert.equal(parseDateFromText("从5月25日开始", ref), "2026-05-25");
});

test("parsePlanSeedFromText extracts linear algebra topic", () => {
  const seed = parsePlanSeedFromText(
    "请你为我制定一个完整的考研线性代数学习方案，从5月25日开始，大概2-3个月，每天一章加练习。",
  );

  assert.equal(seed.topic, "考研线性代数");
  assert.equal(seed.startDate, "2026-05-25");
  assert.ok(seed.durationDays && seed.durationDays >= 50);
  assert.ok(seed.title.includes("线性代数"));
  assert.ok(seed.title.length < 60);
});

test("normalizeComposePlanArgs shortens raw prompt title", () => {
  const raw =
    "请你为我制定一个完整的考研线性代数学习方案，从5月25日开始，大概2-3个月，每天一章加练习。";
  const normalized = normalizeComposePlanArgs({
    sourceText: raw,
    title: raw,
    goal: raw,
  });

  assert.notEqual(normalized.title, raw);
  assert.ok(normalized.title && normalized.title.length < 50);
});

test("decomposePlanRuleBased returns phases for linear algebra", () => {
  const decomposed = decomposePlanRuleBased({
    sourceText:
      "考研线性代数，从5月25日开始，2-3个月，每天一章加练习",
  });

  assert.ok(decomposed);
  assert.equal(decomposed?.phases.length, 6);
  assert.ok(decomposed?.phases[0]?.title.includes("行列式") || decomposed?.phases[0]?.title.length > 0);
});
