import type { PendingAction } from "./schemas";
import type { AgentContextBudget, AgentContextMode } from "./context-builder";
import type { AgentPromptThreadSummary } from "./thread-summary";
import type { AgentWorkbenchMode } from "./workbench-mode";

export type AgentPromptContext = {
  agentRuns?: Array<{
    completedAt: null | string;
    id: number;
    relatedPlanTitle: null | string;
    startedAt: null | string;
    status: string;
    summary: null | string;
    title: string;
    workflow: string;
  }>;
  checklists: Array<{
    completedItems?: number;
    groups: Array<{
      items: string[];
      title: string;
    }>;
    id?: null | number;
    status?: null | string;
    title: string;
    totalItems?: number;
    visibility?: null | string;
  }>;
  contentItems?: Array<{
    id: number;
    kind: "notes" | "pages" | "posts" | "updates";
    status: string;
    summary: null | string;
    title: string;
    updatedAt: string;
    visibility: string;
  }>;
  contextStats?: {
    budget: AgentContextBudget;
    included: {
      agentRuns: number;
      checklists: number;
      contentItems: number;
      memories: number;
      planReviews: number;
      plans: number;
      timelineCandidates: number;
      timelineEvents: number;
    };
    totalAvailable: {
      agentRuns: number;
      checklists: number;
      contentItems: number;
      memories: number;
      planReviews: number;
      plans: number;
      timelineEvents: number;
    };
  };
  mode?: AgentContextMode;
  workbenchMode?: AgentWorkbenchMode | null;
  memories?: Array<{
    confidence: number;
    content: string;
    id: number;
    lastUsedAt: null | string;
    title: string;
    type: "fact" | "preference" | "project_context" | "workflow_rule" | "writing_style";
  }>;
  narrativeGaps?: string[];
  now: string;
  pendingAction: null | PendingAction;
  threadSummary?: AgentPromptThreadSummary | null;
  planReviews?: Array<{
    health: string;
    id: number;
    planTitle: null | string;
    recommendations: string[];
    reviewedAt: string;
    scope: string;
    source: string;
    summary: string;
    title: string;
  }>;
  plans: Array<{
    agentBrief?: null | string;
    agentState?: null | string;
    dueDate?: null | string;
    executionMode?: null | string;
    id?: null | number;
    lastAgentRunStatus?: null | string;
    linkedContentCount?: number;
    priority: string;
    state: string;
    title: string;
    visibility?: null | string;
  }>;
  timelineCandidates?: Array<{
    id: number;
    kind: "notes" | "pages" | "posts" | "updates";
    status: string;
    summary: null | string;
    title: string;
    updatedAt: string;
    visibility: string;
  }>;
  timelineEvents?: Array<{
    eventDate: string;
    id: number;
    isFeatured: boolean;
    relatedContent: null | string;
    status: string;
    title: string;
    type: string;
    visibility: string;
  }>;
};

const contextModeLabelMap: Record<AgentContextMode, string> = {
  content: "内容",
  general: "概览",
  planning: "规划",
  progress: "进度",
  review: "复盘",
  timeline: "时间线",
};

const contentKindLabelMap: Record<"notes" | "pages" | "posts" | "updates", string> = {
  notes: "Note",
  pages: "Page",
  posts: "Post",
  updates: "Update",
};

const memoryTypeLabelMap: Record<"fact" | "preference" | "project_context" | "workflow_rule" | "writing_style", string> = {
  fact: "事实",
  preference: "偏好",
  project_context: "项目上下文",
  workflow_rule: "工作流规则",
  writing_style: "写作风格",
};

const formatPlans = (plans: AgentPromptContext["plans"]) => {
  if (plans.length === 0) {
    return "- 还没有现成计划。";
  }

  return plans
    .map((plan) => {
      const extras = [
        plan.executionMode ? `executionMode=${plan.executionMode}` : null,
        plan.agentState ? `agentState=${plan.agentState}` : null,
        typeof plan.linkedContentCount === "number" ? `linkedContent=${plan.linkedContentCount}` : null,
        plan.dueDate ? `due=${plan.dueDate}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${plan.title} | state=${plan.state} | priority=${plan.priority}${extras ? ` | ${extras}` : ""}`;
    })
    .join("\n");
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
      const completion =
        typeof checklist.totalItems === "number"
          ? ` | completion=${checklist.completedItems ?? 0}/${checklist.totalItems}`
          : "";
      const visibility = checklist.visibility ? ` | visibility=${checklist.visibility}` : "";

      return `- ${checklist.title}${completion}${visibility}\n${groups}`;
    })
    .join("\n");
};

const formatContentItems = (items: NonNullable<AgentPromptContext["contentItems"]>) => {
  if (items.length === 0) {
    return "- 暂无需要纳入本轮的内容条目。";
  }

  return items
    .map((item) => {
      const summary = item.summary ? ` | summary=${item.summary}` : "";

      return `- ${contentKindLabelMap[item.kind]} #${item.id} ${item.title} | status=${item.status} | visibility=${item.visibility}${summary}`;
    })
    .join("\n");
};

const formatTimelineEvents = (events: NonNullable<AgentPromptContext["timelineEvents"]>) => {
  if (events.length === 0) {
    return "- 暂无需要纳入本轮的时间线节点。";
  }

  return events
    .map((event) => {
      const featured = event.isFeatured ? " | featured=true" : "";
      const related = event.relatedContent ? ` | related=${event.relatedContent}` : "";

      return `- TimelineEvent #${event.id} ${event.title} | type=${event.type} | eventDate=${event.eventDate} | status=${event.status} | visibility=${event.visibility}${featured}${related}`;
    })
    .join("\n");
};

const formatAgentRuns = (runs: NonNullable<AgentPromptContext["agentRuns"]>) => {
  if (runs.length === 0) {
    return "- 暂无需要纳入本轮的 AgentRun。";
  }

  return runs
    .map((run) => {
      const related = run.relatedPlanTitle ? ` | plan=${run.relatedPlanTitle}` : "";
      const summary = run.summary ? ` | summary=${run.summary}` : "";

      return `- AgentRun #${run.id} ${run.title} | workflow=${run.workflow} | status=${run.status}${related}${summary}`;
    })
    .join("\n");
};

const formatPlanReviews = (reviews: NonNullable<AgentPromptContext["planReviews"]>) => {
  if (reviews.length === 0) {
    return "- 暂无需要纳入本轮的计划回顾。";
  }

  return reviews
    .map((review) => {
      const plan = review.planTitle ? ` | plan=${review.planTitle}` : "";
      const recommendations =
        review.recommendations.length > 0 ? ` | recommendations=${review.recommendations.join("；")}` : "";

      return `- PlanReview #${review.id} ${review.title} | scope=${review.scope} | health=${review.health}${plan} | summary=${review.summary}${recommendations}`;
    })
    .join("\n");
};

const formatMemories = (memories: NonNullable<AgentPromptContext["memories"]>) => {
  if (memories.length === 0) {
    return "- 暂无可用长期记忆。";
  }

  return memories
    .map(
      (memory) =>
        `- Memory #${memory.id} ${memory.title} | type=${memoryTypeLabelMap[memory.type]} | confidence=${memory.confidence.toFixed(2)} | content=${memory.content}`,
    )
    .join("\n");
};

const formatNarrativeGaps = (gaps: string[]) => {
  if (gaps.length === 0) {
    return "- 暂无明显叙事缺口。";
  }

  return gaps.map((gap) => `- ${gap}`).join("\n");
};

const formatContextStats = (context: AgentPromptContext) => {
  if (!context.contextStats) {
    return "未启用预算化上下文。";
  }

  const included = context.contextStats.included;
  const budget = context.contextStats.budget;

  return `mode=${context.mode ?? "general"}，included plans=${included.plans}/${budget.maxPlans}, content=${included.contentItems}/${budget.maxContentItems}, timeline=${included.timelineEvents}/${budget.maxTimelineEvents}, agentRuns=${included.agentRuns}/${budget.maxAgentRuns}, planReviews=${included.planReviews}/${budget.maxPlanReviews}, memories=${included.memories}`;
};

const formatThreadSummary = (summary: AgentPromptContext["threadSummary"]) => {
  if (!summary) {
    return "- 暂无压缩线程摘要。";
  }

  const updatedAt = summary.updatedAt ? ` | updatedAt=${summary.updatedAt}` : "";

  return `- coveredMessages=${summary.messageCount}${updatedAt}\n${summary.summary}`;
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

  if (pendingAction.type === "await_confirmation") {
    return `当前有一个等待确认的动作：intent=${pendingAction.action.intent}，risk=${pendingAction.action.riskLevel}，summary=${pendingAction.action.summary}。如果用户明确确认或执行，才能继续；如果用户取消，放弃该动作。`;
  }

  if (pendingAction.type === "await_batch_confirmation") {
    return `当前有 ${pendingAction.actions.length} 个等待批量确认的动作。用户回复「确认」则全部执行；「取消」则全部放弃。`;
  }

  if (pendingAction.type === "await_queue_resume") {
    return `当前有 ${pendingAction.deferredTaskIds.length} 个延后子任务等待继续执行。用户回复「继续」则从保存的队列恢复；「取消」则放弃这条延后队列。`;
  }

  if (pendingAction.type === "await_strategy_resume") {
    return `当前有一次策略暂停等待继续：strategy=${pendingAction.strategyMode}，failedTask=${pendingAction.failedTaskId ?? "unknown"}，reason=${pendingAction.reason}。用户回复「继续」则跳过同类失败保护并换一种重规划策略重试；「取消」则放弃。`;
  }

  if (pendingAction.type === "await_learning_followup") {
    return `当前有一个学习咨询后续上下文：subject=${pendingAction.subject}，originalMessage=${pendingAction.originalMessage}。如果用户接着说“拆成计划/清单/规划一下”，优先转换为 compose_plan，并保留该学科主题。`;
  }

  const target = pendingAction.groupTitle
    ? `${pendingAction.checklistTitle} / ${pendingAction.groupTitle} / ${pendingAction.itemTitle}`
    : `${pendingAction.checklistTitle} / ${pendingAction.itemTitle}`;

  return `当前有一个待补充备注的上下文：${target}。如果用户接着说感受、备注、难点、总结，优先判断为 add_completion_note。`;
};

const workbenchModeIntentHints: Record<string, string> = {
  ask: `\n工作台模式：用户当前在「ask（提问）」视图下。优先以 answer_question 回答知识问题；只有当用户明确要求写入时才进入事务意图。\n`,
  execute: `\n工作台模式：用户当前在「execute（执行）」视图下。优先匹配写入类意图（create_plan / append_plan_item / complete_plan_item / compose_schedule_item / compose_timeline_event）；若无法匹配，也允许 answer_question。\n`,
  plan: `\n工作台模式：用户当前在「plan（规划）」视图下。优先匹配 create_plan / compose_plan / append_plan_item / evaluate_plan 等规划意图；排版和上下文多纳入计划维度。\n`,
  review: `\n工作台模式：用户当前在「review（复盘）」视图下。优先匹配 evaluate_plan / weekly_review / query_progress；上下文会提供更多 AgentRun 和 PlanReview。\n`,
  timeline: `\n工作台模式：用户当前在「timeline（时间线）」视图下。优先匹配 compose_timeline_event / add_completion_note；关注时间线完整性与叙事一致性。\n`,
};

const formatWorkbenchModeHint = (workbenchMode?: AgentWorkbenchMode | null) => {
  if (!workbenchMode) {
    return "";
  }

  return workbenchModeIntentHints[workbenchMode] ?? "";
};

export const buildAgentSystemPrompt = (context: AgentPromptContext) => `你是 SunnyPanel 的 AI Agent，既能直接回答用户的问题，也能在用户明确要求时管理计划和清单。

当前时间：${context.now}
上下文模式：${context.mode ? contextModeLabelMap[context.mode] : "概览"}
上下文预算：${formatContextStats(context)}

你必须先判断用户是在问知识/学习/规划咨询，还是在要求你写入 SunnyPanel 的计划、清单、进度或评估数据。若用户一句话包含多个动作（例如「制定计划并排进日程」），仍只输出**一个**最优先的 intent；复合编排由编排器处理。你只能输出 JSON，不要输出 Markdown，不要解释，不要包裹代码块。

可用意图只有 13 个：
1. answer_question
2. create_plan
3. append_plan_item
4. complete_plan_item
5. compose_plan
6. compose_schedule_item
7. compose_timeline_event
8. add_completion_note
9. query_progress
10. evaluate_plan
11. save_memory
12. weekly_review
13. clarify

规则：
- 如果用户问通用知识、考试科目、学习章节、概念解释、复习建议、内容草稿建议，优先返回 answer_question，并把完整回答放到 args.answer。
- 如果用户明确要求“记住/保存偏好/以后按这个规则”，优先返回 save_memory；只在用户明确授权记忆时提取长期记忆。
- 不要因为问题不涉及 SunnyPanel 数据就拒绝。只有当用户明确要求创建、更新、查询进度、评估计划时，才进入事务意图。
- answer_question 可以在 args.suggestAction 里给一个后续建议，例如“需要的话我可以把这些章节写入清单”。
- 如果问题涉及考试大纲、政策、版本或其他可能变化的信息，回答里要提醒“以当年官方大纲为准”。
- 如果信息不够，返回 clarify，并在 args.question 里提出一个具体问题。
- 不要猜测不存在的 checklist title 或 item title。
- 如果用户只是补充一句完成感受，而且当前有待补 completion note 的上下文，优先返回 add_completion_note。
- create_plan 至少要给出 title。
- compose_plan 用于“帮我制定计划 / 帮我规划 / 创建一个完整计划”。它要尽量给出 title、goal、motivation、scope、outOfScope、keySteps、nextActions、successCriteria、risks、suggestedPriority、suggestedDueDate、agentBrief；如果目标太模糊，返回 clarify。
- compose_schedule_item 用于“安排今天 / 放到明天上午 / 创建日程 / 加入日程”。它要尽量给出 title、date、startTime、endTime、isAllDay、priority、reason、relatedPlanId/relatedChecklistId；如果没有日期，返回 clarify。相对日期要结合上下文 now。
- append_plan_item 至少要给出 checklistTitle 和 itemTitle；如果清单有多个分组且用户没有说明 groupTitle，返回 clarify。
- complete_plan_item 至少要给出 checklistTitle 和 itemTitle。
- compose_timeline_event 用于“补时间线 / 生成 Timeline 节点 / 把这段整理成 Timeline”。它可以使用 post/note/update/checklist_item/plan/free_text 作为 sourceType；默认 createEvent=true、visibility=public。若用户只要提案或预览，createEvent=false。
- add_completion_note 至少要给出 checklistTitle、itemTitle 和 completionNote。
- query_progress 可以不带参数；如果用户问某份清单进度，把清单名放到 checklistTitle。
- evaluate_plan 可以不带参数表示整体评估；如果用户点名某项计划，把计划名放到 planTitle。
- save_memory 至少要给出 content；type 只能是 preference / project_context / writing_style / workflow_rule / fact；confidence 是 0 到 1。
- weekly_review 用于“生成本周回顾 / 复盘这一周 / 看看本周计划执行情况”。默认 persistReview=true；如果用户说预览、先看、不保存、不写入，则 persistReview=false。默认 createSuggestions=true；如果用户明确不要建议，则 createSuggestions=false。
- dueDate 如果没有把握，就不要编造。
- priority 只能是 high / medium / low。
- state 只能是 backlog / active / paused / done。
- executionMode 只能是 manual / hybrid / agent。
- scope 只能是 all / plans / checklists。

输出格式示例：
{"intent":"answer_question","confidence":0.92,"args":{"answer":"考研数学二通常考高等数学和线性代数，不考概率论。具体范围以当年官方大纲为准。","suggestAction":"如果你愿意，我可以把这些章节拆成复习清单。"}}
{"intent":"create_plan","confidence":0.92,"args":{"title":"补完计算机组成原理复习计划","priority":"high","state":"backlog"}}
{"intent":"compose_plan","confidence":0.9,"args":{"title":"补完计算机组成原理复习计划","goal":"建立可执行的计组复习路径并完成第一轮复盘","keySteps":["梳理章节范围","拆分每日复习块","完成核心题型复盘"],"nextActions":["今天整理章节清单","明天安排第一组题型"],"successCriteria":["形成完整复习清单","完成第一组题型复盘"],"risks":["范围过大导致拖延"],"suggestedPriority":"high","agentBrief":"目标、范围、关键步骤、验收标准和风险都要围绕计组复习推进。"}}
{"intent":"compose_schedule_item","confidence":0.9,"args":{"title":"复盘反函数习题","date":"2026-05-07","startTime":"09:00","endTime":"10:30","isAllDay":false,"priority":"medium","reason":"把清单条目落到明天上午的执行时间块。"}}
{"intent":"append_plan_item","confidence":0.9,"args":{"checklistTitle":"高等数学","groupTitle":"映射与函数","itemTitle":"反函数习题复盘"}}
{"intent":"compose_timeline_event","confidence":0.88,"args":{"sourceType":"update","sourceId":12,"sourceTitle":"完成 Agent Inbox","visibility":"public","createEvent":true}}
{"intent":"query_progress","confidence":0.86,"args":{"scope":"all"}}
{"intent":"evaluate_plan","confidence":0.86,"args":{"planTitle":"补完计算机组成原理复习计划"}}
{"intent":"save_memory","confidence":0.86,"args":{"title":"偏好：回答保持简洁","type":"preference","content":"用户希望 Agent 回答默认简洁，先给结论，再给必要细节。","confidence":0.8}}
{"intent":"weekly_review","confidence":0.9,"args":{"persistReview":true,"createSuggestions":true}}

长期记忆：
${formatMemories(context.memories ?? [])}

线程摘要：
${formatThreadSummary(context.threadSummary)}

当前计划：
${formatPlans(context.plans)}

当前清单：
${formatChecklists(context.checklists)}

内容快照：
${formatContentItems(context.contentItems ?? [])}

时间线快照：
${formatTimelineEvents(context.timelineEvents ?? [])}

时间线候选：
${formatContentItems(context.timelineCandidates ?? [])}

Agent 运行快照：
${formatAgentRuns(context.agentRuns ?? [])}

计划回顾快照：
${formatPlanReviews(context.planReviews ?? [])}

叙事缺口：
${formatNarrativeGaps(context.narrativeGaps ?? [])}

待处理上下文：
${formatPendingAction(context.pendingAction)}
${formatWorkbenchModeHint(context.workbenchMode)}
`;
