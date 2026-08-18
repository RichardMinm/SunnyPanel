import type { AgentArbitrationDecision } from "@/lib/agent/intent/arbitration";
import { parseDefinitionQuestionIntent } from "@/lib/agent/intent/retired-intent-response";
import type { AgentPromptContext } from "@/lib/agent/prompts";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";
import { isRecord } from "@/lib/shared/is-record";

export type AgentQuestionKind =
  | "decision_support"
  | "general_advice"
  | "learning_path"
  | "project_analysis"
  | "study_advice";

export type AgentEvidenceItem = {
  id: string;
  reason: string;
  score: number;
  source:
    | "agent_run"
    | "checklist"
    | "content"
    | "memory"
    | "pending_action"
    | "plan"
    | "plan_review"
    | "thread"
    | "timeline";
  summary: string;
  title: string;
};

export type AgentCognitiveFrame = {
  confidence: number;
  evidence: AgentEvidenceItem[];
  goal: string;
  isCorrection: boolean;
  missingInfo: string[];
  questionKind: AgentQuestionKind;
  riskBoundary: string;
  shouldClarify: boolean;
  writeAllowed: boolean;
};

export type AgentAnswerPlan = {
  basis: string[];
  conclusion: string;
  needsClarification: boolean;
  nextActions: string[];
  clarificationQuestion?: string;
  steps: string[];
};

export type AgentAnswerQualityCheck = {
  answeredQuestion: boolean;
  avoidedUnrelatedContext: boolean;
  avoidedUnnecessaryClarification: boolean;
  issues: string[];
  respectedWriteBoundary: boolean;
  score: number;
  usedRelevantContext: boolean;
};

export type CognitiveAdvisoryInput = {
  arbitration?: AgentArbitrationDecision | null;
  context: AgentPromptContext;
  history: AgentChatMessage[];
  message: string;
  pendingAction: null | PendingAction;
};

export type CognitiveAdvisoryResult = {
  answer: string;
  frame: AgentCognitiveFrame;
  plan: AgentAnswerPlan;
  quality: AgentAnswerQualityCheck;
};

export const shouldUseCognitiveAdvisory = ({
  intent,
  message,
  pendingAction,
}: {
  intent: { intent: string };
  message: string;
  pendingAction: null | PendingAction;
}) => {
  const definitionIntent = parseDefinitionQuestionIntent(message);
  const openDomainTopic =
    definitionIntent?.intent === "answer_question"
      ? definitionIntent.args.openDomainTopic
      : null;

  return (
    intent.intent === "answer_question" &&
    !openDomainTopic &&
    (pendingAction?.type === "await_learning_followup" ||
      /(参谋|咨询|建议|分析|评估|路径|路线|路线图|顺序|学习|复习|备考|入门|什么是|是什么|什么叫|怎么推进|如何推进|怎么做|如何做|选择|取舍|决策|SunnyPanel|Agent|智能体|泛化|智能化|核心能力|网络安全|信息安全)/i.test(
        message,
      ))
  );
};

const knownSubjects: Array<{
  aliases: string[];
  canonical: string;
  firstAction: string;
  steps: string[];
}> = [
  {
    aliases: ["线性代数", "线代"],
    canonical: "线性代数",
    firstAction: "先用 5 道矩阵、秩、方程组基础题做诊断，确认是概念断点还是计算/转化问题。",
    steps: [
      "矩阵与行列式打底：把运算规则、初等变换和秩练稳。",
      "用向量组和秩理解线性方程组：不要只背结论，要能解释解空间为什么变。",
      "再进入特征值、特征向量和二次型：每个主题都用典型题串起来。",
      "最后做综合题和错题复盘：记录卡点属于概念、计算、转化还是审题。",
    ],
  },
  {
    aliases: ["信息安全", "网络安全", "网安", "蓝队"],
    canonical: "信息安全（偏蓝队）",
    firstAction: "先补网络、Linux、HTTP 和日志阅读能力，再进入蓝队场景练习。",
    steps: [
      "基础层：计算机网络、Linux、脚本、HTTP、常见服务和日志格式。",
      "安全层：Web 常见漏洞、攻击链、权限维持、横向移动和安全事件生命周期。",
      "蓝队层：日志分析、告警研判、检测规则、应急响应、溯源报告。",
      "实战层：靶场复盘、真实案例拆解、规则沉淀和周复盘。",
    ],
  },
  {
    aliases: ["高等数学", "高数", "微积分"],
    canonical: "高等数学",
    firstAction: "先用极限、导数、积分各 2 道题定位薄弱点，再决定补概念还是加题型训练。",
    steps: [
      "函数、极限、连续打底，先把定义和常见等价关系讲清楚。",
      "一元微分和一元积分分开练透，再做混合题。",
      "进入多元微积分和常微分方程时，用题型归纳连接方法。",
      "每两到三天复盘一次错题，按概念、计算、转化、审题分类。",
    ],
  },
];

const stopwords = [
  "给我",
  "帮我",
  "请你",
  "请",
  "一下",
  "问题",
  "怎么",
  "如何",
  "推进",
  "处理",
  "学习",
  "路径",
  "路线",
  "参谋",
  "建议",
  "规划",
  "当前",
];

const semanticAliasGroups = [
  ["agent", "ai", "助手", "智能体", "个人助手"],
  ["泛化", "通用", "开放式", "开放", "模糊"],
  ["智能化", "智能", "认知", "咨询智能", "核心能力"],
  ["咨询", "参谋", "建议", "判断", "评估", "分析", "决策"],
  ["上下文", "证据", "工作台", "长期目标"],
  ["评测", "校验", "测试", "质量门", "自检"],
  ["计划", "规划", "plan"],
  ["清单", "checklist", "检查"],
  ["记忆", "memory", "偏好"],
];

const normalize = (value: null | string | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[\s，,。.!！?？:：;；、"'“”‘’（）()[\]{}<>《》/\\_\-·#]+/g, "");

const cleanup = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[\s，,。.!！?？:：;；、]+|[\s，,。.!！?？:：;；、]+$/g, "")
    .trim();

const getString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
};

const getStringArray = (value: unknown, limit: number) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
};

const addKeyword = (keywords: Set<string>, keyword: string, normalizedMessage: string) => {
  const normalized = normalize(keyword);

  if (normalized.length >= 2 && !stopwords.includes(normalized)) {
    keywords.add(normalized);
  }

  for (const group of semanticAliasGroups) {
    if (group.some((alias) => normalized.includes(normalize(alias)) || normalizedMessage.includes(normalize(alias)))) {
      for (const alias of group) {
        const normalizedAlias = normalize(alias);

        if (normalizedAlias.length >= 2 && !stopwords.includes(normalizedAlias)) {
          keywords.add(normalizedAlias);
        }
      }
    }
  }
};

const extractKeywords = (message: string) => {
  const normalizedMessage = normalize(message);
  const keywords = new Set<string>();

  for (const token of normalizedMessage.match(/[a-z0-9]+/g) ?? []) {
    addKeyword(keywords, token, normalizedMessage);
  }

  for (const segment of normalizedMessage.match(/[\u4e00-\u9fff]+/g) ?? []) {
    addKeyword(keywords, segment, normalizedMessage);

    for (let size = Math.min(4, segment.length); size >= 2; size -= 1) {
      for (let index = 0; index + size <= segment.length; index += 1) {
        addKeyword(keywords, segment.slice(index, index + size), normalizedMessage);
      }
    }
  }

  return [...keywords];
};

const scoreText = (message: string, parts: Array<null | string | undefined>) => {
  const searchable = normalize(parts.filter(Boolean).join(" "));
  const keywords = extractKeywords(message);

  if (!searchable || keywords.length === 0) {
    return 0;
  }

  return keywords.reduce((score, keyword) => {
    if (!keyword || !searchable.includes(keyword)) {
      return score;
    }

    return score + Math.min(10, Math.max(2, keyword.length));
  }, 0);
};

const inferQuestionKind = (message: string, pendingAction: null | PendingAction): AgentQuestionKind => {
  if (
    pendingAction?.type === "await_learning_followup" ||
    /(学习|复习|备考|入门).{0,8}(路径|路线|路线图|顺序)|(?:路径|路线|路线图).{0,8}(学习|复习|备考|入门)|蓝队/.test(
      message,
    )
  ) {
    return "learning_path";
  }

  if (/(学习|复习|备考|入门|线性代数|高等数学|高数|信息安全|网络安全)/.test(message)) {
    return "study_advice";
  }

  if (/(先做|优先|还是|选择|取舍|决策|该先|应该先|哪一步|推哪|只有\s*\d+\s*分钟|\d+\s*分钟)/.test(message)) {
    return "decision_support";
  }

  if (/(SunnyPanel|Agent|智能体|泛化|智能化|核心能力|项目|Dashboard|工作台)/i.test(message)) {
    return "project_analysis";
  }

  return "general_advice";
};

const inferGoal = (message: string, kind: AgentQuestionKind, pendingAction: null | PendingAction) => {
  if (pendingAction?.type === "await_learning_followup") {
    return `${pendingAction.subject}学习路径`;
  }

  const cleaned = cleanup(
    message
      .replace(/^(请你|请|帮我|给我|为我|我想|想)/, "")
      .replace(/(参谋一下|参谋|分析一下|评估一下|建议一下)/g, "")
      .replace(/(怎么推进|如何推进|怎么做|怎么办|怎么看|给点建议|给个建议)[？?。!！]*$/g, ""),
  );

  if (cleaned) {
    return cleaned;
  }

  return kind === "learning_path" ? "学习路径" : "当前问题";
};

const explicitWritePattern =
  /(创建|新建|保存|记住|写入|删除|确认执行|执行一下|安排到|排进|排入|加入日程|创建日程|(?:制定|生成|创建|做成|拆成|拆分|拆解).{0,8}(计划|清单|草稿|日程)|学习计划|复习计划|计划草稿)/;

const directPathCorrectionPattern =
  /((只要|仅要|直接|给出|给我|输出).{0,8}(路径|路线|路线图|学习顺序))|((路径|路线|路线图).{0,8}(即可|就行|就可以))|((不是|并不是|不要|不用|不需要).{0,8}计划)/;

const selectSubject = (message: string, pendingAction: null | PendingAction) => {
  if (pendingAction?.type === "await_learning_followup") {
    const fromPending = knownSubjects.find((subject) => subject.aliases.some((alias) => pendingAction.subject.includes(alias)));

    return fromPending ?? {
      aliases: [pendingAction.subject],
      canonical: pendingAction.subject,
      firstAction: `先围绕${pendingAction.subject}做基础诊断，再按能力层级推进。`,
      steps: [
        "先建立知识框架，列出核心概念和常见应用场景。",
        "做少量基础练习定位薄弱点。",
        "按主题专项突破，再进入综合练习。",
        "用错题、笔记和复盘形成闭环。",
      ],
    };
  }

  const normalized = normalize(message);
  const known = knownSubjects.find((subject) => subject.aliases.some((alias) => normalized.includes(normalize(alias))));

  if (known) {
    return known;
  }

  const extracted =
    cleanup(
      message.match(/(?:规划|给出|梳理|整理)?(.+?)(?:学习|复习|备考|入门).{0,4}(?:路径|路线|路线图|顺序)/)?.[1] ??
        message.match(/(.+?)(?:的)?(?:学习|复习|备考|入门)/)?.[1] ??
        "",
    ) || "这门学科";

  return {
    aliases: [extracted],
    canonical: extracted,
    firstAction: `先围绕${extracted}做一次小诊断，确认概念、练习和应用哪一块最弱。`,
    steps: [
      "先建立知识框架，列出核心概念和常见应用场景。",
      "做少量基础练习定位薄弱点。",
      "按主题专项突破，再进入综合练习。",
      "用错题、笔记和复盘形成闭环。",
    ],
  };
};

const evidenceFromContext = (context: AgentPromptContext, message: string): AgentEvidenceItem[] => {
  const candidates: AgentEvidenceItem[] = [];

  for (const [index, plan] of context.plans.entries()) {
    const summary = [plan.agentBrief, `state=${plan.state}`, `priority=${plan.priority}`].filter(Boolean).join("；");
    const score = scoreText(message, [plan.title, plan.agentBrief, plan.agentState, plan.state, plan.priority]);

    candidates.push({
      id: `plan:${plan.id ?? index}`,
      reason: "计划标题或 Agent brief 与本轮问题相关。",
      score,
      source: "plan",
      summary,
      title: plan.title,
    });
  }

  for (const [index, checklist] of context.checklists.entries()) {
    const groupSummary = checklist.groups
      .slice(0, 3)
      .map((group) => `${group.title}${group.items.length > 0 ? `：${group.items.slice(0, 4).join("、")}` : ""}`)
      .join("；");
    const score = scoreText(message, [
      checklist.title,
      ...checklist.groups.flatMap((group) => [group.title, ...group.items]),
    ]);

    candidates.push({
      id: `checklist:${checklist.id ?? index}`,
      reason: "清单分组或条目能支持下一步建议。",
      score,
      source: "checklist",
      summary: groupSummary,
      title: checklist.title,
    });
  }

  for (const memory of context.memories ?? []) {
    const score = scoreText(message, [memory.title, memory.content, memory.type]);
    const answerStyleBoost =
      (memory.type === "writing_style" ||
        (memory.type === "preference" && /(回答|回复|结论|铺垫|短答案|长答案|语气|风格)/.test(`${memory.title}${memory.content}`)))
        ? 9
        : 0;

    candidates.push({
      id: `memory:${memory.id}`,
      reason: "长期记忆提供用户偏好或项目背景。",
      score: score + answerStyleBoost + Math.round(memory.confidence * 2),
      source: "memory",
      summary: memory.content,
      title: memory.title,
    });
  }

  for (const run of context.agentRuns ?? []) {
    const score = scoreText(message, [run.title, run.summary, run.workflow, run.relatedPlanTitle]);

    candidates.push({
      id: `agent_run:${run.id}`,
      reason: "最近 AgentRun 可反映当前工作进展。",
      score,
      source: "agent_run",
      summary: run.summary ?? `${run.workflow} · ${run.status}`,
      title: run.title,
    });
  }

  for (const review of context.planReviews ?? []) {
    const score = scoreText(message, [review.title, review.summary, review.planTitle, ...review.recommendations]);

    candidates.push({
      id: `plan_review:${review.id}`,
      reason: "计划回顾包含健康度和建议。",
      score,
      source: "plan_review",
      summary: [review.summary, ...review.recommendations.slice(0, 2)].join("；"),
      title: review.title,
    });
  }

  if (context.threadSummary?.summary) {
    const score = scoreText(message, [context.threadSummary.summary]);

    candidates.push({
      id: "thread:summary",
      reason: "当前会话摘要可承接最近讨论。",
      score,
      source: "thread",
      summary: context.threadSummary.summary,
      title: "当前会话摘要",
    });
  }

  return candidates
    .filter((item) => item.score >= 4)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
};

const pendingEvidence = (pendingAction: null | PendingAction): AgentEvidenceItem[] => {
  if (!pendingAction) {
    return [];
  }

  if (pendingAction.type === "await_learning_followup") {
    return [
      {
        id: "pending:learning_followup",
        reason: "用户正在纠偏或续接上一轮学习咨询。",
        score: 20,
        source: "pending_action",
        summary: pendingAction.originalMessage,
        title: `${pendingAction.subject}学习咨询`,
      },
    ];
  }

  if (pendingAction.type === "await_clarification") {
    return [
      {
        id: "pending:clarification",
        reason: "当前存在待澄清写入动作，需要判断是否续接或另起请求。",
        score: 12,
        source: "pending_action",
        summary: pendingAction.question,
        title: `待澄清：${pendingAction.intent}`,
      },
    ];
  }

  return [
    {
      id: `pending:${pendingAction.type}`,
      reason: "当前存在待处理动作，回答需要保持安全边界。",
      score: 10,
      source: "pending_action",
      summary: pendingAction.type,
      title: "待处理动作",
    },
  ];
};

export const buildAgentCognitiveFrame = ({
  arbitration,
  context,
  message,
  pendingAction,
}: CognitiveAdvisoryInput): AgentCognitiveFrame => {
  const questionKind = inferQuestionKind(message, pendingAction);
  const isCorrection = arbitration?.isCorrection === true || directPathCorrectionPattern.test(message);
  const writeAllowed =
    arbitration?.requiresWrite === true || (!isCorrection && explicitWritePattern.test(message) && questionKind !== "learning_path");
  const evidence = [...pendingEvidence(pendingAction), ...evidenceFromContext(context, message)]
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
  const missingInfo =
    evidence.length === 0 && (questionKind === "decision_support" || questionKind === "project_analysis")
      ? ["当前目标", "可用时间或约束", "判断标准"]
      : [];

  return {
    confidence: Math.min(0.95, 0.68 + evidence.length * 0.05 + (isCorrection ? 0.1 : 0)),
    evidence,
    goal: inferGoal(message, questionKind, pendingAction),
    isCorrection,
    missingInfo,
    questionKind,
    riskBoundary: writeAllowed ? "用户包含明确写入信号，后续仍需经过 DryRun/确认边界。" : "只读咨询回答，不写入计划、清单、日程或记忆。",
    shouldClarify: false,
    writeAllowed,
  };
};

const evidenceBasis = (frame: AgentCognitiveFrame) =>
  frame.evidence.slice(0, 3).map((item) => `${item.title}：${item.summary}`);

export const buildAgentAnswerPlan = (frame: AgentCognitiveFrame, message: string, pendingAction: null | PendingAction): AgentAnswerPlan => {
  if (frame.questionKind === "learning_path" || frame.questionKind === "study_advice") {
    const subject = selectSubject(message, pendingAction);
    const correctionPrefix = frame.isCorrection ? "按你的纠偏，这次只给路径，不进入计划草稿。" : "先给路径，不进入计划草稿。";

    return {
      basis: evidenceBasis(frame),
      conclusion: `${correctionPrefix}${subject.canonical}应该按“基础诊断 → 主线学习 → 专项训练 → 复盘闭环”推进。`,
      needsClarification: false,
      nextActions: [
        subject.firstAction,
        "完成第一轮诊断后，再决定是否需要拆成可确认的学习计划或清单。",
      ],
      steps: subject.steps,
    };
  }

  if (frame.questionKind === "project_analysis") {
    return {
      basis: evidenceBasis(frame),
      conclusion: `我会把「${frame.goal}」当作项目推进判断，而不是写入动作。优先补齐可评测的认知回答能力，再谈更强自治执行。`,
      needsClarification: false,
      nextActions: [
        "先固定 5-8 个真实问题评测集，确保回答质量可以被回归测试捕捉。",
        "把上下文证据、回答计划和自检结果放进 trace，便于判断 Agent 为什么这样回答。",
      ],
      steps: [
        "先做咨询回答质量：让开放式问题能直接给判断和下一步。",
        "再做上下文证据选择：只引用相关计划、清单和记忆，排除噪音。",
        "然后做回答自检：检查是否过度反问、误写入或答非所问。",
        "最后把通过评测的能力接入 Dashboard 任务流和检查器。",
      ],
    };
  }

  if (frame.questionKind === "decision_support") {
    return {
      basis: evidenceBasis(frame),
      conclusion: `我会先给一个可执行取舍：围绕「${frame.goal}」选择最能降低不确定性的下一步。`,
      needsClarification: false,
      nextActions: [
        "列出两个候选动作的收益、风险和等待成本。",
        "先推进 30-60 分钟能产生可验证结果的那个动作。",
      ],
      steps: [
        "明确判断标准：收益、紧急度、依赖关系、可逆性。",
        "用当前上下文找证据，不凭关键词猜。",
        "选择一个最小行动并设定复盘点。",
      ],
    };
  }

  return {
    basis: evidenceBasis(frame),
    conclusion: `我先直接回答「${frame.goal}」，并保持只读，不写入任何工作台数据。`,
    needsClarification: false,
    nextActions: [
      "先按当前信息给出可执行建议。",
      "如果你需要落地到计划、清单或日程，再单独走确认流程。",
    ],
    steps: [
      "明确目标和约束。",
      "复用已有上下文和记忆。",
      "给出一个最小下一步。",
    ],
  };
};

export const renderAgentAnswerPlan = (plan: AgentAnswerPlan) => {
  const parts = [
    `结论：${plan.conclusion}`,
    plan.basis.length > 0 ? `依据：\n${plan.basis.map((item) => `- ${item}`).join("\n")}` : "依据：当前上下文证据不足，所以先按通用方法给出可执行建议。",
    `建议路径：\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
    `下一步：\n${plan.nextActions.map((action) => `- ${action}`).join("\n")}`,
  ];

  if (plan.needsClarification && plan.clarificationQuestion) {
    parts.push(`需要你补充：${plan.clarificationQuestion}`);
  }

  return parts.join("\n\n");
};

export const parseAgentAnswerPlan = (value: unknown): AgentAnswerPlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  const conclusion = getString(value.conclusion);
  const steps = getStringArray(value.steps, 8);
  const nextActions = getStringArray(value.nextActions, 6);

  if (!conclusion || steps.length === 0 || nextActions.length === 0) {
    return null;
  }

  const needsClarification = value.needsClarification === true;
  const clarificationQuestion = getString(value.clarificationQuestion);

  return {
    basis: getStringArray(value.basis, 6),
    conclusion,
    needsClarification,
    nextActions,
    ...(clarificationQuestion ? { clarificationQuestion } : {}),
    steps,
  };
};

export const checkAgentAnswerQuality = ({
  answer,
  frame,
  plan,
}: {
  answer: string;
  frame: AgentCognitiveFrame;
  plan: AgentAnswerPlan;
}): AgentAnswerQualityCheck => {
  const issues: string[] = [];
  const questionCount = (answer.match(/[？?]/g) ?? []).length;
  const hasDirectAnswer = /(结论|建议|路径|先|优先|下一步|我会)/.test(answer);
  const answeredQuestion = answer.trim().length >= 40 && hasDirectAnswer && !(questionCount >= 2 && !/(结论|建议路径|下一步)/.test(answer));
  const avoidedUnnecessaryClarification = !(questionCount >= 2 && !hasDirectAnswer);
  const respectedWriteBoundary =
    frame.writeAllowed ||
    !/(已创建|已保存|已写入|我会创建|我将创建|确认后写入|DryRun|直接写入)/.test(answer);
  const evidenceAnchors = frame.evidence.flatMap((item) => [
    item.title,
    item.summary.slice(0, 18),
  ]).filter((item) => item.trim().length > 0);
  const groundedBasis =
    plan.basis.length === 0 ||
    frame.evidence.length === 0 ||
    plan.basis.every((basis) => evidenceAnchors.some((anchor) => basis.includes(anchor) || anchor.includes(basis.slice(0, 8))));
  const usedRelevantContext =
    frame.evidence.length === 0 ||
    (groundedBasis && frame.evidence.some((item) => answer.includes(item.title) || answer.includes(item.summary.slice(0, 12))));
  const avoidedUnrelatedContext = groundedBasis && !(!frame.evidence.some((item) => /厨房|收纳/.test(`${item.title}${item.summary}`)) && /厨房|收纳/.test(answer));

  if (!answeredQuestion) {
    issues.push("没有直接回答用户问题。");
  }

  if (!avoidedUnnecessaryClarification) {
    issues.push("存在过度反问，应该先给可执行建议。");
  }

  if (!respectedWriteBoundary) {
    issues.push("只读咨询中出现了写入或确认流程表述。");
  }

  if (!usedRelevantContext) {
    issues.push("没有使用已筛选的相关上下文证据。");
  }

  if (!avoidedUnrelatedContext) {
    issues.push("引用了未被证据选择命中的无关上下文。");
  }

  const score =
    [
      answeredQuestion,
      avoidedUnnecessaryClarification,
      respectedWriteBoundary,
      usedRelevantContext,
      avoidedUnrelatedContext,
    ].filter(Boolean).length / 5;

  return {
    answeredQuestion,
    avoidedUnrelatedContext,
    avoidedUnnecessaryClarification,
    issues,
    respectedWriteBoundary,
    score,
    usedRelevantContext,
  };
};

export const buildCognitiveAdvisoryAnswer = (input: CognitiveAdvisoryInput): CognitiveAdvisoryResult => {
  const frame = buildAgentCognitiveFrame(input);
  const plan = buildAgentAnswerPlan(frame, input.message, input.pendingAction);
  const answer = renderAgentAnswerPlan(plan);
  const quality = checkAgentAnswerQuality({ answer, frame, plan });

  return {
    answer,
    frame,
    plan,
    quality,
  };
};
