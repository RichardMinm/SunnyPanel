# 全站前端风格统一 — 设计文档

## 目标

保持 Dashboard 简洁功能不变，以首页风格为标杆，统一包括 Admin 在内的全站前端视觉风格。

## 实现策略

混合策略：底层 token 共享 → 核心组件类整理 → Admin 主题重写 → 逐页替换内联样式。

## 1. Token 系统统一

Admin 的 `admin-theme.css` 中自有颜色变量废弃，全部引用 `globals.css` 语义 token：

| Admin 当前变量 | 替换为 |
|---|---|
| `--theme-text` | `var(--foreground)` |
| `--theme-bg` | `transparent` |
| `--theme-border-color` | `var(--border)` |
| `--theme-input-bg` | `var(--surface)` |
| `--color-warning-400` | `var(--accent)` |
| `--color-warning-600` | `var(--accent-strong)` |

Admin 背景渐变与主站 body 渐变统一。

## 2. 核心组件类

### 已有（保持不变）
- `.sunny-card` / `.sunny-card-strong` — 卡片
- `.sunny-panel` — 面板
- `.sunny-button-primary` / `.sunny-button-secondary` — 按钮
- `.sunny-badge` / `.sunny-badge-*` — 标签
- `.sunny-dashboard-*` 系列 — Dashboard 专用
- `.sunny-agent-*` 系列 — Agent workspace 专用
- `.sunny-home-*` 系列 — 首页专用
- `.sunny-command-*` 系列 — 命令面板专用
- `.sunny-nav-*` 系列 — 导航专用
- `.sunny-prose` — 富文本

### 新增 Admin 专用类（写入 admin-theme.css，引用 globals.css token）

- `.sunny-admin-sidebar` — 左侧导航面板，磨砂玻璃 + 圆角
- `.sunny-admin-nav-group` — 导航分组
- `.sunny-admin-nav-item` — 导航项 hover 带 accent 微光
- `.sunny-admin-table` — 表格，透明底 + 细分隔线
- `.sunny-admin-field` — 表单输入框，统一圆角 + focus ring
- `.sunny-admin-modal` — 弹窗/抽屉，与命令面板风格一致

### 页面内联样式替换

Timeline、Notes、Updates 中的 `bg-white/*`、`rounded-[1rem]` 等内联类替换为语义化类。

## 3. Admin 主题重写

`admin-theme.css` 完全重写：

- 删除所有自有颜色变量
- 导航区域 → 磨砂玻璃面板，导航项 accent 微光 hover
- 主内容区 → `.sunny-panel` 风格
- 按钮 → 主按钮 accent 渐变圆角，次级按钮白色底边框
- 表单输入框 → border-radius: 12px，focus 时 accent 色 shadow
- 表格 → 透明背景，细分隔线，hover 行 accent 微光
- 弹窗/抽屉 → 磨砂玻璃 + 大圆角
- 字体 → `--sunny-font-sans` / `--sunny-font-mono`

## 4. 逐页更新

- **Dashboard** — rail 侧栏和 topbar 透明度层次微调
- **Timeline** — 内联 bg-white/* 替换为 sunny-card，圆角统一
- **Notes** — 清理残留内联色值
- **Updates** — 清理残留内联色值
- **LivePreview** — 清理残留内联色值
- **CommandPalette** — 不变

## 5. 深色模式

所有新增组件类和页面修改需有对应 `html[data-theme="dark"]` 覆盖。

## 6. 实现顺序

1. Token 整理 + admin-theme.css 重写
2. Admin 专用 sunny-* 类（写入 admin-theme.css）
3. 页面逐页替换 → Timeline → Notes → Updates → LivePreview
4. Dashboard 微调
5. 深色模式验证
