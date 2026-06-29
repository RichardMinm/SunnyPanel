import type { AgentChatMessage, AgentIntent } from "../../schemas";
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
    aliases: ["CTF", "夺旗赛", "capture the flag", "cap the flag"],
    canonical: "CTF（夺旗赛）",
    focus: ["Web", "Reverse", "Pwn", "Crypto", "Misc", "Forensics"],
    sequence: [
      "先选 1-2 个方向入门（常见是 Web + Misc）",
      "用靶场/历年题练基础套路与工具链",
      "再按兴趣扩到 Reverse/Pwn/Crypto",
      "通过战队或 writeup 复盘形成闭环",
    ],
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

const definitionQuestionPattern =
  /^(?:什么是|什么叫|请问什么是)(.+?)[？?]?$|^(.+?)是什么[？?]?$/;

const normalizeDefinitionQuestion = (message: string) =>
  cleanupText(
    message
      .replace(/\s+/g, "")
      .replace(/^(那么|那|所以|另外|还有|顺便|我想问|想问一下|请问)/, "")
      .replace(/[呢吗][？?]?$/, "")
      .replace(/[？?]$/, ""),
  );

const extractDefinitionTopic = (normalized: string) => {
  const topicMatch =
    normalized.match(/^(?:什么是|什么叫|请问什么是)(.+)$/) ??
    normalized.match(/^(.+?)是什么$/);

  return cleanupLearningSubject(topicMatch?.[1] ?? topicMatch?.[2] ?? "");
};

export const lookupKnownSubjectByTopic = (rawTopic: string) => {
  const normalized = cleanupText(rawTopic.replace(/\s+/g, ""));
  const lowered = normalized.toLowerCase();

  for (const subject of knownSubjectAliases) {
    if (subject.aliases.some((alias) => lowered === alias.toLowerCase())) {
      return subject;
    }
  }

  for (const subject of knownSubjectAliases) {
    if (
      subject.aliases.some(
        (alias) =>
          lowered.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lowered),
      )
    ) {
      return subject;
    }
  }

  return null;
};

export const resolveSubjectByTopic = (rawTopic: string) => {
  const known = lookupKnownSubjectByTopic(rawTopic);

  if (known) {
    return known;
  }

  return extractLearningSubject(`${rawTopic}学习`);
};

const subjectTopicKey = (subject: ReturnType<typeof extractLearningSubject>) =>
  `${subject.canonical}${subject.aliases.join("")}`;

export const isElaborationFollowupRequest = (message: string) =>
  /(更加详细|更详细|详细一点|详细些|详细一些|展开说说|展开讲|展开一下|多说一点|多说一些|深入一点|再详细|补充细节|能不能细说|继续讲|接着说|讲细一点|具体一点)/.test(
    cleanupText(message.replace(/\s+/g, "")),
  );

export const buildExpandedDefinitionAnswer = (subject: ReturnType<typeof extractLearningSubject>) => {
  const topicKey = subjectTopicKey(subject);

  if (/信息安全|网络安全|网安|蓝队/.test(topicKey)) {
    return `${subject.canonical}（日常也称网络安全 / 网安 / 蓝队）是一套围绕「保护信息系统与数据」展开的目标、原则与实践。下面按更细的层次展开：

**1. 核心目标（CIA 及扩展）**
- 机密性：未授权者不能读；常见手段包括加密、访问控制、最小权限。
- 完整性：数据与系统不被未授权篡改；常见手段包括哈希校验、签名、变更审计。
- 可用性：授权用户在需要时能访问；常见手段包括冗余、备份、容灾、DDoS 防护。
- 扩展目标：可审计（留痕可追溯）、可恢复（备份与演练）、合规（等保、ISO 27001 等框架）。

**2. 三层能力模型（更细）**
- 基础层：TCP/IP、HTTP/DNS、Linux/Windows 基础、常见服务（Nginx/数据库）、日志格式（access/error/syslog）。
- 威胁层：漏洞利用链、钓鱼/社工、权限提升、横向移动、C2、数据渗出；对应 MITRE ATT&CK 等框架。
- 治理层：资产清单、风险分级、策略与流程、人员培训、漏洞管理周期、事件响应 playbook、合规审计。

**3. 蓝队日常在做什么**
- 监控与告警研判：SIEM/SOC、规则调优、误报治理。
- 日志分析与溯源：从单点告警还原攻击链。
- 应急响应：隔离、取证、根除、恢复、复盘报告。
- 预防性工作：基线加固、补丁管理、钓鱼演练、检测规则沉淀。

**4. 与 CTF / 红队的区别**
- CTF 偏解题与技巧训练；红队偏模拟真实攻击；蓝队偏检测、响应与治理。三者互补，不是替代关系。

如果你想继续，我可以按「怎么学 / 蓝队入门路径」展开；若要落成计划或清单，请明确说「帮我制定计划」。`;
  }

  if (/ctf|夺旗|capture the flag|cap the flag/i.test(topicKey)) {
    return `${subject.canonical} 的更完整说明如下：

**1. 两种主流赛制**
- Jeopardy（解题赛）：按类别独立题目，做出一题得一 flag，常见类别即 Web / Reverse / Pwn / Crypto / Misc / Forensics。
- Attack-Defense（攻防赛）：每队维护同款服务，既要防守自家服务，也要攻击别队拿 flag；强调运维、加固与现场排查。

**2. 各方向在练什么**
- Web：HTTP、鉴权、注入、SSRF、文件上传、逻辑漏洞；工具如 Burp Suite。
- Reverse：逆向二进制/移动端，识别算法与 patch；工具如 IDA/Ghidra。
- Pwn：栈/堆溢出、ROP、沙箱绕过；需要 C 与汇编基础。
- Crypto：古典/现代密码误用、RSA/AES 实现漏洞；需要数学与编码功底。
- Misc：杂项与脑洞题，常考编码、隐写、流量分析、OSINT。
- Forensics：磁盘/内存/流量取证，重建攻击时间线。

**3. 典型训练闭环**
- 选 1–2 个方向入门（Web + Misc 最常见）→ 靶场（如 BUUCTF、NSS、HackTheBox 等）→ 读 writeup 对照思路 → 战队或社群复盘 → 再扩方向。

**4. 常见误区**
- 只刷题不复盘：没有 writeup 对照，很难形成可迁移的方法论。
- 过早 All-in Pwn/Reverse：基础网络与 Linux 不牢会很痛苦。
- 把 CTF 技巧直接当生产安全：赛场环境与真实企业攻防仍有差距。

如果你接下来想「怎么学 / 怎么规划路径」，我可以继续按学习路径回答；若要拆成计划或清单，请明确说「帮我制定计划」。`;
  }

  return `${subject.canonical} 的更详细框架如下：

**1. 它解决什么问题**
- 目标人群、典型应用场景，以及「学会它」后你能做什么。

**2. 核心模块（对应关键词：${subject.focus.join("、")}）**
- 每个模块用一句话说明「学什么」和「怎么验证学会了」（小练习/小项目）。

**3. 常见学习顺序**
${subject.sequence.map((step, index) => `- ${index + 1}. ${step}`).join("\n")}

**4. 如何检验进度**
- 能否用自己的话解释核心概念；
- 能否独立完成 1–2 个代表性练习；
- 错题/卡点是否被分类记录（概念 / 计算 / 转化 / 审题）。

若要落成可执行计划或复习清单，请明确说「帮我制定计划」。`;
};

export const buildDefinitionAnswer = (subject: ReturnType<typeof extractLearningSubject>) => {
  const topicKey = subjectTopicKey(subject);

  if (/信息安全|网络安全|网安|蓝队/.test(topicKey)) {
    const focus = subject.focus.slice(0, 4).join("、");

    return `${subject.canonical}是保护信息系统与数据在机密性、完整性、可用性（以及可审计、可恢复等扩展目标）上不受损害的一组目标、原则与实践。日常语境里「网络安全 / 网安 / 蓝队」通常都落在这个大框架下。

你可以把它理解成三层：
1. 基础层：网络、系统、协议与应用如何工作（例如 ${focus}）。
2. 威胁层：攻击者如何入侵、驻留、横向移动，以及事件如何被检测与响应。
3. 治理层：策略、流程、人和工具如何协同，把风险控制在可接受范围。

如果接下来你想「怎么学 / 怎么入门 / 怎么规划路径」，我可以按学习路径回答；如果你想把这些拆成可执行计划或清单，再明确说「帮我制定计划」即可。`;
  }

  if (/ctf|夺旗|capture the flag|cap the flag/i.test(topicKey)) {
    return `${subject.canonical}是信息安全领域的实战竞赛形式：参赛者在授权环境中通过解题（Jeopardy）或攻防对抗（Attack-Defense）获取 flag（一串证明成功的标记）。

常见方向包括 ${subject.focus.join("、")}。它强调在真实约束下综合运用知识、工具与排查能力，而不是背单一概念。

入门路径通常是：先选 1-2 个方向（Web/Misc 较常见）→ 靶场与历年题练套路 → 按兴趣扩展到 Reverse/Pwn/Crypto → 用 writeup 和战队复盘闭环。

如果你接下来想「怎么学 / 怎么规划路径」，我可以继续按学习路径回答；若要拆成计划或清单，请明确说「帮我制定计划」。`;
  }

  return `${subject.canonical}是一个需要先界定语境的概念：它通常指一组相互关联的知识、方法与实践，而不是单一知识点。

我会先用三句话帮你建立框架：
1. 它解决什么问题（目标与应用场景）。
2. 它的核心组成部分是什么（常见模块或关键词：${subject.focus.slice(0, 4).join("、")}）。
3. 初学者通常从哪里切入（先概念、再例题、再综合应用）。

如果你接下来想深入「怎么学 / 学习路径 / 复习规划」，可以直接继续问；若要落成计划或清单，请明确说「帮我制定计划」。`;
};

export const parseDefinitionQuestionIntent = (message: string): AgentIntent | null => {
  const normalized = normalizeDefinitionQuestion(message);

  if (!definitionQuestionPattern.test(normalized) || writeActionPattern.test(normalized)) {
    return null;
  }

  const rawTopic = extractDefinitionTopic(normalized);

  if (!rawTopic) {
    return null;
  }

  const knownSubject = lookupKnownSubjectByTopic(rawTopic);

  if (!knownSubject) {
    return {
      args: {
        answer: "",
        openDomainTopic: rawTopic,
        suggestAction: null,
      },
      confidence: 0.75,
      intent: "answer_question",
    };
  }

  return {
    args: {
      answer: buildDefinitionAnswer(knownSubject),
      learningContext: {
        originalMessage: message,
        subject: knownSubject.canonical,
      },
      suggestAction: `如果你愿意，我可以继续给出${knownSubject.canonical}的学习路径，或帮你拆成复习清单。`,
    },
    confidence: 0.9,
    intent: "answer_question",
  };
};

export const inferTopicFromConversationHistory = (history: AgentChatMessage[]) => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.role !== "user") {
      continue;
    }

    const definitionIntent = parseDefinitionQuestionIntent(entry.content);

    if (
      definitionIntent?.intent === "answer_question" &&
      definitionIntent.args.learningContext?.subject
    ) {
      return definitionIntent.args.learningContext.subject;
    }

    const normalized = normalizeDefinitionQuestion(entry.content);
    const rawTopic = extractDefinitionTopic(normalized);

    if (rawTopic) {
      return resolveSubjectByTopic(rawTopic).canonical;
    }
  }

  const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant")?.content ?? "";

  if (/ctf|夺旗/i.test(lastAssistant)) {
    return "CTF（夺旗赛）";
  }

  if (/信息安全|网络安全|网安|蓝队/.test(lastAssistant)) {
    return "信息安全";
  }

  return null;
};

export const buildElaborationAnswerIntent = (
  message: string,
  subjectCanonical: string,
  originalMessage?: string,
): AgentIntent => {
  const subject = resolveSubjectByTopic(subjectCanonical);

  return {
    args: {
      answer: buildExpandedDefinitionAnswer(subject),
      learningContext: {
        originalMessage: originalMessage ?? message,
        subject: subject.canonical,
      },
      suggestAction: `如果你还想了解${subject.canonical}的学习路径，可以直接说「怎么学」。`,
    },
    confidence: 0.92,
    intent: "answer_question",
  };
};

export const parseElaborationFollowupIntent = (
  message: string,
  history: AgentChatMessage[] = [],
): AgentIntent | null => {
  if (!isElaborationFollowupRequest(message)) {
    return null;
  }

  const subjectCanonical = inferTopicFromConversationHistory(history);

  if (!subjectCanonical) {
    return null;
  }

  return buildElaborationAnswerIntent(message, subjectCanonical);
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
  const definitionIntent = parseDefinitionQuestionIntent(message);

  if (definitionIntent) {
    return definitionIntent;
  }

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
