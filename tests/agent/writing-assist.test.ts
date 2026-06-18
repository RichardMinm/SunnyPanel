import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  buildWritingAssistMessages,
  parseWritingAssistResult,
} from "../../src/lib/agent/prompts/writing-assist";
import { createTokenUsageSnapshot } from "../../src/lib/agent/token-usage";
import { rememberWritingStyle, runWritingAssist } from "../../src/lib/agent/writing-assist-core";

const read = (path: string) => readFileSync(path, "utf8");

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
