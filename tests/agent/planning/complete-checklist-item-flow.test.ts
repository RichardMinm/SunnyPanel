import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeAgentIntent } from "../../../src/lib/agent/executor";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const baseChecklist = {
  createdAt: "2026-06-01T00:00:00.000Z",
  groups: [
    {
      items: [
        {
          completedAt: null,
          completionNote: null,
          id: "item-login",
          isCompleted: false,
          title: "登录页修复",
        },
      ],
      title: "修复阶段",
    },
  ],
  id: 401,
  slug: "release-checklist",
  status: "draft",
  summary: null,
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

const completionIntent: Extract<AgentIntent, { intent: "complete_plan_item" }> = {
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

const setupCompletionPayload = ({
  checklists = [baseChecklist],
  existingTimelineEvents = [],
}: {
  checklists?: unknown[];
  existingTimelineEvents?: unknown[];
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
        docs: existingTimelineEvents,
        totalDocs: existingTimelineEvents.length,
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

  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown>; id?: number };

    if (args.collection === "checklists") {
      return {
        ...baseChecklist,
        groups: args.data?.groups,
        id: args.id ?? baseChecklist.id,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: args.id ?? 901,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "timeline-events") {
      return {
        id: 901,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 1001,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });
};

const operationsByType = (type: "create" | "update") =>
  getPayloadStubOperations().filter((operation) => operation.type === type);

test("confirmed completion marks checklist item complete and writes completion metadata", async () => {
  setupCompletionPayload();

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  const checklistUpdate = operationsByType("update").find(
    (operation) => (operation.args as { collection?: string }).collection === "checklists",
  );
  assert.ok(checklistUpdate);
  const updatedGroups = (checklistUpdate.args as { data?: { groups?: Array<{ items?: Array<Record<string, unknown>> }> } })
    .data?.groups;
  const updatedItem = updatedGroups?.[0]?.items?.[0];

  assert.equal(updatedItem?.isCompleted, true);
  assert.equal(updatedItem?.completedAt, "2026-06-29T20:30:00.000+08:00");
  assert.equal(updatedItem?.completionNote, "登录页修复已验收。");
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /标记完成/);
});

test("confirmed completion creates Timeline event linked to checklist item", async () => {
  setupCompletionPayload();

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });
  const timelineCreate = operationsByType("create").find(
    (operation) => (operation.args as { collection?: string }).collection === "timeline-events",
  );

  assert.ok(timelineCreate);
  const data = (timelineCreate.args as { data?: Record<string, unknown> }).data;
  assert.equal(data?.relatedChecklist, baseChecklist.id);
  assert.equal(data?.relatedTaskKey, "item-login");
  assert.equal(data?.eventDate, "2026-06-29T20:30:00.000+08:00");
  assert.equal(data?.type, "project");
  assert.equal(data?.visibility, "private");
  assert.match(String(data?.description), /登录页修复已验收/);
  assert.equal((result.rollbackPayload as { strategy?: string }).strategy, "restore_checklist_groups_and_timeline");
});

test("missing checklist clarifies and does not write", async () => {
  setupCompletionPayload({ checklists: [] });

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  assert.match(result.assistantMessage, /没找到/);
  assert.equal(operationsByType("update").length, 0);
  assert.equal(operationsByType("create").length, 0);
});

test("missing item clarifies and does not write", async () => {
  setupCompletionPayload();

  const result = await executeAgentIntent(
    {
      args: {
        ...completionIntent.args,
        itemTitle: "不存在的清单项",
      },
      intent: "complete_plan_item",
    },
    undefined,
    { userId: 1 },
  );

  assert.match(result.assistantMessage, /没找到/);
  assert.equal(operationsByType("update").length, 0);
  assert.equal(operationsByType("create").length, 0);
});

test("ambiguous item asks for clarification and does not write", async () => {
  setupCompletionPayload({
    checklists: [
      {
        ...baseChecklist,
        groups: [
          {
            items: [{ id: "item-a", isCompleted: false, title: "联调验收" }],
            title: "测试阶段",
          },
          {
            items: [{ id: "item-b", isCompleted: false, title: "联调验收" }],
            title: "发布阶段",
          },
        ],
      },
    ],
  });

  const result = await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        completedAt: null,
        completionNote: null,
        groupTitle: null,
        itemTitle: "联调验收",
      },
      intent: "complete_plan_item",
    },
    undefined,
    { userId: 1 },
  );

  assert.match(result.assistantMessage, /多个|哪一个/);
  assert.equal(operationsByType("update").length, 0);
  assert.equal(operationsByType("create").length, 0);
});
