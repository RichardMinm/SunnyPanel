import { NextResponse } from "next/server";

import { checkReleaseReadiness } from "@/lib/release/readiness";

export const dynamic = "force-dynamic";

const buildResponse = ({
  duration,
  error,
  ready,
}: {
  duration: number;
  error?: "application_not_ready" | "database_unavailable";
  ready: boolean;
}) => NextResponse.json(
  {
    db: ready || error === "application_not_ready" ? "connected" : "disconnected",
    ...(error ? { error } : {}),
    duration,
    status: ready ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  },
  { status: ready ? 200 : 503 },
);

export async function GET() {
  const startedAt = Date.now();
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return buildResponse({
      duration: Date.now() - startedAt,
      error: "database_unavailable",
      ready: false,
    });
  }

  try {
    const readiness = await checkReleaseReadiness(connectionString);

    if (!readiness.ready) {
      return buildResponse({
        duration: Date.now() - startedAt,
        error: "application_not_ready",
        ready: false,
      });
    }

    return buildResponse({
      duration: Date.now() - startedAt,
      ready: true,
    });
  } catch (error) {
    console.error("[health] readiness check failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return buildResponse({
      duration: Date.now() - startedAt,
      error: "database_unavailable",
      ready: false,
    });
  }
}
