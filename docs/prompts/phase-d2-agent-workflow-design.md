# Phase D2：Agent Workflow Design

## Goal

整理 Agent Workflow v1 与 Safety Model，不修改主链路代码。

## Tasks

- 更新 `docs/agent-workflow-v1.md`
- 更新 `docs/safety-model.md`
- 更新 `docs/design/agent-activity-states.md`

## Protected Areas

- Agent pipeline
- Executor
- Policy Guard
- rollback
- AgentActionReceipt
- LangGraph runtime
- protected tests

## Rules

- 查询类意图不得进入写入流程
- 写入类意图必须经过 Draft / Dry-run / Policy Guard / Pending Confirmation
- Execute 后必须生成 Receipt
- 可 rollback 操作必须显式声明 rollback
- 不展示 raw Chain-of-Thought
- 不展示 raw prompt / raw LLM response / secret

## Verification

```bash
git diff --check
npm run test:agent
npm run typecheck
npm run lint
```

Only run agent tests if code changed or test suite is available.
