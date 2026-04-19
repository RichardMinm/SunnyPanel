# SunnyPanel

一个使用 `Next.js + Payload CMS + PostgreSQL` 构建的单用户个人面板系统。  
它把“公开表达”和“私有管理”放进同一个长期可维护的工作流里。

## 中文说明

### 项目定位

SunnyPanel 被设计成两个层面同时存在的系统：

- 公开层：Blog、Notes、Updates、Timeline，用来写作、记录和组织叙事
- 私有层：Dashboard、Payload Admin、Plan，用来做内容运营、计划管理和后台操作

它不是从多用户产品起步，而是先服务一个人的长期表达与回顾系统。

### 当前进度

目前仓库已经完成这些核心部分：

- Payload CMS 已接入 Next.js App Router
- 已启用 `Users` 认证 collection 和统一的 `Media` 资源 collection
- 核心内容模型已落地：`Post`、`Note`、`Update`、`TimelineEvent`、`Plan`、`Page`
- 公开路由已经可访问：`/blog`、`/notes`、`/updates`、`/timeline`
- `Page` 前台路由已接入，可通过后台发布 `/about`、`/now` 等固定页面
- 首页已经接入真实内容数据，不再是纯占位页面
- `/dashboard` 已经是登录感知的私有工作台入口
- 本地开发可通过 Docker Compose 启 PostgreSQL，也支持整栈本地编排

### 技术栈

- Next.js 16 App Router
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- Docker Compose
- TypeScript

### 内容模型

- `Users`：单管理员认证集合
- `Media`：图片与上传资源中心
- `Post`：长文，包含 slug、summary、rich text、tags、cover image、status、visibility
- `Note`：短内容片段，包含 category、mood、pinned、status、visibility
- `Update`：动态流，记录 life / work / project 的变化
- `TimelineEvent`：时间线节点，可关联 Post 或 Update
- `Plan`：私有计划项，包含 priority、status、日期信息
- `Page`：未来扩展用的独立富文本页面

### 路由

公开路由：

- `/`
- `/blog`
- `/blog/[slug]`
- `/about`
- `/now`
- `/notes`
- `/updates`
- `/timeline`

私有与后台路由：

- `/dashboard`
- `/admin`
- `/api/[...slug]`
- `/graphql`
- `/graphql-playground`

### 本地开发

1. 复制 `.env.example` 为 `.env`
2. 运行 `docker compose up -d postgres`
3. 运行 `npm install`
4. 运行 `npm run dev`
5. 打开 [http://localhost:3000](http://localhost:3000)
6. 打开 [http://localhost:3000/admin](http://localhost:3000/admin)
7. 如果还没有管理员用户，先走 Payload 的创建首个用户流程

补充说明：

- `.env` 中的 `DATABASE_URL` 是给宿主机开发环境使用的，默认应指向 `127.0.0.1:${POSTGRES_PORT}`
- 如果使用 `docker compose up --build` 跑整栈，`app` 服务会自动覆盖为内部的 `postgres:5432`

### Docker Compose

只启动 PostgreSQL：

```bash
docker compose up -d postgres
```

启动完整开发栈：

```bash
docker compose up --build
```

### 常用命令

```bash
npm run dev
npm run lint
npm run typecheck
npm run generate:types
npm run generate:importmap
```

### Git 约定

- `main` 为稳定分支
- 功能开发尽量放在短生命周期 feature 分支上
- 提交保持小而单一职责
- 推荐使用 `feat`、`fix`、`chore`、`docs` 前缀

### 下一步重点

- 继续把私有 Dashboard 做成真正的计划与运营面板
- 提升文章详情页与 Page 渲染体验
- 继续打磨公开页面的视觉风格与移动端表现

### 参考

- 规划文档：`AgentDev.md`

## English

SunnyPanel is a single-user panel system built with `Next.js`, `Payload CMS`, and `PostgreSQL`.
It combines a public publishing surface with a private workspace for planning, review, and content operations.

### Overview

- Public surface: Blog, Notes, Updates, and Timeline
- Private surface: Dashboard, Payload Admin, and Plan management
- The product starts as a focused personal system instead of a multi-user platform

### Current Status

- Payload CMS is wired into the Next.js App Router
- `Users` auth and centralized `Media` management are already in place
- Core collections are implemented: `Post`, `Note`, `Update`, `TimelineEvent`, `Plan`, and `Page`
- Public routes are live: `/blog`, `/notes`, `/updates`, `/timeline`
- `Page` collection can now power static public pages such as `/about` and `/now`
- The homepage already reads real content from Payload
- `/dashboard` is now an auth-aware private workspace entry
- Docker Compose is available for local PostgreSQL and full-stack local setup

### Stack

- Next.js 16 App Router
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- Docker Compose
- TypeScript

### Local Development

1. Copy `.env.example` to `.env`
2. Run `docker compose up -d postgres`
3. Run `npm install`
4. Run `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)
6. Open [http://localhost:3000/admin](http://localhost:3000/admin)

Notes:

- `DATABASE_URL` in `.env` is intended for host-side development and should point to `127.0.0.1:${POSTGRES_PORT}`
- When running the full stack through Docker Compose, the `app` service automatically switches to the internal `postgres:5432` hostname

### Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run generate:types
npm run generate:importmap
```
