import { NextResponse } from "next/server";

import { evaluatePlan } from "@/lib/agent/evaluation";
import type { EvaluatePlanArgs } from "@/lib/agent/schemas";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseEvaluationArgs = (value: unknown): EvaluatePlanArgs => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    planId: parseNumber(value.planId),
    planTitle: typeof value.planTitle === "string" ? value.planTitle.trim() || null : null,
  };
};

const requireAgentAuth = async () => {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能评估计划。",
      },
      { status: 401 },
    );
  }

  return null;
};

export async function GET(request: Request) {
  const authError = await requireAgentAuth();

  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  const result = await evaluatePlan(
    parseEvaluationArgs({
      planId: url.searchParams.get("planId"),
      planTitle: url.searchParams.get("planTitle"),
    }),
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const authError = await requireAgentAuth();

  if (authError) {
    return authError;
  }

  const body = await request.json().catch(() => null);
  const result = await evaluatePlan(parseEvaluationArgs(body), {
    persistReview: !isRecord(body) || body.persistReview !== false,
  });

  return NextResponse.json(result);
}
