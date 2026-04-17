# Personal Panel System — 开发规划文档（V1）

## 一、项目目标

构建一个 **个人展示 + 私人管理一体化系统**：

* 对外：个人主页 / 博客 / 动态 / 时间线
* 对内：计划管理 / 内容编辑 / 仪表盘
* 单用户系统（仅本人可编辑）
* 长期可扩展（未来可加 AI / 搜索 / 订阅）

---

## 二、技术选型（已确定）

### 前端

* Next.js（App Router）
* Tailwind CSS
* shadcn/ui（组件体系）
* Motion（动画）
* next-themes（明暗模式）

### 后端

* Payload CMS（嵌入 Next.js）
* PostgreSQL

### 部署

* Docker Compose
* Nginx（反向代理 + HTTPS）

说明：

* Next.js 支持 Node / Docker 部署，适合全栈一体应用 ([Next.js][1])
* Payload 为 TypeScript-first CMS，内置 Admin、鉴权、内容模型 ([selfhosting.sh][2])
* 内容编辑方案采用 Payload RichText，优先保证后台创作体验与 V1 开发效率

---

## 三、系统结构

### 1. 前台（Public）

```
/                首页
/blog            博客
/notes           短文
/updates         动态
/timeline        时间线
/about           关于
/now             当前状态
```

### 2. 后台（Private）

```
/admin           Payload Admin
/dashboard       仪表盘
```

---

## 四、核心模块定义

### 0. 基础系统模型

#### Users（后台用户）

* 使用 Payload `auth` collection
* V1 仅创建一个管理员账号
* 不做公开注册
* 不做多角色系统

#### Media（媒体资源）

* 统一管理封面图、文章插图、页面图片
* 支持后台上传
* 支持与 Post / Note / Update / Page 关联

---

### 模型通用规则

适用于 Post / Note / Update / TimelineEvent / Page / Plan：

* `status`: `draft | published`
* `visibility`: `public | private`

规则说明：

* `draft` 表示内容仍在编辑中，不进入正式展示
* `published` 表示内容已可被系统使用
* `private` 表示仅后台可见，不在前台展示
* 对前台公开页面而言，默认仅展示 `status=published` 且 `visibility=public` 的内容

---

## 1. Post（博客）

* title
* slug
* summary
* content (richtext)
* tags[]
* coverImage（关联 Media）
* status (draft/published)
* publishedAt
* visibility (public/private)

---

## 2. Note（短文）

* content
* mood / category
* createdAt
* visibility
* pinned

---

## 3. Update（动态）

* type（life/work/project）
* content
* link
* createdAt
* visibility

---

## 4. TimelineEvent（核心模块）

⚠️ 必须作为一等模型

* title
* description
* eventDate
* type（milestone/project/life）
* relatedPost（可选关联 Post）
* relatedUpdate（可选关联 Update）
* isFeatured
* status
* visibility
* sortOrder

---

## 5. Plan（仅私有）

* title
* description
* status
* priority
* startDate
* dueDate
* visibility（默认 private）

说明：

* V1 纳入正式模型
* 默认只在私有 dashboard 中使用
* 不进入公开前台

---

## 6. Page（静态页面）

* slug
* title
* content
* visibility

---

## 五、UI/UX 要求

### 1. 视觉风格

* 现代 / 克制 / 留白充足
* 卡片化但不过度
* 信息层级清晰

---

### 2. 动画要求

#### 页面级

* 页面切换有轻微过渡
* 不使用重动画

#### 组件级

* 卡片 hover 动效
* 列表 stagger 动画

#### 滚动

* timeline / 首页模块使用渐入

---

### 3. 明暗模式

* 支持 Light / Dark / System
* 无闪烁切换
* 独立设计两套配色

---

### 4. 响应式

* Desktop：主栏 + 侧栏
* Tablet：双栏
* Mobile：单栏

---

## 六、Timeline 展示规范（重点）

### 视图 1：侧边栏

* 最近 5 条
* 简略信息

### 视图 2：首页模块

* 精选 milestone
* 可跳转

### 视图 3：独立页面

* 年份分组
* 筛选
* 可展开详情

---

## 七、后台（Payload）要求

### 必须支持

* Users 鉴权（仅管理员）
* Media 上传与管理
* 所有内容类型 CRUD
* Draft / Publish
* 字段编辑（非 JSON）
* 权限控制（仅 admin）

### 可选增强

* Live Preview（前台实时预览）
* 多设备预览

---

## 八、开发阶段（必须按顺序）

## Phase 1 — 基础架构

* Next.js 初始化
* Payload 集成
* PostgreSQL 连接
* Docker Compose 搭建
* 本地开发环境与容器结构对齐

---

## Phase 2 — 鉴权与媒体基础

* Users collection
* Media collection
* Admin 登录与权限控制

---

## Phase 3 — 内容模型

* Post
* Note
* Update
* TimelineEvent
* Plan
* Page

---

## Phase 4 — 前台页面

* 首页
* 博客列表 + 详情
* Notes 页
* 动态页
* timeline 页
* about / now / page 渲染

---

## Phase 5 — 私有后台体验

* dashboard
* Plan 管理
* 内容快捷入口

---

## Phase 6 — UI优化

* 动画接入
* 明暗模式
* 响应式优化

---

## Phase 7 — 后台优化

* Live Preview
* 字段优化
* 内容结构调整

---

## 九、非目标（非常重要）

当前版本 **不做**：

* ❌ 多用户系统
* ❌ 评论系统
* ❌ 搜索（后期）
* ❌ 推荐算法
* ❌ SEO 深度优化
* ❌ 多语言
* ❌ App / 小程序

---

## 十、部署结构

```
nginx
 ├── nextjs-app (包含 payload)
 ├── postgres
 └── volume (media + db)
```

说明：

* V1 从开发阶段起就采用 Docker Compose 组织服务，减少后续环境切换成本
* Next.js 可运行在 Docker 容器中并通过 Nginx 反代 ([月球基地][3])
* Payload + Postgres 常见为多容器部署结构 ([selfhosting.sh][2])

建议的环境变量分组：

* App：`NEXT_PUBLIC_SERVER_URL`、`PAYLOAD_SECRET`
* Database：`DATABASE_URI`
* Storage：媒体上传目录与持久化 volume

---

## 十一、成功标准（验收）

* 能访问公开主页
* 能登录后台并编辑内容
* 能上传并复用媒体资源
* 博客 / 动态 / timeline 正常展示
* dashboard 可查看并管理私有 Plan
* 明暗模式正常
* 页面切换流畅
* timeline 三种视图可用

---

## 十二、Git 机制（开发必须遵守）

### 1. 仓库初始化

* 项目从 V1 开始即纳入 Git 管理
* `main` 作为稳定主分支
* 所有开发工作通过功能分支进行，不直接在 `main` 上长期开发

### 2. 分支策略

推荐分支命名：

* `feature/bootstrap-next-payload`
* `feature/content-models`
* `feature/public-pages`
* `feature/dashboard-plan`
* `chore/docker-setup`
* `docs/agentdev-refine`
* `fix/timeline-query`

规则：

* 一个分支只解决一类问题
* 大功能按阶段拆分，不做超大杂糅分支
* 合并回 `main` 前至少保证本地可运行

### 3. 提交规范

推荐提交格式：

* `feat: init next.js and payload integration`
* `feat: add timeline and plan collections`
* `fix: correct public content visibility query`
* `chore: add docker compose and env example`
* `docs: refine development workflow`

提交类型：

* `feat`：新功能
* `fix`：Bug 修复
* `chore`：工程配置、依赖、脚手架
* `docs`：文档修改
* `refactor`：重构但不改行为
* `style`：纯样式调整

### 4. 开发节奏

每个阶段建议遵循以下循环：

1. 新建功能分支
2. 完成一个可验证的小目标
3. 本地自测
4. 提交一次清晰 commit
5. 合并回 `main`

原则：

* 小步提交
* 每次提交保持语义单一
* 不把“脚手架 + 内容模型 + UI + 部署”全部堆进一个 commit

### 5. 版本节点建议

* `v0.1.0`：基础架构完成，可打开首页和后台
* `v0.2.0`：内容模型完成，可在后台录入内容
* `v0.3.0`：前台主要页面可浏览
* `v0.4.0`：dashboard 与 Plan 可用
* `v1.0.0`：V1 验收完成，可部署上线

---

## 十三、开发任务拆分（执行版）

### Phase 1 — 基础架构输出物

* 初始化 Next.js App Router 项目
* 配置 TypeScript / ESLint / 基础目录结构
* 集成 Payload 入口
* 建立 PostgreSQL 连接配置
* 增加 `.env.example`
* 增加 Docker Compose 与基础运行说明

### Phase 2 — 鉴权与媒体基础输出物

* `Users` collection
* `Media` collection
* admin 登录
* 上传目录与访问路径打通

### Phase 3 — 内容模型输出物

* `Post` collection
* `Note` collection
* `Update` collection
* `TimelineEvent` collection
* `Plan` collection
* `Page` collection
* 公共查询统一遵守 `published + public`

### Phase 4 — 前台页面输出物

* 首页聚合模块
* `/blog` 与文章详情页
* `/notes`
* `/updates`
* `/timeline`
* `/about`
* `/now`
* 通用 page 渲染机制

### Phase 5 — 私有后台体验输出物

* `/dashboard`
* Plan 看板或列表
* 快捷入口卡片
* 近期内容概览

### Phase 6 — UI 优化输出物

* 基础设计 token
* Light / Dark / System
* 进入动效与列表动效
* 移动端适配

### Phase 7 — 后台优化输出物

* Live Preview
* 字段分组优化
* 编辑体验细化

---

## 十四、建议目录结构

```text
src/
  app/
    (public)/
    admin/
    dashboard/
  collections/
  components/
  lib/
  styles/
public/
docker/
```

目录职责：

* `app/`：Next.js 路由与页面
* `collections/`：Payload 内容模型定义
* `components/`：前台与后台共享组件
* `lib/`：数据库、查询、工具函数、权限逻辑
* `styles/`：全局样式与主题变量

---

## 十五、开发约束（避免返工）

* 所有公开查询必须显式过滤 `status=published` 与 `visibility=public`
* `Plan` 默认不暴露到前台
* Timeline 不通过临时拼装实现，必须使用独立 `TimelineEvent`
* V1 不引入搜索、评论、多语言
* V1 优先完成“可写、可读、可回顾”，弱化复杂运营能力
* 先保证内容流完整，再做视觉打磨

---

## 十六、开工前检查清单

满足以下条件后即可进入正式开发：

* 技术选型已冻结
* 内容编辑方案已确定为 RichText
* Users / Media / 核心 collections 范围已明确
* Git 仓库已初始化
* `.gitignore` 已建立
* 分支与提交规范已确定
* 本地 Node 环境可用
* Docker 开发方式已确认

---

## 十七、一句话原则

> 这是一个“个人表达系统”，不是“内容管理系统”。

所有设计优先：

1. 可长期使用
2. 易写内容
3. 易回顾
4. 易扩展

---

[1]: https://nextjs.org/docs/pages/getting-started/deploying?utm_source=chatgpt.com "Getting Started: Deploying | Next.js"
[2]: https://selfhosting.sh/apps/payload-cms/?utm_source=chatgpt.com "How to Self-Host Payload CMS with Docker Compose"
[3]: https://blog.eimoon.com/p/nextjs-docker-deployment-guide/?utm_source=chatgpt.com "Next.js 应用的 Docker 部署完整指南 | 从本地开发到生产 ..."
