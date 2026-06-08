# 日程页面 UI 重构设计

**日期**: 2026-06-08  
**状态**: 已确认  
**分支**: `refactor/dashboard-orphan-cleanup`

## 概述

将日程页面从开发者工具风格重构为 Apple Calendar / Notion Calendar / Linear 的轻量产品化风格。采用精炼极简主义美学——白底灰背景、pill 形元素、微妙边框和阴影、timeline 风格事件列表。

## 当前问题

1. 左侧月历区域过空，右侧日程卡片过重
2. 当天日程列表重复内容过多（每张卡片都展示来源说明）
3. 选中日期大面积蓝色背景+边框，视觉过重
4. 顶部标题、月份切换、返回按钮层级不够清晰
5. 底部 DeepSeek / Agent 状态栏偏开发者工具风格

## 设计方向

**美学**: 精炼极简主义 — Notion Calendar × Linear  
**关键词**: 克制、精准、pill 形元素、micronspacing、subtle shadows  
**调色**: `#f8fafc` 页面背景、`#fff` 卡片、`#e5e7eb` 边框、`#1d4ed8` 蓝色强调

---

## 组件架构

```
修改:
├── ScheduleMonthView.tsx        完全重写：Header + 月历 Chip + Timeline 面板
├── sunny-dashboard-schedule.css 完全重写，硬编码色值（非 token 变量）
├── icons.tsx                    新增日程用 SVG 图标
├── DashboardShell.tsx           日程模式下隐藏底部状态栏
└── DashboardStatusBar.tsx       Agent Toast 模式，默认隐藏
```

**图标清单**（新增到 `icons.tsx`）：
- `chevron-left` / `chevron-right` — 月份切换箭头
- `plus` — 新建日程
- `clock` — 时间 icon
- `layers` — 来源说明 icon（展开详情用）

现有 `archive`、`calendar`、`schedule` 等图标已存在，无需新增。

---

## 1. 产品化 Header

```html
┌──────────────────────────────────────────────────────────────┐
│  日程安排                                                     │
│  管理你的课程、学习计划与每日任务                                │
│                                                              │
│  [今天]  [‹] 2026年6月 [›]  [月|周|日]  [+ 新建]              │
└──────────────────────────────────────────────────────────────┘
```

- **标题**: `font-size: 22px`, `font-weight: 700`, `color: #0f172a`
- **副标题**: `font-size: 13px`, `color: #94a3b8`
- **今天按钮**: `border: 1px solid #e2e8f0`, `border-radius: 8px`, `background: #fff`
- **月份导航**: 左右箭头按钮 + 当前月份文字居中
- **视图切换**: segmented control — `[月 | 周 | 日]`，选中项 `background: #e2e8f0`
- **新建按钮**: `background: #1d4ed8`, `color: #fff`, `border-radius: 8px`
- 月/周/日中仅「月」可用，「周」「日」显示为 disabled 态（占位，后续开发）

---

## 2. 主体左右布局

```
┌──────────────────────────────┬──────────────────┐
│         月历 (70%)           │  当日安排 (360px) │
│                              │                  │
│  ┌──┬──┬──┬──┬──┬──┬──┐    │  2026年6月8日     │
│  │一│二│三│四│五│六│日│    │  · 周日 · 5项     │
│  ├──┼──┼──┼──┼──┼──┼──┤    │                  │
│  │  │  │  │  │  │  │  │    │  08:00 ─┬─ ┌──┐  │
│  │  │  │  │  │  │  │  │    │         │  │卡片│  │
│  │  │  │  │  │  │  │  │    │  10:30 ─┼─ ┌──┐  │
│  │  │  │  │  │  │  │  │    │         │  │卡片│  │
│  │  │  │  │  │  │  │  │    │  14:00 ─┴─ ┌──┐  │
│  │  │  │  │  │  │  │  │    │            │卡片│  │
│  └──┴──┴──┴──┴──┴──┴──┘    │                  │
└──────────────────────────────┴──────────────────┘
```

- **间距**: 20px
- **月历卡片**: `background: #fff`, `border-radius: 20px`, `border: 1px solid #e5e7eb`, `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`, `padding: 16px`
- **右侧面板**: 同上卡片样式，`width: 360px-420px`，`flex-shrink: 0`

---

## 3. 月历单元格

```
┌──────────┐
│ 8        │  ← 选中日期：background #eff6ff, box-shadow inset 0 0 0 1px #bfdbfe
│ ┌──────┐ │
│ │课时1  │ │  ← event chip: height 22px, radius 999px, font 12px
│ │课时2  │ │
│ │ +3    │ │  ← 超出 2 条显示 +N
│ └──────┘ │
└──────────┘
```

- **min-height**: 96px
- **border-radius**: 14px
- **hover**: `background: #f8fafc`
- **选中日期**: `background: #eff6ff` + `box-shadow: inset 0 0 0 1px #bfdbfe`（无厚重蓝色边框）
- **今天**: 日期数字用 `background: #1d4ed8` 的蓝色圆形 badge（`width: 24px`, `height: 24px`, `border-radius: 50%`）
- **其他月份**: `opacity: 0.35`
- **周六/日头部**: `color: #cbd5e1`

### Event Chip

- `height: 22px`, `border-radius: 999px`, `font-size: 12px`
- 默认背景 `#f1f5f9`，文字 `#475569`
- 高优先级背景 `#fef3c7`，文字 `#92400e`
- 选中日期内 chip 背景 `#dbeafe`，文字 `#1e40af`
- 最多展示 2 条，超出显示 `+N`（`font-size: 10px`, `color: #94a3b8`）
- 单条 chip 超出宽度时 `text-overflow: ellipsis`

---

## 4. Timeline 风格日程列表

```
┌──────────────────────────────────────┐
│  2026年6月8日 · 周日         5 项     │
│                                      │
│  08:00  ●  ┌─────────────────────┐  │
│            │ 机器学习练习   计划中  │  │
│            │ 08:00–10:00 · 2小时  │  │
│            └─────────────────────┘  │
│            │                        │  ← 竖线连接
│  10:30  ●  ┌─────────────────────┐  │
│            │ 提交项目周报   高优先  │  │  ← 点击展开
│            │ 10:30–11:00 · 30分钟  │  │
│            │ ┌─────────────────┐ │  │
│            │ │ 来源说明展开区域  │ │  │  ← 描述默认隐藏
│            │ └─────────────────┘ │  │
│            └─────────────────────┘  │
│            │  (虚线, 间隔较大)        │
│  14:00  ●  ┌─────────────────────┐  │
│            │ 复习统计学习   已完成  │  │  ← 已完成：文字划线，opacity 0.6
│            │ 14:00–16:00 · 2小时  │  │
│            └─────────────────────┘  │
└──────────────────────────────────────┘
```

- **时间列**: `flex: 0 0 48px`, `text-align: right`, `font-size: 11px`, `color: #94a3b8`, `font-variant-numeric: tabular-nums`
- **时间点 dot**: `9px` 圆形，颜色对应优先级（蓝=普通、黄=高、绿=已完成）
- **连接线**: `2px solid #f1f5f9`，间距 16px。相邻事件时间差超过 1 小时时连接线间距加大到 32px
- **卡片**: `border-radius: 14px`, `border: 1px solid #f1f5f9`（默认）/ `#e2e8f0`（选中/展开时）
- **卡片默认信息**: 标题 + 状态 pill + 时间范围 + 时长
- **展开描述**: `margin-top: 8px`, `padding: 8px 10px`, `background: #f8fafc`, `border-radius: 8px`，显示来源说明
- **已完成**: 标题 `text-decoration: line-through`, 整体 `opacity: 0.6`, 状态 pill 绿色
- **已取消/已跳过**: 用 dash 边框 + opacity 0.5，不在 timeline 中显示 dot

---

## 5. 状态 Pill

- `padding: 2px 8px`, `border-radius: 999px`
- 计划中: `background: #f1f5f9`, `color: #64748b`
- 高优先级: `background: #fef3c7`, `color: #92400e`
- 已完成: `background: #dcfce7`, `color: #16a34a`
- 已取消/已跳过: `background: #fee2e2`, `color: #dc2626`

---

## 6. 底部 Agent 状态

```
┌─────────────────────────────────┐
│  ● Agent 工作中 — 正在整理日程...  │  ← 右下角 toast
└─────────────────────────────────┘
```

- **默认隐藏**: `DashboardShell` 在 `activeMode === "schedule"` 时不渲染 `DashboardStatusBar`
- **Agent Toast**: 仅 `isSubmitting === true` 时显示，右下角浮层
  - `background: #fff`, `border: 1px solid #e5e7eb`, `border-radius: 16px`
  - `padding: 8px 14px`, `font-size: 11px`, `color: #64748b`
  - 绿色脉冲圆点 + 文字
  - `box-shadow: 0 4px 12px rgba(0,0,0,0.08)`
  - `position: fixed`, `bottom: 16px`, `right: 16px`, `z-index: 100`
- **开发调试信息**: `process.env.NODE_ENV === "development"` 时 toast 额外显示模型名和分支

---

## 7. 响应式

### 桌面端（≥900px）
左右布局，月历 70%，右侧 360-420px

### 窄屏（<900px）
- 上下布局：月历在上，Timeline 在下
- 月历单元格 `min-height: 72px`
- 右侧面板 `width: 100%`，无左边框，上边用分割线
- Header 操作区换行

---

## 8. 无 Emoji

所有可视化元素使用 `DashboardIcon` 组件中的本地 SVG 图标。新增图标：
- `chevron-left` / `chevron-right`
- `plus`
- `clock`
- `layers`

---

## 文件变更清单

```
修改:
├── src/components/dashboard/schedule/ScheduleMonthView.tsx  完全重写
├── src/app/styles/sunny-dashboard-schedule.css               完全重写
├── src/components/dashboard/icons.tsx                        新增 5 个 SVG 图标
├── src/components/dashboard/DashboardShell.tsx               日程模式隐藏 status bar
└── src/components/dashboard/DashboardStatusBar.tsx           新增 Agent Toast 模式
```

## 旧代码清理

`ScheduleMonthView.tsx` 中原有的 helper 函数（`getDaysInMonth`、`formatDateKey`、`formatAgendaDateLabel`、`sortScheduleItems`、`statusLabel`、`formatTimeRange`）保留逻辑，但返回值/渲染结构调整以匹配新 UI。现有的 API 调用（`/api/agent/schedule?month=`）和数据类型（`ScheduleItemSummary`）保持不变。
