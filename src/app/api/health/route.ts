import { getPayload } from "payload";
import config from "@payload-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db: "connected" | "disconnected" = "disconnected";

  try {
    const payload = await getPayload({ config });
    // A lightweight query to verify database connectivity
    await payload.count({ collection: "users", where: {} });
    db = "connected" as const;
  } catch (error) {
    console.error("[health] database check failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  const duration = Date.now() - startedAt;
  const healthy = db === "connected";

  const body = {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    db,
    ...(!healthy ? { error: "database_unavailable" as const } : {}),
    uptime: process.uptime(),
    duration,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: healthy ? 200 : 503,
  });
}
