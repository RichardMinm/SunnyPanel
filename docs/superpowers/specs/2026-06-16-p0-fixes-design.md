# P0 严重问题修复 — 设计文档

> 基于审计报告 `audit-report-2026-06-16.md`，修复全部 12 个严重问题。

## 范围

| 编号 | 类别 | 问题 | 文件 |
|------|------|------|------|
| 1A | 凭证 | 移除硬编码数据库密码/API URL | `.env.example`, `.claude/settings.local.json`, `payload.config.ts`, `client.ts` |
| 1B | 安全 | 删除调试端点 | `run-agent-chat-pipeline.ts`, `confirmation-step.ts` |
| 1C | 安全 | 添加数据所有权过滤 | `schedule/route.ts`, audit memory/checklist/timeline |
| 1D | 并发 | 修复模块级可变状态 | `permission-resolver.ts` |
| 1E | 编译 | 修复 9 个 TS 错误 | `executor.ts`, `function-tools.ts`, `rollback.ts`, `safety.ts`, `run-agent-chat-pipeline.ts`, `tool-registry.ts` |
| 1F | 安全 | 移除 JWT 默认 secret | `payload.config.ts` |

## 非目标

- 不碰循环依赖解耦（P1）
- 不拆大文件（P1）
- 不做 CSS 迁移（P1/P2）
- 不加测试（P2）
