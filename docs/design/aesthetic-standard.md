# Aesthetic Standard

## 1. Rules

- 编写代码前先确认视觉标准
- 不只实现功能可用
- 必须检查视觉层级
- 必须检查留白
- 必须检查字体层级
- 必须检查组件复用
- 必须检查动效一致性
- 必须检查 design token 使用
- 不新增零散 token
- 不新增一次性组件
- 不做页面级样式 hack

---

## 2. Visual Direction

Allowed qualities:

- clean
- calm
- structured
- editorial
- agent-native
- personal workspace

Avoid:

- enterprise admin template
- noisy SaaS dashboard
- over-decorated portfolio site
- traditional CMS backend style
- random card stacking

---

## 3. Layout Standard

Rules:

- 页面有清晰主次结构
- 重要内容优先展示
- 辅助信息进入侧栏 / Inspector / 次级区域
- 不允许所有信息平铺堆叠
- 不允许无意义卡片化
- 不允许每个模块自定义布局规则

Recommended:

- PublicShell
- DashboardShell
- EditorLayout
- PlanDetailLayout
- WorkbenchLayout
- InspectorPanel

---

## 4. Typography Standard

Rules:

- 标题层级清晰
- 正文字号适合长时间阅读
- 行高舒适
- Blog / Notes 详情页必须有良好 prose 样式
- Dashboard 信息密度可以更高，但不得拥挤

Avoid:

- 随意新增字号
- 标题层级混乱
- 正文行宽过长
- Blog 详情页像后台表单页

---

## 5. Spacing Standard

Rules:

- 使用统一 spacing token
- 页面边距一致
- 卡片内部留白一致
- 列表项间距一致
- 信息密度与可读性平衡

Avoid:

- 硬编码 margin / padding
- 每个页面一套间距
- 过度拥挤
- 过度留白导致信息稀薄

---

## 6. Color Standard

Rules:

- 使用统一 design tokens
- Agent 状态颜色语义清晰
- Public Site 和 Dashboard 共享基础 token

Avoid:

- 页面中写 hex color
- 同一语义使用多个颜色
- 过度使用高饱和色
- 破坏阅读体验

---

## 7. Motion Standard

Rules:

- 动效服务状态变化
- 动效克制、自然、快速
- Agent Activity 动效必须由结构化状态驱动
- loading / empty / confirmation / receipt 状态可有轻量动效

Avoid:

- 动效伪造真实执行进度
- 每个页面单独实现动画
- 多动画库并存
- 过度炫技

---

## 8. Public Site Standard

Rules:

- Home 使用内容入口结构
- Blog / Notes 保证阅读排版
- Timeline 保证时间秩序
- About 保持简洁
- Tags / Categories 辅助浏览，不喧宾夺主
- 不写产品介绍型文案

---

## 9. Dashboard Standard

Rules:

- 保持工作台感
- 保持高信息密度但不拥挤
- Agent Workbench 有明确执行阶段感
- Inspector 增强上下文理解
- Planning / Checklist / Schedule 体现执行闭环
- 不写传统 CMS 后台感

---

## 10. Pre-code Checklist

Before UI implementation:

- 目标页面视觉定位已明确
- 页面信息层级已明确
- 布局结构已明确
- 组件复用方案已明确
- 状态设计已明确
- 动效边界已明确
- token 使用方案已明确
- 不做事项已明确
