import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { CollectionAfterChangeHook } from "payload";

import { Checklist as ChecklistCollection } from "../../../src/collections/Checklist";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { createChecklistFromIntent } from "../../../src/lib/agent/tools/checklist-create";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const checklist = {
  createdAt: "2026-06-01T00:00:00.000Z",
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
  id: 7101,
  slug: "sunnypanel-release",
  status: "draft",
  summary: null,
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

const completedChecklist = {
  ...checklist,
  groups: [
    {
      items: [
        {
          ...checklist.groups[0]!.items[0]!,
          completedAt: "2026-06-29T20:30:00.000+08:00",
          completionNote: "登录页修复已验收。",
          isCompleted: true,
        },
      ],
      title: "修复阶段",
    },
  ],
};

const existingTimelineEvent = {
  createdAt: "2026-06-01T00:00:00.000Z",
  description: "旧说明",
  eventDate: "2026-06-01T00:00:00.000Z",
  id: 8101,
  isFeatured: false,
  relatedChecklist: checklist.id,
  relatedTaskKey: "item-login",
  sortOrder: 0,
  sourceType: "checklist",
  status: "draft",
  title: "完成清单项：登录页修复",
  type: "project",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

const completeIntent: Extract<AgentIntent, { intent: "complete_plan_item" }> = {
  args: {
    checklistTitle: "SunnyPanel 发布清单",
    completedAt: "2026-06-29T20:30:00.000+08:00",
    completionNote: "登录页修复已验收。",
    groupTitle: "修复阶段",
    itemTitle: "登录页修复",
  },
  intent: "complete_plan_item",
};

beforeEach(() => {
  resetPayloadStub();
});

const operationsFor = (type: "create" | "update", collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === type &&
      (operation.args as { collection?: string }).collection === collection,
  );

const setupPayload = ({
  checklists = [checklist],
  timelineEvents = [],
}: {
  checklists?: unknown[];
  timelineEvents?: unknown[];
} = {}) => {
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };

    if (args.collection === "checklists") {
      return {
        docs: checklists,
        totalDocs: checklists.length,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        docs: timelineEvents,
        totalDocs: timelineEvents.length,
      };
    }

    return {
      docs: [],
      totalDocs: 0,
    };
  });

  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "checklists") {
      return checklists.find(
        (document) =>
          document != null &&
          typeof document === "object" &&
          (document as { id?: unknown }).id === args.id,
      ) ?? null;
    }

    return null;
  });

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "checklists") {
      return {
        id: 7201,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: 8201,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 8301,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });

  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown>; id?: number };

    if (args.collection === "checklists") {
      return {
        ...checklist,
        groups: args.data?.groups,
        id: args.id ?? checklist.id,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: args.id ?? existingTimelineEvent.id,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });
};

const timelineDataFrom = (type: "create" | "update") =>
  (operationsFor(type, "timeline-events")[0]?.args as { data?: Record<string, unknown> } | undefined)?.data;

test("create_checklist does not generate Timeline events", async () => {
  setupPayload();

  await createChecklistFromIntent(
    {
      groups: [
        {
          items: [{ description: null, isCompleted: false, title: "登录页修复" }],
          title: "修复阶段",
        },
      ],
      title: "SunnyPanel 发布清单",
    },
    undefined,
    {
      payload: await getPayloadClient() as never,
      userId: 1,
    },
  );

  assert.equal(operationsFor("create", "checklists").length, 1);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
});

test("append checklist item does not generate Timeline events", async () => {
  setupPayload();

  await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        description: "补一条回归验证。",
        groupTitle: "修复阶段",
        itemTitle: "回归验证",
      },
      intent: "append_plan_item",
    },
    undefined,
    { userId: 1 },
  );

  assert.equal(operationsFor("update", "checklists").length, 1);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.equal(operationsFor("update", "timeline-events").length, 0);
});

test("complete_checklist_item creates a checklist-sourced Timeline event with stable semantics", async () => {
  setupPayload();

  await executeAgentIntent(completeIntent, undefined, { userId: 1 });

  const data = timelineDataFrom("create");
  assert.ok(data);
  assert.equal(data.relatedChecklist, checklist.id);
  assert.equal(data.relatedTaskKey, "item-login");
  assert.equal(data.sourceType, "checklist");
  assert.equal(data.type, "project");
  assert.equal(data.status, "draft");
  assert.equal(data.visibility, "private");
  assert.equal(data.eventDate, "2026-06-29T20:30:00.000+08:00");
  assert.match(String(data.title), /^完成清单项：/);
  assert.match(String(data.title), /登录页修复/);
  assert.match(String(data.description), /SunnyPanel 发布清单/);
  assert.match(String(data.description), /修复阶段/);
  assert.match(String(data.description), /登录页修复/);
  assert.match(String(data.description), /登录页修复已验收/);
});

test("checklist afterChange completion hook uses the same checklist Timeline semantics", async () => {
  const createdEvents: Record<string, unknown>[] = [];
  const afterChangeHook = ChecklistCollection.hooks?.afterChange?.[0] as CollectionAfterChangeHook;

  assert.ok(afterChangeHook);

  await afterChangeHook({
    doc: completedChecklist,
    operation: "update",
    previousDoc: checklist,
    req: {
      context: {},
      payload: {
        create: async (input: unknown) => {
          const args = input as { collection?: string; data?: Record<string, unknown> };

          if (args.collection === "timeline-events" && args.data) {
            createdEvents.push(args.data);
          }

          return { id: 8202, ...(args.data ?? {}) };
        },
        find: async () => ({
          docs: [],
          totalDocs: 0,
        }),
      },
    },
  } as unknown as Parameters<CollectionAfterChangeHook>[0]);

  assert.equal(createdEvents.length, 1);
  assert.equal(createdEvents[0]?.sourceType, "checklist");
  assert.equal(createdEvents[0]?.relatedChecklist, checklist.id);
  assert.equal(createdEvents[0]?.relatedTaskKey, "item-login");
  assert.match(String(createdEvents[0]?.title), /^完成清单项：/);
  assert.match(String(createdEvents[0]?.description), /SunnyPanel 发布清单/);
  assert.match(String(createdEvents[0]?.description), /修复阶段/);
  assert.match(String(createdEvents[0]?.description), /登录页修复/);
});

test("completion note updates checklist item and Timeline description without duplicates", async () => {
  setupPayload({
    checklists: [
      {
        ...checklist,
        groups: completedChecklist.groups,
      },
    ],
    timelineEvents: [existingTimelineEvent],
  });

  await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        completionNote: "补充：验证了错误态和成功态。",
        groupTitle: "修复阶段",
        itemTitle: "登录页修复",
      },
      intent: "add_completion_note",
    },
    undefined,
    { userId: 1 },
  );

  const checklistUpdate = operationsFor("update", "checklists")[0];
  const timelineUpdate = timelineDataFrom("update");
  const updatedItem = (checklistUpdate?.args as { data?: { groups?: Array<{ items?: Array<Record<string, unknown>> }> } })
    .data?.groups?.[0]?.items?.[0];

  assert.equal(updatedItem?.completionNote, "补充：验证了错误态和成功态。");
  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.ok(timelineUpdate);
  assert.equal(timelineUpdate.sourceType, "checklist");
  assert.match(String(timelineUpdate.description), /SunnyPanel 发布清单/);
  assert.match(String(timelineUpdate.description), /修复阶段/);
  assert.match(String(timelineUpdate.description), /登录页修复/);
  assert.match(String(timelineUpdate.description), /错误态和成功态/);
});

test("completion note for unfinished item clarifies without Timeline writes", async () => {
  setupPayload();

  const result = await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        completionNote: "补充：还没完成就写备注。",
        groupTitle: "修复阶段",
        itemTitle: "登录页修复",
      },
      intent: "add_completion_note",
    },
    undefined,
    { userId: 1 },
  );

  assert.match(result.assistantMessage, /还没被标记完成/);
  assert.equal(operationsFor("update", "checklists").length, 0);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.equal(operationsFor("update", "timeline-events").length, 0);
});

test("repeating completion of the same item updates existing Timeline instead of duplicating it", async () => {
  setupPayload({ timelineEvents: [existingTimelineEvent] });

  await executeAgentIntent(completeIntent, undefined, { userId: 1 });

  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.equal(operationsFor("update", "timeline-events").length, 1);
  assert.equal(
    (operationsFor("update", "timeline-events")[0]?.args as { id?: number }).id,
    existingTimelineEvent.id,
  );
});
