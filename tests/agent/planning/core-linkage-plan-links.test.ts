import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendPlanLink,
  removePlanLink,
} from "../../../src/lib/core-linkage/plan-links";

test("appendPlanLink preserves unrelated links while collapsing duplicate target links", () => {
  const result = appendPlanLink(
    [
      { relationTo: "posts", value: 11 },
      { relationTo: "schedule-items", value: 41 },
      { relationTo: "schedule-items", value: 41 },
    ],
    { relationTo: "schedule-items", value: 41 },
  );

  assert.deepEqual(result, [
    { relationTo: "posts", value: 11 },
    { relationTo: "schedule-items", value: 41 },
  ]);
});

test("appendPlanLink normalizes populated relationship objects and numeric values", () => {
  const result = appendPlanLink(
    [
      { relationTo: "posts", value: { id: 11, title: "已有文章" } },
      { relationTo: "checklists", value: { id: 21, title: "已有清单" } },
    ],
    { relationTo: "schedule-items", value: 41 },
  );

  assert.deepEqual(result, [
    { relationTo: "posts", value: 11 },
    { relationTo: "checklists", value: 21 },
    { relationTo: "schedule-items", value: 41 },
  ]);
});

test("appendPlanLink fails closed for malformed Plan linkedContent", () => {
  assert.throws(
    () => appendPlanLink([{ relationTo: "checklists", value: "invalid" }], {
      relationTo: "checklists",
      value: 21,
    }),
    /linkedContent/i,
  );
  assert.throws(
    () => appendPlanLink({ relationTo: "checklists", value: 21 }, {
      relationTo: "checklists",
      value: 21,
    }),
    /linkedContent/i,
  );
});

test("removePlanLink removes only the target and is idempotent", () => {
  const current = [
    { relationTo: "posts", value: 11 },
    { relationTo: "schedule-items", value: 41 },
    { relationTo: "schedule-items", value: 41 },
    { relationTo: "schedule-items", value: 42 },
  ];
  const link = { relationTo: "schedule-items" as const, value: 41 };
  const afterFirstRemoval = removePlanLink(current, link);

  assert.deepEqual(afterFirstRemoval, [
    { relationTo: "posts", value: 11 },
    { relationTo: "schedule-items", value: 42 },
  ]);
  assert.deepEqual(removePlanLink(afterFirstRemoval, link), afterFirstRemoval);
});
