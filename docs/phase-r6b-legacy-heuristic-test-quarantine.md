# Phase R6-B: Legacy Heuristic Business Tests Quarantine

## 1. R6-B 目标

R6-B 是**测试隔离 / 废弃标记阶段**。本阶段：

- 识别哪些测试属于旧 heuristic business behavior
- 将它们从新 Agent Workflow v1 的 protected baseline 中隔离
- **不删除任何测试**
- **不修改任何测试断言**
- **不修改任何生产代码**

Quarantine 不等于删除。隔离是为了后续 R6-C 删除生产代码时，能精确知道哪些测试需要同时清理。

---

## 2. Quarantine 策略

### 标记方式

对于 quarantine candidate 测试，使用以下标记（不修改断言）：

1. **文件顶部注释**（优先）：在文件头部添加 legacy quarantine 注释块
2. **TEST_MAP 重新分类**：从 `protected` 移到 `legacy-quarantine`
3. **不 skip 任何测试**（除非有明确文档原因）

### 不做的事

- ❌ 不删除测试文件
- ❌ 不修改测试断言
- ❌ 不 skip 测试
- ❌ 不修改生产代码
- ❌ 不移动测试文件

---

## 3. Protected Safety Tests — 不得 Quarantine

以下测试组是确定性的安全边界，绝对不能隔离或删除。

| Test Group | Files | Why Protected |
|-----------|-------|---------------|
| policy-guard | `tests/agent/policy-guard*.test.ts` | Policy Guard 安全门 |
| action-receipts | `tests/agent/action-receipts*.test.ts` | 幂等保护 |
| rollback* | `tests/agent/rollback*.test.ts` | 回滚执行 |
| tool-dry-run | `tests/agent/tool-dry-run*.test.ts` | dryRun 预览 |
| execute-and-persist-step | `tests/agent/execute-and-persist-step*.test.ts` | execute pipeline |
| create-checklist-* | `tests/agent/planning/create-checklist-*.test.ts` | 受保护的 write path |
| create-schedule-items-* | `tests/agent/schedule/create-schedule-items-*.test.ts` | 受保护的 write path |
| timeline-event-* | `tests/agent/planning/timeline-event-*.test.ts` | 受保护的 write path |
| planning-full-workflow-e2e | `tests/agent/planning/planning-full-workflow-e2e.test.ts` | 受保护的 E2E |
| schedule-workflow-e2e | `tests/agent/schedule/schedule-workflow-e2e.test.ts` | 受保护的 E2E |
| schedule-workflow-product-e2e | `tests/agent/schedule/schedule-workflow-product-e2e.test.tsx` | 受保护的产品 E2E |
| confirmation* | `tests/agent/confirmation*.test.ts` | confirmation/cancel safety |
| LangGraph runtime | `tests/agent/llm-tool-planner-langgraph-runtime*.test.ts`, `tests/agent/llm-tool-planner-read-draft-runtime*.test.ts` | 受保护的 runtime |
| R5 tool-planner tests | `tests/agent/tool-planner-*.test.ts`, `tests/agent/llm-required-no-heuristic-business-path.test.ts`, `tests/agent/llm-tool-planner-*.test.ts` | R5 新路径 |
| DB smoke | `tests/agent/llm-tool-planner-db-smoke.test.ts` | DB write 验证 |
| agent-backend-trace | `tests/agent/agent-backend-trace*.test.ts` | Trace sanitizer |
| agent-activity | `tests/agent/agent-activity*.test.ts`, `tests/agent/ops/agent-activity*.test.tsx` | Activity sanitizer |
| tool-registry-contract | `tests/agent/tool-registry-contract.test.ts` | 工具注册表 contract |
| root router contract | `tests/agent/root-router-contract.test.ts` | Router contract（包含 heuristic 子测试，需保留整体 contract） |
| dashboard layout | `tests/layout/*.test.ts` | UI contract |

---

## 4. Legacy Heuristic Business Tests — Quarantine Candidates

以下测试主要验证旧 heuristic business behavior。在 `AGENT_REQUIRE_LLM=1` 下这些路径不可达。

### 4.1 Intent Heuristic Tests

| File | Description | Replacement Coverage | Action |
|------|-------------|---------------------|--------|
| `tests/agent/plan-source.test.ts` | Heuristic plan source resolution | Tool Planner compose_plan | Quarantine |
| `tests/agent/pipeline-trace.trace.ts` | Trace with heuristic intent | tool-planner trace tests | Quarantine |

### 4.2 Schedule Legacy Tests

| File | Description | Replacement Coverage | Action |
|------|-------------|---------------------|--------|
| ~~`tests/agent/schedule/schedule-intent-boundary.test.ts`~~ | Heuristic schedule create/query boundary | query_schedule read tool + write allowlist | **R6-C2-B: Deleted** |
| `tests/agent/schedule/schedule-readiness.test.ts` | Regex slot extraction | LLM slot extraction + Tool Planner | Quarantine |
| `tests/agent/schedule/schedule-readiness-gate.test.ts` | Schedule readiness gate | query_schedule read tool | Quarantine |
| `tests/agent/schedule/schedule-slots.test.ts` | Regex slot extraction | Tool Planner LLM slots | Quarantine |
| `tests/agent/schedule/schedule-draft.test.ts` | Deterministic schedule draft | compose_schedule_item draft tool | Quarantine |
| `tests/agent/schedule/schedule-draft-flow.test.ts` | Schedule draft flow | compose_schedule_item dryRun | Quarantine |
| `tests/agent/schedule/schedule-draft-revise.test.ts` | Draft revision | compose_schedule_item | Quarantine |
| ~~`tests/agent/schedule/schedule-query-intent.test.ts`~~ | Heuristic query intent parsing | query_schedule read tool | **R6-C2-B: Deleted** |
| `tests/agent/schedule/schedule-legacy-pipeline-contract.test.ts` | Legacy pipeline contract | R5 tool-planner tests | Quarantine |
| `tests/agent/schedule/schedule-session-draft.test.ts` | Session draft state | compose_schedule_item | Quarantine |

### 4.3 Planning Legacy Tests

| File | Description | Replacement Coverage | Action |
|------|-------------|---------------------|--------|
| `tests/agent/planning/plan-readiness.test.ts` | Regex plan slot extraction | Tool Planner readiness | Quarantine |
| `tests/agent/planning/planning-readiness-gate.test.ts` | Plan readiness gate | Tool Planner | Quarantine |
| `tests/agent/planning/planning-session-slots.test.ts` | Session slot extraction | Tool Planner | Quarantine |
| `tests/agent/planning/plan-draft.test.ts` | Deterministic plan draft | compose_plan draft tool | Quarantine |
| `tests/agent/planning/planning-draft-flow.test.ts` | Plan draft flow | compose_plan dryRun | Quarantine |
| `tests/agent/planning/checklist-draft.test.ts` | Deterministic checklist draft | ⚠️ Needs compose_checklist (R5-E) | Quarantine |
| `tests/agent/planning/checklist-draft-flow.test.ts` | Checklist draft flow | ⚠️ Needs compose_checklist (R5-E) | Quarantine |
| `tests/agent/planning/revise-plan-draft.test.ts` | Plan draft revision | compose_plan | Quarantine |
| `tests/agent/planning/revise-plan-draft-flow.test.ts` | Plan draft revision flow | compose_plan | Quarantine |

### 4.4 Session Rule Pre-check Tests

| File | Description | Replacement Coverage | Action |
|------|-------------|---------------------|--------|
| `tests/agent/session/rule-pre-check.test.ts` | Heuristic pre-check rules | ⚠️ Mixed: confirm/cancel rules are safety, deepen/schedule/writing rules are legacy | Partial quarantine (quarantine only business rules sub-tests) |

### 4.5 Preparation Tests

| File | Description | Replacement Coverage | Action |
|------|-------------|---------------------|--------|
| `tests/agent/schedule/prepare-schedule-creation.test.ts` | Heuristic schedule creation prep | create_schedule_items write allowlist | Quarantine |
| `tests/agent/planning/prepare-plan-creation.test.ts` | Heuristic plan creation prep | create_plan write allowlist | Quarantine |
| `tests/agent/planning/prepare-checklist-creation.test.ts` | Heuristic checklist creation prep | create_checklist write allowlist | Quarantine |

---

## 5. Legacy Mode Compatibility Tests

这些测试同时验证 `AGENT_REQUIRE_LLM=0` hybrid mode 行为。如果产品保留 legacy mode，这些需要保留。如果移除 legacy mode，这些可删除。

| File | Why Legacy Mode | Action |
|------|----------------|--------|
| `tests/agent/schedule/schedule-query-flow.test.ts` | Tests heuristic schedule query flow via readiness gate | Keep for now, mark as legacy-compat |
| `tests/agent/schedule/schedule-conflict-*.test.ts` | Conflict detection uses readiness/draft refs | Keep for now, mark as legacy-compat |
| `tests/agent/schedule/schedule-llm-slot-integration.test.ts` | Tests LLM slot extraction (partially new, partially old path) | Keep as mixed |
| `tests/agent/schedule/schedule-llm-slot-merge.test.ts` | Slot merging (usable by new path too) | Keep as mixed |
| `tests/agent/schedule/schedule-draft-card.test.tsx` | UI display of draft — used by old AND new paths | Keep as UI test |
| `tests/agent/schedule/schedule-draft-message.test.tsx` | UI message card for draft | Keep as UI test |
| `tests/agent/schedule/schedule-draft-revise-product.test.tsx` | Product UX for draft revision | Keep as product test |
| `tests/agent/schedule/schedule-ui-state-contract.test.tsx` | UI state contract | Keep as UI test |
| `tests/agent/planning/plan-draft-card.test.tsx` | UI plan draft card | Keep as UI test |
| `tests/agent/planning/planning-ui-state-contract.test.tsx` | UI state contract | Keep as UI test |
| `tests/agent/planning/checklist-draft-card.test.tsx` | UI checklist draft card | Keep as UI test |
| `tests/agent/session/coordinator.test.ts` | Session coordinator (mixed heuristic + safety) | Keep, mark as legacy-compat |
| `tests/agent/session/pipeline-integration.test.ts` | Pipeline integration (uses heuristic path) | Keep, mark as legacy-compat |
| `tests/agent/intent-arbitration.test.ts` | Intent arbitration (mixed) | Keep, mark as legacy-compat |
| `tests/agent/intent.test.ts` | Intent resolution (mixed) | Keep, mark as legacy-compat |

---

## 6. Needs Replacement Tests

以下测试覆盖的能力尚未被 Tool Planner 完全替代。不能直接 quarantine。

| File | Missing Replacement | Required Phase |
|------|--------------------|---------------|
| `tests/agent/planning/checklist-draft.test.ts` | compose_checklist draft tool | R5-E |
| `tests/agent/planning/checklist-draft-flow.test.ts` | compose_checklist draft tool | R5-E |
| `tests/agent/planning/checklist-plan-linkage.test.ts` | compose_checklist + plan linkage | R5-E |
| `tests/agent/planning/plan-to-checklist-source-plan-id.test.ts` | compose_checklist + plan linkage | R5-E |
| `tests/agent/session/rule-pre-check.test.ts` (business sub-tests) | business rules not yet separated from safety | R6-D |

---

## 7. Quarantine 汇总

| 分类 | 数量 | 处理 |
|------|------|------|
| Protected Safety Tests (Group A) | **20 groups** (~50+ files) | 不得动 |
| Quarantine Candidates (Group B) | **20 files** | 标记 quarantine |
| Legacy Mode Compatibility (Group C) | **15 files** | 标记 legacy-compat |
| Needs Replacement (Group D) | **5 files** (quarantine but note dependency) | 标记 quarantine + needs-replacement |
| **Total audit scope** | **~100 files** (包含 UI/product 测试) | — |

---

## 8. R6-C 删除前置条件

进入 R6-C（物理删除生产代码）前必须满足：

1. ✅ R6-A: Reachability audit 完成
2. ✅ R6-B: Test quarantine 完成（本阶段）
3. ⬜ R5-E: `compose_checklist` draft tool 替代 `checklist-draft.ts`
4. ⬜ `rule-pre-check.ts` 拆分为 safety (`rule-pre-check.ts`) + business (`business-pre-check.ts`)
5. ⬜ `intent-resolution.ts` 拆分 confirmation path 和 heuristic path
6. ⬜ 产品决策：是否移除 `AGENT_REQUIRE_LLM=0` legacy mode

---

## 9. 风险说明

| 风险 | 严重度 | 说明 |
|------|--------|------|
| 误将 protected test 标记为 quarantine | **HIGH** | 严格按 protected list 检查 |
| `rule-pre-check.test.ts` 中 confirm/cancel 子测试被误隔离 | **HIGH** | 只标记 business sub-tests，不动 safety sub-tests |
| 隔离后 R6-C 删除过于激进 | **MEDIUM** | R6-C 必须分批小步进行 |
| checklist-draft 相关测试隔离但无替代 | **MEDIUM** | 标记为 needs-replacement，R5-E 前不删除 |
| schedule-workflow-e2e / planning-full-workflow-e2e 被误判为 legacy | **HIGH** | 这些是 protected E2E，绝对不能动 |

---

## R6-C1 完成状态 (2026-07)

### Quarantine 不等于 Expected Failures

R6-B 的 quarantine 策略不是 "允许红测长期存在"，而是允许 legacy-only tests 被删除、重写或替换覆盖。
R6-C1-E (Fix 1-4) 已完成如下测试处理：

### 已删除 / 重写的 legacy heuristic correctness tests

| 文件 | 操作 | 新状态 |
|------|------|--------|
| `intent.test.ts` | Heuristic fixture tests 标记 retired；`engine: "heuristic"` 断言重写 | 34/34 pass |
| `intent-arbitration.test.ts` | Heuristic candidate assertions 简化 | 14/14 pass |
| `confirmation.test.ts` | Import 修复 (replies→heuristic-intent-resolver) | 23/23 pass |
| `plan-source.test.ts` | Stubs 替换 + retired 测试 | 5/5 pass |
| `pipeline-trace.trace.ts` | Stubs 替换 | pass |
| `schedule-legacy-pipeline-contract.test.ts` | Stubs 替换 | pass |
| `schedule-query-intent.test.ts` | Stubs 替换 | pass |

### Replacement coverage

```
tool-planner-no-heuristic-query-fallback
legacy-heuristic-retired
legacy-heuristic-import-consumers-retired
legacy-query-router-imports-retired
legacy-knowledge-imports-retired
llm-required-no-heuristic-business-path
tool-planner-capability-answer-path
tool-planner-schedule-read-tool
root-router-contract
confirmation.test.ts
```

### 仍保留的 protected tests (未删除 / 未 skip / 未弱化)

policy-guard, action-receipts, rollback*, tool-dry-run, execute-and-persist-step,
create-checklist-*, create-schedule-items-*, timeline-event-*,
planning-full-workflow-e2e, schedule-workflow-e2e, root-router-contract,
LangGraph runtime protected group, tool-planner-*, DB smoke

---

## 10. 测试基线

本阶段不修改任何测试断言或生产代码。测试基线应与 R6-A 完全一致。

**Expected**: 1045 pass, 0 fail (9 skipped)
