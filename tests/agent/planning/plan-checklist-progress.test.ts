import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculatePlanChecklistProgress,
  type PlanChecklistProgress,
} from "../../../src/lib/agent/planning/plan-checklist-progress";

const emptyProgress: PlanChecklistProgress = {
  completedChecklistCount: 0,
  completedItems: 0,
  completionRate: 0,
  hasLinkedChecklists: false,
  linkedChecklistCount: 0,
  totalItems: 0,
};

test("no linked checklist returns zero progress", () => {
  assert.deepEqual(calculatePlanChecklistProgress({ linkedContent: [] }), emptyProgress);
  assert.deepEqual(calculatePlanChecklistProgress({ linkedContent: null }), emptyProgress);
});

test("single checklist with no completed items returns 0 percent", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [{ relationTo: "checklists", value: 1 }],
    checklists: [
      {
        groups: [
          {
            items: [
              { isCompleted: false },
              { isCompleted: false },
              { isCompleted: null },
            ],
          },
        ],
        id: 1,
      },
    ],
  });

  assert.equal(progress.completedItems, 0);
  assert.equal(progress.totalItems, 3);
  assert.equal(progress.completionRate, 0);
  assert.equal(progress.linkedChecklistCount, 1);
  assert.equal(progress.completedChecklistCount, 0);
  assert.equal(progress.hasLinkedChecklists, true);
});

test("single checklist with one of four completed returns 25 percent", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [{ relationTo: "checklists", value: 1 }],
    checklists: [
      {
        groups: [
          {
            items: [
              { isCompleted: true },
              { isCompleted: false },
              { isCompleted: false },
              { isCompleted: false },
            ],
          },
        ],
        id: 1,
      },
    ],
  });

  assert.equal(progress.completedItems, 1);
  assert.equal(progress.totalItems, 4);
  assert.equal(progress.completionRate, 25);
});

test("fully completed checklist returns 100 percent and counts completed checklist", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [{ relationTo: "checklists", value: 1 }],
    checklists: [
      {
        groups: [
          {
            items: [
              { isCompleted: true },
              { isCompleted: true },
            ],
          },
        ],
        id: 1,
      },
    ],
  });

  assert.equal(progress.completedItems, 2);
  assert.equal(progress.totalItems, 2);
  assert.equal(progress.completionRate, 100);
  assert.equal(progress.completedChecklistCount, 1);
});

test("multiple linked checklists aggregate item and checklist completion", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [
      { relationTo: "checklists", value: 1 },
      { relationTo: "checklists", value: 2 },
    ],
    checklists: [
      {
        groups: [{ items: [{ isCompleted: true }, { isCompleted: false }] }],
        id: 1,
      },
      {
        groups: [{ items: [{ isCompleted: true }, { isCompleted: true }] }],
        id: 2,
      },
    ],
  });

  assert.equal(progress.completedItems, 3);
  assert.equal(progress.totalItems, 4);
  assert.equal(progress.completionRate, 75);
  assert.equal(progress.linkedChecklistCount, 2);
  assert.equal(progress.completedChecklistCount, 1);
});

test("empty groups empty items and malformed checklists are safe", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [
      { relationTo: "checklists", value: 1 },
      { relationTo: "checklists", value: 2 },
      { relationTo: "checklists", value: 3 },
    ],
    checklists: [
      { groups: [], id: 1 },
      { groups: [{ items: null }], id: 2 },
      { groups: null, id: 3 },
      null,
      { id: "not-linked", groups: [{ items: [{ isCompleted: true }] }] },
    ],
  });

  assert.equal(progress.completedItems, 0);
  assert.equal(progress.totalItems, 0);
  assert.equal(progress.completionRate, 0);
  assert.equal(progress.linkedChecklistCount, 3);
  assert.equal(progress.completedChecklistCount, 0);
});

test("non checklist linkedContent is ignored", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [
      { relationTo: "posts", value: 10 },
      { relationTo: "notes", value: 11 },
      { relationTo: "checklists", value: 1 },
    ],
    checklists: [
      { groups: [{ items: [{ isCompleted: true }] }], id: 1 },
      { groups: [{ items: [{ isCompleted: true }] }], id: 10 },
    ],
  });

  assert.equal(progress.linkedChecklistCount, 1);
  assert.equal(progress.totalItems, 1);
  assert.equal(progress.completedItems, 1);
});

test("populated checklist objects in linkedContent are supported and deduplicated", () => {
  const progress = calculatePlanChecklistProgress({
    linkedContent: [
      {
        relationTo: "checklists",
        value: {
          groups: [{ items: [{ isCompleted: true }, { isCompleted: false }] }],
          id: 1,
          title: "上线清单",
        },
      },
      { relationTo: "checklists", value: 1 },
    ],
    checklists: [
      {
        groups: [{ items: [{ isCompleted: false }] }],
        id: 1,
      },
    ],
  });

  assert.equal(progress.linkedChecklistCount, 1);
  assert.equal(progress.completedItems, 1);
  assert.equal(progress.totalItems, 2);
  assert.equal(progress.completionRate, 50);
});

test("calculatePlanChecklistProgress does not mutate input objects", () => {
  const input = {
    checklists: [
      {
        groups: [{ items: [{ isCompleted: true }, { isCompleted: false }] }],
        id: 1,
      },
    ],
    linkedContent: [{ relationTo: "checklists", value: 1 }],
  };
  const before = structuredClone(input);

  calculatePlanChecklistProgress(input);

  assert.deepEqual(input, before);
});
