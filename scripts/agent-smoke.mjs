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

const readStreamEvents = async (response) => {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Streaming response has no body.");
  }

  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.replace("event:", "")
        .trim();

      if (event) {
        events.push(event);
      }
    }
  }

  return events;
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

const events = await readStreamEvents(chatResponse);

for (const event of ["status", "meta", "token", "done"]) {
  if (!events.includes(event)) {
    throw new Error(`chat stream did not include ${event} event`);
  }
}

const threadResponse = await fetch(`${serverUrl}/api/agent/thread`, {
  headers: {
    cookie: cookieHeader,
  },
});

await assertOk(threadResponse, "thread");

console.log("Agent smoke test passed.");
