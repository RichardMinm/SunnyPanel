# SunnyPanel

SunnyPanel 是一个 **AI 原生的个人长期工作台**——LLM Agent 作为系统内核，贯穿写作、计划、排期、复盘与内容运营的全流程。

它不是通用后台，也不是 NAS 导航页，而是一个让 AI 理解你的工作区、帮你拆解意图、协调多个专业能力完成复杂任务的个人操作系统。

## 核心定位

### Agent 驱动的工作流

- **复合意图理解**：一次说「制定考研计划 + 排进下周日程 + 每周五复盘」，Agent 自动拆解为 DAG 子任务
- **多 Agent 协作**：6 个专业 Agent（Plan / Schedule / Review / Memory / Content / Query）通过 Agent Bus 协同，各自拥有独立 LLM 推理
- **DryRun → 确认 → 执行 → 回滚**：每个写操作都有完整的 dry-run 预览、风险分级和回滚策略
- **长期记忆**：向量检索 + 类型分类，Agent 记住你的偏好、写作风格和工作流规则
- **Dashboard 即 Agent 工作台**：对话面板、审批卡片、Trace 时间线、产物管理

### 公开表达

- `Home`、`Blog`、`Notes`、`Updates`、`Timeline`、`Checklists`、`About`、`Now`
- **Markdown 所见即所得写作**：Typora / Obsidian 风格编辑器，Markdown 纯文本存库
- **Timeline 作为长期记忆骨架**：公开写作、动态、项目进展自动形成时间线叙事

### 数据与工具

- **15 个数据集合**：Post / Note / Update / Page / TimelineEvent / Checklist / Plan / PlanReview / ScheduleItem / AgentMemory / AgentRun / AgentSuggestion / AgentThread / Media / Users
- **13 个 Agent 工具**：覆盖计划创建/拆解、日程排期/改期、清单完成/备注、记忆存储、周报生成、Timeline 同步
- **Payload CMS** 管理底层数据模型，Admin 编辑器与公开站点共用渲染层

## 架构概览

```
用户消息 / Dashboard 对话
        │
        ▼
┌──────────────────────────────────┐
│  Orchestrator (编排器)            │
│  LLM 感知 workspace 上下文        │
│  拆解复合意图 → TaskNode DAG      │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Execution Graph (DAG 执行引擎)   │
│  拓扑分层并行执行                  │
│  每层路由到对应 Specialized Agent  │
│  Agent Bus 传递 artifact          │
└──────────────┬───────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐┌────────┐┌────────┐
│  Plan  ││Schedule││ Review │  ...
│  Agent ││ Agent  ││ Agent  │
│  +LLM  ││  +LLM  ││  +LLM  │
└────────┘└────────┘└────────┘
        │
        ▼
┌──────────────────────────────────┐
│  Tool Registry (13 工具)          │
│  dryRun → propose → execute       │
│  → rollback                       │
└──────────────┬───────────────────┘
               │
               ▼
        Payload CMS / PostgreSQL
```

## 已实现能力

### Agent 系统
- 编排器（Orchestrator）：LLM 拆解 single / compound 意图为 TaskNode DAG
- 6 个专业 Agent 定义与路由，Agent Bus 消息传递
- 13 个工具含完整 dryRun / execute / rollback 生命周期，逐工具风险分级
- OpenAI Function Calling 支持，带 LLM → 启发式降级链路
- 长期记忆系统：类型分类、向量检索、相关性评分
- AgentRun 审计追溯、rollback API、token 统计
- Dashboard 全屏 Agent 工作台：对话、审批、追踪、产物、上下文字段

### 写作与内容
- Markdown 纯文本存库，MDXEditor 所见即所得编辑
- 公开站点与 Admin 共用 `sunny-prose` 渲染层与 CSS token
- 浅色 / 深色主题兼容
- Lexical JSON → Markdown 迁移脚本 + 幂等保护
- 阅读时长、摘要提取（兼容 Lexical 存量）

### 计划与日程
- Plan 模型含阶段拆解、优先级、执行模式（manual / agent / hybrid）
- ScheduleItem 含日期、时间段、冲突检测
- 周报 PlanReview：规则快照 + LLM 语义增强
- 清单与 Timeline 联动（完成条目 → 同步 Timeline 节点）

### 站点体验
- 全站 `Cmd/Ctrl + K` 命令面板：导航、新建内容、进入后台
- Live Preview：Payload Admin 内实时预览公开页面
- Dashboard：Focus Hero、日程日历、计划跑道、内容队列、Timeline 缺口

## 技术栈

- Next.js 16 App Router
- React 19
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- TypeScript
- MDXEditor v4
- Docker Compose

## 数据模型

### Collections（15 个）

| Collection | 说明 |
|------------|------|
| Posts | 博客文章（Markdown 存库） |
| Notes | 短札 / 想法 |
| Updates | 动态更新 |
| Pages | 自定义页面（About、Now 等） |
| TimelineEvents | 时间线节点 |
| Checklists | 清单任务（支持分组） |
| Plans | 计划（含阶段拆解、优先级、执行模式） |
| PlanReviews | 计划周报 / 复盘 |
| ScheduleItems | 日程（日期、时段、冲突检测） |
| AgentThreads | Agent 对话线程 |
| AgentRuns | Agent 执行记录（审计追溯） |
| AgentMemories | Agent 长期记忆（向量检索） |
| AgentSuggestions | Agent 生成的建议 |
| Media | 上传媒体文件 |
| Users | 管理员用户 |

### Globals（1 个）

| Global | 说明 |
|--------|------|
| AgentSettings | Agent 全局配置（LLM provider、模型、温度等） |

## 主要路由

### 公开路由

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/blog` | 文章列表 |
| `/blog/[slug]` | 文章详情 |
| `/notes` | 短札 |
| `/updates` | 动态 |
| `/timeline` | 时间线 |
| `/checklists` | 清单 |
| `/[slug]` | 页面（About、Now、Projects 等） |

### 私有与后台路由

| 路由 | 说明 |
|------|------|
| `/dashboard` | Agent 工作台 Dashboard |
| `/admin` | Payload 管理后台 |
| `/api/...` | API 路由（含回滚端点） |
| `/graphql` | GraphQL 端点 |
| `/graphql-playground` | GraphQL 调试 |

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量：

```bash
cp .env.example .env
```

3. 启动 PostgreSQL：

```bash
docker compose up -d postgres
```

4. 启动开发服务：

```bash
npm run dev
```

5. 打开站点：

- 前台：[http://localhost:3000](http://localhost:3000)
- 后台：[http://localhost:3000/admin](http://localhost:3000/admin)

首次进入后台时，如果还没有管理员用户，需要先按 Payload 的引导创建首个用户。

## 部署

### Vercel（推荐）

1. 将项目推送到 GitHub
2. 在 Vercel 导入仓库，框架选 Next.js
3. 设置环境变量（DATABASE_URL 指向可访问的 PostgreSQL）
4. 部署完成后，通过 `/admin` 创建管理员用户

需要外部 PostgreSQL（如 Supabase、Neon、Railway），或使用 `withPayload` 需要的持久化存储。

### Docker 完整部署

```bash
# 构建并启动（含 Next.js + PostgreSQL）
docker compose up --build -d
```

生产环境需要配置：
- `PAYLOAD_SECRET` — 随机字符串（`openssl rand -base64 32`）
- `DATABASE_URL` — PostgreSQL 连接串
- `OPENAI_API_KEY` — LLM API（可选，未配置时 Agent 使用规则降级）

## 测试

### Agent 单元测试（24 个测试文件）

```bash
npm run test:agent

# 冒烟测试
npm run smoke:agent
```

测试覆盖：意图识别、参数解析、安全校验、确认流程、记忆分类、工单执行等核心路径。测试文件位于 `tests/agent/`。

### E2E 测试

```bash
npm run test:e2e
```

Playwright 驱动，测试文件位于 `tests/e2e/`。

### 类型检查

```bash
npm run typecheck
```

## Docker（开发环境）

只启动数据库：

```bash
docker compose up -d postgres
```

启动完整开发栈：

```bash
docker compose up --build
```

## 常用命令

```bash
npm run dev               # 启动开发服务
npm run build             # 生产构建
npm run test:agent        # Agent 单元测试（24 个测试文件）
npm run test:e2e          # E2E 测试
npm run smoke:agent       # Agent 冒烟测试
npm run lint              # ESLint
npm run typecheck         # TypeScript 类型检查
npm run generate:types    # 生成 Payload 类型
npm run generate:importmap # 生成 Payload importMap
npm run migrate:lexical-to-markdown  # Lexical → Markdown 迁移
```

## 改造指南

项目正在持续演进，以下文档用于 Vibe Coding 上下文输入，指导分阶段改造：

- **[EDITOR-GUIDE.md](EDITOR-GUIDE.md)**：Markdown 所见即所得写作编辑器改造（Lexical → Markdown 存库）
- **[AGENT-GUIDE.md](AGENT-GUIDE.md)**：Agent 系统从规则驱动到 LLM 驱动的三阶段架构
- **[AGENT-MULTI-V2-GUIDE.md](AGENT-MULTI-V2-GUIDE.md)**：Agent 多智能体协作改造（Agent 自主推理、编排器感知上下文、ReAct 循环）

## 环境变量

`.env.example` 提供了本地开发所需的基础变量。宿主机开发时，`DATABASE_URL` 默认应指向本机 PostgreSQL：

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/sunny_panel
```

Agent 需要配置 LLM API 才能工作（可选，未配置时使用规则降级）：

```bash
OPENAI_API_KEY=sk-...
# 或其他兼容 API（智谱 GLM 等）
```

如果通过 Docker Compose 启动完整栈，应用容器会使用内部数据库地址。

## 使用建议

- 首次使用从 `/dashboard` 开始，Agent 会帮你了解当前状态
- 用自然语言告诉 Agent 你想做什么（制定计划、排日程、写周报、记偏好）
- 维护 Timeline 节点，让它成为公开内容的长期记忆层
- 用命令面板 `Cmd/Ctrl + K` 快速进入常用页面
- 写作时直接在 Admin 编辑器中用 Markdown 快捷键，所见即所得

## 已知限制

- **无多用户角色系统** — 当前权限模型为二元制（已登录 / 匿名），无管理员/编辑/访客分级
- **Agent 依赖外部 LLM** — 未配置 LLM API 时降级为启发式规则，复合意图能力受限
- **无 CI/CD 流水线** — 未配置 GitHub Actions 或其他自动化构建/测试管道
- **仅支持 PostgreSQL** — 未适配 SQLite 或 MySQL
- **夜间模式切换可能丢失 Payload Admin 样式** — 部分 Payload 内建组件未完全适配深色主题 token
