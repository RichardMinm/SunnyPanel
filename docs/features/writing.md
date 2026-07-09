# Feature: Writing

## Scope

- Blog / Notes 内容创建
- 内容编辑器
- metadata inspector
- category / tags
- preview
- publish / unpublish
- public page link
- AI 辅助改写 / 总结 / 标题建议

## Editor Rules

- 编辑体验可参考 Outline
- 不直接复制受限第三方主仓库代码
- 可研究 ProseMirror / TipTap 类架构
- 如复用第三方代码，保留 license / attribution
- 新增 `docs/third-party-notices.md` if needed

## Data Rules

- Markdown / MDX-like text 作为 canonical content 优先
- editor JSON 可选保存
- rendered HTML 不作为唯一数据源
- 保留 contentFormat
- 保证 Public Site 可渲染
- 保证 Agent 可安全读取和改写

## UI Rules

- Writing 中管理发布和公开状态
- 不新增 Public Manager
- tags / categories 在 Inspector 管理
- v1 不新增独立 Taxonomy Manager
- 首页文章展示需符合 aesthetic standard

## Agent Rules

Agent 可以：

- 生成草稿
- 改写内容
- 总结内容
- 建议标题
- 生成发布前检查建议

Agent 不可以：

- 未确认写入内容
- 未确认发布内容
- 批量改写已发布内容
- 绕过 confirmation

## Acceptance Criteria

- draft 不进入 Public Site
- private 不进入 Public Site
- published + public 进入 Public Site
- Blog / Notes 可显示 category / tags
- `/tags/[slug]` 只显示 published + public
- `/categories/[slug]` 只显示 published + public
