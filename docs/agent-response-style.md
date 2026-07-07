# Agent Response Style

SunnyPanel Agent 的回复文案遵循混合架构：确定性判断 + LLM 辅助表达。

## Clarification Composer (Phase LLM-1)

当 Planning / Schedule readiness 判断为 insufficient 时，Agent 需要向用户追问更多信息。

### 架构

```
Deterministic Readiness (不变的)
  → Structured Clarification Context (从 slots/readiness 构造)
    → [LLM Composer or Fallback Composer]
      → Output Validation (校验规则)
        → User-facing Message
```

### 核心原则

1. **Readiness 是结构化判断** — 信息是否足够进入草案，由确定性代码决定。LLM 不参与这个决策。
2. **Clarification copy 可以由 LLM 辅助生成** — LLM 可以使追问更自然、更柔和。
3. **LLM 只负责表达，不负责执行决策** — LLM 输出只影响用户看到的文案，不影响 Agent 行为。
4. **LLM 输出必须经过 validation** — 校验规则确保输出不包含内部字段、不承诺写入、不绕过安全边界。
5. **LLM 失败必须 fallback** — fallback 也是柔和自然的模板，不是旧的工程化文案。

### 不变的安全边界

- Readiness 判断逻辑不变
- Readiness insufficient 仍然不创建 pendingAction
- Readiness insufficient 仍然不进入 dry-run
- Readiness insufficient 仍然不进入 Policy Guard
- Readiness insufficient 仍然不进入 Executor
- Confirmation 机制不变
- Draft / dry-run / confirmation / execute / receipt / rollback 链路完全不变

### 不暴露的内容

Clarification 回复中绝不出现以下内部字段名：

- `sourceType`, `missingSlots`, `knownSlots`
- `conflictPolicy`, `priorityRule`
- `availableTimeWindows`, `dailyCapacity`
- `plan_creation`, `schedule_creation`
- `currentProgress`, `successCriteria`
- `deliverables`, `constraints`

### 必须包含的内容

- "暂时不会写入" 或 "不直接写入" 的明确声明
- "先生成草案" 或 "先给你一版草案" 的下一步说明
- 用户可直接复制的示例回复 (suggestedReply)

### Feature Flag

| Flag | 值 | 行为 |
|------|-----|------|
| `AGENT_LLM_CLARIFICATION_COMPOSER` | `0` 或未设置 (默认) | 使用 fallback composer |
| `AGENT_LLM_CLARIFICATION_COMPOSER` | `1` | 尝试 LLM composer，失败时 fallback |
| `AGENT_DISABLE_LLM` | `1` | 强制 fallback（全局覆盖） |

### 模块位置

`src/lib/agent/response/clarification/`

| 文件 | 用途 |
|------|------|
| `types.ts` | 输入/输出类型定义 |
| `feature-flag.ts` | Feature flag 判断 |
| `build-context.ts` | 从 readiness slots 构造 ClarificationComposerInput |
| `fallback-composer.ts` | 确定性 fallback 文案生成 |
| `validate-output.ts` | LLM/fallback 输出校验 |
| `llm-composer.ts` | LLM 调用 + prompt + fallback 协调 |
| `index.ts` | 公共导出 |

### 接入点

- `schedule/readiness-gate.ts` — `composeScheduleClarificationAsync`
- `planning/readiness-gate.ts` — `composePlanClarificationAsync`
- `chat-pipeline/run-agent-chat-pipeline.ts` — readiness gate applied 分支调用 async composer

### 测试

| 测试文件 | 覆盖内容 |
|----------|---------|
| `tests/agent/clarification-composer.test.ts` | fallback composer + validation (31 tests) |
| `tests/agent/schedule/schedule-clarification-composer.test.ts` | schedule context + fallback (13 tests) |
| `tests/agent/planning/planning-clarification-composer.test.ts` | planning context + fallback (12 tests) |
