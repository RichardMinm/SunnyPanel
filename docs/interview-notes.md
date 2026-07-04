# SunnyPanel Interview Notes

These notes are written for spoken interview answers. They are intentionally direct and conversational.

## 1. SunnyPanel 是什么？

SunnyPanel 是一个 AI 原生的个人长期工作台。它不是单纯的博客，也不是普通后台。它把写作、计划、清单、日程、时间线和 Agent 工作流放在一个系统里，让 AI 能帮助我把自然语言目标变成可追踪、可确认、可回滚的工作记录。

## 2. 为什么要做这个项目？

我想验证一个问题：Agent 如果真的进入个人工作系统，应该怎么安全地写数据？很多 AI demo 停留在“生成一段计划”，但真实产品里更难的是状态、确认、审计、回滚和失败恢复。SunnyPanel 就是围绕这些问题做的。

## 3. 和普通个人博客 / 后台系统有什么不同？

普通博客主要是内容发布，后台系统主要是 CRUD。SunnyPanel 的重点是工作流：公开站点能展示长期叙事，Dashboard 能让 Agent 帮我拆计划、生成清单、安排日程，并且每一步都有安全边界。

## 4. Agent 是怎么理解用户意图的？

它先经过会话状态协调和 intent router，结合上下文判断用户是在问问题、继续草案、准备创建，还是确认执行。对于计划和日程这类复杂任务，还会走 readiness 判断，信息不够就追问，信息足够才进入草案或准备创建。

## 5. 为什么要有 Draft？

Draft 是为了避免“模型一生成就写库”。比如用户只说“6 月 30 日前上线第一版”，Agent 不应该直接创建完整计划。Draft 让 Agent 先把理解展示出来，用户可以修改、补充、确认方向，但数据库还没有被改变。

## 6. 为什么要有 Pending Confirmation？

Pending Confirmation 是真正写库前的用户确认边界。草案被认可不等于执行。确认卡会展示将要创建或修改什么、风险是什么、是否可回滚。只有用户确认后，executor 才能写数据。

## 7. 如何避免重复确认导致重复写入？

用 AgentActionReceipt。每个确认操作有稳定的 actionId，执行前先 claim receipt。如果已经有终态 receipt，系统直接重放之前的结果，而不是再次写库。这样网络重试、用户重复点击、LangGraph resume 都不会造成重复创建。

## 8. rollback 是怎么做的？

rollback 不是泛化数据库时间机器，而是按操作记录补偿 payload。创建类操作可以删除刚创建的记录；更新类操作可以恢复 before snapshot；计划和清单的链接也会只移除本次 action 添加的 relation。如果补偿失败，会报告 indeterminate，不假装成功。

## 9. Plan / Checklist / Schedule / Timeline 的关系是什么？

Plan 是目标和阶段，Checklist 是可执行任务，Schedule 是把任务放到具体时间，Timeline 是长期记录和完成事件。比如一个 Plan 可以生成 Checklist，Checklist 完成项会同步 Timeline，Plan 的进度从 linked checklists 聚合出来，而不是直接写一个容易漂移的 progress 字段。

## 10. 这个项目最难的地方是什么？

最难的不是让模型生成内容，而是把 Agent 变成产品系统：多轮状态怎么存，草案和写库怎么分开，确认后怎么恢复，重复确认怎么幂等，失败后怎么回滚，UI 怎么让用户看懂当前状态。这些都比单次 prompt 复杂。

## 11. 如果让你重构，你会怎么做？

我会继续收敛 workflow abstraction，把 readiness、draft、prepare、execute、rollback 做成更统一的 workflow contract。现在 Planning 和 Schedule 已经比较清楚，但未来可以让新增 workflow 更少写 glue code，同时保留每个领域自己的规则。

## 12. 这个项目体现了哪些工程能力？

它体现了 TypeScript 工程化、状态机设计、Agent 安全边界、数据库写入审计、回滚设计、测试基线、CI/CD、产品 UI 状态表达，以及把 AI 能力落到真实业务流程里的能力。

## 13. 它和网络安全方向有什么关系？

它不是一个安全攻防工具，但它体现了安全工程思维：最小权限、确认边界、审计日志、幂等、防重复执行、回滚、不要信任模型原始输出。这些思路和安全方向是相通的，尤其是把不确定的智能系统接入真实操作时。

## 14. 后续会怎么扩展？

我会优先做真实使用反馈和小规模打磨，而不是马上堆功能。后续可能做 ChecklistDraft revise、更多自然语言草案编辑、外部日历只读冲突检测、recurrence 设计。但这些都会继续遵守 draft / confirmation / execute / receipt / rollback 的安全模型。
