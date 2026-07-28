import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  completeChecklistItemByKey,
  type ChecklistCompletionPayload,
} from "../../../src/lib/core-linkage/checklist-completion";
import { buildChecklistItemReferenceKey } from "../../../src/lib/core-linkage/checklist-item-key";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { evaluateScheduleReadinessGate } from "../../../src/lib/agent/schedule/readiness-gate";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

type ChecklistFixture = {
  createdAt: string;
  groups: Array<{
    items: Array<{
      completedAt: null | string;
      completionNote: null | string;
      description: null | string;
      id?: null | string;
      isCompleted: boolean;
      title: string;
    }>;
    title: string;
  }>;
  id: number;
  planId: number;
  slug: string;
  status: "draft" | "published";
  summary: null | string;
  title: string;
  updatedAt: string;
  visibility: "private" | "public";
};

const checklist: ChecklistFixture = {
  createdAt: "2026-07-01T00:00:00.000Z",
  groups: [
    {
      items: [
        {
          completedAt: null,
          completionNote: null,
          description: "完成登录页修复并通过冒烟验证。",
          id: "item-login",
          isCompleted: false,
          title: "登录页修复",
        },
      ],
      title: "修复阶段",
    },
  ],
  id: 501,
  planId: 77,
  slug: "release-checklist",
  status: "draft",
  summary: null,
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-07-01T00:00:00.000Z",
  visibility: "private",
};

const completionIntent = {
  args: {
    checklistTitle: checklist.title,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    completionNote: "登录页修复已验收。",
    groupTitle: "修复阶段",
    itemTitle: "登录页修复",
  },
  intent: "complete_plan_item",
} as const;

const plan = {
  id: 77,
  linkedContent: [
    { relationTo: "posts", value: 7 },
    { relationTo: "checklists", value: checklist.id },
  ],
  progress: 0,
  title: "SunnyPanel 发布计划",
};

type MutableState = {
  checklist: ChecklistFixture;
  plan: typeof plan;
  planUpdateError: boolean;
  timelineDeleteError: boolean;
  timelineEvent: null | Record<string, unknown>;
};

let state: MutableState;

const operationsFor = (type: "create" | "delete" | "update", collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === type &&
      (operation.args as { collection?: string }).collection === collection,
  );

const setupPayload = (input: Partial<MutableState> = {}) => {
  state = {
    checklist: structuredClone(checklist),
    plan: structuredClone(plan),
    planUpdateError: false,
    timelineDeleteError: false,
    timelineEvent: null,
    ...input,
  };

  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };

    if (args.collection === "checklists") {
      return { docs: [structuredClone(state.checklist)], totalDocs: 1 };
    }

    if (args.collection === "timeline-events") {
      return {
        docs: state.timelineEvent ? [structuredClone(state.timelineEvent)] : [],
        totalDocs: state.timelineEvent ? 1 : 0,
      };
    }

    return { docs: [], totalDocs: 0 };
  });

  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "checklists" && args.id === state.checklist.id) {
      return structuredClone(state.checklist);
    }

    if (args.collection === "plans" && args.id === state.plan.id) {
      return structuredClone(state.plan);
    }

    if (
      args.collection === "timeline-events" &&
      state.timelineEvent &&
      args.id === state.timelineEvent.id
    ) {
      return structuredClone(state.timelineEvent);
    }

    return null;
  });

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "timeline-events") {
      state.timelineEvent = { id: 802, ...(args.data ?? {}) };
      return structuredClone(state.timelineEvent);
    }

    if (args.collection === "agent-runs") {
      return { id: 1002, ...(args.data ?? {}) };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });

  setPayloadStubUpdateHandler(async (input) => {
    const args = input as {
      collection?: string;
      data?: Record<string, unknown>;
      id?: number;
    };

    if (args.collection === "checklists" && args.id === state.checklist.id) {
      state.checklist = {
        ...state.checklist,
        groups: args.data?.groups as ChecklistFixture["groups"],
      };
      return structuredClone(state.checklist);
    }

    if (args.collection === "timeline-events" && state.timelineEvent) {
      state.timelineEvent = { ...state.timelineEvent, ...(args.data ?? {}) };
      return structuredClone(state.timelineEvent);
    }

    if (args.collection === "plans" && args.id === state.plan.id) {
      if (state.planUpdateError) {
        throw new Error("database rejected private plan Phoenix");
      }
      state.plan = {
        ...state.plan,
        linkedContent: args.data?.linkedContent as typeof plan.linkedContent,
      };
      return structuredClone(state.plan);
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });

  setPayloadStubDeleteHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (
      args.collection === "timeline-events" &&
      state.timelineEvent &&
      args.id === state.timelineEvent.id
    ) {
      if (state.timelineDeleteError) {
        throw new Error("timeline compensation rejected private event Phoenix");
      }
      const deleted = state.timelineEvent;
      state.timelineEvent = null;
      return structuredClone(deleted);
    }

    throw new Error(`unexpected delete collection ${args.collection ?? "unknown"}`);
  });
};

beforeEach(() => {
  resetPayloadStub();
  setupPayload();
});

test("shared Checklist item key keeps the current one-based group-item-title contract", () => {
  assert.equal(
    buildChecklistItemReferenceKey({
      groupIndex: 0,
      itemIndex: 0,
      title: "  修复   登录页  ",
    }),
    "1-1-修复 登录页",
  );
  assert.equal(
    buildChecklistItemReferenceKey({
      groupIndex: 2,
      itemIndex: 4,
      title: "发布验证",
    }),
    "3-5-发布验证",
  );
});

test("schedule readiness creation uses the shared Checklist item key contract", () => {
  const result = evaluateScheduleReadinessGate({
    intent: {
      args: { answer: "" },
      confidence: 0.8,
      intent: "answer_question",
    },
    sessionState: {
      conversation: { lastTopic: "发布清单" },
      pending: {},
      planning: {
        checklistDraft: {
          groups: [
            {
              items: [{ done: false, title: "  修复   登录页  " }],
              title: "上线前",
            },
          ],
          sourcePlanId: 77,
          title: "发布清单草案",
        },
        workflow: "plan_creation",
      },
      schemaVersion: 1,
      semantic: {
        currentTarget: { entityType: "checklist", topic: "发布清单" },
        domain: "planning",
        stage: "drafting",
        workflow: "plan_creation",
      },
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    userMessage: "帮我排到日程",
  });

  assert.equal(result.gateApplied, true);
  if (!result.gateApplied) return;
  assert.equal(
    result.sessionState.scheduling?.slots?.tasks?.[0]?.sourceChecklistItemKey,
    "1-1-修复 登录页",
  );
});

test("completion service accepts only an exact embedded item ID or canonical key", async () => {
  const payload = await getPayloadClient();

  const embeddedIdResult = await completeChecklistItemByKey({
    checklistId: checklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "item-login",
    payload: payload as unknown as ChecklistCompletionPayload,
  });
  assert.equal(embeddedIdResult.ok, true);

  resetPayloadStub();
  const canonicalChecklist: ChecklistFixture = {
    ...structuredClone(checklist),
    groups: [
      {
        items: [
          {
            ...structuredClone(checklist.groups[0]!.items[0]!),
            id: undefined,
            title: "修复 登录页",
          },
        ],
        title: "修复阶段",
      },
    ],
  };
  setupPayload({ checklist: canonicalChecklist });
  const canonicalPayload = await getPayloadClient();
  const canonicalResult = await completeChecklistItemByKey({
    checklistId: canonicalChecklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "1-1-修复 登录页",
    payload: canonicalPayload as unknown as ChecklistCompletionPayload,
  });
  assert.equal(canonicalResult.ok, true);
  assert.equal(state.timelineEvent?.relatedTaskKey, "1-1-修复 登录页");

  resetPayloadStub();
  setupPayload({ checklist: canonicalChecklist });
  const staleKeyPayload = await getPayloadClient();
  const staleTitleResult = await completeChecklistItemByKey({
    checklistId: canonicalChecklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "1-1-修复登录页",
    payload: staleKeyPayload as unknown as ChecklistCompletionPayload,
  });
  assert.equal(staleTitleResult.ok, false);
  if (!staleTitleResult.ok) assert.equal(staleTitleResult.code, "item_not_found");
  assert.equal(operationsFor("update", "checklists").length, 0);

  const partialTitleResult = await completeChecklistItemByKey({
    checklistId: canonicalChecklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "修复登录页",
    payload: staleKeyPayload as unknown as ChecklistCompletionPayload,
  });
  assert.equal(partialTitleResult.ok, false);
  assert.equal(operationsFor("update", "checklists").length, 0);
});

test("completion service fails closed when an exact persisted item reference is duplicated", async () => {
  const duplicateChecklist: ChecklistFixture = {
    ...structuredClone(checklist),
    groups: [
      structuredClone(checklist.groups[0]!),
      {
        items: [
          {
            ...structuredClone(checklist.groups[0]!.items[0]!),
            id: "item-login",
            title: "另一个同 ID 条目",
          },
        ],
        title: "第二阶段",
      },
    ],
  };
  setupPayload({ checklist: duplicateChecklist });
  const payload = await getPayloadClient();

  const result = await completeChecklistItemByKey({
    checklistId: duplicateChecklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "item-login",
    payload: payload as unknown as ChecklistCompletionPayload,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ambiguous_item_reference");
  assert.equal(operationsFor("update", "checklists").length, 0);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
});

test("confirmed checklist completion writes exact Timeline relationships, links Plan, and reports persisted effects", async () => {
  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  assert.equal(result.status, undefined);
  assert.deepEqual(
    state.timelineEvent && {
      relatedChecklist: state.timelineEvent.relatedChecklist,
      relatedPlan: state.timelineEvent.relatedPlan,
      relatedTaskKey: state.timelineEvent.relatedTaskKey,
    },
    {
      relatedChecklist: checklist.id,
      relatedPlan: plan.id,
      relatedTaskKey: "item-login",
    },
  );
  assert.deepEqual(state.plan.linkedContent, [
    { relationTo: "posts", value: 7 },
    { relationTo: "checklists", value: checklist.id },
    { relationTo: "timeline-events", value: 802 },
  ]);

  const checklistUpdate = operationsFor("update", "checklists")[0];
  assert.ok(checklistUpdate);
  assert.equal(
    (checklistUpdate.args as { context?: { skipChecklistPlanProgressSync?: unknown } }).context
      ?.skipChecklistPlanProgressSync,
    undefined,
  );
  assert.equal(
    (checklistUpdate.args as { context?: { skipChecklistTimelineSync?: unknown } }).context
      ?.skipChecklistTimelineSync,
    true,
  );
  const exactReads = getPayloadStubOperations().filter(
    (operation) => operation.type === "findByID",
  );
  assert.ok(exactReads.length > 0);
  assert.ok(
    exactReads.every(
      (operation) =>
        (operation.args as { user?: { id?: unknown } }).user?.id === 1,
    ),
  );

  const agentRun = operationsFor("create", "agent-runs")[0];
  assert.ok(agentRun);
  const affectedDocuments = (
    agentRun.args as {
      data?: {
        affectedDocuments?: Array<{
          collection?: string;
          documentId?: number;
          operation?: string;
        }>;
      };
    }
  ).data?.affectedDocuments;
  assert.deepEqual(
    affectedDocuments?.map(({ collection, documentId, operation }) => ({
      collection,
      documentId,
      operation,
    })),
    [
      { collection: "checklists", documentId: checklist.id, operation: "update" },
      { collection: "timeline-events", documentId: 802, operation: "create" },
      { collection: "plans", documentId: plan.id, operation: "update" },
    ],
  );
  assert.ok(affectedDocuments?.every(({ documentId }) => Number.isInteger(documentId) && documentId! > 0));
});

test("Plan-link failure compensates Timeline before Checklist and returns a sanitized failure", async () => {
  setupPayload({ planUpdateError: true });

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  assert.equal(result.status, "failed");
  assert.doesNotMatch(result.assistantMessage, /Phoenix|database/i);
  assert.equal(state.timelineEvent, null);
  assert.deepEqual(state.checklist.groups, checklist.groups);

  const operations = getPayloadStubOperations();
  const failedPlanLinkIndex = operations.findIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "plans",
  );
  const timelineCompensationIndex = operations.findIndex(
    (operation) =>
      operation.type === "delete" &&
      (operation.args as { collection?: string }).collection === "timeline-events",
  );
  const checklistUpdateIndexes = operations.flatMap((operation, index) =>
    operation.type === "update" &&
    (operation.args as { collection?: string }).collection === "checklists"
      ? [index]
      : [],
  );

  assert.ok(failedPlanLinkIndex >= 0);
  assert.ok(timelineCompensationIndex > failedPlanLinkIndex);
  assert.ok(checklistUpdateIndexes.at(-1)! > timelineCompensationIndex);
});

test("repeating exact completion reuses one Timeline event and one Plan link", async () => {
  const payload = await getPayloadClient();
  const input = {
    checklistId: checklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    completionNote: "登录页修复已验收。",
    itemKey: "item-login",
    payload: payload as unknown as ChecklistCompletionPayload,
  };

  const first = await completeChecklistItemByKey(input);
  const second = await completeChecklistItemByKey(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(operationsFor("create", "timeline-events").length, 1);
  assert.equal(operationsFor("update", "timeline-events").length, 1);
  assert.equal(operationsFor("update", "plans").length, 1);
  assert.deepEqual(
    state.plan.linkedContent.filter((link) => link.relationTo === "timeline-events"),
    [{ relationTo: "timeline-events", value: 802 }],
  );
});

test("Timeline compensation failure is not masked and Checklist restoration is still attempted", async () => {
  setupPayload({
    planUpdateError: true,
    timelineDeleteError: true,
  });
  const payload = await getPayloadClient();

  const result = await completeChecklistItemByKey({
    checklistId: checklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "item-login",
    payload: payload as unknown as ChecklistCompletionPayload,
  });

  assert.deepEqual(result, {
    code: "compensation_failed",
    ok: false,
    safeMessage: "The completion outcome could not be reconciled safely.",
  });
  assert.deepEqual(state.checklist.groups, checklist.groups);
  assert.equal(operationsFor("delete", "timeline-events").length, 1);
  assert.equal(operationsFor("update", "checklists").length, 2);
});

test("Plan-link failure restores a pre-existing Timeline event before Checklist groups", async () => {
  const previousTimelineEvent = {
    description: "旧说明",
    eventDate: "2026-07-01T00:00:00.000Z",
    id: 801,
    isFeatured: true,
    relatedChecklist: checklist.id,
    relatedPlan: 88,
    relatedPost: null,
    relatedScheduleItem: 901,
    relatedTaskKey: "item-login",
    relatedUpdate: null,
    sortOrder: 4,
    sourceType: "checklist",
    status: "published",
    title: "旧 Timeline",
    type: "project",
    visibility: "private",
  };
  setupPayload({
    planUpdateError: true,
    timelineEvent: previousTimelineEvent,
  });
  const payload = await getPayloadClient();

  const result = await completeChecklistItemByKey({
    checklistId: checklist.id,
    completedAt: "2026-07-28T09:30:00.000+08:00",
    itemKey: "item-login",
    payload: payload as unknown as ChecklistCompletionPayload,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "plan_link_write_failed");
  assert.deepEqual(state.timelineEvent, previousTimelineEvent);
  assert.deepEqual(state.checklist.groups, checklist.groups);

  const operations = getPayloadStubOperations();
  const timelineUpdateIndexes = operations.flatMap((operation, index) =>
    operation.type === "update" &&
    (operation.args as { collection?: string }).collection === "timeline-events"
      ? [index]
      : [],
  );
  const checklistRestoreIndex = operations.findLastIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "checklists",
  );
  assert.equal(timelineUpdateIndexes.length, 2);
  assert.ok(timelineUpdateIndexes[1]! < checklistRestoreIndex);
});

test("rollback unlinks a newly created Timeline event before deleting it and then restores Checklist groups", async () => {
  setupPayload({
    plan: {
      ...plan,
      linkedContent: [
        ...plan.linkedContent,
        { relationTo: "timeline-events", value: 802 },
        { relationTo: "schedule-items", value: 901 },
      ],
    },
    timelineEvent: {
      id: 802,
      relatedChecklist: checklist.id,
      relatedPlan: plan.id,
      relatedTaskKey: "item-login",
      title: "完成：登录页修复",
    },
  });
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklist.groups,
        planLinkChanged: true,
        planLinkedContent: plan.linkedContent,
        timelineEvent: null,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: checklist.id,
        planId: plan.id,
        timelineEventId: 802,
      },
    },
    { payload: payload as never, persistAudit: false, userId: 1 },
  );

  assert.deepEqual(state.plan.linkedContent, [
    { relationTo: "posts", value: 7 },
    { relationTo: "checklists", value: checklist.id },
    { relationTo: "schedule-items", value: 901 },
  ]);

  const operations = getPayloadStubOperations();
  const planUnlinkIndex = operations.findIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "plans",
  );
  const timelineDeleteIndex = operations.findIndex(
    (operation) =>
      operation.type === "delete" &&
      (operation.args as { collection?: string }).collection === "timeline-events",
  );
  const checklistRestoreIndex = operations.findIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "checklists",
  );

  assert.ok(planUnlinkIndex >= 0);
  assert.ok(timelineDeleteIndex > planUnlinkIndex);
  assert.ok(checklistRestoreIndex > timelineDeleteIndex);
  assert.ok(
    operations
      .filter((operation) => operation.type === "findByID")
      .every(
        (operation) =>
          (operation.args as { user?: { id?: unknown } }).user?.id === 1,
      ),
  );
});

test("rollback restores a pre-existing Timeline event with its prior Plan and Schedule relations", async () => {
  const previousTimelineEvent = {
    description: "旧说明",
    eventDate: "2026-07-01T00:00:00.000Z",
    id: 801,
    isFeatured: true,
    relatedChecklist: checklist.id,
    relatedPlan: 88,
    relatedPost: null,
    relatedScheduleItem: 901,
    relatedTaskKey: "item-login",
    relatedUpdate: null,
    sortOrder: 4,
    sourceType: "checklist",
    status: "published",
    title: "旧 Timeline",
    type: "project",
    visibility: "private",
  };
  setupPayload({
    plan: {
      ...plan,
      linkedContent: [
        ...plan.linkedContent,
        { relationTo: "timeline-events", value: 801 },
        { relationTo: "schedule-items", value: 902 },
      ],
    },
    timelineEvent: {
      ...previousTimelineEvent,
      description: "新说明",
      relatedPlan: plan.id,
      relatedScheduleItem: 999,
    },
  });
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklist.groups,
        planLinkChanged: true,
        planLinkedContent: plan.linkedContent,
        timelineEvent: previousTimelineEvent,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: checklist.id,
        planId: plan.id,
        timelineEventId: previousTimelineEvent.id,
      },
    },
    { payload: payload as never, persistAudit: false, userId: 1 },
  );

  assert.deepEqual(state.timelineEvent, previousTimelineEvent);
  assert.deepEqual(state.plan.linkedContent, [
    { relationTo: "posts", value: 7 },
    { relationTo: "checklists", value: checklist.id },
    { relationTo: "schedule-items", value: 902 },
  ]);

  const operations = getPayloadStubOperations();
  const planUnlinkIndex = operations.findIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "plans",
  );
  const timelineRestoreIndex = operations.findIndex(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === "timeline-events",
  );
  assert.ok(planUnlinkIndex >= 0);
  assert.ok(timelineRestoreIndex > planUnlinkIndex);
});
