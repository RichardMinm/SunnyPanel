/**
 * Rule Pre-Check — Test Suite
 *
 * Phase 2: Semantic Session Coordinator Rule Pre-Check
 * Tests cover all 6 rules + fallback + edge cases.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import {
  isPendingCancelMessage,
  isPendingConfirmMessage,
  isDeepenMessage,
  isScheduleQueryMessage,
  isScheduleCreateMessage,
  isWritingRevisionContext,
  isWritingRevisionMessage,
  getCurrentTopic,
  normalizeUserMessage,
  inferActionFromPendingIntent,
  rulePreCheck,
  type PendingAction,
  type RulePreCheckInput,
} from "../../../src/lib/agent/session/rule-pre-check";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";

/* ──── Helpers ──── */

const makePendingAction = (
  intent: string,
  summary?: string,
): PendingAction => ({
  type: "await_confirmation",
  action: { intent },
  summary,
});

/* ═══════════════════════════════════════════════════════════════════════
   normalizeUserMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("normalizeUserMessage trims and collapses whitespace", () => {
  assert.equal(normalizeUserMessage("  确认执行  "), "确认执行");
  assert.equal(normalizeUserMessage("hello   world"), "hello world");
  assert.equal(normalizeUserMessage("  ok  "), "ok");
});

test("normalizeUserMessage lowercases ASCII", () => {
  assert.equal(normalizeUserMessage("OK"), "ok");
  assert.equal(normalizeUserMessage("Yes!"), "yes!");
  assert.equal(normalizeUserMessage("NO"), "no");
});

test("normalizeUserMessage preserves Chinese semantics", () => {
  assert.equal(normalizeUserMessage("确认执行"), "确认执行");
  assert.equal(normalizeUserMessage("明天下午三点安排一个会议"), "明天下午三点安排一个会议");
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isPendingConfirmMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isPendingConfirmMessage matches explicit confirmations", () => {
  assert.equal(isPendingConfirmMessage("确认"), true);
  assert.equal(isPendingConfirmMessage("确认执行"), true);
  assert.equal(isPendingConfirmMessage("可以"), true);
  assert.equal(isPendingConfirmMessage("没问题"), true);
  assert.equal(isPendingConfirmMessage("好的"), true);
  assert.equal(isPendingConfirmMessage("行"), true);
  assert.equal(isPendingConfirmMessage("是的"), true);
  assert.equal(isPendingConfirmMessage("开始吧"), true);
  assert.equal(isPendingConfirmMessage("ok"), true);
  assert.equal(isPendingConfirmMessage("yes"), true);
});

test("isPendingConfirmMessage rejects non-confirm messages", () => {
  assert.equal(isPendingConfirmMessage("你好"), false);
  assert.equal(isPendingConfirmMessage("今天天气怎么样"), false);
  assert.equal(isPendingConfirmMessage("帮我查询"), false);
});

test("isPendingConfirmMessage rejects long sentences with 可以", () => {
  assert.equal(isPendingConfirmMessage("可以先解释一下这个计划吗"), false);
  assert.equal(isPendingConfirmMessage("可以先确认一下吗"), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isPendingCancelMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isPendingCancelMessage matches explicit cancellations", () => {
  assert.equal(isPendingCancelMessage("取消"), true);
  assert.equal(isPendingCancelMessage("算了"), true);
  assert.equal(isPendingCancelMessage("不用了"), true);
  assert.equal(isPendingCancelMessage("不要"), true);
  assert.equal(isPendingCancelMessage("别做了"), true);
  assert.equal(isPendingCancelMessage("停止"), true);
  assert.equal(isPendingCancelMessage("放弃"), true);
  assert.equal(isPendingCancelMessage("cancel"), true);
  assert.equal(isPendingCancelMessage("no"), true);
});

test("isPendingCancelMessage rejects non-cancel messages", () => {
  assert.equal(isPendingCancelMessage("继续"), false);
  assert.equal(isPendingCancelMessage("好的"), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: getCurrentTopic
   ═══════════════════════════════════════════════════════════════════════ */

test("getCurrentTopic returns topic from currentTarget.topic (priority 1)", () => {
  const session = createDefaultSessionState();
  session.semantic.currentTarget.topic = "Machine Learning";
  session.conversation.lastTopic = "Old Topic";
  assert.equal(getCurrentTopic(session), "Machine Learning");
});

test("getCurrentTopic returns topic from conversation.lastTopic (priority 2)", () => {
  const session = createDefaultSessionState();
  session.conversation.lastTopic = "CTF";
  assert.equal(getCurrentTopic(session), "CTF");
});

test("getCurrentTopic returns entityName (priority 3)", () => {
  const session = createDefaultSessionState();
  session.semantic.currentTarget.entityName = "Project Alpha";
  assert.equal(getCurrentTopic(session), "Project Alpha");
});

test("getCurrentTopic returns null when no topic is available", () => {
  const session = createDefaultSessionState();
  assert.equal(getCurrentTopic(session), null);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isDeepenMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isDeepenMessage matches deepen signals", () => {
  assert.equal(isDeepenMessage("更详细"), true);
  assert.equal(isDeepenMessage("详细一点"), true);
  assert.equal(isDeepenMessage("展开说说"), true);
  assert.equal(isDeepenMessage("继续讲"), true);
  assert.equal(isDeepenMessage("举个例子"), true);
  assert.equal(isDeepenMessage("我需要更加详细的信息"), true);
  assert.equal(isDeepenMessage("补充细节"), true);
  assert.equal(isDeepenMessage("继续"), true);
  assert.equal(isDeepenMessage("然后呢"), true);
});

test("isDeepenMessage rejects non-deepen messages", () => {
  assert.equal(isDeepenMessage("今天天气怎么样"), false);
  assert.equal(isDeepenMessage("创建一个计划"), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isScheduleQueryMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isScheduleQueryMessage matches schedule queries", () => {
  assert.equal(isScheduleQueryMessage("今天有什么日程"), true);
  assert.equal(isScheduleQueryMessage("今天有什么安排"), true);
  assert.equal(isScheduleQueryMessage("明天有什么安排"), true);
  assert.equal(isScheduleQueryMessage("看看我这周的日程"), true);
  assert.equal(isScheduleQueryMessage("查看日程"), true);
  assert.equal(isScheduleQueryMessage("最近有什么安排"), true);
  assert.equal(isScheduleQueryMessage("本周日程"), true);
  assert.equal(isScheduleQueryMessage("下周日程"), true);
  assert.equal(isScheduleQueryMessage("今天我要做什么"), true);
  assert.equal(isScheduleQueryMessage("明天我要做什么"), true);
});

test("isScheduleQueryMessage rejects schedule create messages", () => {
  assert.equal(isScheduleQueryMessage("明天下午三点安排一个会议"), false);
  assert.equal(isScheduleQueryMessage("帮我安排一个会议"), false);
  assert.equal(isScheduleQueryMessage("帮我加一条日程"), false);
  assert.equal(isScheduleQueryMessage("创建日程"), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isScheduleCreateMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isScheduleCreateMessage matches schedule creation", () => {
  assert.equal(isScheduleCreateMessage("明天下午三点安排一个会议"), true);
  assert.equal(isScheduleCreateMessage("帮我安排一个会议"), true);
  assert.equal(isScheduleCreateMessage("帮我加一条日程"), true);
  assert.equal(isScheduleCreateMessage("创建日程"), true);
  assert.equal(isScheduleCreateMessage("新增日程"), true);
  assert.equal(isScheduleCreateMessage("把它排到周五"), true);
  assert.equal(isScheduleCreateMessage("明天3点开会"), true);
});

test("isScheduleCreateMessage rejects schedule queries", () => {
  assert.equal(isScheduleCreateMessage("今天有什么安排"), false);
  assert.equal(isScheduleCreateMessage("明天有什么日程"), false);
  assert.equal(isScheduleCreateMessage("查看日程"), false);
  assert.equal(isScheduleCreateMessage("看看我这周的日程"), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isWritingRevisionContext
   ═══════════════════════════════════════════════════════════════════════ */

test("isWritingRevisionContext matches writing domain", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  assert.equal(isWritingRevisionContext(session), true);
});

test("isWritingRevisionContext matches writing workflows", () => {
  const session = createDefaultSessionState();
  session.semantic.workflow = "writing_creation";
  assert.equal(isWritingRevisionContext(session), true);

  session.semantic.workflow = "writing_revision";
  assert.equal(isWritingRevisionContext(session), true);
});

test("isWritingRevisionContext matches writing entity types", () => {
  const session = createDefaultSessionState();
  session.semantic.currentTarget.entityType = "writing";
  assert.equal(isWritingRevisionContext(session), true);

  session.semantic.currentTarget.entityType = "article";
  assert.equal(isWritingRevisionContext(session), true);
});

test("isWritingRevisionContext rejects non-writing context", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  assert.equal(isWritingRevisionContext(session), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: isWritingRevisionMessage
   ═══════════════════════════════════════════════════════════════════════ */

test("isWritingRevisionMessage matches revision signals", () => {
  assert.equal(isWritingRevisionMessage("改一下"), true);
  assert.equal(isWritingRevisionMessage("修改一下"), true);
  assert.equal(isWritingRevisionMessage("润色"), true);
  assert.equal(isWritingRevisionMessage("扩写"), true);
  assert.equal(isWritingRevisionMessage("缩短"), true);
  assert.equal(isWritingRevisionMessage("太啰嗦"), true);
  assert.equal(isWritingRevisionMessage("太短了"), true);
  assert.equal(isWritingRevisionMessage("重写"), true);
  assert.equal(isWritingRevisionMessage("续写"), true);
  assert.equal(isWritingRevisionMessage("换个说法"), true);
  assert.equal(isWritingRevisionMessage("语气调整"), true);
});

/* ═══════════════════════════════════════════════════════════════════════
   Helper: inferActionFromPendingIntent
   ═══════════════════════════════════════════════════════════════════════ */

test("inferActionFromPendingIntent returns correct actions", () => {
  assert.equal(inferActionFromPendingIntent("create_schedule"), "create");
  assert.equal(inferActionFromPendingIntent("compose_writing"), "create");
  assert.equal(inferActionFromPendingIntent("add_checklist"), "create");
  assert.equal(inferActionFromPendingIntent("update_schedule"), "update");
  assert.equal(inferActionFromPendingIntent("modify_plan"), "update");
  assert.equal(inferActionFromPendingIntent("append_content"), "update");
  assert.equal(inferActionFromPendingIntent("complete_task"), "update");
  assert.equal(inferActionFromPendingIntent("delete_schedule"), "delete");
  assert.equal(inferActionFromPendingIntent("remove_record"), "delete");
  assert.equal(inferActionFromPendingIntent("cancel_pending"), "cancel");
});

test("inferActionFromPendingIntent returns undefined for unknown intent", () => {
  assert.equal(inferActionFromPendingIntent("explain_concept"), undefined);
  assert.equal(inferActionFromPendingIntent("give_examples"), undefined);
  assert.equal(inferActionFromPendingIntent("query"), undefined);
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 1: Pending Confirmation — Confirm
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 1 — pending confirmation confirm", () => {
  const session = createDefaultSessionState();
  const pendingAction = makePendingAction("compose_schedule_item", "创建日程");

  const result = rulePreCheck({
    session,
    message: "确认执行",
    pendingAction,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "confirm_pending_action");
  assert.equal(result!.shouldUpdateSession, true);
  assert.equal(result!.sessionPatch.stage, "confirming");
  assert.notEqual(result!.sessionPatch.stage, "executing");
  assert.equal(result!.routeHint.source, "rule");
  assert.ok(
    result!.routeHint.expectedIntents.includes("compose_schedule_item"),
    "expectedIntents should contain the pending action intent",
  );
  assert.equal(result!.routeHint.expectedIntents[0], "compose_schedule_item");
  // suggestedAction should NOT be fixed to "create"
  assert.equal(result!.routeHint.suggestedAction, undefined);
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 2: Pending Confirmation — Cancel
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 2 — pending confirmation cancel", () => {
  const session = createDefaultSessionState();
  const pendingAction = makePendingAction("delete_schedule", "删除日程");

  const result = rulePreCheck({
    session,
    message: "算了不做了",
    pendingAction,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "cancel_pending_action");
  assert.equal(result!.shouldUpdateSession, true);
  assert.equal(result!.sessionPatch.stage, "exploring");
  assert.equal(result!.sessionPatch.workflow, "none");
  assert.equal(result!.routeHint.source, "rule");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 3: Deepen with Topic
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 3 — deepen with topic", () => {
  const session = createDefaultSessionState();
  session.conversation.lastTopic = "CTF";

  const result = rulePreCheck({
    session,
    message: "我需要更加详细的信息",
    pendingAction: null,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "deepen_current_flow");
  assert.equal(result!.shouldUpdateSession, false);
  assert.deepEqual(result!.sessionPatch, {});
  assert.equal(result!.routeHint.suggestedAction, "expand_answer");
  assert.equal(result!.routeHint.suggestedTarget, "last_topic");
  assert.ok(
    result!.routeHint.contextualClues.some((c) => c.includes("CTF")),
    "contextualClues should mention the topic CTF",
  );
  assert.equal(result!.routeHint.source, "rule");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 4: Deepen without Topic → null
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 3 — deepen without topic returns null", () => {
  const session = createDefaultSessionState();
  // No topic set anywhere

  const result = rulePreCheck({
    session,
    message: "更详细一点",
    pendingAction: null,
  });

  assert.equal(result, null);
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 5: Schedule Query
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 4 — schedule query", () => {
  const session = createDefaultSessionState();

  const result = rulePreCheck({
    session,
    message: "看看我这周的日程",
    pendingAction: null,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "switch_domain");
  assert.equal(result!.sessionPatch.domain, "schedule");
  assert.equal(result!.sessionPatch.stage, "exploring");
  assert.equal(result!.sessionPatch.workflow, "schedule_composition");
  assert.equal(result!.routeHint.suggestedAction, "query");
  assert.equal(result!.routeHint.suggestedTarget, "schedule");
  assert.equal(result!.routeHint.source, "rule");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 6: Schedule Create
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 5 — schedule create", () => {
  const session = createDefaultSessionState();

  const result = rulePreCheck({
    session,
    message: "明天下午三点安排一个会议",
    pendingAction: null,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "switch_domain");
  assert.equal(result!.sessionPatch.domain, "schedule");
  assert.equal(result!.sessionPatch.stage, "drafting");
  assert.equal(result!.sessionPatch.workflow, "schedule_composition");
  assert.equal(result!.routeHint.suggestedAction, "create");
  assert.equal(result!.routeHint.suggestedTarget, "schedule");
  assert.equal(result!.routeHint.source, "rule");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 7: Schedule Query/Create No Cross-Misjudgment
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 4/5 — schedule query and create do not cross-misjudge", () => {
  const session = createDefaultSessionState();

  // Query cases
  const q1 = rulePreCheck({ session, message: "今天有什么安排", pendingAction: null });
  assert.ok(q1);
  assert.equal(q1!.routeHint.suggestedAction, "query");

  const q2 = rulePreCheck({ session, message: "明天有什么日程", pendingAction: null });
  assert.ok(q2);
  assert.equal(q2!.routeHint.suggestedAction, "query");

  // Create cases
  const c1 = rulePreCheck({ session, message: "明天下午三点安排一个会议", pendingAction: null });
  assert.ok(c1);
  assert.equal(c1!.routeHint.suggestedAction, "create");

  const c2 = rulePreCheck({ session, message: "帮我加一条日程", pendingAction: null });
  assert.ok(c2);
  assert.equal(c2!.routeHint.suggestedAction, "create");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 8: Writing Continuous Revision
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 6 — writing continuous revision", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";

  const result = rulePreCheck({
    session,
    message: "把开头改一下，太啰嗦了",
    pendingAction: null,
  });

  assert.ok(result, "should return a TransitionOutput");
  assert.equal(result!.transitionType, "deepen_current_flow");
  assert.equal(result!.sessionPatch.domain, "writing");
  assert.equal(result!.sessionPatch.stage, "refining");
  assert.equal(result!.sessionPatch.workflow, "writing_revision");
  assert.equal(result!.routeHint.suggestedAction, "update");
  assert.equal(result!.routeHint.suggestedTarget, "writing");
  assert.ok(
    result!.routeHint.expectedIntents.includes("writing_revision"),
    "expectedIntents should contain writing_revision",
  );
  assert.equal(result!.routeHint.source, "rule");
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 9: Non-Writing Context Revision → null
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 6 — non-writing context revision returns null", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";

  const result = rulePreCheck({
    session,
    message: "把开头改一下",
    pendingAction: null,
  });

  assert.equal(result, null);
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 10: Ambiguous Input → null
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 7 — ambiguous input returns null", () => {
  const session = createDefaultSessionState();

  const result = rulePreCheck({
    session,
    message: "嗯",
    pendingAction: null,
  });

  assert.equal(result, null);
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 11: Long Sentence with 可以 → No Pending Confirm
   ═══════════════════════════════════════════════════════════════════════ */

test("rule 1 — long sentence with 可以 does not trigger pending confirm", () => {
  const session = createDefaultSessionState();
  const pendingAction = makePendingAction("create_plan", "创建学习计划");

  const result = rulePreCheck({
    session,
    message: "可以先解释一下这个计划吗",
    pendingAction,
  });

  // Should NOT hit confirm_pending_action
  // May return null or hit another rule (like deepen if topic exists)
  if (result) {
    assert.notEqual(result.transitionType, "confirm_pending_action");
  }
  // Either null or a different rule is acceptable
});

/* ═══════════════════════════════════════════════════════════════════════
   TEST 12: rulePreCheck is Pure — no LLM, no tools, no DB
   ═══════════════════════════════════════════════════════════════════════ */

test("rulePreCheck is pure — does not import LLM client, tool executor, or DB", async () => {
  // Verify the module does not import LLM-related modules
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/session/rule-pre-check.ts"),
    "utf8",
  );

  // Must not import LLM client
  assert.doesNotMatch(source, /from.*llm|from.*openai|from.*anthropic|from.*complete-structured/i);
  // Must not import tool executor
  assert.doesNotMatch(source, /from.*executor|from.*tool-gate|from.*dry-run/i);
  // Must not import DB
  assert.doesNotMatch(source, /from.*payload|from.*mongodb|from.*postgres|from.*database/i);
});

test("rulePreCheck does not mutate input session", () => {
  const session = createDefaultSessionState();
  session.conversation.lastTopic = "Original";

  const originalDomain = session.semantic.domain;
  const originalStage = session.semantic.stage;

  rulePreCheck({
    session,
    message: "确认",
    pendingAction: makePendingAction("create_plan", "创建计划"),
  });

  // Session should be unchanged
  assert.equal(session.semantic.domain, originalDomain);
  assert.equal(session.semantic.stage, originalStage);
  assert.equal(session.conversation.lastTopic, "Original");
});

test("rulePreCheck returns null for empty message", () => {
  const session = createDefaultSessionState();

  assert.equal(rulePreCheck({ session, message: "", pendingAction: null }), null);
  assert.equal(rulePreCheck({ session, message: "   ", pendingAction: null }), null);
});

/* ──── Additional Edge Cases ──── */

test("pending confirm works with various confirm messages", () => {
  const session = createDefaultSessionState();
  const pa = makePendingAction("create_writing", "创建文章");

  const messages = ["好的", "行", "可以", "没问题", "ok", "yes", "开始吧", "做吧"];
  for (const msg of messages) {
    const result = rulePreCheck({ session, message: msg, pendingAction: pa });
    assert.ok(result, `should match "${msg}"`);
    assert.equal(result!.transitionType, "confirm_pending_action");
  }
});

test("pending confirm does not set suggestedAction to 'create'", () => {
  const session = createDefaultSessionState();
  const pa = makePendingAction("create_plan", "创建计划");

  const result = rulePreCheck({ session, message: "确认", pendingAction: pa });
  assert.ok(result);
  // suggestedAction is intentionally not set in confirm rule
  assert.equal(result!.routeHint.suggestedAction, undefined);
  // expectedIntents passes through the pending intent
  assert.ok(result!.routeHint.expectedIntents.includes("create_plan"));
});

test("pending cancel with various cancel messages", () => {
  const session = createDefaultSessionState();
  const pa = makePendingAction("create_plan", "创建计划");

  const messages = ["取消", "算了", "不用了", "不要", "cancel", "no"];
  for (const msg of messages) {
    const result = rulePreCheck({ session, message: msg, pendingAction: pa });
    assert.ok(result, `should match "${msg}"`);
    assert.equal(result!.transitionType, "cancel_pending_action");
  }
});

test("deepen does not hit if there is no topic", () => {
  const session = createDefaultSessionState();
  // Ensure no topic
  session.semantic.currentTarget.topic = null;
  session.semantic.currentTarget.entityName = null;
  session.conversation.lastTopic = null;

  const result = rulePreCheck({
    session,
    message: "展开说说",
    pendingAction: null,
  });

  assert.equal(result, null);
});

test("schedule query does not match creation with 安排", () => {
  // "今天有什么安排" is query, "安排会议" is create
  assert.equal(isScheduleQueryMessage("今天有什么安排"), true);
  assert.equal(isScheduleCreateMessage("今天有什么安排"), false);

  assert.equal(isScheduleQueryMessage("明天下午三点安排一个会议"), false);
  assert.equal(isScheduleCreateMessage("明天下午三点安排一个会议"), true);
});

test("writing revision not matched in general context", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  session.semantic.workflow = "none";

  const result = rulePreCheck({
    session,
    message: "把开头改一下",
    pendingAction: null,
  });

  assert.equal(result, null);
});

test("writing revision matched via entityType", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general"; // domain is general
  session.semantic.currentTarget.entityType = "article"; // but entity is article

  const result = rulePreCheck({
    session,
    message: "润色一下",
    pendingAction: null,
  });

  assert.ok(result);
  assert.equal(result!.routeHint.suggestedAction, "update");
  assert.equal(result!.routeHint.suggestedTarget, "writing");
});
