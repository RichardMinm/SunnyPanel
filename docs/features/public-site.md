# Feature: Public Site

## Routes

- `/`
- `/blog`
- `/blog/[slug]`
- `/notes`
- `/notes/[slug]`
- `/timeline`
- `/about`
- `/tags/[slug]`
- `/categories/[slug]`

## Rules

- 只展示 published + public
- 不展示 draft
- 不展示 private
- 不承载写入操作
- 不承载 Agent Workbench
- 不承载 confirmation / rollback / receipt
- 不写产品介绍型文案

## Display Requirements

Home:

- Featured posts
- Recent Blog
- Recent Notes
- Timeline preview

Blog / Notes:

- title
- summary
- publishedAt
- category
- tags
- reading layout

Tags / Categories:

- only published + public items

## Non-goals

- Updates 独立栏目
- Checklists 公开栏目
- Public Manager
- Agent Trace 公开展示
