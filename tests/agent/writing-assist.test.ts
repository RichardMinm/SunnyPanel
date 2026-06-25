import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  buildWritingAssistMessages,
  parseWritingAssistResult,
} from "../../src/lib/agent/prompts/writing-assist";
import { runResolveIntentStep } from "../../src/lib/agent/chat-pipeline/resolve-intent-step";
import { createTokenUsageSnapshot } from "../../src/lib/agent/token-usage";
import {
  rememberWritingStyle,
  runWritingAssist,
  type WritingAssistRequest,
} from "../../src/lib/agent/writing-assist-core";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentChatResponse, AgentTraceStep } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const read = (path: string) => readFileSync(path, "utf8");

const promptContext: AgentPromptContext = {
  checklists: [],
  contentItems: [{ id: 1, kind: "posts", status: "published", summary: null, title: "上一篇随笔", updatedAt: "2026-06-01", visibility: "public" }],
  memories: [{ id: 1, title: "文风样例", type: "writing_style", content: "短句、直接", confidence: 0.8, lastUsedAt: null }],
  now: "2026-06-25T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 8,
  inputTokens: 5,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 13,
};

describe("writing assist API", () => {
  test("route exposes supported assist actions", () => {
    const route = read("src/app/api/agent/writing-assist/route.ts");

    assert.match(route, /writing-assist/);
    assert.match(route, /generate_title/);
    assert.match(route, /rewrite/);
    assert.match(route, /AGENT_DISABLE_LLM/);
  });

  test("prompt builder covers selection and document level actions", () => {
    const prompts = read("src/lib/agent/prompts/writing-assist.ts");

    assert.match(prompts, /generate_summary/);
    assert.match(prompts, /extract_tags/);
    assert.match(prompts, /generate_outline/);
  });

  test("editor exposes lightweight AI entry points", () => {
    const toolbar = read("src/components/content-editor/EditorToolbar.tsx");
    const bubble = read("src/components/content-editor/EditorBubbleMenu.tsx");
    const pane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(toolbar, /续写/);
    assert.match(bubble, /改写/);
    assert.match(pane, /生成标题/);
    assert.match(pane, /自动生成摘要/);
  });

  test("document-level AI outline results become editable heading blocks", () => {
    const pane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(pane, /response\.outline/);
    assert.match(pane, /type:\s*"heading"/);
    assert.match(pane, /attrs:\s*\{\s*level:\s*item\.level/);
    assert.match(pane, /contentRich:\s*nextContent/);
  });

  test("writing assist failures are visible in the editor pane", () => {
    const pane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(pane, /error:\s*aiError/);
    assert.match(pane, /AI 辅助失败/);
    assert.match(pane, /sunny-writing-inline-error/);
  });

  test("selection AI actions replace only the selected editor range", () => {
    const bubble = read("src/components/content-editor/EditorBubbleMenu.tsx");
    const pane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(bubble, /replaceSelection/);
    assert.match(bubble, /insertContentAt\(\{ from, to \}/);
    assert.match(bubble, /textBetween\(from, to, " "\)\.trim\(\) !== selectedText/);
    assert.match(pane, /replaceSelection\(response\.result\)/);
    assert.doesNotMatch(
      pane,
      /\["condense", "expand", "polish", "rewrite", "summarize"\]\.includes\(action\)[\s\S]*?onUpdateDraft\(\{\s*contentRich/,
    );
  });
});

describe("writing assist core", () => {
  test("messages inject style memories, related content, and a negative example", () => {
    const messages = buildWritingAssistMessages({
      action: "rewrite",
      collection: "posts",
      relatedTitles: ["上一篇随笔"],
      styleMemories: ["文风样例·改写：简洁直接"],
      text: "原文",
      title: "标题",
    });

    assert.match(messages[0].content, /negative example/);
    assert.match(messages[1].content, /文风偏好/);
    assert.match(messages[1].content, /简洁直接/);
    assert.match(messages[1].content, /近期同类内容/);
    assert.match(messages[1].content, /上一篇随笔/);
  });

  test("parse normalizes result, tags, and outline JSON shapes", () => {
    assert.deepEqual(parseWritingAssistResult("polish", { result: "  润色  " }), { result: "润色" });
    assert.deepEqual(parseWritingAssistResult("extract_tags", { tags: ["写作", 7, "灵感"] }), {
      tags: ["写作", "灵感"],
    });

    const outline = parseWritingAssistResult("generate_outline", {
      outline: [
        { id: "s1", level: 1, text: "开篇" },
        { id: "s2", level: 9, text: "非法层级" },
      ],
    });
    assert.equal(outline.outline?.length, 1);
    assert.equal(outline.outline?.[0]?.id, "s1");
  });

  test("runWritingAssist feeds style + related context into the shared LLM layer", async () => {
    const seen: string[] = [];
    const result = await runWritingAssist(
      { action: "polish", collection: "posts", text: "原文", title: "标题" },
      {
        complete: async ({ messages, parse }) => {
          for (const message of messages) {
            seen.push(message.content);
          }
          return {
            data: parse({ result: "润色后的文本" }) ?? {},
            raw: "",
            tokenUsage: createTokenUsageSnapshot(),
          };
        },
        fetchRelatedTitles: async () => ["上一篇文章"],
        fetchStyleMemories: async () => ["文风样例·改写：简洁直接"],
      },
    );

    assert.equal(result.result, "润色后的文本");
    assert.ok(seen.some((content) => content.includes("简洁直接")));
    assert.ok(seen.some((content) => content.includes("上一篇文章")));
  });

  test("rememberWritingStyle persists an accepted rewrite as writing_style memory", async () => {
    let persisted: null | Record<string, unknown> = null;
    const doc = await rememberWritingStyle(
      { action: "rewrite", collection: "posts", resultText: "用户偏好的简洁表达。" },
      {
        persist: async (memory) => {
          persisted = memory as Record<string, unknown>;
          return { ...(memory as Record<string, unknown>), id: 1 } as never;
        },
      },
    );

    const saved = persisted as null | Record<string, unknown>;
    assert.equal(saved?.type, "writing_style");
    assert.match(String(saved?.content), /用户偏好的简洁表达/);
    assert.equal(doc?.type, "writing_style");
  });

  test("rememberWritingStyle skips empty acceptances", async () => {
    const doc = await rememberWritingStyle(
      { action: "rewrite", resultText: "   " },
      {
        persist: async () => {
          throw new Error("should not persist empty acceptance");
        },
      },
    );

    assert.equal(doc, null);
  });
});

describe("writing assist through Agent chat", () => {
  test("writing workbench mode resolves to a traceable Agent chat response", async () => {
    const trace: AgentTraceStep[] = [];
    const tokens: string[] = [];
    const result = await runResolveIntentStep({
      confirmationSignals: { cancel: false, confirm: false },
      context: promptContext,
      emitStatus: () => undefined,
      emitToken: (token) => tokens.push(token),
      emitUsage: () => undefined,
      intentModelEngine: "workflow",
      message: "请润色：今天写得很散，但我还是想保留一点温度。",
      modelResolver: async () => {
        throw new Error("writing mode should not call the generic intent model");
      },
      pendingAction: null,
      persistAgentTurn: async () => ({ id: 77 } as AgentThread),
      pushTrace: (step) => trace.push(step),
      recordAgentConfirmationDecisionFn: async () => undefined,
      recordBatchConfirmationDecisionFn: async () => undefined,
      resolvedHistory: [],
      thread: { id: 77 } as AgentThread,
      tokenUsage: baseTokenUsage,
      trace,
      user: { id: 1 },
      workbenchMode: "writing",
      writingAssistRunner: async (request: WritingAssistRequest) => {
        assert.equal(request.action, "polish");
        assert.match(request.text ?? "", /今天写得很散/);
        return { result: "今天的文字还有些散，但里面有一种值得保留的温度。" };
      },
    });

    assert.equal(result.outcome, "continue");
    assert.equal(result.data.resolution.intent.intent, "answer_question");
    assert.match(
      result.data.resolution.intent.intent === "answer_question"
        ? result.data.resolution.intent.args.answer
        : "",
      /值得保留的温度/,
    );
    assert.match(tokens.join(""), /值得保留的温度/);
    assert.ok((result.data.tokenUsage.outputTokens ?? 0) > 0);
    assert.ok(trace.some((step) => step.id === "writing-assist-chat" && step.status === "done"));
  });

  test("writing workbench mode returns a controlled clarify response when LLM is disabled", async () => {
    const trace: AgentTraceStep[] = [];
    const result = await runResolveIntentStep({
      confirmationSignals: { cancel: false, confirm: false },
      context: promptContext,
      emitStatus: () => undefined,
      emitToken: () => undefined,
      emitUsage: () => undefined,
      intentModelEngine: "workflow",
      message: "帮我改写这段文字：原文",
      modelResolver: async () => {
        throw new Error("disabled writing mode should not call the generic intent model");
      },
      pendingAction: null,
      persistAgentTurn: async () => ({ id: 78 } as AgentThread),
      pushTrace: (step) => trace.push(step),
      recordAgentConfirmationDecisionFn: async () => undefined,
      recordBatchConfirmationDecisionFn: async () => undefined,
      resolvedHistory: [],
      thread: { id: 78 } as AgentThread,
      tokenUsage: baseTokenUsage,
      trace,
      user: { id: 1 },
      workbenchMode: "writing",
    });

    assert.equal(result.outcome, "continue");
    assert.equal(result.data.resolution.intent.intent, "clarify");
    assert.match(
      result.data.resolution.intent.intent === "clarify"
        ? result.data.resolution.intent.args.question
        : "",
      /AI 功能已禁用/,
    );
    assert.ok(trace.some((step) => step.id === "writing-assist-chat" && step.status === "error"));
  });
});
