# Phase D1：Design Baseline Audit

## Goal

只读审计并更新设计文档，不修改业务代码。

## Tasks

- 更新 `docs/product-map.md`
- 更新 `docs/feature-index.md`
- 更新 `docs/design/route-map.md`
- 更新 `docs/design/domain-model.md`
- 更新 `docs/design/content-lifecycle.md`

## Rules

- 不写产品介绍型文字
- 使用 scope / rules / non-goals / data contract
- 不修改 Agent pipeline
- 不修改 Executor
- 不修改 Policy Guard
- 不修改 rollback
- 不修改 AgentActionReceipt
- 不修改 Payload schema
- 不新增 migration
- 不删除 protected tests

## Verification

Run:

```bash
git diff --check
```

If docs lint exists, run it.

## Output

- 修改文件列表
- 做了什么
- 没有做什么
- 是否修改业务代码
- 是否触碰 protected tests
- 验证结果
