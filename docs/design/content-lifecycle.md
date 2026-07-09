# Content Lifecycle

## 1. Scope

Applies to:

- Blog
- Notes
- Public Site display
- Writing metadata
- tags / categories
- publish / unpublish

---

## 2. Flow

```txt
Dashboard / Writing
→ Create Draft
→ Edit Content
→ Set Metadata
→ Set Category / Tags
→ Preview
→ Publish
→ Public Site Display
```

---

## 3. States

Status:

- draft
- published
- archived

Visibility:

- private
- public

---

## 4. Writing Responsibilities

- 创建 Blog / Notes 草稿
- 编辑内容
- 设置 title
- 设置 slug
- 设置 summary
- 设置 cover image
- 设置 type
- 设置 status
- 设置 visibility
- 设置 category
- 设置 tags
- Preview Public Page
- Publish / Unpublish
- View Public Page

---

## 5. Public Site Responsibilities

- 展示 published + public Blog
- 展示 published + public Notes
- 展示 public Timeline events
- 展示 tags / categories browsing

Rules:

- 不管理内容
- 不编辑内容
- 不发布内容
- 不删除内容
- 不承载 Agent execution

---

## 6. Taxonomy Boundary

Management location:

- Dashboard / Writing
- Writing Inspector
- future: Writing / Taxonomy

Display location:

- Public Site
- Blog list
- Notes list
- Tag page
- Category page
- Content detail page

Rules:

- Public Site 可以展示和筛选 tags / categories
- Public Site 不创建、编辑、删除 tags / categories
- 未发布内容的 tag / category 不进入公开页面
- private 内容不进入公开 tag / category 页面

---

## 7. Agent Boundary

Agent 可以：

- 生成内容草案
- 改写内容
- 总结内容
- 生成标题建议
- 生成发布前检查建议

Agent 不可以：

- 未经确认写入内容
- 未经确认发布内容
- 绕过 Writing 发布流程
- 在 Public Site 上执行写入操作
