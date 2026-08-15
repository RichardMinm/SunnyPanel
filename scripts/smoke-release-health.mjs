const healthUrl = process.env.RELEASE_HEALTH_URL?.trim()
  || "http://127.0.0.1:3000/api/health";
const timeoutMs = Number.parseInt(
  process.env.RELEASE_HEALTH_TIMEOUT_MS ?? "60000",
  10,
);
const pollIntervalMs = 1_000;

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error("[release-health] RELEASE_HEALTH_TIMEOUT_MS must be positive.");
  process.exit(1);
}

const deadline = Date.now() + timeoutMs;
let lastFailure = "application did not respond";

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json();

    if (
      response.ok
      && body?.status === "ok"
      && body?.db === "connected"
      && typeof body?.timestamp === "string"
      && typeof body?.uptime === "number"
    ) {
      console.info(
        `[release-health] Production runtime is ready (${response.status}, ${body.duration}ms).`,
      );
      process.exit(0);
    }

    lastFailure = `HTTP ${response.status}, status=${String(body?.status)}, db=${String(body?.db)}, error=${String(body?.error ?? "none")}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
  }

  const remainingMs = Math.max(0, deadline - Date.now());
  await new Promise((resolve) => setTimeout(
    resolve,
    Math.min(pollIntervalMs, remainingMs),
  ));
}

console.error(
  `[release-health] Production runtime did not become ready within ${timeoutMs}ms: ${lastFailure}`,
);
process.exit(1);
