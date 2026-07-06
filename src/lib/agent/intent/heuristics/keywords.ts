export const createPlanKeywords = ["帮我创建计划", "创建计划", "新建计划", "创建一个计划", "帮我新建计划", "创建一个.*计划"];
export const composePlanKeywords = [
  "学习计划草稿",
  "帮我制定计划",
  "制定计划",
  "帮我规划",
  "创建一个完整计划",
  "生成完整计划",
  "做一个完整计划",
  "进行计划",
  "做计划",
  "安排计划",
  "帮我设计",
  "帮我安排计划",
  "规划一下",
  "排一下",
  "定个计划",
  "做个方案",
  "帮我做学习计划",
  "帮我制定学习计划",
  "帮我安排学习",
  "帮我拆分",
  "帮我拆解",
];

export const schedulePlanKeywords = [
  "安排进日程",
  "排进日程",
  "排入日程",
  "安排到日程",
  "添加到日程",
  "自动排期",
  "帮我排期",
  "生成日程",
  "帮我安排时间",
];
export const scheduleComposerKeywords = ["安排今天", "帮我安排今天", "今天安排", "排到", "放到", "加入日程", "创建日程", "安排到", "加一条", "加一个", "安排一个", "安排一场", "全天日程", "全天"];
export const appendItemKeywords = ["补充计划项", "追加计划项", "新增计划项", "添加计划项", "加一个条目", "补一个条目", "添加条目", "新增条目", "加上「", "加上“"];
export const completionKeywords = ["完成了", "学完了", "做完了", "标记", "完成"];
export const noteKeywords = ["补充备注", "添加备注", "备注是", "备注：", "感受是", "想法是"];
export const memoryKeywords = ["记住", "记一下", "保存记忆", "保存偏好", "以后记得", "以后都", "我的偏好", "我的习惯"];
export const progressKeywords = ["进度", "完成率", "完成情况", "统计"];
export const evaluationKeywords = ["评估", "评价", "建议", "分析", "复盘"];
export const weeklyReviewKeywords = ["本周回顾", "本周复盘", "周回顾", "周复盘", "复盘这一周", "复盘这周", "这一周", "这周", "本周计划执行情况"];
export const timelineComposerKeywords = ["compose_timeline_event", "补时间线", "时间线节点", "Timeline 节点", "timeline 节点", "整理成 Timeline", "写进 Timeline"];
export const negativeReplyKeywords = ["不用", "不用了", "先不用", "暂时不用", "不需要", "先这样"];
export const confirmationReplyKeywords = ["确认", "确认执行", "执行", "可以执行", "同意", "继续", "继续执行", "没问题", "好的", "好"];
export const cancellationReplyKeywords = ["取消", "不要执行", "不执行", "先别执行", "先别", "放弃", "停止"];

/* ── Query keywords (query-first, higher priority than writes) ── */
export const queryScheduleKeywords = [
  "有什么安排",
  "有什么日程",
  "最近有什么日程",
  "最近的日程",
  "最近日程",
  "有哪些安排",
  "有哪些日程",
  "查看日程",
  "查看最近的日程",
  "看下日程",
  "查日程",
  "日程安排",
  "今天的安排",
  "明天的安排",
];
export const queryPlanKeywords = ["有哪些计划", "查看计划", "看下计划", "进行中的计划", "计划进展", "计划进度", "计划情况", "计划的进展", "计划列表"];
export const queryChecklistKeywords = ["清单进度", "完成得怎么样", "完成了多少", "还剩多少", "清单情况", "清单完成"];
export const queryTimelineKeywords = ["最近完成", "最近做了", "完成哪些", "完成了哪些", "最近的事", "时间线", "动态", "最近.*完成了"];
export const queryMemoryKeywords = ["有什么习惯", "什么偏好", "记忆里", "我记得", "我的偏好", "我的习惯"];
export const capabilityKeywords = ["支持吗", "能不能", "是否支持", "可以吗", "有没有这个功能", "怎么用", "如何使用", "能帮我", "你会", "有没有.*功能", "支持.*吗", "支持.*删除", "能不能.*删除"];

/* ── Write verbs (used by query-first guard) ── */
export const writeVerbsPattern = /(创建|新建|制定|生成|添加|新增|删除|删掉|移除|取消|改成|改为|改到|调整为|推迟到|提前到|更新为|提升到|标记完成|排到|排入|安排到|保存|记住|写入)/;
export const queryPattern = /(有什么|有哪些|怎么样|最近|本周|这周|这个月|快到期|支持吗|能不能|是否|查看了|看一下|看下|帮我查|帮我查看|查一下)/;
