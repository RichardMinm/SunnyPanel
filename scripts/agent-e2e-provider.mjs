import { createServer } from "node:http";

import {
  buildOpenAIChatCompletionSse,
  resolveQueryQualitativeStream,
} from "./lib/agent-e2e-provider-protocol.mjs";

const enabled = process.env.AGENT_E2E_FAKE_PROVIDER === "1";
const token = process.env.AGENT_E2E_FAKE_PROVIDER_TOKEN?.trim();
const port = Number(process.env.AGENT_E2E_FAKE_PROVIDER_PORT ?? 4010);

if (!enabled || !token || process.env.CI !== "true") {
  throw new Error(
    "The deterministic Agent provider may only run in CI with an explicit token.",
  );
}

if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("AGENT_E2E_FAKE_PROVIDER_PORT must be a non-privileged TCP port.");
}

const MAX_REQUEST_BYTES = 256 * 1024;
const WORKSPACE_PREFIX = "[WORKSPACE CONTEXT — UNTRUSTED user data";

const jsonResponse = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};

const sseResponse = (response, body, completion) => {
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  });
  response.end(buildOpenAIChatCompletionSse({
    content: completion.content,
    created: Math.floor(Date.now() / 1000),
    includeUsage: body.stream_options?.include_usage === true,
    model: String(body.model ?? "sunnypanel-release-fixture"),
  }));
};

const stringContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (
      part && typeof part === "object" && typeof part.text === "string"
        ? part.text
        : ""
    ))
    .join("");
};

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const singleTaskDecision = ({ args, intent, label, role }) => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: label,
  tasks: [{
    agentRole: role,
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label,
  }],
  version: 2,
});

const exactPlanId = (workspace, title) => {
  const match = workspace.match(
    new RegExp(
      `^- \\[[^\\]]+\\] ${escapeRegExp(title)} \\(id=([1-9]\\d*)\\)$`,
      "mu",
    ),
  );
  return match ? Number(match[1]) : null;
};

const exactSchedule = (workspace, id, title) => {
  const match = workspace.match(
    new RegExp(
      `^- ${escapeRegExp(title)} \\(id=${id} \\|[^\\n]*status=planned\\)$`,
      "mu",
    ),
  );
  return Boolean(match);
};

const buildCompletion = (body) => {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const normalized = messages.map((message) => ({
    content: stringContent(message?.content),
    role: message?.role,
  }));
  const system = normalized
    .filter(({ role }) => role === "system")
    .map(({ content }) => content)
    .join("\n");
  const workspace = normalized.find(
    ({ content, role }) => role === "user" && content.startsWith(WORKSPACE_PREFIX),
  )?.content ?? "";
  const request = normalized
    .filter(
      ({ content, role }) =>
        role === "user" && !content.startsWith(WORKSPACE_PREFIX),
    )
    .at(-1)?.content.trim() ?? "";

  if (system.includes("SunnyPanel 的计划评估增强器")) {
    const input = JSON.parse(request);
    return {
      recommendations: Array.isArray(input.ruleBasedRecommendations)
        ? input.ruleBasedRecommendations
        : [],
      summary: typeof input.ruleBasedSummary === "string"
        ? input.ruleBasedSummary
        : "评估已完成。",
    };
  }

  const createPlan = request.match(/^帮我创建计划：(.+)$/u);
  if (createPlan) {
    const title = createPlan[1].trim();
    if (!title) return null;
    return singleTaskDecision({
      args: { title },
      intent: "create_plan",
      label: "创建计划",
      role: "plan",
    });
  }

  const modifyPlan = request.match(/^把「([^」]+)」的优先级改为高$/u);
  if (modifyPlan) {
    const title = modifyPlan[1].trim();
    const targetId = exactPlanId(workspace, title);
    if (!targetId) return null;
    return singleTaskDecision({
      args: {
        changeDescription: "将优先级改为高",
        entityName: title,
        entityType: "plan",
        patch: { priority: "high" },
        targetId,
      },
      intent: "modify_record",
      label: "修改计划优先级",
      role: "plan",
    });
  }

  const completeSchedule = request.match(
    /^(?:将|把)日程\s*#([1-9]\d*)\s*「([^」]+)」\s*(?:标记为|设为)完成$/u,
  );
  if (completeSchedule) {
    const targetId = Number(completeSchedule[1]);
    const title = completeSchedule[2].trim();
    if (!exactSchedule(workspace, targetId, title)) return null;
    return singleTaskDecision({
      args: {
        changeDescription: "标记为完成",
        entityName: title,
        entityType: "schedule",
        patch: { status: "done" },
        targetId,
      },
      intent: "modify_record",
      label: "完成日程",
      role: "schedule",
    });
  }

  return null;
};

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    jsonResponse(response, 200, { status: "ok" });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    jsonResponse(response, 404, { error: { message: "Not found." } });
    return;
  }

  if (request.headers.authorization !== `Bearer ${token}`) {
    jsonResponse(response, 401, { error: { message: "Unauthorized." } });
    return;
  }

  let receivedBytes = 0;
  const chunks = [];
  request.on("data", (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_REQUEST_BYTES) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    if (receivedBytes > MAX_REQUEST_BYTES) return;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (body?.stream === true) {
        const queryCompletion = resolveQueryQualitativeStream(body);
        if (!queryCompletion) {
          jsonResponse(response, 400, {
            error: {
              message: "Only enum-only Query qualitative streaming is supported.",
            },
          });
          return;
        }
        sseResponse(response, body, queryCompletion);
        return;
      }
      if (body?.response_format?.type !== "json_object") {
        jsonResponse(response, 400, {
          error: { message: "Only non-streaming JSON mode is supported." },
        });
        return;
      }
      const completion = buildCompletion(body);
      if (!completion) {
        jsonResponse(response, 422, {
          error: { message: "Synthetic request is outside the release fixture allowlist." },
        });
        return;
      }
      const content = JSON.stringify(completion);
      jsonResponse(response, 200, {
        choices: [{
          finish_reason: "stop",
          index: 0,
          message: { content, role: "assistant" },
        }],
        created: Math.floor(Date.now() / 1000),
        id: "chatcmpl-sunnypanel-release",
        model: String(body.model ?? "sunnypanel-release-fixture"),
        object: "chat.completion",
        usage: {
          completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
          prompt_tokens: 64,
          total_tokens: 64 + Math.max(1, Math.ceil(content.length / 4)),
        },
      });
    } catch {
      jsonResponse(response, 400, { error: { message: "Invalid fixture request." } });
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.info(`[agent-e2e-provider] Ready on 127.0.0.1:${port}.`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
