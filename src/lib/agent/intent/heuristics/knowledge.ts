import type { AgentIntent } from "../../schemas";
import { cleanupText } from "./shared-text";

const mathTwoSyllabusAnswer = `考研数学二通常考两门：高等数学和线性代数，不考概率论与数理统计。分值结构一般是高等数学约 80%，线性代数约 20%，具体以当年官方考试大纲为准。

高等数学常见章节：
1. 函数、极限、连续
2. 一元函数微分学
3. 一元函数积分学
4. 多元函数微积分学
5. 常微分方程

线性代数常见章节：
1. 行列式
2. 矩阵
3. 向量
4. 线性方程组
5. 矩阵的特征值和特征向量
6. 二次型`;

const isMathTwoSyllabusQuestion = (message: string) => {
  const isMathTwoQuestion = /(考研)?数学\s*(二|2)|考研数\s*(二|2)|数二/.test(message);
  const asksSyllabus =
    message.includes("考哪些") ||
    message.includes("考什么") ||
    message.includes("哪些科目") ||
    message.includes("具体章节") ||
    message.includes("章节") ||
    message.includes("大纲") ||
    message.includes("范围");

  return isMathTwoQuestion && asksSyllabus;
};

export { isMathTwoSyllabusQuestion };

const knownSubjectAliases: Array<{ aliases: string[]; canonical: string; focus: string[]; sequence: string[] }> = [
  {
    aliases: ["线性代数", "线代"],
    canonical: "线性代数",
    focus: ["矩阵运算", "向量组与秩", "线性方程组", "特征值与特征向量", "二次型"],
    sequence: ["矩阵和行列式打底", "用向量组/秩理解方程组", "再进入特征值和二次型", "最后按综合题型串联"],
  },
  {
    aliases: ["高等数学", "高数", "微积分"],
    canonical: "高等数学",
    focus: ["极限与连续", "一元微分", "一元积分", "多元微分积分", "常微分方程"],
    sequence: ["极限和函数性质打底", "微分与积分分开练透", "再做多元和微分方程", "最后用综合题训练建模与计算"],
  },
  {
    aliases: ["信息安全", "网络安全", "网安", "蓝队"],
    canonical: "信息安全",
    focus: ["计算机网络", "Linux 与脚本基础", "Web 安全常识", "日志分析", "应急响应", "检测规则与安全设备"],
    sequence: [
      "先补网络、Linux、HTTP 和基础脚本能力",
      "再理解常见漏洞、攻击链和安全事件生命周期",
      "偏蓝队时重点练日志分析、告警研判、规则编写和应急处置",
      "最后用靶场、真实案例复盘和检测规则沉淀形成闭环",
    ],
  },
];

const learningAdviceQuestionPattern =
  /(参谋|建议|指导|分析|看看|聊聊|说说).{0,12}(学习|复习|备考|入门)|((该|应该|怎么|如何|怎样|咋).{0,8}(学习|学|复习|备考|入门))|((学习|复习|备考|入门).{0,12}(怎么|如何|怎样|建议|参谋))/;
const learningPathQuestionPattern =
  /(?:学习|复习|备考|入门)(?:的)?(?:路径|路线|路线图|顺序)|(?:路径|路线|路线图).{0,8}(?:学习|复习|备考|入门)/;
const generalConsultationQuestionPattern =
  /(参谋一下|参谋|分析一下|评估一下|建议一下|帮我看看|给我看看|聊聊|说说|怎么看|如何判断)|((该|应该|怎么|如何|怎样|咋).{0,16}(做|推进|处理|选择|开始|优化|改进|判断|评估|分析|决策))/;
const writeActionPattern = /(创建|新建|制定|生成|安排到|排进|排入|日程|保存|记住|写入|删除|确认执行|执行一下)/;
const persistentWriteActionPattern = /(创建|新建|安排到|排进|排入|日程|保存|记住|写入|删除|确认执行|执行一下|(?:制定|生成).{0,4}计划)/;

const cleanupLearningSubject = (value: string) => {
  let current = cleanupText(value);
  let previous = "";

  while (current && current !== previous) {
    previous = current;
    current = cleanupText(
      current
        .replace(/^(我想|想|给我|帮我|请你|请|关于|对|为我|给|我)/, "")
        .replace(/^(规划|设计|梳理|整理|制定)(一个|一条)?/, "")
        .replace(/^(一个|一条)/, ""),
    );
  }

  return cleanupText(current.replace(/(这门课|这个学科|课程|科目|方向)$/, ""));
};

const extractLearningSubject = (message: string) => {
  const normalized = cleanupText(message.replace(/\s+/g, ""));

  for (const subject of knownSubjectAliases) {
    if (subject.aliases.some((alias) => normalized.includes(alias))) {
      return subject;
    }
  }

  const candidates = [
    normalized.match(/(?:规划|设计|梳理|整理|给出|制定)(?:一个|一条)?(.+?)(?:的)?(?:学习|复习|备考|入门)(?:的)?(?:路径|路线|路线图)/)?.[1],
    normalized.match(/(.+?)(?:的)?(?:学习|复习|备考|入门)(?:的)?(?:路径|路线|路线图)/)?.[1],
    normalized.match(/(?:给我)?参谋一下(.+?)(?:的)?(?:学习|复习|备考|入门)/)?.[1],
    normalized.match(/(.+?)(?:该|应该)?(?:怎么|如何|怎样|咋)(?:学习|学|复习|备考|入门)/)?.[1],
    normalized.match(/(.+?)(?:的)?(?:学习|复习|备考|入门)(?:建议|方法|路径)/)?.[1],
  ]
    .map((item) => cleanupLearningSubject(item ?? ""))
    .filter(Boolean);

  const subject = candidates[0] ?? "这门学科";

  return {
    aliases: [subject],
    canonical: subject,
    focus: ["核心概念", "基础例题", "高频题型", "错题复盘"],
    sequence: ["先建立知识框架", "再逐章做基础题", "随后按题型专项突破", "最后用错题和小测闭环"],
  };
};

export const isLearningAdviceQuestion = (message: string) =>
  (learningAdviceQuestionPattern.test(message) && !writeActionPattern.test(message)) ||
  (learningPathQuestionPattern.test(message) && !persistentWriteActionPattern.test(message));

const cleanupConsultationTopic = (value: string) =>
  cleanupText(
    value
      .replace(/^(我想|想|给我|帮我|请你|请|关于|对|一下|看看)/, "")
      .replace(/(怎么看|怎么做|怎么办|怎么判断|如何判断|如何推进|如何处理|下一步|给点建议|给个建议|建议|方案|路线|问题)$/, ""),
  );

export const extractConsultationTopic = (message: string) => {
  const normalized = cleanupText(message);
  const candidates = [
    normalized.match(/(?:给我|帮我|请你|请)?(?:参谋一下|参谋|分析一下|评估一下|建议一下|帮我看看|给我看看|聊聊|说说)(.+)/)?.[1],
    normalized.match(/关于(.+?)(?:怎么看|怎么做|怎么办|如何推进|如何处理|给点建议|给个建议|下一步)/)?.[1],
    normalized.match(/(.+?)(?:该|应该)?(?:怎么|如何|怎样|咋)(?:做|推进|处理|选择|开始|优化|改进|判断|评估|分析|决策)/)?.[1],
  ]
    .map((item) => cleanupConsultationTopic(item ?? ""))
    .filter(Boolean);

  return candidates[0] ?? "";
};

export const isGeneralConsultationQuestion = (message: string) => {
  if (writeActionPattern.test(message) || !generalConsultationQuestionPattern.test(message)) {
    return false;
  }

  return extractConsultationTopic(message).length > 0;
};

const buildLearningAdviceAnswer = (subject: ReturnType<typeof extractLearningSubject>) => {
  const focus = subject.focus.join("、");
  const sequence = subject.sequence.map((step, index) => `${index + 1}. ${step}`).join("\n");

  return `${subject.canonical}的学习，我会先给一条路径，而不是直接做成需要日期和验收标准的计划：诊断薄弱点 → 建立主线 → 题型训练 → 复盘迭代。

先做诊断：用 3-5 道基础题确认薄弱点，重点看 ${focus}。如果概念说不清，先回教材/讲义；如果概念懂但题做不动，就优先补例题和变式。

推荐路径：
${sequence}

练习方式：每学完一个小节，立刻做少量基础题；每两到三天做一次混合题；错题不要只抄答案，要记录“卡在概念、计算、转化还是审题”。这样能更快判断下一步该补知识还是加训练量。`;
};

const parseLearningAdviceIntent = (message: string): AgentIntent | null => {
  if (!isLearningAdviceQuestion(message)) {
    return null;
  }

  const subject = extractLearningSubject(message);

  return {
    args: {
      answer: buildLearningAdviceAnswer(subject),
      learningContext: {
        originalMessage: message,
        subject: subject.canonical,
      },
      suggestAction: `如果你愿意，我可以继续把它拆成一份${subject.canonical}学习计划，或者先生成一份复习清单供你确认。`,
    },
    confidence: 0.86,
    intent: "answer_question",
  };
};

export const parseKnowledgeAnswerIntent = (message: string): AgentIntent | null => {
  const learningAdviceIntent = parseLearningAdviceIntent(message);

  if (learningAdviceIntent) {
    return learningAdviceIntent;
  }

  if (!isMathTwoSyllabusQuestion(message)) {
    return null;
  }

  return {
    args: {
      answer: mathTwoSyllabusAnswer,
      suggestAction: "如果你愿意，我可以把这些章节拆成「考研数学二复习清单」。",
    },
    confidence: 0.92,
    intent: "answer_question",
  };
};
