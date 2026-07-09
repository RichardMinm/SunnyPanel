# Phase D4：Planning Execution Lifecycle Audit

## Goal

只读审计 Planning / Checklist / Schedule 当前模型和流程，输出最小变更方案。

## Desired Model

```txt
Plan
→ Checklist
→ ChecklistItem
→ ScheduleItem
→ Completion
→ Plan Progress
```

## Tasks

- 审计 Plan / Checklist / Schedule schema
- 审计现有 tests
- 审计冲突检测逻辑
- 输出当前差距
- 输出最小变更方案
- 不直接修改主链路

## Rules

- LLM 只生成建议，不直接执行
- 冲突检测优先由确定性逻辑完成
- 用户确认前不得创建、移动、删除日程
- Execute 后必须生成 receipt
- 本地 rollback support 必须显式声明

## Forbidden

- 不修改 Planning / Schedule 主链路
- 不修改 protected tests
- 不新增 migration，除非先确认
- 不做自动重排
- 不接外部 Calendar

## Tests Baseline

```bash
npm run test:agent:planning
npm run test:agent:schedule
npm run test:agent
npm run typecheck
npm run lint
git diff --check
```
