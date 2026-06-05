import assert from "node:assert/strict";
import test from "node:test";

import { getSiteCopy } from "../../src/lib/site-copy";

test("Chinese admin groups match Dashboard-first product language", () => {
  const groups = getSiteCopy("zh").admin.groups as Record<"agent" | "content" | "planning" | "settings" | "system", string>;

  assert.equal(groups.content, "内容管理");
  assert.equal(groups.planning, "计划与日程");
  assert.equal(groups.agent, "AI Agent");
  assert.equal(groups.settings, "设置");
  assert.equal(groups.system, "系统");
});
