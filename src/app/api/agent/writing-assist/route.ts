import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAgentStructuredModelConfig } from "@/lib/agent/llm/resolve-agent-model-config";
import { logAgentEvent } from "@/lib/agent/logger";
import {
  ModelCallAuthorizationError,
  createModelCallBudgetRecorder,
} from "@/lib/agent/orchestration/model-call-budget";
import {
  isBoundedWritingRichContent,
  validateWritingAssistInput,
} from "@/lib/agent/writing/input-contract";
import {
  rememberWritingStyle,
  runWritingAssist,
} from "@/lib/agent/writing-assist-core";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { checkRateLimit } from "@/lib/shared/rate-limit";
import { dashboardContentCollections } from "@/lib/dashboard/content/config";

const actionSchema = z.enum([
  "condense",
  "continue",
  "expand",
  "extract_tags",
  "generate_outline",
  "generate_summary",
  "generate_title",
  "polish",
  "rewrite",
  "summarize",
]);
const collectionSchema = z.enum(dashboardContentCollections);
const assistRequestSchema = z.object({
  action: actionSchema,
  collection: collectionSchema.optional(),
  contentRich: z.custom(isBoundedWritingRichContent).optional(),
  summary: z.string().max(4_000).optional(),
  text: z.string().max(50_000).optional(),
  title: z.string().max(500).optional(),
}).strict();
const rememberStyleRequestSchema = z.object({
  action: z.literal("remember_style"),
  collection: collectionSchema.optional(),
  result: z.string().trim().min(1).max(50_000),
  sourceAction: actionSchema.optional(),
  text: z.string().max(50_000).optional(),
}).strict();
export async function POST(request: Request) {
  const auth = await getPayloadAuthResult();

  if (!auth.user) {
    return NextResponse.json({ message: "未授权" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(`writing-assist:${auth.user.id}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "请求过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);
  const action = body && typeof body === "object" && "action" in body
    ? String(body.action)
    : "";

  // 用户显式采纳改写 → 轻量沉淀 writing_style 记忆，形成"越用越懂文风"的学习闭环。
  if (action === "remember_style") {
    const parsed = rememberStyleRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "采纳内容格式无效" }, { status: 400 });
    }

    try {
      const memory = await rememberWritingStyle({
        action: parsed.data.sourceAction ?? "rewrite",
        collection: parsed.data.collection,
        resultText: parsed.data.result,
        sourceText: parsed.data.text,
      });

      return memory
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { message: "内容为空或包含敏感凭据，未保存" },
            { status: 400 },
          );
    } catch {
      return NextResponse.json({ message: "记忆写入失败" }, { status: 502 });
    }
  }

  const parsed = assistRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
  }
  const inputValidation = validateWritingAssistInput(parsed.data);
  if (!inputValidation.ok) {
    return NextResponse.json(
      {
        message: inputValidation.code === "sensitive_input"
          ? "内容包含敏感凭据，无法发送给写作模型"
          : "写作内容格式或大小无效",
      },
      { status: 400 },
    );
  }

  if (process.env.AGENT_DISABLE_LLM === "1") {
    if (action === "extract_tags") {
      return NextResponse.json({ tags: ["写作", "草稿"] });
    }

    if (action === "generate_outline") {
      return NextResponse.json({
        outline: [{ id: "section-1", level: 1, text: "开篇" }],
      });
    }

    return NextResponse.json({ message: "AI 功能已禁用", result: "" }, { status: 503 });
  }

  const config = await resolveAgentStructuredModelConfig(undefined, {
    maxOutputTokens: 8_192,
    maxRetries: 0,
    temperature: 0.4,
    timeoutMs: 30_000,
  });

  if (!config) {
    return NextResponse.json({ message: "AI 模型未配置" }, { status: 503 });
  }

  try {
    const modelCallRecorder = createModelCallBudgetRecorder();
    const result = await runWritingAssist({
      action: parsed.data.action,
      collection: parsed.data.collection,
      contentRich: parsed.data.contentRich as never,
      summary: parsed.data.summary,
      text: parsed.data.text,
      title: parsed.data.title,
    }, {
      modelInvocation: {
        logicalCallAuthorizer: (scopeId) => {
          if (modelCallRecorder.record("specialist", scopeId) === false) {
            throw new ModelCallAuthorizationError(
              "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED",
            );
          }
        },
        modelConfig: config,
        providerAttemptAuthorizer: () =>
          modelCallRecorder.recordProviderAttempt("specialist"),
        signal: request.signal,
      },
    });

    const accounting = modelCallRecorder.snapshot();
    logAgentEvent("info", "agent.writing_assist", {
      action: parsed.data.action,
      logicalCalls: accounting.specialistLogicalCalls,
      providerAttempts: accounting.specialistProviderAttempts,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ message: "AI 请求失败" }, { status: 502 });
  }
}
