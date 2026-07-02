import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeAgentIntent } from "../../../src/lib/agent/executor";
import type { CreateChecklistArgs } from "../../../src/lib/agent/schemas";
import {
  buildChecklistCreateData,
  buildCreateChecklistRollbackPayload,
  createChecklistFromIntent,
  createChecklistSlugBase,
  resolveUniqueChecklistSlug,
} from "../../../src/lib/agent/tools/checklist-create";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindHandler,
} from "../../stubs/payload-client";

const sampleArgs: CreateChecklistArgs = {
  groups: [
    {
      items: [
        {
          description: "修复登录表单和鉴权回跳。",
          isCompleted: true,
          title: "修复登录页",
        },
      ],
      title: "上线收尾",
    },
  ],
  sourceText: "从 SunnyPanel 第一版计划草案生成。",
  summary: "来源计划：SunnyPanel 第一版上线计划草案",
  title: "SunnyPanel 第一版上线任务清单",
};

beforeEach(() => {
  resetPayloadStub();
});

test("adapter maps create checklist args to private draft Payload data", () => {
  const data = buildChecklistCreateData(sampleArgs, {
    slug: "sunnypanel-launch-checklist",
  });

  assert.equal(data.title, sampleArgs.title);
  assert.equal(data.slug, "sunnypanel-launch-checklist");
  assert.equal(data.visibility, "private");
  assert.equal(data.status, "draft");
  assert.equal(data.summary, sampleArgs.summary);
  assert.equal(data.groups.length, 1);
  assert.equal(data.groups[0]?.title, "上线收尾");
  assert.equal(data.groups[0]?.items?.[0]?.title, "修复登录页");
  assert.equal(data.groups[0]?.items?.[0]?.description, "修复登录表单和鉴权回跳。");
  assert.equal(data.groups[0]?.items?.[0]?.isCompleted, false);
  assert.equal("sourceText" in data, false);
  assert.equal(sampleArgs.groups[0]?.items[0]?.isCompleted, true);
});

test("Chinese checklist titles generate a safe slug base", () => {
  const slug = createChecklistSlugBase("上线清单");

  assert.match(slug, /^checklist-[a-z0-9]+$/);
});

test("slug conflict resolves to a different candidate", async () => {
  let calls = 0;
  const payload = {
    find: async () => {
      calls += 1;

      return calls === 1
        ? { docs: [{ id: 1, slug: "sunny-launch" }], totalDocs: 1 }
        : { docs: [], totalDocs: 0 };
    },
  };

  const slug = await resolveUniqueChecklistSlug("Sunny Launch", {
    payload,
    preferredBase: "sunny-launch",
  });

  assert.notEqual(slug, "sunny-launch");
  assert.match(slug, /^sunny-launch-[a-z0-9-]+$/);
  assert.equal(calls, 2);
});

test("invalid checklist create args fail before Payload writes", async () => {
  await assert.rejects(
    createChecklistFromIntent(
      {
        ...sampleArgs,
        title: " ",
      },
      undefined,
      { userId: 7 },
    ),
    /title/,
  );
  assert.deepEqual(getPayloadStubOperations(), []);
});

test("createChecklistFromIntent writes a checklist and AgentRun", async () => {
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "checklists") {
      return {
        createdAt: "2026-07-01T00:00:00.000Z",
        id: 501,
        updatedAt: "2026-07-01T00:00:00.000Z",
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 901,
        ...args.data,
      };
    }

    throw new Error(`unexpected collection ${args.collection}`);
  });

  const result = await createChecklistFromIntent(sampleArgs, undefined, {
    userId: 7,
  });

  assert.equal(result.type, "create_checklist");
  assert.equal(result.checklistId, 501);
  assert.equal(result.title, sampleArgs.title);
  assert.equal(result.groupsCount, 1);
  assert.equal(result.itemsCount, 1);
  assert.deepEqual(result.rollbackPayload, buildCreateChecklistRollbackPayload(501));

  const operations = getPayloadStubOperations();
  const checklistCreate = operations.find(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === "checklists",
  );
  const agentRunCreate = operations.find(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === "agent-runs",
  );

  assert.ok(checklistCreate);
  assert.ok(agentRunCreate);
  assert.equal(
    ((checklistCreate.args as { data: { groups: Array<{ items: Array<{ isCompleted: boolean }> }> } }).data.groups[0]?.items[0]?.isCompleted),
    false,
  );
});

test("executor create_checklist branch creates the checklist after confirmation", async () => {
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "checklists") {
      return {
        createdAt: "2026-07-01T00:00:00.000Z",
        id: 502,
        updatedAt: "2026-07-01T00:00:00.000Z",
        ...args.data,
      };
    }

    return { id: 902, ...args.data };
  });

  const result = await executeAgentIntent(
    {
      args: sampleArgs,
      intent: "create_checklist",
    },
    undefined,
    { userId: 7 },
  );

  assert.match(result.assistantMessage, /已创建清单/);
  assert.equal(result.pendingAction, null);
  assert.deepEqual(result.rollbackPayload, buildCreateChecklistRollbackPayload(502));
});

test("create_checklist execute requires authenticated user context", async () => {
  await assert.rejects(
    createChecklistFromIntent(sampleArgs, undefined, {}),
    /authenticated user|user/i,
  );
  assert.deepEqual(getPayloadStubOperations(), []);
});
