import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { Checklist, Plan, User } from "../../../src/payload-types";
import {
  assembleWorkspaceSnapshot,
  type WorkspaceCoreData,
} from "../../../src/lib/payload/workspace";
import type { PlanChecklistProgress } from "../../../src/lib/agent/planning/plan-checklist-progress";
import {
  getPayloadStubOperations,
  resetPayloadStub,
} from "../../stubs/payload-client";

type SnapshotWithChecklistProgress = ReturnType<typeof assembleWorkspaceSnapshot> & {
  checklistProgressByPlanId?: Record<string, PlanChecklistProgress>;
};

const makePlan = (overrides: Partial<Plan> = {}): Plan => ({
  agentState: "idle",
  createdAt: "2026-06-01T00:00:00.000Z",
  executionMode: "manual",
  id: 1001,
  linkedContent: [],
  priority: "medium",
  progress: 73,
  state: "active",
  status: "draft",
  title: "SunnyPanel 第一版上线计划",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
  ...overrides,
} as Plan);

const makeChecklist = (overrides: Partial<Checklist> = {}): Checklist => ({
  createdAt: "2026-06-01T00:00:00.000Z",
  groups: [
    {
      items: [
        { id: "item-1", isCompleted: true, title: "完成 Agent 主链路" },
        { id: "item-2", isCompleted: false, title: "补 E2E" },
        { id: "item-3", isCompleted: false, title: "整理文档" },
        { id: "item-4", isCompleted: false, title: "部署内测" },
      ],
      title: "上线阶段",
    },
  ],
  id: 2001,
  slug: "sunnypanel-release",
  status: "draft",
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
  ...overrides,
} as Checklist);

const emptyCount = { totalDocs: 0 };

const makeCore = ({
  checklists = [],
  plans = [],
}: {
  checklists?: Checklist[];
  plans?: Plan[];
}): WorkspaceCoreData => ({
  agentRuns: { docs: [], totalDocs: 0 },
  checklists: { docs: checklists },
  counts: {
    draftNotes: emptyCount,
    draftPosts: emptyCount,
    draftTimelineEvents: emptyCount,
    draftUpdates: emptyCount,
    publicChecklists: emptyCount,
    publicNotes: emptyCount,
    publicPages: emptyCount,
    publicPosts: emptyCount,
    publicTimelineEvents: emptyCount,
    publicUpdates: emptyCount,
  },
  notes: { docs: [] },
  pages: { docs: [] },
  planReviews: { docs: [], totalDocs: 0 },
  plans: { docs: plans },
  posts: { docs: [] },
  schedule: {
    today: [],
    tomorrow: [],
  },
  timelineEvents: { docs: [] },
  updates: { docs: [] },
  user: {
    createdAt: "2026-06-01T00:00:00.000Z",
    email: "codex@sunnypanel.local",
    id: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
  } as User,
});

const getProgress = (snapshot: SnapshotWithChecklistProgress, planId: number) =>
  snapshot.checklistProgressByPlanId?.[String(planId)];

beforeEach(() => {
  resetPayloadStub();
});

test("workspace snapshot returns checklistProgress for linked checklist plans", () => {
  const plan = makePlan({
    linkedContent: [{ relationTo: "checklists", value: 2001 }],
  });
  const snapshot = assembleWorkspaceSnapshot(makeCore({
    checklists: [makeChecklist()],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;

  assert.deepEqual(getProgress(snapshot, plan.id), {
    completedChecklistCount: 0,
    completedItems: 1,
    completionRate: 25,
    hasLinkedChecklists: true,
    linkedChecklistCount: 1,
    totalItems: 4,
  });
});

test("workspace snapshot only counts checklist linkedContent", () => {
  const plan = makePlan({
    linkedContent: [
      { relationTo: "posts", value: 2001 },
      { relationTo: "notes", value: 3001 },
      { relationTo: "checklists", value: 2001 },
    ],
  });
  const snapshot = assembleWorkspaceSnapshot(makeCore({
    checklists: [
      makeChecklist(),
      makeChecklist({
        id: 3001,
        groups: [{ items: [{ isCompleted: true, title: "不应计入" }], title: "其他" }],
      }),
    ],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;

  assert.equal(getProgress(snapshot, plan.id)?.linkedChecklistCount, 1);
  assert.equal(getProgress(snapshot, plan.id)?.totalItems, 4);
});

test("computed progress rises when checklist item completion changes", () => {
  const plan = makePlan({
    linkedContent: [{ relationTo: "checklists", value: 2001 }],
  });
  const before = assembleWorkspaceSnapshot(makeCore({
    checklists: [makeChecklist()],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;
  const after = assembleWorkspaceSnapshot(makeCore({
    checklists: [
      makeChecklist({
        groups: [
          {
            items: [
              { id: "item-1", isCompleted: true, title: "完成 Agent 主链路" },
              { id: "item-2", isCompleted: true, title: "补 E2E" },
              { id: "item-3", isCompleted: false, title: "整理文档" },
              { id: "item-4", isCompleted: false, title: "部署内测" },
            ],
            title: "上线阶段",
          },
        ],
      }),
    ],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;

  assert.equal(getProgress(before, plan.id)?.completionRate, 25);
  assert.equal(getProgress(after, plan.id)?.completionRate, 50);
});

test("rollback-restored checklist groups naturally restore computed progress", () => {
  const plan = makePlan({
    linkedContent: [{ relationTo: "checklists", value: 2001 }],
  });
  const completed = assembleWorkspaceSnapshot(makeCore({
    checklists: [
      makeChecklist({
        groups: [
          {
            items: [
              { id: "item-1", isCompleted: true, title: "完成 Agent 主链路" },
              { id: "item-2", isCompleted: true, title: "补 E2E" },
              { id: "item-3", isCompleted: false, title: "整理文档" },
              { id: "item-4", isCompleted: false, title: "部署内测" },
            ],
            title: "上线阶段",
          },
        ],
      }),
    ],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;
  const rolledBack = assembleWorkspaceSnapshot(makeCore({
    checklists: [makeChecklist()],
    plans: [plan],
  })) as SnapshotWithChecklistProgress;

  assert.equal(getProgress(completed, plan.id)?.completionRate, 50);
  assert.equal(getProgress(rolledBack, plan.id)?.completionRate, 25);
});

test("delete checklist rollback restores linkedContent and computed progress without Plan.progress writes", () => {
  const planWithoutChecklist = makePlan({ linkedContent: [] });
  const planWithChecklist = makePlan({
    linkedContent: [{ relationTo: "checklists", value: 2001 }],
  });
  const deleted = assembleWorkspaceSnapshot(makeCore({
    checklists: [],
    plans: [planWithoutChecklist],
  })) as SnapshotWithChecklistProgress;
  const restored = assembleWorkspaceSnapshot(makeCore({
    checklists: [makeChecklist()],
    plans: [planWithChecklist],
  })) as SnapshotWithChecklistProgress;

  assert.equal(getProgress(deleted, planWithoutChecklist.id)?.completionRate, 0);
  assert.equal(getProgress(restored, planWithChecklist.id)?.completionRate, 25);
  assert.equal(restored.plans.active[0]?.progress, 73);
  assert.equal(getPayloadStubOperations().some((operation) => operation.type === "update"), false);
});
