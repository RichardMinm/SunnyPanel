import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { runWithAgentExecutionContext } from "../../../src/lib/agent/execution-context";
import { hasServerInternalFailedAuditCompensation } from "../../../src/lib/agent/internal-rollback-evidence";
import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import type { ComposeTimelineEventArgs } from "../../../src/lib/agent/schemas";
import { composeTimelineEventFromIntent } from "../../../src/lib/agent/tools/timeline-tools";
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

type Document = Record<string, unknown> & { id: number };

const plan = {
  id: 11,
  linkedContent: [{ relationTo: "posts", value: 7 }],
  title: "SunnyPanel 上线计划",
};

const checklist = {
  groups: [
    {
      id: "release",
      items: [
        {
          id: "item-login",
          isCompleted: true,
          title: "登录页修复",
        },
      ],
      title: "上线准备",
    },
  ],
  id: 31,
  planId: plan.id,
  title: "SunnyPanel 发布清单",
};

const existingTimelineEvent = {
  description: "旧说明",
  eventDate: "2026-07-01T00:00:00.000Z",
  id: 41,
  isFeatured: false,
  relatedChecklist: checklist.id,
  relatedPlan: null,
  relatedTaskKey: "item-login",
  sortOrder: 2,
  sourceType: "checklist",
  status: "draft",
  title: "旧 Timeline 标题",
  type: "project",
  visibility: "private",
};

type SetupOptions = {
  denied?: Set<string>;
  documents?: Document[];
  existingEvents?: Document[];
  failAgentRun?: boolean;
  failPlanLink?: boolean;
  failPlanUnlink?: boolean;
};

const setupPayload = ({
  denied = new Set(),
  documents = [plan, checklist],
  existingEvents = [],
  failAgentRun = false,
  failPlanLink = false,
  failPlanUnlink = false,
}: SetupOptions = {}) => {
  const state = new Map<string, Document>();
  for (const document of documents) {
    const collection = "groups" in document ? "checklists" : "plans";
    state.set(`${collection}:${document.id}`, structuredClone(document));
  }
  for (const event of existingEvents) {
    state.set(`timeline-events:${event.id}`, structuredClone(event));
  }

  let nextTimelineId = 101;
  let nextRunId = 201;

  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };
    const key = `${args.collection}:${args.id}`;
    if (denied.has(key)) {
      const error = new Error("private resource details");
      Object.assign(error, { status: 403 });
      throw error;
    }
    return structuredClone(state.get(key) ?? null);
  });

  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };
    if (args.collection !== "timeline-events") {
      return { docs: [], totalDocs: 0 };
    }
    const docs = [...state.entries()]
      .filter(([key]) => key.startsWith("timeline-events:"))
      .map(([, document]) => structuredClone(document));
    return { docs, totalDocs: docs.length };
  });

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };
    if (args.collection === "timeline-events") {
      const event = { id: nextTimelineId++, ...(args.data ?? {}) };
      state.set(`timeline-events:${event.id}`, structuredClone(event));
      return event;
    }
    if (args.collection === "agent-runs") {
      if (failAgentRun) {
        throw new Error("private audit failure");
      }
      return { id: nextRunId++, ...(args.data ?? {}) };
    }
    throw new Error(`unexpected create ${args.collection ?? "unknown"}`);
  });

  setPayloadStubUpdateHandler(async (input) => {
    const args = input as {
      collection?: string;
      data?: Record<string, unknown>;
      id?: number;
    };
    if (args.collection === "plans") {
      const links = args.data?.linkedContent;
      const hasTimelineLink =
        Array.isArray(links) &&
        links.some(
          (link) =>
            link != null &&
            typeof link === "object" &&
            (link as { relationTo?: unknown }).relationTo === "timeline-events",
        );
      if (failPlanLink || (failPlanUnlink && !hasTimelineLink)) {
        throw new Error("private plan write failure");
      }
    }
    const key = `${args.collection}:${args.id}`;
    const current = state.get(key);
    if (!current) {
      throw new Error("missing document");
    }
    const updated = { ...current, ...(args.data ?? {}) };
    state.set(key, structuredClone(updated));
    return updated;
  });

  setPayloadStubDeleteHandler(async (input) => {
    const args = input as { collection?: string; id?: number };
    const key = `${args.collection}:${args.id}`;
    const document = state.get(key) ?? { id: args.id ?? 0 };
    state.delete(key);
    return document;
  });

  return state;
};

const run = (args: ComposeTimelineEventArgs) =>
  runWithAgentExecutionContext({ userId: 1 }, () =>
    composeTimelineEventFromIntent(args),
  );

const businessWrites = () =>
  getPayloadStubOperations().filter((operation) => {
    const args = operation.args as { collection?: string };
    return (
      (operation.type === "create" ||
        operation.type === "delete" ||
        operation.type === "update") &&
      args.collection !== "agent-runs"
    );
  });

const writesFor = (
  collection: string,
  type?: "create" | "delete" | "update",
) =>
  businessWrites().filter((operation) => {
    const args = operation.args as { collection?: string };
    return args.collection === collection && (!type || operation.type === type);
  });

beforeEach(() => {
  resetPayloadStub();
});

test("explicit Plan source writes relatedPlan and appends the exact Timeline link", async () => {
  setupPayload();

  const result = await run({
    createEvent: true,
    sourceId: plan.id,
    sourceText: "完成上线准备。",
    sourceTitle: "不可信标题",
    sourceType: "plan",
    visibility: "private",
  });

  const timelineCreate = writesFor("timeline-events", "create")[0];
  assert.ok(timelineCreate);
  const timelineData = (timelineCreate.args as { data?: Record<string, unknown> }).data;
  assert.equal(timelineData?.relatedPlan, plan.id);
  assert.equal(timelineData?.sourceType, "plan");

  const planUpdate = writesFor("plans", "update")[0];
  assert.ok(planUpdate);
  assert.deepEqual(
    (planUpdate.args as { data?: { linkedContent?: unknown } }).data?.linkedContent,
    [
      { relationTo: "posts", value: 7 },
      { relationTo: "timeline-events", value: 101 },
    ],
  );
  assert.equal(result.rollbackSourceRunId, 201);
  assert.deepEqual(result.affectedDocuments, [
    {
      collection: "timeline-events",
      documentId: 101,
      operation: "create",
      visibility: "private",
    },
    {
      collection: "plans",
      documentId: plan.id,
      operation: "update",
      visibility: "unknown",
    },
  ]);
  assert.deepEqual(result.rollbackPayload, {
    strategy: "delete_created_timeline_event",
    target: {
      collection: "timeline-events",
      documentId: 101,
      planId: plan.id,
      timelineEventId: 101,
    },
  });
  const agentRunCreate = getPayloadStubOperations().find((operation) => {
    const operationArgs = operation.args as { collection?: string };
    return (
      operation.type === "create" &&
      operationArgs.collection === "agent-runs"
    );
  });
  assert.equal(
    (
      agentRunCreate?.args as {
        data?: { afterSnapshot?: { planLinkChanged?: unknown } };
      }
    ).data?.afterSnapshot?.planLinkChanged,
    true,
  );
});

test("explicit Checklist source resolves the exact item and derives Plan from Checklist.planId", async () => {
  setupPayload();

  await run({
    checklistTitle: "模型给出的清单标题",
    createEvent: true,
    itemTitle: "模型给出的条目标题",
    relatedTaskKey: "item-login",
    sourceId: checklist.id,
    sourceText: "完成了一个条目。",
    sourceType: "checklist_item",
    visibility: "private",
  });

  const timelineCreate = writesFor("timeline-events", "create")[0];
  assert.ok(timelineCreate);
  const data = (timelineCreate.args as { data?: Record<string, unknown> }).data;
  assert.equal(data?.relatedChecklist, checklist.id);
  assert.equal(data?.relatedTaskKey, "item-login");
  assert.equal(data?.relatedPlan, plan.id);
  assert.equal(data?.sourceType, "checklist");
  assert.match(String(data?.title), /SunnyPanel 发布清单/);
  assert.match(String(data?.title), /登录页修复/);
  assert.equal(writesFor("plans", "update").length, 1);
});

test("invalid, deleted, or inaccessible Plan IDs fail with zero business writes", async () => {
  for (const scenario of [
    { id: -1, options: {} },
    { id: 999, options: {} },
    {
      id: plan.id,
      options: { denied: new Set([`plans:${plan.id}`]) },
    },
  ] as const) {
    resetPayloadStub();
    setupPayload(scenario.options);

    const result = await run({
      createEvent: true,
      sourceId: scenario.id,
      sourceText: "完成上线准备。",
      sourceType: "plan",
    });

    assert.equal(result.status, "failed");
    assert.equal(businessWrites().length, 0);
    assert.doesNotMatch(result.assistantMessage, /private resource/i);
  }
});

test("invalid, deleted, or inaccessible Checklist IDs fail with zero business writes", async () => {
  for (const scenario of [
    { id: 1.5, options: {} },
    { id: 999, options: {} },
    {
      id: checklist.id,
      options: { denied: new Set([`checklists:${checklist.id}`]) },
    },
  ] as const) {
    resetPayloadStub();
    setupPayload(scenario.options);

    const result = await run({
      createEvent: true,
      relatedTaskKey: "item-login",
      sourceId: scenario.id,
      sourceText: "完成条目。",
      sourceType: "checklist_item",
    });

    assert.equal(result.status, "failed");
    assert.equal(businessWrites().length, 0);
    assert.doesNotMatch(result.assistantMessage, /private resource/i);
  }
});

test("missing or unknown Checklist item key fails with zero business writes", async () => {
  for (const relatedTaskKey of [undefined, "item-does-not-exist"]) {
    resetPayloadStub();
    setupPayload();

    const result = await run({
      createEvent: true,
      relatedTaskKey,
      sourceId: checklist.id,
      sourceText: "完成条目。",
      sourceType: "checklist_item",
    });

    assert.equal(result.status, "failed");
    assert.equal(businessWrites().length, 0);
  }
});

test("missing, invalid, deleted, or inaccessible persisted Checklist Plan relation fails closed", async () => {
  const scenarios: SetupOptions[] = [
    {
      documents: [{ ...checklist, planId: null }, plan],
    },
    {
      documents: [{ ...checklist, planId: 0 }, plan],
    },
    {
      documents: [checklist],
    },
    {
      denied: new Set([`plans:${plan.id}`]),
    },
  ];

  for (const options of scenarios) {
    resetPayloadStub();
    setupPayload(options);

    const result = await run({
      createEvent: true,
      relatedTaskKey: "item-login",
      sourceId: checklist.id,
      sourceText: "完成条目。",
      sourceType: "checklist_item",
    });

    assert.equal(result.status, "failed");
    assert.equal(businessWrites().length, 0);
  }
});

test("Plan title or a unique workspace Plan never substitutes for an explicit ID", async () => {
  setupPayload();

  const result = await run({
    createEvent: true,
    sourceText: "把唯一计划做成时间线。",
    sourceTitle: plan.title,
    sourceType: "plan",
  });

  assert.equal(result.status, "failed");
  assert.equal(businessWrites().length, 0);
  assert.equal(
    getPayloadStubOperations().filter((operation) => operation.type === "find")
      .length,
    0,
  );
});

test("Checklist and item titles never substitute for exact persisted IDs", async () => {
  setupPayload();

  const result = await run({
    checklistTitle: checklist.title,
    createEvent: true,
    itemTitle: "登录页修复",
    sourceText: "完成条目。",
    sourceType: "checklist_item",
  });

  assert.equal(result.status, "failed");
  assert.equal(businessWrites().length, 0);
  assert.equal(
    getPayloadStubOperations().filter((operation) => operation.type === "find")
      .length,
    0,
  );
});

test("preview-only path performs zero reads and zero writes", async () => {
  setupPayload();

  const result = await run({
    createEvent: false,
    sourceId: plan.id,
    sourceText: "只生成提案。",
    sourceType: "plan",
  });

  assert.match(result.assistantMessage, /Timeline title/);
  assert.deepEqual(getPayloadStubOperations(), []);
});

test("Plan-link failure compensates a newly created Timeline event", async () => {
  const state = setupPayload({ failPlanLink: true });

  const result = await run({
    createEvent: true,
    sourceId: plan.id,
    sourceText: "完成上线准备。",
    sourceType: "plan",
    visibility: "private",
  });

  assert.equal(result.status, "failed");
  assert.equal(writesFor("timeline-events", "create").length, 1);
  assert.equal(writesFor("plans", "update").length, 1);
  assert.equal(writesFor("timeline-events", "delete").length, 1);
  assert.equal(state.has("timeline-events:101"), false);
  assert.equal(
    getPayloadStubOperations().filter((operation) => {
      const args = operation.args as { collection?: string };
      return operation.type === "create" && args.collection === "agent-runs";
    }).length,
    0,
  );
});

test("AgentRun failure unlinks the Plan and deletes the Timeline before returning failure", async () => {
  const state = setupPayload({ failAgentRun: true });

  const result = await run({
    createEvent: true,
    sourceId: plan.id,
    sourceText: "完成上线准备。",
    sourceType: "plan",
    visibility: "private",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.rollbackPayload, undefined);
  assert.deepEqual(state.get(`plans:${plan.id}`)?.linkedContent, plan.linkedContent);
  assert.equal(state.has("timeline-events:101"), false);
  assert.equal(writesFor("plans", "update").length, 2);
  assert.equal(writesFor("timeline-events", "delete").length, 1);
});

test("failed AgentRun compensation returns internal evidence and never source-less success", async () => {
  const state = setupPayload({
    failAgentRun: true,
    failPlanUnlink: true,
  });

  const result = await run({
    createEvent: true,
    sourceId: plan.id,
    sourceText: "完成上线准备。",
    sourceType: "plan",
    visibility: "private",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.rollbackSourceRunId, undefined);
  assert.ok(result.rollbackPayload);
  assert.equal(hasServerInternalFailedAuditCompensation(result), true);
  assert.equal(state.has("timeline-events:101"), true);
  assert.equal(writesFor("timeline-events", "delete").length, 0);
  assert.doesNotMatch(JSON.stringify(result), /private audit|private plan/i);
});

test("explicit Checklist composition remains create-only and never updates an existing exact event", async () => {
  setupPayload({
    existingEvents: [existingTimelineEvent],
  });

  const result = await run({
    createEvent: true,
    relatedTaskKey: "item-login",
    sourceId: checklist.id,
    sourceText: "新说明",
    sourceType: "checklist_item",
    visibility: "public",
  });

  assert.notEqual(result.status, "failed");
  assert.equal(writesFor("timeline-events", "create").length, 1);
  assert.equal(writesFor("timeline-events", "update").length, 0);
});

test("existing non-Plan source types remain unchanged", async () => {
  for (const scenario of [
    { expectedField: "relatedPost", sourceId: 76, sourceType: "post" },
    { expectedField: "relatedUpdate", sourceId: 77, sourceType: "update" },
    { expectedField: null, sourceId: 78, sourceType: "note" },
    { expectedField: null, sourceId: null, sourceType: "free_text" },
  ] as const) {
    resetPayloadStub();
    setupPayload();

    await run({
      createEvent: true,
      sourceId: scenario.sourceId,
      sourceText: "发布 Agent Inbox。",
      sourceTitle: "Agent Inbox",
      sourceType: scenario.sourceType,
      visibility: "public",
    });

    const timelineCreate = writesFor("timeline-events", "create")[0];
    assert.ok(timelineCreate);
    const data = (timelineCreate.args as { data?: Record<string, unknown> })
      .data;
    if (scenario.expectedField) {
      assert.equal(data?.[scenario.expectedField], scenario.sourceId);
    }
    assert.equal(data?.relatedPlan, undefined);
    assert.equal(writesFor("plans").length, 0);
  }
});

test("linked Timeline rollback removes the exact Plan link before deleting the event", async () => {
  const linkedPlan = {
    ...plan,
    linkedContent: [
      ...plan.linkedContent,
      { relationTo: "timeline-events", value: existingTimelineEvent.id },
    ],
  };
  const state = setupPayload({
    documents: [linkedPlan, checklist],
    existingEvents: [existingTimelineEvent],
  });

  await executeRollbackFromPayload(
    {
      strategy: "delete_created_timeline_event",
      target: {
        collection: "timeline-events",
        documentId: existingTimelineEvent.id,
        planId: plan.id,
        timelineEventId: existingTimelineEvent.id,
      },
    },
    {
      payload: (await getPayloadClient()) as never,
      persistAudit: false,
      userId: 1,
    },
  );

  assert.deepEqual(state.get(`plans:${plan.id}`)?.linkedContent, plan.linkedContent);
  assert.equal(state.has(`timeline-events:${existingTimelineEvent.id}`), false);
  assert.equal(writesFor("plans", "update").length, 1);
  assert.equal(writesFor("timeline-events", "delete").length, 1);
});

test("linked Timeline rollback fails closed without deleting when Plan unlink fails", async () => {
  const linkedPlan = {
    ...plan,
    linkedContent: [
      ...plan.linkedContent,
      { relationTo: "timeline-events", value: existingTimelineEvent.id },
    ],
  };
  const state = setupPayload({
    documents: [linkedPlan, checklist],
    existingEvents: [existingTimelineEvent],
    failPlanLink: true,
  });

  await assert.rejects(
    executeRollbackFromPayload(
      {
        strategy: "delete_created_timeline_event",
        target: {
          collection: "timeline-events",
          documentId: existingTimelineEvent.id,
          planId: plan.id,
          timelineEventId: existingTimelineEvent.id,
        },
      },
      {
        payload: (await getPayloadClient()) as never,
        persistAudit: false,
        userId: 1,
      },
    ),
  );

  assert.equal(state.has(`timeline-events:${existingTimelineEvent.id}`), true);
  assert.equal(writesFor("timeline-events", "delete").length, 0);
});

test("legacy Timeline rollback without Plan metadata preserves delete-only behavior", async () => {
  const state = setupPayload({ existingEvents: [existingTimelineEvent] });

  await executeRollbackFromPayload(
    {
      strategy: "delete_created_timeline_event",
      target: {
        collection: "timeline-events",
        documentId: existingTimelineEvent.id,
      },
    },
    {
      payload: (await getPayloadClient()) as never,
      persistAudit: false,
    },
  );

  assert.equal(state.has(`timeline-events:${existingTimelineEvent.id}`), false);
  assert.equal(writesFor("plans", "update").length, 0);
  assert.equal(writesFor("timeline-events", "delete").length, 1);
});
