import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../src/lib/agent/rollback";
import { dryRunAgentTool } from "../../src/lib/agent/tool-registry";
import { modifyRecordFromIntent } from "../../src/lib/agent/tools/modify-record";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubUpdateHandler,
} from "../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

const resolvedTarget = (
  collection: "checklists" | "plans" | "schedule-items" | "timeline-events",
  document: Record<string, unknown>,
) => ({
  question: null,
  resolved: {
    collection,
    document,
    id: document.id as number,
    title: document.title as string,
  },
});

test("modify_record dry-run normalizes safe scalar patches for all four entity types", async () => {
  const cases = [
    {
      args: {
        changeDescription: "优先级改为高",
        entityName: "考研冲刺",
        entityType: "plan" as const,
      },
      collection: "plans",
      document: { id: 11, priority: "medium", title: "考研冲刺", visibility: "private" },
      expectedPatch: { priority: "high" },
    },
    {
      args: {
        changeDescription: "日期改到 2026-07-01，开始时间改为 09:30",
        entityName: "晨间复习",
        entityType: "schedule" as const,
      },
      collection: "schedule-items",
      document: { date: "2026-06-30", id: 12, startTime: "08:00", title: "晨间复习" },
      expectedPatch: { date: "2026-07-01", startTime: "09:30" },
    },
    {
      args: {
        changeDescription: "说明改为最后一周冲刺清单",
        entityName: "高数清单",
        entityType: "checklist" as const,
      },
      collection: "checklists",
      document: { id: 13, summary: "旧说明", title: "高数清单", visibility: "private" },
      expectedPatch: { summary: "最后一周冲刺清单" },
    },
    {
      args: {
        changeDescription: "设为精选，类型改为项目",
        entityName: "第一版上线",
        entityType: "timeline" as const,
      },
      collection: "timeline-events",
      document: { id: 14, isFeatured: false, title: "第一版上线", type: "milestone", visibility: "private" },
      expectedPatch: { isFeatured: true, type: "project" },
    },
  ];

  for (const item of cases) {
    const result = await dryRunAgentTool(
      {
        args: item.args,
        intent: "modify_record",
      },
      {
        createActionId: () => `modify-${item.document.id}`,
        resolveModifyRecord: async () =>
          resolvedTarget(item.collection as never, item.document),
      } as never,
    );

    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") continue;
    assert.equal(result.action.changes[0]?.collection, item.collection);
    assert.equal(result.action.changes[0]?.documentId, item.document.id);
    assert.deepEqual((result.action.args as { patch: unknown }).patch, item.expectedPatch);
    assert.equal((result.action.args as { targetId: number }).targetId, item.document.id);
  }
});

test("modify_record dry-run clarifies an ambiguous target", async () => {
  const result = await dryRunAgentTool(
    {
      args: {
        changeDescription: "优先级改为高",
        entityName: "复习",
        entityType: "plan",
      },
      intent: "modify_record",
    },
    {
      resolveModifyRecord: async () => ({
        question: "找到多个匹配目标：复习数学、复习英语。请指定名称或 ID。",
        resolved: null,
      }),
    } as never,
  );

  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /多个匹配目标/);
    assert.equal(result.pendingAction?.type, "await_clarification");
  }
});

test("modify_record rejects checklist nested item changes", async () => {
  const result = await dryRunAgentTool(
    {
      args: {
        changeDescription: "把第一组里的第一项改成已完成",
        entityName: "高数清单",
        entityType: "checklist",
        patch: { groups: [{ title: "不允许" }] },
      } as never,
      intent: "modify_record",
    },
    {
      resolveModifyRecord: async () =>
        resolvedTarget("checklists", {
          groups: [{ title: "原分组" }],
          id: 13,
          title: "高数清单",
          visibility: "private",
        }),
    } as never,
  );

  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /嵌套条目|不支持修改/);
  }
});

test("modify_record rejects agentBrief as internal Agent metadata", async () => {
  for (const entityType of ["plan", "schedule"] as const) {
    const result = await dryRunAgentTool(
      {
        args: {
          changeDescription: "Agent Brief 改为由 Agent 自动推进",
          entityName: entityType === "plan" ? "迁移计划" : "迁移日程",
          entityType,
          patch: { agentBrief: "由 Agent 自动推进" },
        },
        intent: "modify_record",
      } as never,
      {
        resolveModifyRecord: async () =>
          resolvedTarget(
            entityType === "plan" ? "plans" : "schedule-items",
            {
              agentBrief: "旧值",
              id: entityType === "plan" ? 21 : 22,
              title: entityType === "plan" ? "迁移计划" : "迁移日程",
            },
          ),
      } as never,
    );

    assert.equal(result.type, "clarify");
    if (result.type === "clarify") {
      assert.match(result.assistantMessage, /内部 Agent 元数据|不支持修改/);
    }
  }
});

test("modify_record rejects invalid values even when the field name is allowed", async () => {
  const result = await dryRunAgentTool(
    {
      args: {
        changeDescription: "优先级改成紧急",
        entityName: "考研冲刺",
        entityType: "plan",
        patch: { priority: "urgent" },
      } as never,
      intent: "modify_record",
    },
    {
      resolveModifyRecord: async () =>
        resolvedTarget("plans", {
          id: 11,
          priority: "medium",
          title: "考研冲刺",
          visibility: "private",
        }),
    } as never,
  );

  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /不能从|明确说明/);
  }
});

test("modify_record executes the normalized patch, records audit, and returns snapshot rollback", async () => {
  setPayloadStubFindByIDHandler(async () => ({
    date: "2026-06-30",
    id: 42,
    priority: "medium",
    startTime: "08:00",
    status: "planned",
    title: "晨间复习",
  }));
  setPayloadStubUpdateHandler(async (args) => ({
    date: "2026-07-01",
    id: 42,
    priority: "high",
    startTime: "09:30",
    status: "planned",
    title: "晨间复习",
    ...(args as { data?: object }).data,
  }));
  setPayloadStubCreateHandler(async () => ({ id: 900 }));

  const payload = await getPayloadClient();
  const result = await modifyRecordFromIntent(
    {
      changeDescription: "日期和优先级已确认",
      entityName: "晨间复习",
      entityType: "schedule",
      patch: {
        date: "2026-07-01",
        priority: "high",
        startTime: "09:30",
      },
      targetId: 42,
    },
    undefined,
    { payload: payload as never },
  );

  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "update")?.args,
    {
      collection: "schedule-items",
      data: {
        date: "2026-07-01",
        priority: "high",
        startTime: "09:30",
      },
      id: 42,
      overrideAccess: true,
    },
  );
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "agent-runs",
    ),
    true,
  );
  assert.deepEqual(result.rollbackPayload, {
    beforeSnapshot: {
      date: "2026-06-30",
      priority: "medium",
      startTime: "08:00",
    },
    strategy: "restore_modified_record",
    target: {
      collection: "schedule-items",
      documentId: 42,
    },
  });
});

test("restore_modified_record writes only the captured safe snapshot", async () => {
  const payload = await getPayloadClient();
  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        priority: "medium",
        title: "原计划",
      },
      strategy: "restore_modified_record",
      target: {
        collection: "plans",
        documentId: 71,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "update")?.args,
    {
      collection: "plans",
      data: {
        priority: "medium",
        title: "原计划",
      },
      id: 71,
      overrideAccess: true,
    },
  );
});
