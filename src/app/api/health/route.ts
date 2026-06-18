import { getPayload } from "payload";
import config from "@payload-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db: "connected" | "disconnected" = "disconnected";
  let dbError: string | null = null;

  try {
    const payload = await getPayload({ config });
    // A lightweight query to verify database connectivity
    await payload.count({ collection: "users", where: {} });
    db = "connected" as const;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown database error";
  }

  const duration = Date.now() - startedAt;
  const healthy = db === "connected";

  const body = {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    db,
    ...(dbError ? { dbError } : {}),
    uptime: process.uptime(),
    duration,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: healthy ? 200 : 503,
  });
}
