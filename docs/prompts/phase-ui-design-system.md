# Phase UI：Design System and Aesthetic Baseline

## Goal

在实现 UI 前，先审计并统一 Design System、tokens、组件和动效边界。

## Tasks

- 审计现有组件目录
- 审计 token 使用
- 审计硬编码颜色 / spacing / shadow
- 审计动画库使用
- 审计 PublicShell / DashboardShell
- 输出最小统一方案

## Rules

- 不新增零散 token
- 不重复实现基础组件
- 不引入多套动画库
- 不写产品介绍型 UI 文案
- 不为了视觉效果破坏 Agent 安全边界
- 动画不得伪造真实执行进度
- Agent Activity 必须来自结构化状态

## Aesthetic Requirements

- 视觉层级清晰
- 留白一致
- 字体层级稳定
- 组件风格统一
- Dashboard 具备工作台感
- Public Site 具备阅读体验
- 首页文章展示美观

## Forbidden

- 不修改 Agent pipeline
- 不修改 Executor
- 不修改 Policy Guard
- 不修改 rollback
- 不弱化 protected tests
- 不大规模重构所有页面

## Tests

```bash
npm run test:content
npm run typecheck
npm run lint
git diff --check
```
