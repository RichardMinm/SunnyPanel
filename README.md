# SunnyPanel

SunnyPanel 是一个单用户个人面板系统，基于 `Next.js`、`Payload CMS`、`PostgreSQL`、`Tailwind CSS` 和 `TypeScript` 构建。

它的目标不是做通用后台，也不是 NAS 导航页，而是成为一个长期使用的个人操作系统：用于公开写作、记录动态、沉淀时间线、管理计划和进行内容运营。

## 核心定位

- 公开表达：`Home`、`Blog`、`Notes`、`Updates`、`Timeline`、`About`、`Now`
- 私有工作：`Dashboard`、`Payload Admin`、计划管理、内容运营
- 长期记忆：Timeline 作为公开写作、动态、项目和阶段进展的记忆骨架
- 快速操作：全站支持 `Cmd/Ctrl + K` 打开命令面板，快速导航和新建内容

## 已实现能力

- Payload CMS 集成 Next.js App Router
- PostgreSQL 数据存储
- 单管理员认证
- 公开内容模型：`Post`、`Note`、`Update`、`TimelineEvent`、`Checklist`、`Page`
- 私有计划模型：`Plan`、`PlanReview`
- 公开站点首页、文章、短札、动态、清单、时间线和页面路由
- 私有 Dashboard，用于查看下一步行动、计划状态、草稿队列和时间线缺口
- Timeline 年度归档、精选里程碑、首页 Timeline Highlight 和轻量侧边时间线
- SunnyPanel 轻量 UI 组件层：卡片、区块标题、状态徽标、空状态、快捷操作和时间线卡片
- 全站命令面板：导航、进入后台、新建文章、短札、动态、时间线节点、计划和上传媒体
- 浅色 / 深色主题兼容

## 技术栈

- Next.js 16 App Router
- React 19
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- TypeScript
- Docker Compose

## 主要路由

公开路由：

- `/`
- `/blog`
- `/blog/[slug]`
- `/notes`
- `/updates`
- `/timeline`
- `/checklists`
- `/about`
- `/now`

私有与后台路由：

- `/dashboard`
- `/admin`
- `/api/[...slug]`
- `/graphql`
- `/graphql-playground`

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

## Docker

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
npm run dev
npm run lint
npm run typecheck
npm run generate:types
npm run generate:importmap
```

## 环境变量

`.env.example` 提供了本地开发所需的基础变量。宿主机开发时，`DATABASE_URL` 默认应指向本机 PostgreSQL，例如：

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/sunny_panel
```

如果通过 Docker Compose 启动完整栈，应用容器会使用内部数据库地址。

## 使用建议

- 用真实内容替换默认示例内容
- 优先维护 Timeline 节点，让它成为公开内容的长期记忆层
- 使用 Dashboard 处理每天的下一步行动和内容运营
- 使用命令面板快速进入常用页面和创建内容
