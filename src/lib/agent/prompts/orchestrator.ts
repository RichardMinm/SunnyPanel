import type { AgentPromptContext } from "../prompts";

export const buildOrchestratorSystemPrompt = (context: AgentPromptContext) => `你是 SunnyPanel 的编排器 Agent。你的职责是把用户的自然语言请求拆解为可执行的子任务 DAG，而不是直接执行写库操作。

当前时间：${context.now}

你可以看到用户当前工作区状态（计划、清单、Timeline、长期记忆）。拆解时请利用这些信息，避免创建重复计划或忽略已有 planId。

规则：
1. 如果用户只有一个明确动作（例如「创建计划：考研数学」），返回 mode=single，tasks 只含 1 项。
2. 如果用户有复合请求（例如「制定计划并排进下周」「复盘本周并安排明天」），返回 mode=compound，拆成多个子任务。
3. 每个子任务必须指定 intent（与 SunnyPanel 支持的意图一致）和 args（尽量完整，含 planId 等引用）。
4. dependsOn 填写前置子任务的 id；无依赖则为空数组。
5. agentRole 从 plan / schedule / review / memory / content / query 中选择。
6. 排期类任务若依赖计划创建，dependsOn 应包含创建计划任务的 id，且 schedule 子任务 args 应带 planId（若上下文已有匹配计划则直接引用 id）。
7. 若请求与已有计划/清单明显重复，优先引用现有资源而非新建。
8. 利用长期记忆（confidence≥0.5）调整拆解顺序与粒度。
9. 先输出一句简短的中文思考过程（不超过 80 字，说明你的拆解理由和对上下文的引用），然后紧跟着输出 JSON。不要用 Markdown 代码块包裹 JSON。

可用 intent：
answer_question, create_plan, append_plan_item, complete_plan_item, compose_plan, compose_schedule_item, compose_timeline_event, add_completion_note, query_progress, evaluate_plan, save_memory, weekly_review, schedule_plan, clarify

输出格式：
{
  "mode": "single" | "compound",
  "reasoning": "拆解理由（应体现对上下文的引用）",
  "tasks": [
    {
      "id": "t1",
      "label": "用户可见的短标签",
      "intent": "compose_plan",
      "args": {},
      "dependsOn": [],
      "agentRole": "plan"
    }
  ]
}`;

export const buildOrchestratorUserPrompt = (message: string, context: AgentPromptContext) => {
  const activePlans = context.plans.filter((plan) => plan.state === "active");
  const planLines = context.plans
    .slice(0, 8)
    .map(
      (plan) =>
        `- [${plan.state}/${plan.priority}] ${plan.title} (id=${plan.id ?? "?"})${plan.dueDate ? ` 截止 ${plan.dueDate}` : ""}`,
    )
    .join("\n");

  const checklistLines = context.checklists
    .slice(0, 5)
    .map((checklist) => {
      const progress = checklist.totalItems ? `${checklist.completedItems ?? 0}/${checklist.totalItems}` : "?";

      return `- ${checklist.title} (${progress})`;
    })
    .join("\n");

  const timelineSummary = (context.timelineEvents ?? [])
    .slice(0, 3)
    .map((event) => `- ${event.eventDate}: ${event.title}`)
    .join("\n");

  const memoryLines = (context.memories ?? [])
    .filter((memory) => memory.confidence >= 0.5)
    .slice(0, 5)
    .map((memory) => `- [${memory.type}] ${memory.title}: ${memory.content}`)
    .join("\n");

  return [
    "## 当前工作区状态",
    `### 计划 (${context.plans.length} 个，活跃 ${activePlans.length})`,
    planLines || "无",
    `### 清单 (${context.checklists.length} 个)`,
    checklistLines || "无",
    "### Timeline 最近事件",
    timelineSummary || "无",
    memoryLines ? `### 相关长期记忆\n${memoryLines}` : "",
    "---",
    "## 用户消息",
    message,
  ]
    .filter((line) => line !== "")
    .join("\n");
};
