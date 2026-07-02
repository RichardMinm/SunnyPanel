import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import { generateChecklistDraftFromPlanDraft } from "../../../src/lib/agent/planning/checklist-draft";
import { buildCreateChecklistInputFromDraft } from "../../../src/lib/agent/planning/prepare-checklist-creation";
import type { CreateChecklistArgs } from "../../../src/lib/agent/schemas";
import {
  appendChecklistLinkToPlanLinkedContent,
  buildCreateChecklistPlanLinkRollbackPayload,
  createChecklistFromIntent,
} from "../../../src/lib/agent/tools/checklist-create";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const sampleArgs: CreateChecklistArgs = {
  groups: [
    {
      items: [
        {
          description: null,
          isCompleted: false,
          title: "修复登录页",
        },
      ],
      title: "上线收尾",
    },
  ],
  sourceText: "从清单草案准备创建正式清单。",
  title: "SunnyPanel 第一版上线任务清单",
};

const planDraft: PlanDraft & { sourcePlanId: number } = {
  availableTime: "每天 2 小时",
  currentProgress: "已有 Dashboard 基础页面",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  scope: "登录页、Agent 对话、部署检查",
  sourcePlanId: 88,
  stages: [
    {
      tasks: ["修复登录页", "补齐 Agent 对话"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划",
};

beforeEach(() => {
  resetPayloadStub();
});

test("ChecklistDraft carries sourcePlanId from PlanDraft into create_checklist args", () => {
  const draft = generateChecklistDraftFromPlanDraft({ planDraft });
  const result = buildCreateChecklistInputFromDraft(draft);

  assert.equal(draft.sourcePlanId, 88);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create checklist args");
  assert.equal(result.args.sourcePlanId, 88);
});

test("appendChecklistLinkToPlanLinkedContent appends checklist relation without overwriting existing links", () => {
  const before = [
    { relationTo: "posts" as const, value: 11 },
    { relationTo: "checklists" as const, value: 22 },
  ];
  const result = appendChecklistLinkToPlanLinkedContent(before, 501);

  assert.deepEqual(result, [
    { relationTo: "posts", value: 11 },
    { relationTo: "checklists", value: 22 },
    { relationTo: "checklists", value: 501 },
  ]);
  assert.deepEqual(before, [
    { relationTo: "posts", value: 11 },
    { relationTo: "checklists", value: 22 },
  ]);
});

test("appendChecklistLinkToPlanLinkedContent deduplicates an existing checklist relation", () => {
  const before = [
    { relationTo: "checklists" as const, value: 501 },
    { relationTo: "checklists" as const, value: 501 },
  ];

  assert.deepEqual(appendChecklistLinkToPlanLinkedContent(before, 501), [
    { relationTo: "checklists", value: 501 },
  ]);
});

test("create checklist without sourcePlanId does not update plans", async () => {
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "checklists") {
      return { id: 501, ...args.data };
    }

    return { id: 901, ...args.data };
  });

  const result = await createChecklistFromIntent(sampleArgs, undefined, { userId: 7 });

  assert.equal(result.checklistId, 501);
  assert.equal(result.linkedPlanId, null);
  assert.equal(
    getPayloadStubOperations().some((operation) => {
      const args = operation.args as { collection?: string };
      return operation.type === "update" && args.collection === "plans";
    }),
    false,
  );
});

test("create checklist with sourcePlanId updates Plan linkedContent", async () => {
  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection: string; id: number };

    if (args.collection === "plans" && args.id === 88) {
      return {
        id: 88,
        linkedContent: [{ relationTo: "posts", value: 11 }],
        title: "SunnyPanel 第一版上线计划",
      };
    }

    return null;
  });
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "checklists") {
      return { id: 502, ...args.data };
    }

    return { id: 902, ...args.data };
  });
  setPayloadStubUpdateHandler(async (input) => ({ id: 88, ...(input as { data: Record<string, unknown> }).data }));

  const result = await createChecklistFromIntent(
    {
      ...sampleArgs,
      sourcePlanId: 88,
    },
    undefined,
    { userId: 7 },
  );

  assert.equal(result.linkedPlanId, 88);
  assert.deepEqual(result.beforeLinkedContent, [{ relationTo: "posts", value: 11 }]);
  assert.deepEqual(result.afterLinkedContent, [
    { relationTo: "posts", value: 11 },
    { relationTo: "checklists", value: 502 },
  ]);
  assert.deepEqual(result.rollbackPayload, buildCreateChecklistPlanLinkRollbackPayload({
    beforeLinkedContent: [{ relationTo: "posts", value: 11 }],
    checklistId: 502,
    planId: 88,
  }));

  const planUpdate = getPayloadStubOperations().find((operation) => {
    const args = operation.args as { collection?: string };
    return operation.type === "update" && args.collection === "plans";
  });
  assert.deepEqual((planUpdate?.args as { data?: unknown }).data, {
    linkedContent: [
      { relationTo: "posts", value: 11 },
      { relationTo: "checklists", value: 502 },
    ],
  });
});

test("sourcePlanId that cannot be resolved fails before creating a checklist", async () => {
  setPayloadStubFindByIDHandler(async () => null);
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));

  await assert.rejects(
    createChecklistFromIntent(
      {
        ...sampleArgs,
        sourcePlanId: 404,
      },
      undefined,
      { userId: 7 },
    ),
    /sourcePlanId|计划|Plan/i,
  );
  assert.equal(
    getPayloadStubOperations().some((operation) => {
      const args = operation.args as { collection?: string };
      return operation.type === "create" && args.collection === "checklists";
    }),
    false,
  );
});

test("plan update failure deletes the created checklist as compensation", async () => {
  setPayloadStubFindByIDHandler(async () => ({
    id: 88,
    linkedContent: [],
    title: "SunnyPanel 第一版上线计划",
  }));
  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "checklists") {
      return { id: 503, ...args.data };
    }

    return { id: 903, ...args.data };
  });
  setPayloadStubUpdateHandler(async () => {
    throw new Error("plan update failed");
  });
  setPayloadStubDeleteHandler(async () => ({ id: 503 }));

  await assert.rejects(
    createChecklistFromIntent(
      {
        ...sampleArgs,
        sourcePlanId: 88,
      },
      undefined,
      { userId: 7 },
    ),
    /plan update failed|已回滚|rolled back/i,
  );

  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .map((operation) => operation.args),
    [
      {
        collection: "checklists",
        id: 503,
        overrideAccess: true,
      },
    ],
  );
});
