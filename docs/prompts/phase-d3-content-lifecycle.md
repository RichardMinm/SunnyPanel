# Phase D3：Content Lifecycle Implementation Prompt

## Goal

实现或审计 Writing → Public Site 的内容生命周期。

## Scope

- Writing metadata
- status / visibility
- category / tags
- preview
- publish / unpublish
- public filtering

## Rules

- Public Site 只展示 published + public
- draft 不展示
- private 不展示
- tags / categories 在 Writing 管理
- v1 不新增独立 Public Manager
- v1 不新增独立 Taxonomy Manager
- 不直接复制受限第三方主仓库代码
- 如复用第三方代码，保留 license / attribution

## Forbidden

- 不修改 Agent pipeline
- 不修改 Executor
- 不修改 Policy Guard
- 不删除 checklist / schedule / planning workflow
- 不删除 protected tests
- 不新增 schema / migration，除非先输出风险分析并得到确认

## Tests

```bash
npm run test:content
npm run typecheck
npm run lint
git diff --check
```
