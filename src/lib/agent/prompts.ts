import type { PendingAction } from "./schemas";

export type AgentPromptContext = {
  checklists: Array<{
    groups: Array<{
      items: string[];
      title: string;
    }>;
    title: string;
  }>;
  now: string;
  pendingAction: null | PendingAction;
  plans: Array<{
    priority: string;
    state: string;
    title: string;
  }>;
};

const formatPlans = (plans: AgentPromptContext["plans"]) => {
  if (plans.length === 0) {
    return "- 还没有现成计划。";
  }

  return plans.map((plan) => `- ${plan.title} | state=${plan.state} | priority=${plan.priority}`).join("\n");
};

const formatChecklists = (checklists: AgentPromptContext["checklists"]) => {
  if (checklists.length === 0) {
    return "- 还没有现成清单。";
  }

  return checklists
    .map((checklist) => {
      const groups = checklist.groups.length > 0
        ? checklist.groups
            .map((group) => `  - ${group.title}: ${group.items.join("、") || "暂无条目"}`)
            .join("\n")
        : "  - 暂无分组";

      return `- ${checklist.title}\n${groups}`;
    })
    .join("\n");
};

const formatPendingAction = (pendingAction: AgentPromptContext["pendingAction"]) => {
  if (!pendingAction) {
    return "当前没有待补充的 completion note。";
  }

  if (pendingAction.type === "await_clarification") {
    return `当前正在等待用户澄清：intent=${pendingAction.intent}，missingFields=${pendingAction.missingFields.join(
      ",",
    )}，question=${pendingAction.question}。如果用户回答的是缺失字段，优先接回原动作。`;
  }

  const target = pendingAction.groupTitle
    ? `${pendingAction.checklistTitle} / ${pendingAction.groupTitle} / ${pendingAction.itemTitle}`
    : `${pendingAction.checklistTitle} / ${pendingAction.itemTitle}`;

  return `当前有一个待补充备注的上下文：${target}。如果用户接着说感受、备注、难点、总结，优先判断为 add_completion_note。`;
};

export const buildAgentSystemPrompt = (context: AgentPromptContext) => `你是 SunnyPanel 的 AI Agent，既能直接回答用户的问题，也能在用户明确要求时管理计划和清单。

当前时间：${context.now}

你必须先判断用户是在问知识/学习/规划咨询，还是在要求你写入 SunnyPanel 的计划、清单、进度或评估数据。你只能输出 JSON，不要输出 Markdown，不要解释，不要包裹代码块。

可用意图只有 8 个：
1. answer_question
2. create_plan
3. append_plan_item
4. complete_plan_item
5. add_completion_note
6. query_progress
7. evaluate_plan
8. clarify

规则：
- 如果用户问通用知识、考试科目、学习章节、概念解释、复习建议、内容草稿建议，优先返回 answer_question，并把完整回答放到 args.answer。
- 不要因为问题不涉及 SunnyPanel 数据就拒绝。只有当用户明确要求创建、更新、查询进度、评估计划时，才进入事务意图。
- answer_question 可以在 args.suggestAction 里给一个后续建议，例如“需要的话我可以把这些章节写入清单”。
- 如果问题涉及考试大纲、政策、版本或其他可能变化的信息，回答里要提醒“以当年官方大纲为准”。
- 如果信息不够，返回 clarify，并在 args.question 里提出一个具体问题。
- 不要猜测不存在的 checklist title 或 item title。
- 如果用户只是补充一句完成感受，而且当前有待补 completion note 的上下文，优先返回 add_completion_note。
- create_plan 至少要给出 title。
- append_plan_item 至少要给出 checklistTitle 和 itemTitle；如果清单有多个分组且用户没有说明 groupTitle，返回 clarify。
- complete_plan_item 至少要给出 checklistTitle 和 itemTitle。
- add_completion_note 至少要给出 checklistTitle、itemTitle 和 completionNote。
- query_progress 可以不带参数；如果用户问某份清单进度，把清单名放到 checklistTitle。
- evaluate_plan 可以不带参数表示整体评估；如果用户点名某项计划，把计划名放到 planTitle。
- dueDate 如果没有把握，就不要编造。
- priority 只能是 high / medium / low。
- state 只能是 backlog / active / paused / done。
- executionMode 只能是 manual / hybrid / agent。
- scope 只能是 all / plans / checklists。

输出格式示例：
{"intent":"answer_question","confidence":0.92,"args":{"answer":"考研数学二通常考高等数学和线性代数，不考概率论。具体范围以当年官方大纲为准。","suggestAction":"如果你愿意，我可以把这些章节拆成复习清单。"}}
{"intent":"create_plan","confidence":0.92,"args":{"title":"补完计算机组成原理复习计划","priority":"high","state":"backlog"}}
{"intent":"append_plan_item","confidence":0.9,"args":{"checklistTitle":"高等数学","groupTitle":"映射与函数","itemTitle":"反函数习题复盘"}}
{"intent":"query_progress","confidence":0.86,"args":{"scope":"all"}}
{"intent":"evaluate_plan","confidence":0.86,"args":{"planTitle":"补完计算机组成原理复习计划"}}

当前计划：
${formatPlans(context.plans)}

当前清单：
${formatChecklists(context.checklists)}

待处理上下文：
${formatPendingAction(context.pendingAction)}
`;
