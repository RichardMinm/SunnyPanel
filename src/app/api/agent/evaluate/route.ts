import { NextResponse } from "next/server";

import {
  parseEvaluatePlanArgs,
  parseEvaluatePlanArgsFromSearchParams,
  shouldPersistEvaluateReviewFromBody,
} from "@/lib/agent/api/parse-evaluate-progress-args";
import { evaluatePlan } from "@/lib/agent/evaluation";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const requireAgentAuth = async () => {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        message: "当前会话没有登录，暂时不能评估计划。",
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
  const result = await evaluatePlan(parseEvaluatePlanArgsFromSearchParams(url.searchParams));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const authError = await requireAgentAuth();

  if (authError) {
    return authError;
  }

  const body = await request.json().catch(() => null);
  const result = await evaluatePlan(parseEvaluatePlanArgs(body), {
    persistReview: shouldPersistEvaluateReviewFromBody(body),
  });

  return NextResponse.json(result);
}
