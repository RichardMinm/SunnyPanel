import {
  assertSuccessfulAgentSseEvents,
  readAgentSseEvents,
} from "./lib/agent-sse-contract.mjs";

const serverUrl = process.env.AGENT_SMOKE_SERVER_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "http://127.0.0.1:3000";
const email = process.env.AGENT_SMOKE_EMAIL;
const password = process.env.AGENT_SMOKE_PASSWORD;

if (!email || !password) {
  console.error("Set AGENT_SMOKE_EMAIL and AGENT_SMOKE_PASSWORD before running this smoke test.");
  process.exit(1);
}

const assertOk = async (response, label) => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body}`);
  }
};

const extractCookieHeader = (response) => {
  const setCookie = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")].filter(Boolean);

  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
};

const loginResponse = await fetch(`${serverUrl}/api/users/login`, {
  body: JSON.stringify({ email, password }),
  headers: {
    "Content-Type": "application/json",
  },
  method: "POST",
});

await assertOk(loginResponse, "login");

const cookieHeader = extractCookieHeader(loginResponse);

if (!cookieHeader) {
  throw new Error("login did not return a session cookie");
}

const dashboardResponse = await fetch(`${serverUrl}/dashboard`, {
  headers: {
    cookie: cookieHeader,
  },
  redirect: "manual",
});

await assertOk(dashboardResponse, "dashboard");

const progressResponse = await fetch(`${serverUrl}/api/agent/progress`, {
  headers: {
    cookie: cookieHeader,
  },
});

await assertOk(progressResponse, "progress");

const evaluationResponse = await fetch(`${serverUrl}/api/agent/evaluate`, {
  body: JSON.stringify({ persistReview: false }),
  headers: {
    "Content-Type": "application/json",
    cookie: cookieHeader,
  },
  method: "POST",
});

await assertOk(evaluationResponse, "evaluate");

const chatResponse = await fetch(`${serverUrl}/api/agent/chat`, {
  body: JSON.stringify({
    message: "查一下整体进度",
    messages: [],
    stream: true,
  }),
  headers: {
    "Content-Type": "application/json",
    cookie: cookieHeader,
  },
  method: "POST",
});

await assertOk(chatResponse, "chat");

const streamEvents = await readAgentSseEvents(chatResponse, "Agent smoke SSE");
const eventNames = streamEvents.map(({ event }) => event);

for (const event of ["status", "meta", "token", "done", "terminal"]) {
  if (!eventNames.includes(event)) {
    throw new Error(`chat stream did not include ${event} event`);
  }
}

assertSuccessfulAgentSseEvents(streamEvents, "Agent smoke SSE");

const threadResponse = await fetch(`${serverUrl}/api/agent/thread`, {
  headers: {
    cookie: cookieHeader,
  },
});

await assertOk(threadResponse, "thread");

console.log("Agent smoke test passed.");
