import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const serverUrl =
  process.env.AGENT_E2E_SERVER_URL ??
  process.env.NEXT_PUBLIC_SERVER_URL ??
  "http://127.0.0.1:3000";
const email = process.env.AGENT_E2E_EMAIL;
const password = process.env.AGENT_E2E_PASSWORD;
const timeoutMs = Number(process.env.AGENT_E2E_TIMEOUT_MS ?? 30_000);

if (!email || !password) {
  console.error(
    "Set AGENT_E2E_EMAIL and AGENT_E2E_PASSWORD before running this E2E test.",
  );
  process.exit(1);
}

const request = (path, init = {}) =>
  fetch(new URL(path, serverUrl), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

const assertOk = async (response, label) => {
  if (response.ok) {
    return response;
  }

  throw new Error(
    `${label} failed with ${response.status}: ${await response.text()}`,
  );
};

const loginResponse = await assertOk(
  await request("/api/users/login", {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }),
  "login",
);
const loginBody = await loginResponse.json();
const cookieHeader = (
  loginResponse.headers.getSetCookie?.() ??
  [loginResponse.headers.get("set-cookie")].filter(Boolean)
)
  .map((cookie) => cookie.split(";")[0])
  .join("; ");

assert.ok(cookieHeader, "login must return a session cookie");
assert.equal(typeof loginBody.token, "string", "login must return a JWT");
assert.equal(typeof loginBody.user?.id, "number", "login must return a user id");

const adminRequest = async (path, init = {}) =>
  assertOk(
    await request(path, {
      ...init,
      headers: {
        Authorization: `JWT ${loginBody.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
    `admin request ${path}`,
  );

const unwrapDocument = (body) =>
  body?.doc && typeof body.doc === "object" ? body.doc : body;

const createDocument = async (collection, data) => {
  const response = await adminRequest(`/api/${collection}`, {
    body: JSON.stringify(data),
    method: "POST",
  });

  return unwrapDocument(await response.json());
};

const findDocuments = async (collection, field, value, limit = 10) => {
  const url = new URL(`/api/${collection}`, serverUrl);
  url.searchParams.set(`where[${field}][equals]`, String(value));
  url.searchParams.set("limit", String(limit));
  const response = await assertOk(
    await fetch(url, {
      headers: { Authorization: `JWT ${loginBody.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    }),
    `${collection} lookup`,
  );

  return response.json();
};

const createThreadWithPending = (pendingAction, title) =>
  createDocument("agent-threads", {
    lastInteractionAt: new Date().toISOString(),
    messages: [],
    pendingAction,
    status: "active",
    title,
    user: loginBody.user.id,
  });

const createPlanAction = (title) => ({
  affectedDocuments: [
    {
      collection: "plans",
      operation: "create",
      title,
      visibility: "private",
    },
  ],
  args: {
    description: null,
    title,
  },
  changes: [
    {
      afterPreview: `私有草稿计划「${title}」`,
      beforePreview: "当前不存在这条计划。",
      collection: "plans",
      operation: "create",
      preview: `创建计划「${title}」`,
      visibility: "private",
    },
  ],
  id: randomUUID(),
  intent: "create_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: `创建计划「${title}」`,
  toolName: "create_plan",
});

const chat = async (body) => {
  const response = await assertOk(
    await request("/api/agent/chat", {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
      },
      method: "POST",
    }),
    "Agent chat",
  );

  return response.json();
};

const assertChatContract = (response, turnId) => {
  assert.equal(response.turnId, turnId);
  assert.equal(typeof response.threadId, "number");
  assert.equal(typeof response.assistantMessage, "string");
  assert.equal(typeof response.intent, "string");
  assert.ok(response.tokenUsage?.totalTokens > 0);
  assert.ok(Array.isArray(response.trace));
};

const queryTurnId = `e2e-json-${randomUUID()}`;
const queryResponse = await chat({
  message: "查一下整体进度",
  messages: [],
  stream: false,
  turnId: queryTurnId,
});
assertChatContract(queryResponse, queryTurnId);
assert.equal(queryResponse.intent, "query_progress");

const replayResponse = await chat({
  message: "查一下整体进度",
  messages: [],
  stream: false,
  threadId: queryResponse.threadId,
  turnId: queryTurnId,
});
assert.deepStrictEqual(replayResponse, queryResponse);

const sseTurnId = `e2e-sse-${randomUUID()}`;
const streamResponse = await assertOk(
  await request("/api/agent/chat", {
    body: JSON.stringify({
      message: "查一下整体进度",
      messages: [],
      stream: true,
      threadId: queryResponse.threadId,
      turnId: sseTurnId,
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    method: "POST",
  }),
  "Agent SSE chat",
);
const streamText = await streamResponse.text();
const streamEvents = streamText
  .split("\n\n")
  .filter(Boolean)
  .map((block) => {
    const event = block
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const data = block
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice("data:".length)
      .trim();

    return {
      data: data ? JSON.parse(data) : null,
      event,
    };
  });
const eventNames = streamEvents.map(({ event }) => event);

for (const eventName of [
  "status",
  "meta",
  "token",
  "trace",
  "usage",
  "done",
]) {
  assert.ok(eventNames.includes(eventName), `SSE must include ${eventName}`);
}

const meta = streamEvents.find(({ event }) => event === "meta")?.data;
const done = streamEvents.find(({ event }) => event === "done")?.data;

assert.equal(meta?.turnId, sseTurnId);
assert.equal(done?.turnId, sseTurnId);
assert.equal(done?.intent, "query_progress");
assert.ok(done?.tokenUsage?.totalTokens > 0);
assert.ok(Array.isArray(done?.trace));

const planTitle = `LangGraph E2E ${randomUUID()}`;
const proposalTurnId = `e2e-proposal-${randomUUID()}`;
const proposal = await chat({
  message: `帮我创建计划：${planTitle}`,
  messages: [],
  stream: false,
  threadId: queryResponse.threadId,
  turnId: proposalTurnId,
});
assertChatContract(proposal, proposalTurnId);
assert.equal(proposal.intent, "create_plan");
assert.equal(proposal.pendingAction?.type, "await_confirmation");

const actionId = proposal.pendingAction?.action?.id;
assert.equal(typeof actionId, "string");

const countPlans = async (title = planTitle) =>
  (await findDocuments("plans", "title", title, 2)).totalDocs;

assert.equal(
  await countPlans(),
  0,
  "confirmation interrupt must happen before the business write",
);

const confirmationTurnId = `e2e-confirm-${randomUUID()}`;
const confirmationBody = {
  confirmation: {
    actionId,
    type: "confirm",
  },
  message: "确认",
  messages: [],
  stream: false,
  threadId: queryResponse.threadId,
  turnId: confirmationTurnId,
};
const confirmation = await chat(confirmationBody);
assertChatContract(confirmation, confirmationTurnId);
assert.equal(confirmation.intent, "create_plan");
assert.equal(confirmation.pendingAction, null);

const confirmationReplay = await chat(confirmationBody);
assert.deepStrictEqual(confirmationReplay, confirmation);
assert.equal(
  await countPlans(),
  1,
  "replaying the confirmation turn must not duplicate the business write",
);

const batchTitles = [
  `批量甲-${randomUUID().slice(0, 8)}`,
  `批量乙-${randomUUID().slice(0, 8)}`,
];
const batchActions = batchTitles.map(createPlanAction);
const batchThread = await createThreadWithPending(
  {
    actions: batchActions,
    orchestrationId: `e2e-batch-${randomUUID()}`,
    type: "await_batch_confirmation",
  },
  "Agent E2E batch confirmation",
);
const batchTurnId = `e2e-batch-confirm-${randomUUID()}`;
const batchConfirmationBody = {
  confirmation: {
    actionId: "batch",
    batch: true,
    type: "confirm",
  },
  message: "全部确认",
  messages: [],
  stream: false,
  threadId: batchThread.id,
  turnId: batchTurnId,
};
const batchConfirmation = await chat(batchConfirmationBody);
assertChatContract(batchConfirmation, batchTurnId);
assert.equal(batchConfirmation.pendingAction, null);
const batchReplay = await chat(batchConfirmationBody);
assert.deepStrictEqual(batchReplay, batchConfirmation);

for (const title of batchTitles) {
  assert.equal(
    await countPlans(title),
    1,
    "batch confirmation replay must not duplicate writes",
  );
}

const modifyTitle = `改测-${randomUUID().slice(0, 8)}`;
await createDocument("plans", {
  agentState: "idle",
  domain: "other",
  executionMode: "manual",
  priority: "medium",
  state: "backlog",
  status: "draft",
  title: modifyTitle,
  visibility: "private",
});
const modifyTurnId = `e2e-modify-proposal-${randomUUID()}`;
const modifyProposal = await chat({
  message: `把「${modifyTitle}」的优先级改为高`,
  messages: [],
  stream: false,
  turnId: modifyTurnId,
});
assertChatContract(modifyProposal, modifyTurnId);
assert.equal(modifyProposal.intent, "modify_record");
assert.equal(modifyProposal.pendingAction?.type, "await_confirmation");
assert.equal(
  (await findDocuments("plans", "title", modifyTitle)).docs[0]?.priority,
  "medium",
  "modify_record must not write before confirmation",
);
const modifyConfirmTurnId = `e2e-modify-confirm-${randomUUID()}`;
const modifyConfirmation = await chat({
  confirmation: {
    actionId: modifyProposal.pendingAction.action.id,
    type: "confirm",
  },
  message: "确认",
  messages: [],
  stream: false,
  threadId: modifyProposal.threadId,
  turnId: modifyConfirmTurnId,
});
assertChatContract(modifyConfirmation, modifyConfirmTurnId);
assert.equal(modifyConfirmation.pendingAction, null);
assert.equal(
  (await findDocuments("plans", "title", modifyTitle)).docs[0]?.priority,
  "high",
);

const scheduleTitle = `取消测-${randomUUID().slice(0, 8)}`;
const scheduleItem = await createDocument("schedule-items", {
  category: "default",
  createdBy: "manual",
  date: "2026-07-01T00:00:00.000Z",
  isAllDay: false,
  priority: "medium",
  sourceType: "manual",
  status: "planned",
  title: scheduleTitle,
});
const queueThread = await createThreadWithPending(
  {
    completedTaskIds: [],
    deferredTaskIds: ["query", "cancel"],
    mode: "compound",
    orchestrationId: `e2e-queue-${randomUUID()}`,
    originalMessage: `查询整体进度后取消日程 ${scheduleTitle}`,
    reasoning: "先读取进度，再执行低风险取消。",
    tasks: [
      {
        agentRole: "query",
        args: { scope: "all" },
        dependsOn: [],
        id: "query",
        intent: "query_progress",
        label: "查询整体进度",
      },
      {
        agentRole: "schedule",
        args: {
          itemId: scheduleItem.id,
          reason: "E2E 低风险取消验证",
        },
        dependsOn: ["query"],
        id: "cancel",
        intent: "cancel_schedule_item",
        label: "取消测试日程",
      },
    ],
    type: "await_queue_resume",
  },
  "Agent E2E compound queue",
);
const queueTurnId = `e2e-queue-resume-${randomUUID()}`;
const queueResume = await chat({
  message: "继续",
  messages: [],
  stream: false,
  threadId: queueThread.id,
  turnId: queueTurnId,
});
assertChatContract(queueResume, queueTurnId);
assert.equal(queueResume.pendingAction, null);
assert.equal(
  (await findDocuments("schedule-items", "id", scheduleItem.id)).docs[0]
    ?.status,
  "canceled",
  "compound queue resume must execute low-risk cancel_schedule_item",
);

const failureThread = await createThreadWithPending(
  {
    completedTaskIds: [],
    deferredTaskIds: ["cancel-missing"],
    mode: "single",
    orchestrationId: `e2e-failure-${randomUUID()}`,
    originalMessage: "取消不存在的日程",
    reasoning: "验证工具失败进入受控响应。",
    tasks: [
      {
        agentRole: "schedule",
        args: {
          itemId: 2_147_483_000,
          reason: "E2E controlled failure",
        },
        dependsOn: [],
        id: "cancel-missing",
        intent: "cancel_schedule_item",
        label: "取消不存在的日程",
      },
    ],
    type: "await_queue_resume",
  },
  "Agent E2E controlled failure",
);
const controlledFailureTurnId = `e2e-controlled-failure-${randomUUID()}`;
const controlledFailure = await chat({
  message: "继续",
  messages: [],
  stream: false,
  threadId: failureThread.id,
  turnId: controlledFailureTurnId,
});
assertChatContract(controlledFailure, controlledFailureTurnId);
assert.ok(
  controlledFailure.intent === "clarify" ||
    controlledFailure.pendingAction != null ||
    /失败|不存在|检查|无法/.test(controlledFailure.assistantMessage),
  "tool failure must return a readable controlled response",
);

console.log(
  JSON.stringify(
    {
      batchTurnId,
      confirmationTurnId,
      controlledFailureTurnId,
      modifyConfirmTurnId,
      planTitle,
      queueTurnId,
      queryTurnId,
      sseEvents: [...new Set(eventNames)],
      sseTurnId,
      threadId: queryResponse.threadId,
    },
    null,
    2,
  ),
);
