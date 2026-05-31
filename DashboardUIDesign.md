# SunnyPanel Dashboard UI Vibe Coding Prompt

你现在需要只针对 SunnyPanel 的 Dashboard UI 做重构优化。

不要重写整个项目，不要改动后端数据模型，不要新增复杂 Agent 能力，不要大规模改 Payload collection。

本次目标是：
将当前 Dashboard 从“大号聊天页面 + 左侧任务栏”，进一步优化成真正的 **Codex-like Agent Workspace**。

---

## 一、当前 UI 状态

当前 Dashboard 已经比之前清爽很多，信息密度下降，中间对话区已经成为主要区域。

但仍然存在以下问题：

1. 顶部标题仍然是旧定位：`SSunnyPanel个人表达与私有工作流`；
2. 左上角存在疑似调试残留文本，例如 `j25c2`；
3. 左侧 Sidebar 偏窄，任务标题大量截断；
4. 中间对话内容横向过宽，长文本阅读疲劳；
5. 用户消息贴得太靠右，和助手消息割裂；
6. DryRun 仍然是大段文本，没有结构化卡片；
7. Composer 输入框不够明确，没有成为稳定的主操作入口；
8. 模式切换放在左侧底部，不符合用户输入心智；
9. 右侧 Inspector 被完全取消，导致上下文、审批、Trace 没有承载区域；
10. 当前界面更像聊天页面，还不够像 Agent 执行工作台。

---

## 二、重构目标

请将 Dashboard 优化为：

> 左侧是任务与线程，中央是 Agent Thread，对话和执行流是核心，右侧是可折叠 Inspector，用于展示 Context、Approval、Trace、Linked 和 Memory。

最终布局应接近：

```text
┌──────────────────────────────────────────────────────────────┐
│ SunnyPanel · AI 原生个人工作台       Command   Admin   Theme │
├──────────────┬──────────────────────────────────┬────────────┤
│ Sidebar      │ Agent Thread                     │ Inspector  │
│              │                                  │ 可折叠      │
│ + New Thread │ Thread Header                    │ Context    │
│ 当前任务      │                                  │ Approval   │
│ 待确认        │ Messages                         │ Trace      │
│ 建议          │                                  │ Linked     │
│              │ DryRun / Result Cards             │ Memory     │
│              │                                  │            │
│              │ Composer                          │            │
└──────────────┴──────────────────────────────────┴────────────┘
```

---

## 三、Top Bar 修改要求

### 1. 修正标题

将当前标题：

```text
SSunnyPanel个人表达与私有工作流
```

修改为：

```text
SunnyPanel · AI 原生个人工作台
```

或者使用两级文本：

```text
SunnyPanel
AI 原生个人工作台
```

### 2. 清理异常文本

如果页面左上角存在类似：

```text
j25c2
```

这样的调试残留、Thread ID 残留或布局异常文本，请移除。

如果它是 Thread ID，则不要孤立显示，应放到 Thread Header 中，例如：

```text
Thread #13 · 已就绪
```

### 3. 保留顶部必要入口

Top Bar 保留：

* Command / Search；
* 前台；
* Admin；
* Theme Toggle；
* 当前模型状态。

主题切换不要占据太多空间。

---

## 四、Sidebar 修改要求

### 1. 调整宽度

左侧 Sidebar 当前太窄，请调整为：

```css
width: 280px - 320px;
```

确保任务标题、Thread 标题、建议标题不再大量截断。

### 2. 结构优化

Sidebar 只承担导航和 Thread 切换，不承担输入模式控制。

推荐结构：

```text
+ 新建 Thread

当前任务
- 已恢复 Thread #13
  已就绪

待确认
- 无待办

建议
- 生成本周计划
- 补时间线节点
- 处理逾期计划
- 推进风险

Workspace
- 计划
- 日程
- 写作
- 笔记
- 时间线
- 记忆
```

### 3. 移除或调整底部模式按钮

当前左侧底部的：

```text
均衡 / 聚焦 / 检查 / 调试
```

不适合放在 Sidebar 中。

请将模式切换移动到 Composer 附近。

---

## 五、Agent Workspace 修改要求

中间区域是整个 Dashboard 的核心。

请优化为：

```text
Thread Header
Messages
Execution Cards
Composer
```

### 1. 强化 Thread Header

当前只有简单的“对话 / 对话记录 / 已就绪”，信息不足。

请改成更明确的 Thread Header：

```text
已恢复 Thread #13
状态：已就绪
模式：问答 / DryRun / 执行
关联对象：继续完善公开层阅读体验
```

可以使用轻量 Badge 显示：

* 已就绪；
* DryRun；
* 等待确认；
* 已执行；
* 有风险；
* 已关联计划。

### 2. 限制消息最大宽度

当前消息横向太宽，长文本阅读困难。

请为消息内容容器设置最大宽度：

```css
max-width: 860px;
margin: 0 auto;
```

中间主区域可以很宽，但消息文本不要铺满整个屏幕。

### 3. 用户消息在内容容器内右对齐

用户消息不要贴到页面最右侧。

要求：

```text
用户消息在 message container 内右对齐，而不是在整个 viewport 内右对齐。
```

这样对话阅读路径更连贯。

### 4. 减少内部边框

保留整体层级，但不要出现太多盒子套盒子。

建议：

* 外层容器保留轻边框；
* 内层消息使用轻背景或卡片；
* 避免每一层都加重边框；
* 增加留白和间距。

---

## 六、DryRun 卡片化要求

这是本次最重要的改动。

当前 DryRun 仍然是大段文本，例如：

```text
用户要安排今天，需要先查询当前进度和即将到期计划……
我已经 dry-run 了这个工具动作……
将要做……
影响范围……
回滚准备……
```

请将它改造成结构化卡片。

### DryRunCard 示例

```text
DryRun · 等待确认

操作类型：创建日程
标题：专注推进一个计划动作
时间：2026-05-22 09:00 - 10:30
风险等级：中风险
冲突检测：无冲突
影响范围：创建 1 条日程
回滚状态：可回滚

[确认执行] [修改] [取消]
```

### DryRunCard 字段建议

组件应至少支持：

* operationType；
* title；
* targetCollection；
* timeRange；
* riskLevel；
* conflictStatus；
* impactSummary；
* rollbackAvailable；
* status；
* primaryAction；
* secondaryAction；
* cancelAction。

### 风险颜色

使用统一状态色：

```text
低风险：蓝色或绿色
中风险：黄色
高风险：红色
```

### 注意

DryRun 信息不要再用纯自然语言长段落展示。
用户必须能一眼看到：

* 要做什么；
* 影响什么；
* 有没有风险；
* 能不能撤销；
* 是否等待确认。

---

## 七、执行结果卡片

执行完成后，不要只显示一句普通文本。

请使用 ResultCard。

示例：

```text
已创建日程

标题：专注推进一个计划动作
时间：2026-05-22 09:00 - 10:30
关联计划：继续完善公开层阅读体验

[查看日程] [查看计划]
```

ResultCard 应支持：

* 操作结果；
* 创建对象；
* 时间；
* 关联对象；
* 跳转按钮。

---

## 八、错误卡片

当执行失败或检测到冲突时，使用 ErrorCard。

示例：

```text
执行失败

原因：该时间段与已有日程冲突。
建议：改为 10:40 - 12:00。

[采用建议时间] [重新选择] [取消]
```

错误信息应清晰、可操作，不要只显示技术错误。

---

## 九、Composer 修改要求

Composer 是 Dashboard 的主操作入口，必须固定、清晰、稳定。

### 1. 固定在 Agent Workspace 底部

请确保 Composer 始终在中间区域底部可见。

不要只显示右下角的“命令 ⌘K”。

### 2. Composer 结构

建议结构：

```text
[问答] [建议] [DryRun] [执行] [复盘] [时间线]

输入框：输入你的问题或任务……

当前模式：问答，不会修改数据

[发送]
```

### 3. 模式说明必须明确

例如：

```text
当前模式：问答，不会修改数据
```

或：

```text
当前模式：DryRun，执行前需要确认
```

或：

```text
当前模式：执行，将在确认后写入数据
```

### 4. Slash Commands 占位

输入框可以支持或预留：

```text
/plan 创建计划
/schedule 安排日程
/review 生成复盘
/write 写文章
/memory 保存记忆
/query 查询状态
```

---

## 十、Right Inspector 修改要求

当前版本完全取消了右侧面板，这会导致上下文、审批和 Trace 都被挤到中间对话里。

请添加一个 **可折叠 Inspector Panel**。

### 1. 默认行为

* 普通问答时可以默认收起；
* 有 DryRun 时自动打开 Approval；
* 有执行过程时自动打开 Trace；
* 有关联对象时显示 Linked；
* 有上下文时显示 Context。

### 2. Inspector Tabs

包括：

```text
Context / Approval / Trace / Linked / Memory
```

### 3. Context

展示当前 Agent 使用的上下文：

* 当前计划；
* 当前日程；
* 相关清单；
* 相关文章；
* 最近执行记录。

### 4. Approval

展示待确认操作。

例如：

```text
待确认操作：创建日程
风险等级：中风险
影响范围：1 条日程
```

### 5. Trace

展示执行过程：

```text
1. 识别意图
2. 构建上下文
3. 生成 DryRun
4. 等待确认
5. 执行写入
6. 记录结果
```

### 6. Linked

展示当前 Thread 关联对象：

* Plan；
* ScheduleItem；
* Checklist；
* Post；
* Note；
* TimelineEvent。

### 7. Memory

展示当前使用到的记忆：

* 用户偏好；
* 工作流规则；
* 项目背景。

### 8. 宽度建议

Inspector 宽度建议：

```css
width: 300px - 360px;
```

允许折叠，折叠后保留一个小按钮。

---

## 十一、视觉风格要求

继续保持当前版本的清爽感，但补足执行型工作台的结构感。

### 1. 颜色

统一状态色：

```text
蓝色：当前选中 / 主操作
绿色：成功 / 已完成
黄色：待确认 / 中风险
红色：高风险 / 错误
灰色：空状态 / 禁用
紫色：记忆 / 上下文
```

### 2. 边框

降低边框密度：

* 外层轻边框；
* 内层少边框；
* 用背景层次和间距区分模块；
* 避免盒子套盒子。

### 3. 字体与间距

统一：

* 字体大小；
* 行高；
* 卡片 padding；
* 按钮高度；
* Badge 样式；
* 圆角。

### 4. 空白控制

当前版本空白较多，但消息行长太长。

请做到：

* 页面整体保持呼吸感；
* 消息内容不要过宽；
* Sidebar 不要太窄；
* Inspector 可按需显示。

---

## 十二、响应式要求

### 桌面端

```text
Sidebar / Agent Workspace / Inspector
```

Inspector 可折叠。

### 平板端

* Sidebar 可折叠；
* Inspector 变成右侧 Drawer；
* Agent Workspace 保持主区域。

### 移动端

* 默认只显示 Agent Workspace；
* Sidebar 通过按钮打开；
* Inspector 通过底部 Sheet 打开；
* Composer 固定底部。

---

## 十三、推荐组件拆分

请尽量按组件拆分，避免把所有 UI 写在一个页面里。

建议结构：

```text
src/components/dashboard/
  DashboardShell.tsx
  DashboardTopBar.tsx
  DashboardSidebar.tsx
  ThreadList.tsx
  AgentWorkspace.tsx
  ThreadHeader.tsx
  MessageList.tsx
  MessageBubble.tsx
  DryRunCard.tsx
  ResultCard.tsx
  ErrorCard.tsx
  AgentComposer.tsx
  InspectorPanel.tsx
  ContextPanel.tsx
  ApprovalPanel.tsx
  TracePanel.tsx
  LinkedObjectsPanel.tsx
  MemoryPanel.tsx
  StatusBadge.tsx
  RiskBadge.tsx
```

---

## 十四、不要做的事情

本次只做 Dashboard UI 重构，不要做以下内容：

1. 不要重写后端；
2. 不要新增复杂数据库表；
3. 不要实现完整多 Agent 编排；
4. 不要实现完整长期记忆；
5. 不要实现复杂 Workflow Engine；
6. 不要大改 Payload Admin；
7. 不要做多用户协作；
8. 不要接入 MCP；
9. 不要重构整个项目；
10. 不要引入大型 UI 框架替换现有体系。

---

## 十五、验收标准

完成后 Dashboard 应满足：

1. 顶部标题为 `SunnyPanel · AI 原生个人工作台`；
2. 不再出现 `SSunnyPanel` 或 `j25c2` 之类异常文本；
3. 左侧 Sidebar 宽度合理，任务标题可读；
4. 中间 Agent Thread 是视觉中心；
5. 消息内容最大宽度合理，长文本阅读舒适；
6. 用户消息在内容容器内右对齐；
7. DryRun 已经结构化卡片化；
8. 执行结果和错误也使用卡片展示；
9. Composer 固定在底部并显示模式说明；
10. 模式切换移动到 Composer 附近；
11. 右侧存在可折叠 Inspector；
12. Inspector 包含 Context / Approval / Trace / Linked / Memory；
13. 普通问答时界面保持简洁；
14. 有 DryRun 或执行任务时，界面有明显执行工作台感；
15. 整体保持清爽，但不再只是大聊天页面。

---

## 十六、最终目标

最终效果应是：

> SunnyPanel Dashboard 像 Codex 一样，是一个 Agent 执行工作台。
> 左侧切换任务与线程，中间处理当前 Agent Thread，右侧查看上下文、审批和 Trace。
> 用户通过底部 Composer 输入自然语言，系统通过结构化卡片展示 DryRun、执行结果和错误状态。
