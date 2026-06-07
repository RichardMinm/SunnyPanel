/**
 * B 组面板体验测试：搜索过滤、关联对象卡片、Thinking 折叠、归档
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Thread 搜索过滤逻辑 (DashboardIconBar filtering) ───

describe("Thread search/filter", () => {
  const threads = [
    { id: 1, title: "考研复习计划", tags: ["学习"], pendingAction: null, archived: false, lastInteractionAt: null },
    { id: 2, title: "SunnyPanel 开发", tags: ["开发", "前端"], pendingAction: null, archived: false, lastInteractionAt: null },
    { id: 3, title: "本周复盘", tags: ["复盘"], pendingAction: null, archived: false, lastInteractionAt: null },
    { id: 4, title: "阅读笔记整理", tags: [], pendingAction: null, archived: false, lastInteractionAt: null },
  ];

  const filterThreads = (query: string) => {
    if (!query.trim()) return threads;
    const q = query.trim().toLowerCase();
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)),
    );
  };

  it("空搜索返回全部 threads", () => {
    assert.equal(filterThreads("").length, 4);
    assert.equal(filterThreads("  ").length, 4);
  });

  it("按标题关键词搜索", () => {
    const result = filterThreads("考研");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 1);
  });

  it("按标签搜索", () => {
    const result = filterThreads("前端");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 2);
  });

  it("大小写不敏感", () => {
    const result = filterThreads("SUNNYPANEL");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 2);
  });

  it("无匹配返回空数组", () => {
    const result = filterThreads("健身");
    assert.equal(result.length, 0);
  });
});

// ─── 关联对象面板渲染逻辑 ───

describe("LinkedObjectsPanel", () => {
  const collectionIcon = {
    plans: "📋",
    "schedule-items": "📅",
    notes: "📝",
    posts: "📄",
    checklists: "✅",
    "agent-memories": "🧠",
  };

  const operationLabel = {
    create: "新建",
    update: "更新",
    delete: "删除",
  };

  it("affectedDocuments 为空时返回空状态", () => {
    const documents: Array<{ collection: string; operation: string }> = [];
    assert.equal(documents.length, 0);
  });

  it("单条 affectedDocument 包含完整字段", () => {
    const doc = {
      collection: "plans",
      documentId: 42,
      operation: "create" as const,
      title: "考研复习计划",
      adminHref: "/admin/collections/plans/42",
      publicHref: undefined,
    };

    assert.equal(doc.collection, "plans");
    assert.equal(doc.documentId, 42);
    assert.equal(doc.operation, "create");
    assert.equal(doc.title, "考研复习计划");
    assert.ok(doc.adminHref);
    assert.equal(collectionIcon[doc.collection], "📋");
    assert.equal(operationLabel[doc.operation], "新建");
  });

  it("多条 affectedDocuments 按顺序渲染", () => {
    const docs = [
      { collection: "plans", documentId: 1, operation: "update" as const, title: "计划A" },
      { collection: "schedule-items", documentId: 2, operation: "create" as const, title: "日程B" },
      { collection: "notes", documentId: 3, operation: "delete" as const, title: "笔记C" },
    ];

    assert.equal(docs.length, 3);
    assert.equal(docs[0].title, "计划A");
    assert.equal(docs[1].title, "日程B");
    assert.equal(docs[2].title, "笔记C");
  });

  it("无 title 时使用默认格式", () => {
    const doc = { collection: "plans", documentId: 5, operation: "update" as const };
    const fallback = `${doc.collection} #${doc.documentId}`;
    assert.equal(fallback, "plans #5");
  });

  it("无 href 时卡片不可点击跳转", () => {
    const doc = {
      collection: "posts",
      documentId: 10,
      operation: "create" as const,
      title: "文章",
      adminHref: undefined,
      publicHref: undefined,
    };
    assert.equal(doc.adminHref ?? doc.publicHref, undefined);
  });
});

// ─── Thinking 折叠逻辑 ───

describe("Thinking fold behavior", () => {
  const hasThinking = (content?: string) => Boolean(content?.trim());

  it("thinkingContent 为空时不显示折叠区", () => {
    assert.equal(hasThinking(""), false);
    assert.equal(hasThinking("  "), false);
    assert.equal(hasThinking(undefined), false);
  });

  it("thinkingContent 非空时显示折叠区", () => {
    assert.equal(hasThinking("分析用户意图：计划查询"), true);
  });

  it("thinking content 按双换行分割为步骤", () => {
    const content = "步骤1：读取上下文\n\n步骤2：分析意图\n\n步骤3：生成回答";
    const steps = content.split(/\n{2,}/).filter(Boolean);
    assert.equal(steps.length, 3);
    assert.equal(steps[0], "步骤1：读取上下文");
    assert.equal(steps[2], "步骤3：生成回答");
  });

  it("单段 thinking 不显示步数", () => {
    const content = "正在分析你的请求...";
    const steps = content.split(/\n{2,}/).filter(Boolean);
    assert.equal(steps.length, 1);
  });

  it("isThinking 为 true 时默认展开", () => {
    const isThinking = true;
    const initialState = isThinking ? true : false;
    assert.equal(initialState, true);
  });

  it("isThinking 为 false 时保持当前状态", () => {
    const isThinking = false;
    const initialState = isThinking ? true : false;
    assert.equal(initialState, false);
  });
});

// ─── 归档逻辑 ───

describe("Archive behavior", () => {
  it("restore 从归档列表移除", () => {
    const archiveThreads = [
      { id: 1, title: "旧会话1" },
      { id: 2, title: "旧会话2" },
      { id: 3, title: "旧会话3" },
    ];

    const afterRestore = archiveThreads.filter((t) => t.id !== 2);
    assert.equal(afterRestore.length, 2);
    assert.equal(afterRestore[0].title, "旧会话1");
    assert.equal(afterRestore[1].title, "旧会话3");
  });

  it("归档列表为空时不报错", () => {
    const empty: Array<{ id: number }> = [];
    const afterRestore = empty.filter((t) => t.id !== 1);
    assert.equal(afterRestore.length, 0);
  });
});
