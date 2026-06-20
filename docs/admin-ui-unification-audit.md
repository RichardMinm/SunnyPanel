# Admin UI 风格统一 — 公开站 vs Dashboard 审计

## 结论

公开站与 Dashboard **不是同一套 UI**，但共享 Sunny Panel 设计系统（token、palette、主题、面板语言）。

| 维度 | 公开站 | Dashboard | 一致 |
|------|--------|-----------|------|
| 布局 | 居中 Frame + Footer | 全屏 grid shell | 否 |
| 顶栏 | PublicSiteHeader | 侧栏 IconBar，无顶栏 | 否 |
| 字号 | `:root` 默认 | `.sunny-dashboard-shell` 放大 | 否 |
| 背景氛围 | `sunny-atmosphere` 网格光晕 | 此前 `--dashboard-app-bg: #fff` 遮盖（已改为 `var(--background)`） | 部分 |
| Token / 主题 | 共享 | 共享 | 是 |

## Admin 对齐策略

- **顶栏**：复用 `PublicSiteHeader variant="admin"`
- **氛围**：Admin `html::before/after` 与公开站 `sunny-atmosphere` 同源
- **工作区**：保留 Payload 侧栏 + CMS 内容区，面板 token 对齐 `.sunny-card`
- **Provider**：SSR 读取 cookie 中的 locale / palette，与公开站一致
