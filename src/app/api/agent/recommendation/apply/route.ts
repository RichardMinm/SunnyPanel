import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { validateAgentRunData, validatePlanCreateData } from "@/lib/agent/write-schemas";

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

const summarizeRecommendation = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > 48 ? `${normalized.slice(0, 48).trimEnd()}...` : normalized;
};

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能应用建议。",
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        assistantMessage: "请求体格式不正确。",
      },
      { status: 400 },
    );
  }

  const reviewId = parseNumber(body.reviewId);
  const recommendationIndex = parseNumber(body.recommendationIndex);

  if (reviewId === null || recommendationIndex === null) {
    return NextResponse.json(
      {
        assistantMessage: "缺少 PlanReview 或建议序号。",
      },
      { status: 400 },
    );
  }

  const payload = await getPayloadClient();
  const review = await payload.findByID({
    collection: "plan-reviews",
    depth: 0,
    id: reviewId,
    overrideAccess: true,
  });
  const recommendation = review.recommendations?.[recommendationIndex]?.content?.trim();

  if (!recommendation) {
    return NextResponse.json(
      {
        assistantMessage: "没有找到这条建议。",
      },
      { status: 404 },
    );
  }

  const planData = validatePlanCreateData({
    agentBrief: recommendation,
    agentState: "idle",
    description: `来自 PlanReview #${review.id}：${recommendation}`,
    dueDate: null,
    executionMode: "manual",
    priority: review.health === "risk" ? "high" : "medium",
    state: "backlog",
    status: "draft",
    title: `跟进建议：${summarizeRecommendation(recommendation)}`,
    visibility: "private",
  });
  const createdPlan = await payload.create({
    collection: "plans",
    data: planData,
    overrideAccess: true,
  });
  const recordedAt = new Date().toISOString();
  const agentRunData = validateAgentRunData({
    completedAt: recordedAt,
    goal: `应用 PlanReview #${review.id} 的建议`,
    relatedContent: [
      {
        relationTo: "plan-reviews",
        value: review.id,
      },
    ],
    startedAt: recordedAt,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已创建跟进计划 #${createdPlan.id}`,
        recordedAt,
      },
    ],
    summary: `已根据建议创建跟进计划「${createdPlan.title}」。`,
    title: `Applied recommendation · PlanReview #${review.id}`,
    trigger: "agent",
    workflow: "planning",
  });

  await payload.create({
    collection: "agent-runs",
    data: agentRunData,
    overrideAccess: true,
  });

  return NextResponse.json({
    assistantMessage: `已根据建议创建跟进计划「${createdPlan.title}」。`,
    planId: createdPlan.id,
  });
}
