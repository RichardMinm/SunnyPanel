import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildConfirmedIntentSet,
  shouldAutoApprove,
} from "../../src/lib/agent/permission-resolver";
import type { PendingAction, ProposedAgentAction } from "../../src/lib/agent/schemas";
import { parseUserPreferencesFromMemoryDocs, type UserPreferences } from "../../src/lib/agent/user-preferences";

type AutonomyLevel = 0 | 1 | 2 | 3;
type TestPreferences = UserPreferences & {
  autonomyLevel: AutonomyLevel;
};

const makePreferences = (overrides: Partial<TestPreferences> = {}): TestPreferences => ({
  autoApproveIntents: new Set(),
  autoApproveLowRisk: true,
  autonomyLevel: 2,
  deniedIntents: new Set(),
  maxConsecutiveAutoApprovals: 8,
  ...overrides,
});

const makeAction = (overrides: Partial<ProposedAgentAction> = {}): ProposedAgentAction => ({
  args: {
    title: "测试计划",
  },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "新增计划：测试计划",
    },
  ],
  id: "test-action",
  intent: "create_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建计划「测试计划」",
  ...overrides,
});

const makeContext = (
  overrides: Partial<Parameters<typeof shouldAutoApprove>[1]> = {},
): Parameters<typeof shouldAutoApprove>[1] => ({
  consecutiveAutoCount: 0,
  isFirstActionInThread: false,
  previouslyConfirmedIntents: new Set(),
  userPreferences: makePreferences(),
  ...overrides,
});

test("autonomy level 0 keeps write actions behind confirmation", () => {
  const decision = shouldAutoApprove(
    makeAction(),
    makeContext({
      previouslyConfirmedIntents: new Set(["create_plan", "create_plan:plans"]),
      userPreferences: makePreferences({
        autoApproveIntents: new Set(["create_plan"]),
        autonomyLevel: 0,
      }),
    }),
  );

  assert.equal(decision.approved, false);
  assert.match(decision.reason, /完全确认|Level 0/);
});

test("autonomy level 2 auto-approves previously confirmed medium-risk scope", () => {
  const levelOneDecision = shouldAutoApprove(
    makeAction(),
    makeContext({
      previouslyConfirmedIntents: new Set(["create_plan:plans"]),
      userPreferences: makePreferences({ autonomyLevel: 1 }),
    }),
  );
  const levelTwoDecision = shouldAutoApprove(
    makeAction(),
    makeContext({
      previouslyConfirmedIntents: new Set(["create_plan:plans"]),
      userPreferences: makePreferences({ autonomyLevel: 2 }),
    }),
  );

  assert.equal(levelOneDecision.approved, false);
  assert.match(levelOneDecision.reason, /Level 1|低风险/);
  assert.equal(levelTwoDecision.approved, true);
  assert.match(levelTwoDecision.reason, /同领域|相同操作|Level 2/);
});

test("autonomy level 3 can approve high-risk actions after the first action", () => {
  const highRiskAction = makeAction({
    changes: [
      {
        collection: "schedule-items",
        operation: "create",
        preview: "新增日程：明天 09:00-10:30 复习",
      },
    ],
    intent: "compose_schedule_item",
    riskLevel: "high",
    summary: "创建日程「复习」",
  });

  const decision = shouldAutoApprove(
    highRiskAction,
    makeContext({
      userPreferences: makePreferences({ autonomyLevel: 3 }),
    }),
  );

  assert.equal(decision.approved, true);
  assert.match(decision.reason, /Level 3|全部自动/);
});

test("denied intents and consecutive caps still block level 3 auto approval", () => {
  const action = makeAction({
    intent: "compose_schedule_item",
    riskLevel: "high",
  });
  const deniedDecision = shouldAutoApprove(
    action,
    makeContext({
      userPreferences: makePreferences({
        autonomyLevel: 3,
        deniedIntents: new Set(["compose_schedule_item"]),
      }),
    }),
  );
  const cappedDecision = shouldAutoApprove(
    action,
    makeContext({
      consecutiveAutoCount: 2,
      userPreferences: makePreferences({
        autonomyLevel: 3,
        maxConsecutiveAutoApprovals: 2,
      }),
    }),
  );

  assert.equal(deniedDecision.approved, false);
  assert.match(deniedDecision.reason, /禁止|拒绝/);
  assert.equal(cappedDecision.approved, false);
  assert.match(cappedDecision.reason, /连续自动批准已达上限/);
});

test("buildConfirmedIntentSet records intent and collection scopes", () => {
  const pending: PendingAction = {
    action: makeAction(),
    type: "await_confirmation",
  };

  assert.deepEqual(buildConfirmedIntentSet([pending], "save_memory"), new Set([
    "create_plan:plans",
    "save_memory",
  ]));
});

test("user preference memories can configure autonomy level and intent rules", () => {
  const preferences = parseUserPreferencesFromMemoryDocs([
    {
      content: "3",
      title: "agent_autonomy_level",
    },
    {
      content: "compose_schedule_item, save_memory",
      title: "auto_approve_intent",
    },
    {
      content: "cancel_schedule_item",
      title: "deny_intent",
    },
  ]);

  assert.equal(preferences.autonomyLevel, 3);
  assert.equal(preferences.autoApproveIntents.has("compose_schedule_item"), true);
  assert.equal(preferences.autoApproveIntents.has("save_memory"), true);
  assert.equal(preferences.deniedIntents.has("cancel_schedule_item"), true);
});
