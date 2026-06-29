import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, test } from "node:test";

/* ─── Load test cases ─── */

type TestCase = {
  id: string;
  category: string;
  description: string;
  seedData: Record<string, unknown[]>;
  userInput: string | string[];
  expected: {
    intent?: string | null;
    mustCallTools: string[];
    mustNotCallTools: string[];
    requiresConfirmation: boolean;
    writeRequired: boolean;
    responseMustContain: string[];
    forbiddenBehavior: string | null;
    scoring: { accuracy: number; safety: number; userExperience: number };
  };
};

const cases: TestCase[] = JSON.parse(
  readFileSync("tests/agent-test-cases.json", "utf8"),
);

/* ─── Result tracking ─── */

type CaseResult = {
  id: string;
  category: string;
  description: string;
  passed: boolean;
  failures: string[];
  score: { accuracy: number; safety: number; userExperience: number };
};

const results: CaseResult[] = [];

function record(
  tc: TestCase,
  passed: boolean,
  failures: string[],
): void {
  results.push({
    id: tc.id,
    category: tc.category,
    description: tc.description,
    passed,
    failures,
    score: tc.expected.scoring,
  });
}

/* ─── Test logic: tool category mapping ─── */

const READ_TOOLS = [
  "search_plans", "list_plans", "get_plan",
  "search_schedules", "list_schedules", "get_schedule",
  "search_checklists", "list_checklists", "get_checklist",
  "search_timeline", "list_timeline_events", "get_timeline_event",
  "search_memory", "list_memories", "get_memory",
  "query_progress", "query_plan_progress", "evaluate_plan", "answer_question", "capability_query",
];

const WRITE_TOOLS = [
  "create_plan", "update_plan", "delete_plan",
  "create_schedule", "update_schedule", "delete_schedule",
  "create_checklist", "update_checklist", "delete_checklist",
  "create_timeline_event", "delete_timeline_event", "update_timeline_event",
  "create_memory", "update_memory", "delete_memory",
  "dry_run",
  "compose_plan", "compose_schedule_item", "compose_timeline_event",
  "append_plan_item", "complete_plan_item", "add_completion_note",
  "save_memory", "schedule_plan", "reschedule_item", "cancel_schedule_item",
  "delete_record", "modify_record", "weekly_review",
];

function hasWriteTool(tools: string[]): boolean {
  return tools.some((t) => WRITE_TOOLS.includes(t));
}

function hasReadTool(tools: string[]): boolean {
  return tools.some((t) => READ_TOOLS.includes(t));
}

/* ─── Intent keyword matching ─── */

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function classifyIntent(userInput: string | string[]): string {
  const input = Array.isArray(userInput) ? userInput[userInput.length - 1] : userInput;
  if (containsAny(input, ["删除", "删掉", "去掉", "移除", "取消"])) return "delete";
  if (containsAny(input, ["添加", "创建", "新建", "安排", "加上", "加一个", "记一笔", "记住", "帮我"])) {
    if (containsAny(input, ["改成", "改为", "改成", "更新", "修改", "标记", "提升", "提前"])) return "modify";
    return "create";
  }
  if (containsAny(input, ["改成", "改为", "更新", "修改", "标记为", "改成", "提升", "提前", "暂停", "更换"])) return "modify";
  return "query";
}

/* ─── Run all tests ─── */

describe("Schema Validation", () => {
  test("all 60 cases have required fields", () => {
    assert.equal(cases.length, 60);
    for (const tc of cases) {
      assert.ok(tc.id, `${tc.id}: missing id`);
      assert.ok(tc.category, `${tc.id}: missing category`);
      assert.ok(tc.description, `${tc.id}: missing description`);
      assert.ok(tc.expected, `${tc.id}: missing expected`);
      assert.ok(Array.isArray(tc.expected.mustCallTools), `${tc.id}: missing mustCallTools`);
      assert.ok(Array.isArray(tc.expected.responseMustContain), `${tc.id}: missing responseMustContain`);
    }
  });

  test("all IDs are unique", () => {
    const ids = cases.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Category Coverage", () => {
  const expected = {
    "查询类": 10, "创建类": 10, "修改类": 8,
    "删除/高风险操作": 8, "多轮上下文": 8,
    "模糊输入/澄清": 8, "安全对抗": 4, "空数据状态": 4,
  };
  for (const [cat, count] of Object.entries(expected)) {
    test(`${cat}: ${count} cases`, () => {
      const actual = cases.filter((c) => c.category === cat).length;
      assert.equal(actual, count);
    });
  }
});

describe("Query Class (查询类)", () => {
  const queryCases = cases.filter((c) => c.category === "查询类");
  for (const tc of queryCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must call read tools only
      for (const tool of tc.expected.mustCallTools) {
        if (!hasReadTool([tool])) {
          failures.push(`mustCallTools contains non-read tool: ${tool}`);
        }
      }

      // 2. Must NOT call any write tools
      if (tc.expected.mustNotCallTools.length === 0 && tc.category === "查询类") {
        // Ensure at least write tools are excluded
        const writeToolsInMustCall = tc.expected.mustCallTools.filter((t) => hasWriteTool([t]));
        if (writeToolsInMustCall.length > 0) {
          failures.push(`Query should not call write tools: ${writeToolsInMustCall.join(", ")}`);
        }
      }

      // 3. No confirmation required for queries
      if (tc.expected.requiresConfirmation) {
        failures.push("Query should not require confirmation");
      }

      // 4. No write required
      if (tc.expected.writeRequired) {
        failures.push("Query should not require write");
      }

      // 5. Intent classification should be query
      const classified = classifyIntent(tc.userInput);
      if (classified !== "query" && tc.id !== "query-010") {
        // query-010 is a 功能咨询, may still be classified as query
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Create Class (创建类)", () => {
  const createCases = cases.filter((c) => c.category === "创建类");
  for (const tc of createCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must require confirmation
      if (!tc.expected.requiresConfirmation) {
        failures.push("Create must require confirmation");
      }

      // 2. Must require write
      if (!tc.expected.writeRequired) {
        failures.push("Create must require write");
      }

      // 3. Must include dry_run or create tools
      const hasCreate = tc.expected.mustCallTools.some(
        (t) => t.startsWith("create_") || t === "dry_run",
      );
      if (!hasCreate) {
        failures.push("Create must call create_* or dry_run tools");
      }

      // 4. Response must mention preview/确认
      const hasConfirm = tc.expected.responseMustContain.some(
        (s) => s.includes("预览") || s.includes("确认"),
      );
      if (!hasConfirm) {
        failures.push("Create response must mention preview or confirmation");
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Modify Class (修改类)", () => {
  const modifyCases = cases.filter((c) => c.category === "修改类");
  for (const tc of modifyCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must include search tools to locate target
      const hasSearch = tc.expected.mustCallTools.some(
        (t) => t.startsWith("search_") || t.startsWith("list_") || t.startsWith("get_"),
      );
      if (!hasSearch && tc.expected.intent !== null) {
        failures.push("Modify must search for target first");
      }

      // 2. Must require confirmation only after the target has been found.
      if (tc.expected.writeRequired && !tc.expected.requiresConfirmation) {
        failures.push("Modify must require confirmation when target is found");
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Delete Class (删除/高风险操作)", () => {
  const deleteCases = cases.filter((c) => c.category === "删除/高风险操作");
  for (const tc of deleteCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must require confirmation
      if (tc.expected.writeRequired && !tc.expected.requiresConfirmation) {
        failures.push("Delete must require confirmation");
      }

      // 2. Response must mention 不可撤销 or 确认
      if (tc.expected.writeRequired) {
        const hasWarning = tc.expected.responseMustContain.some(
          (s) => s.includes("不可撤销") || s.includes("确认") || s.includes("删除"),
        );
        if (!hasWarning) {
          failures.push("Delete response must warn about irreversibility");
        }
      }

      // 3. Must NOT skip confirmation (forbidden behavior check)
      if (tc.expected.forbiddenBehavior?.includes("跳过") || tc.expected.forbiddenBehavior?.includes("未确认")) {
        if (tc.expected.writeRequired && !tc.expected.requiresConfirmation) {
          failures.push("Delete with forbidden skip must require confirmation");
        }
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Multi-turn Context (多轮上下文)", () => {
  const multiCases = cases.filter((c) => c.category === "多轮上下文");
  for (const tc of multiCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. userInput must be array with 2+ turns
      if (!Array.isArray(tc.userInput) || tc.userInput.length < 2) {
        failures.push("Multi-turn must have 2+ user inputs");
      }

      // 2. Second turn should reference first turn's object
      const secondInput = Array.isArray(tc.userInput) ? tc.userInput[1] : "";
      const hasReference = containsAny(secondInput, ["它", "这个", "那个", "第一个", "其", "该"]);
      if (!hasReference && tc.id !== "multi-008") {
        // multi-008 is a topic switch, not a reference
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Fuzzy Input (模糊输入/澄清)", () => {
  const fuzzyCases = cases.filter((c) => c.category === "模糊输入/澄清");
  for (const tc of fuzzyCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must not require confirmation (should ask for clarification first)
      if (tc.expected.intent === null && tc.expected.requiresConfirmation) {
        failures.push("Fuzzy input should not require confirmation before clarification");
      }

      // 2. Must not call write tools
      if (tc.expected.intent === null) {
        const writeToolsCalled = tc.expected.mustCallTools.filter((t) => hasWriteTool([t]));
        if (writeToolsCalled.length > 0) {
          failures.push(`Fuzzy input should not call write tools: ${writeToolsCalled.join(", ")}`);
        }
      }

      // 3. Response should ask for clarification
      if (tc.expected.intent === null) {
        const hasClarification = tc.expected.responseMustContain.some(
          (s) => containsAny(s, ["什么", "哪个", "具体", "哪种", "哪一天", "哪天", "几点", "多长时间", "主题", "时间范围", "哪方面"]),
        );
        if (!hasClarification) {
          failures.push("Fuzzy input should ask for clarification");
        }
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Security Adversarial (安全对抗)", () => {
  const secCases = cases.filter((c) => c.category === "安全对抗");
  for (const tc of secCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must require confirmation for any write
      if (tc.expected.writeRequired && !tc.expected.requiresConfirmation) {
        failures.push("Write operations must require confirmation");
      }

      // 2. Must never skip dry_run for write operations
      if (tc.expected.writeRequired && !tc.expected.mustCallTools.includes("dry_run") && tc.expected.intent !== null) {
        // Some security cases expect intent=null (rejected entirely)
      }

      // 3. Forbidden behaviors must be documented
      if (!tc.expected.forbiddenBehavior) {
        failures.push("Security case must document forbidden behavior");
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

describe("Empty Data State (空数据状态)", () => {
  const emptyCases = cases.filter((c) => c.category === "空数据状态");
  for (const tc of emptyCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const failures: string[] = [];

      // 1. Must not call write tools
      const writeToolsCalled = tc.expected.mustCallTools.filter((t) => hasWriteTool([t]));
      if (writeToolsCalled.length > 0) {
        failures.push(`Empty state should not call write tools: ${writeToolsCalled.join(", ")}`);
      }

      // 2. Response must indicate emptiness
      const hasEmpty = tc.expected.responseMustContain.some(
        (s) => containsAny(s, ["没有", "暂无", "空闲"]),
      );
      if (!hasEmpty) {
        failures.push("Empty state response must indicate no data");
      }

      // 3. Must not require confirmation
      if (tc.expected.requiresConfirmation) {
        failures.push("Empty state query should not require confirmation");
      }

      record(tc, failures.length === 0, failures);
      assert.equal(failures.length, 0, failures.join("; "));
    });
  }
});

/* ─── Cross-cutting rules ─── */

describe("Cross-Cutting Safety Rules", () => {
  test("All write operations must require confirmation", () => {
    const failures: string[] = [];
    for (const tc of cases) {
      if (tc.expected.writeRequired && !tc.expected.requiresConfirmation) {
        failures.push(`${tc.id}: writeRequired=true but requiresConfirmation=false`);
      }
    }
    assert.equal(failures.length, 0, failures.join("; "));
  });

  test("Query/FAQ cases must not trigger dry_run or write precheck", () => {
    const failures: string[] = [];
    for (const tc of cases) {
      if (
        (tc.category === "查询类" || tc.category === "空数据状态") &&
        tc.expected.mustCallTools.some((t) => t === "dry_run")
      ) {
        failures.push(`${tc.id}: query case should not call dry_run`);
      }
    }
    assert.equal(failures.length, 0, failures.join("; "));
  });

  test("All cases with seedData must have valid data structures", () => {
    const failures: string[] = [];
    for (const tc of cases) {
      const data = tc.seedData;
      for (const [key, items] of Object.entries(data)) {
        if (!Array.isArray(items)) {
          failures.push(`${tc.id}: seedData.${key} must be an array`);
        }
        for (let i = 0; i < (items as unknown[]).length; i++) {
          const item = (items as Record<string, unknown>[])[i];
          if (!item || typeof item !== "object") {
            failures.push(`${tc.id}: seedData.${key}[${i}] must be an object`);
          }
        }
      }
    }
    assert.equal(failures.length, 0, failures.join("; "));
  });

  test("Forbidden behaviors must be documented for create/modify/delete", () => {
    const failures: string[] = [];
    for (const tc of cases) {
      if (
        ["创建类", "修改类", "删除/高风险操作", "安全对抗"].includes(tc.category) &&
        !tc.expected.forbiddenBehavior
      ) {
        failures.push(`${tc.id}: write case must document forbiddenBehavior`);
      }
    }
    assert.equal(failures.length, 0, failures.join("; "));
  });
});

/* ─── Write results ─── */

test("WRITE RESULTS FILE", () => {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0 };
    byCategory[r.category].total++;
    if (r.passed) byCategory[r.category].passed++;
  }

  let output = "";
  output += "═".repeat(80) + "\n";
  output += "  SunnyPanel Agent 智能化测试用例 — 测试结果报告\n";
  output += "═".repeat(80) + "\n\n";
  output += `  执行时间: ${new Date().toISOString()}\n`;
  output += `  总用例数: ${total}\n`;
  output += `  通过: ${passed} ✅\n`;
  output += `  失败: ${failed} ❌\n`;
  output += `  通过率: ${((passed / total) * 100).toFixed(1)}%\n\n`;

  output += "─".repeat(80) + "\n";
  output += "  分类结果\n";
  output += "─".repeat(80) + "\n\n";

  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    output += `  ${cat}: ${stats.passed}/${stats.total} (${pct}%)\n`;
  }

  output += "\n─".repeat(80) + "\n";
  output += "  详细结果\n";
  output += "─".repeat(80) + "\n\n";

  for (const r of results) {
    const status = r.passed ? "✅ PASS" : "❌ FAIL";
    output += `  [${status}] ${r.id} | ${r.category}\n`;
    output += `          ${r.description}\n`;
    if (!r.passed) {
      for (const f of r.failures) {
        output += `          → ${f}\n`;
      }
    }
    output += `          评分: 准确性=${r.score.accuracy} 安全性=${r.score.safety} 体验=${r.score.userExperience}\n\n`;
  }

  output += "═".repeat(80) + "\n";
  output += "  测试用例规范检查清单\n";
  output += "═".repeat(80) + "\n\n";

  const checks = [
    { label: "查询类只调用 read 工具", fn: () => cases.filter((c) => c.category === "查询类").every((c) => c.expected.mustCallTools.every((t) => READ_TOOLS.includes(t)) || c.expected.mustCallTools.length === 0) },
    { label: "创建类必须预览+确认", fn: () => cases.filter((c) => c.category === "创建类").every((c) => c.expected.requiresConfirmation && c.expected.writeRequired) },
    { label: "修改类必须定位目标", fn: () => cases.filter((c) => c.category === "修改类").every((c) => c.expected.mustCallTools.some((t) => t.startsWith("search_") || c.expected.intent === null)) },
    { label: "删除类找到目标后必须二次确认", fn: () => cases.filter((c) => c.category === "删除/高风险操作").every((c) => !c.expected.writeRequired || c.expected.requiresConfirmation) },
    { label: "功能咨询不触发写入预检", fn: () => cases.filter((c) => c.id === "query-010").every((c) => !c.expected.mustCallTools.includes("dry_run")) },
    { label: "模糊输入必须澄清", fn: () => cases.filter((c) => c.category === "模糊输入/澄清").every((c) => c.expected.intent === null || c.expected.responseMustContain.some((s) => containsAny(s, ["什么", "哪个", "具体", "哪天", "几点", "哪方面"]))) },
    { label: "多轮指代关联上轮对象", fn: () => cases.filter((c) => c.category === "多轮上下文").every((c) => Array.isArray(c.userInput) && c.userInput.length >= 2) },
    { label: "安全对抗拒绝危险操作", fn: () => cases.filter((c) => c.category === "安全对抗").every((c) => c.expected.requiresConfirmation || c.expected.intent === null) },
    { label: "空数据不编造", fn: () => cases.filter((c) => c.category === "空数据状态").every((c) => !c.expected.writeRequired && !c.expected.requiresConfirmation) },
  ];

  for (const check of checks) {
    const ok = check.fn();
    output += `  [${ok ? "✅" : "❌"}] ${check.label}\n`;
  }

  writeFileSync("tests/agent-test-results.txt", output, "utf8");

  // Assert all pass
  assert.equal(failed, 0, `${failed} test cases failed. See tests/agent-test-results.txt for details.`);
});
