import { NextResponse } from "next/server";

import { getAgentModelConfig } from "@/lib/agent/client";
import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";
import {
  rememberWritingStyle,
  runWritingAssist,
} from "@/lib/agent/writing-assist-core";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const writingAssistActions = new Set<WritingAssistAction>([
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

export async function POST(request: Request) {
  const auth = await getPayloadAuthResult();

  if (!auth.user) {
    return NextResponse.json({ message: "未授权" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as null | Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  // 用户显式采纳改写 → 轻量沉淀 writing_style 记忆，形成"越用越懂文风"的学习闭环。
  if (action === "remember_style") {
    const resultText = typeof body?.result === "string" ? body.result : "";

    if (!resultText.trim()) {
      return NextResponse.json({ message: "缺少采纳内容" }, { status: 400 });
    }

    try {
      await rememberWritingStyle({
        action:
          typeof body?.sourceAction === "string" &&
          writingAssistActions.has(body.sourceAction as WritingAssistAction)
            ? (body.sourceAction as WritingAssistAction)
            : "rewrite",
        collection:
          typeof body?.collection === "string" ? (body.collection as never) : undefined,
        resultText,
        sourceText: typeof body?.text === "string" ? body.text : undefined,
      });

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ message: "记忆写入失败" }, { status: 502 });
    }
  }

  if (!writingAssistActions.has(action as WritingAssistAction)) {
    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
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

  const config = await getAgentModelConfig();

  if (!config) {
    return NextResponse.json({ message: "AI 模型未配置" }, { status: 503 });
  }

  try {
    const result = await runWritingAssist({
      action: action as WritingAssistAction,
      collection: typeof body?.collection === "string" ? (body.collection as never) : undefined,
      contentRich:
        body?.contentRich && typeof body.contentRich === "object"
          ? (body.contentRich as never)
          : undefined,
      summary: typeof body?.summary === "string" ? body.summary : undefined,
      text: typeof body?.text === "string" ? body.text : undefined,
      title: typeof body?.title === "string" ? body.title : undefined,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ message: "AI 请求失败" }, { status: 502 });
  }
}
