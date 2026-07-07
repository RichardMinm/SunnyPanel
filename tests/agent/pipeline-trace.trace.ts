/**
 * Agent pipeline trace report generator (diagnostic only — not a CI gate).
 *
 * Scope:
 * - Multi-turn context resolution is simulated (regex), not chat-pipeline.
 * - Write-intent tool info comes from tool-registry; read intents use context + response.
 * - agent-test-cases.json mustCallTools may still reference legacy tool names.
 *
 * Run: npm run test:agent:trace
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const collectHeuristicCandidates = (_msg: string) => [] as Array<{intent: {intent: string, confidence?: number, args: Record<string, unknown>}, source: string}>;
import { resolveUnifiedIntent } from "../../src/lib/agent/intent/llm-unified";
import { getAgentModelConfig } from "../../src/lib/agent/client";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { createClarifyIntent } from "../../src/lib/agent/schemas";
import type { AgentIntent } from "../../src/lib/agent/schemas";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";

const traceDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(traceDir, "../..");
const casesPath = path.join(repoRoot, "tests/agent-test-cases.json");
const outFile = path.join(repoRoot, ".cursor/agent-pipeline-traces.txt");

const cases: Array<{
  id: string;
  category: string;
  description: string;
  seedData: Record<string, unknown[]>;
  userInput: string | string[];
  expected: Record<string, unknown>;
}> = JSON.parse(readFileSync(casesPath, "utf8"));

const LLM_ENABLED = process.env.AGENT_DISABLE_LLM !== "1";

type ModelDebug = { apiKey: boolean; baseUrl: string; model: string; provider: string };

async function loadModelDebug(): Promise<ModelDebug> {
  if (!LLM_ENABLED) {
    return { apiKey: false, baseUrl: "", model: "", provider: "" };
  }
  try {
    const cfg = await getAgentModelConfig();
    return {
      apiKey: !!cfg?.apiKey,
      baseUrl: cfg?.baseUrl || "N/A",
      model: cfg?.model || "N/A",
      provider: cfg?.provider || "env-only",
    };
  } catch (e) {
    return { apiKey: false, baseUrl: "ERROR", model: "ERROR", provider: String(e).slice(0, 100) };
  }
}

function mapTimelineEvents(seedData: Record<string, unknown[]>) {
  const events = (seedData.timelineEvents as Array<Record<string, unknown>> | undefined) ?? [];
  return events.map((event, index) => ({
    eventDate: (event.date as string) || (event.eventDate as string) || "",
    id: (event.id as number) || index + 1,
    isFeatured: Boolean(event.isFeatured),
    relatedContent: (event.relatedContent as string | null) ?? null,
    status: (event.status as string) || "published",
    title: (event.title as string) || "",
    type: (event.type as string) || "project",
    visibility: (event.visibility as string) || "public",
  }));
}

/** Schedules are not on AgentPromptContext; expose them as timeline nodes for LLM routing. */
function mapSchedulesAsTimeline(seedData: Record<string, unknown[]>) {
  const schedules = (seedData.schedules as Array<Record<string, unknown>> | undefined) ?? [];
  return schedules.map((item, index) => {
    const start = (item.startTime as string) || "";
    const end = (item.endTime as string) || "";
    const timeRange = start && end ? `${start}-${end}` : start || null;
    return {
      eventDate: (item.date as string) || "",
      id: (item.id as number) || 1000 + index,
      isFeatured: false,
      relatedContent: timeRange,
      status: (item.status as string) || "planned",
      title: (item.title as string) || "",
      type: "schedule",
      visibility: "private",
    };
  });
}

function buildContext(seedData: Record<string, unknown[]>): AgentPromptContext {
  return {
    checklists: ((seedData.checklists as Array<Record<string, unknown>>) || []).map((c) => ({
      groups: ((c.groups as Array<Record<string, unknown>>) || []).map((g) => ({
        items: ((g.items as Array<Record<string, unknown>>) || []).map(
          (i) => (i.title as string) || "",
        ),
        title: (g.title as string) || "",
      })),
      title: (c.title as string) || "",
    })),
    plans: ((seedData.plans as Array<Record<string, unknown>>) || []).map((p) => ({
      priority: (p.priority as string) || "medium",
      state: (p.state as string) || "active",
      title: (p.title as string) || "",
    })),
    now: new Date().toISOString(),
    pendingAction: null,
    memories: ((seedData.memories as Array<Record<string, unknown>>) || []).map((m) => ({
      content: (m.content as string) || (m.title as string) || "",
      id: (m.id as number) || 0,
      title: (m.title as string) || "",
      type: "fact" as const,
      confidence: 0.8,
      lastUsedAt: null as string | null,
    })),
    timelineEvents: [...mapTimelineEvents(seedData), ...mapSchedulesAsTimeline(seedData)],
  };
}

type ToolInfo = {
  tools: string[];
  phase: string;
  requiresConfirmation: boolean;
  writeRequired: boolean;
  riskLevel: string;
};

const READ_RESPONSE_INTENTS = new Set([
  "answer_question",
  "capability_query",
  "query_schedule",
  "query_plan",
  "query_checklist_progress",
  "query_timeline",
  "query_memory",
  "query_progress",
  "evaluate_plan",
]);

function getIntentToolInfo(intent: string): ToolInfo {
  if (intent === "clarify") {
    return {
      tools: [],
      phase: "arbitration",
      requiresConfirmation: false,
      writeRequired: false,
      riskLevel: "none",
    };
  }

  const def = getAgentToolDefinition(intent as AgentIntent["intent"]);
  if (def) {
    return {
      tools: [def.name],
      phase: "dry_run",
      requiresConfirmation: def.requiresConfirmation ?? true,
      writeRequired: true,
      riskLevel: def.riskLevel ?? "medium",
    };
  }

  if (READ_RESPONSE_INTENTS.has(intent)) {
    return {
      tools: ["context_lookup", "generate_answer"],
      phase: "response",
      requiresConfirmation: false,
      writeRequired: false,
      riskLevel: "none",
    };
  }

  return {
    tools: [],
    phase: "response",
    requiresConfirmation: false,
    writeRequired: false,
    riskLevel: "none",
  };
}

const SEED_TO_ENTITY: Record<string, string> = {
  plans: "plan",
  schedules: "schedule",
  checklists: "checklist",
  timelineEvents: "timeline",
  memories: "memory",
};

type ResolverResult = {
  resolution: "not_found" | "multiple" | "unique" | "skipped";
  dryRunAllowed: boolean;
  matchedEntities: Array<{ id: number; title: string; type: string }>;
};

function resolveTarget(
  seedData: Record<string, unknown[]>,
  entityName: string,
  entityType: string,
): ResolverResult {
  if (!entityName || entityName.length < 2) {
    return { resolution: "not_found", dryRunAllowed: false, matchedEntities: [] };
  }
  const key = Object.keys(seedData).find((k) => SEED_TO_ENTITY[k] === entityType);
  if (!key) {
    return { resolution: "not_found", dryRunAllowed: false, matchedEntities: [] };
  }
  const items = (seedData[key] as Array<Record<string, unknown>>) || [];
  const matches = items
    .filter((item) => {
      const title = (item.title as string) || "";
      return title.includes(entityName) || entityName.includes(title);
    })
    .map((item, i) => ({
      id: (item.id as number) || i + 1,
      title: (item.title as string) || "",
      type: entityType,
    }));

  if (matches.length === 0) return { resolution: "not_found", dryRunAllowed: false, matchedEntities: [] };
  if (matches.length === 1) return { resolution: "unique", dryRunAllowed: true, matchedEntities: matches };
  return { resolution: "multiple", dryRunAllowed: false, matchedEntities: matches };
}

type ToolPlan = {
  searchTools: string[];
  writeTools: string[];
  allTools: string[];
};

function buildToolPlan(intent: string, isWrite: boolean): ToolPlan {
  const plan: ToolPlan = { searchTools: [], writeTools: [], allTools: [] };
  if (intent === "clarify") return plan;

  const def = getAgentToolDefinition(intent as AgentIntent["intent"]);
  if (def) {
    plan.writeTools = [def.name];
    plan.allTools = [def.name];
    return plan;
  }

  if (!isWrite) {
    plan.searchTools = ["context_lookup"];
    plan.allTools = ["context_lookup", "generate_answer"];
  }
  return plan;
}

function detectMixedIntent(message: string): string | null {
  const hasQuery = /(查看|帮我查|看一下|看下|有哪些|有什么)/.test(message);
  const hasDelete = /(删除|删了|删掉|不重要的.*删)/.test(message);
  if (hasQuery && hasDelete) return "mixed_query_delete";
  return null;
}

async function traceTestCase(tc: (typeof cases)[0]): Promise<string> {
  const input = Array.isArray(tc.userInput) ? tc.userInput[tc.userInput.length - 1] : tc.userInput;
  let out = "";

  out += "═".repeat(90) + "\n";
  out += `  ${tc.id}  [${tc.category}]\n`;
  out += `  描述: ${tc.description}\n`;
  out += "═".repeat(90) + "\n\n";

  const seedKeys = Object.keys(tc.seedData);
  if (seedKeys.length > 0) {
    out += "  📦 种子数据:\n";
    for (const key of seedKeys) {
      const items = tc.seedData[key] as Array<Record<string, unknown>>;
      out += `     ${key} (${items.length} 条):\n`;
      for (const item of items) {
        const title = (item.title as string) || JSON.stringify(item).slice(0, 60);
        out += `       - ${title}\n`;
      }
    }
    out += "\n";
  }

  type EntityRef = { id: number; title: string; type: string };
  type TurnContext = {
    entities: EntityRef[];
    entityType: string;
    lastDate: string | null;
    lastIntent: string | null;
  };
  const turnContext: TurnContext = { entities: [], entityType: "plan", lastDate: null, lastIntent: null };

  if (Array.isArray(tc.userInput) && tc.userInput.length > 1) {
    out += "  💬 多轮对话 (simulated — not chat-pipeline):\n";

    for (let i = 0; i < tc.userInput.length; i++) {
      const turnInput = tc.userInput[i];
      out += `  ── 轮次 ${i + 1}: "${turnInput}" ──\n`;

      if (i > 0) {
        let resolvedInput = turnInput;

        if (turnContext.entities.length === 1 && /它|这个|那个|刚才那个/.test(turnInput)) {
          const ref = turnContext.entities[0];
          resolvedInput = turnInput.replace(/它|这个|那个|刚才那个|第一个/g, `「${ref.title}」(#${ref.id})`);
          out += `  ↳ 实体引用: "${turnInput}" → "${resolvedInput}" (→ #${ref.id} ${ref.title})\n`;
        } else if (turnContext.entities.length > 1 && /第一个/.test(turnInput)) {
          const ref = turnContext.entities[0];
          resolvedInput = turnInput.replace(/第一个/g, `「${ref.title}」(#${ref.id})`);
          out += `  ↳ 序数引用: "第一个" → #${ref.id} "${ref.title}"\n`;
        }

        if (/再帮|再把/.test(turnInput) && turnContext.entities.length > 0) {
          const ref = turnContext.entities[0];
          const prefix = turnContext.lastDate ? `${turnContext.lastDate} ` : "";
          resolvedInput = `${prefix}${turnInput.replace(/再帮|再把/, (m) => m.replace("再", ""))}「${ref.title}」(#${ref.id})`;
          out += `  ↳ 上下文继承: #${ref.id} "${ref.title}"\n`;
        }

        if (turnContext.lastDate && /早上|下午|晚上/.test(turnInput) && !/(今天|明天|\d+月)/.test(turnInput)) {
          resolvedInput = `${turnContext.lastDate} ${resolvedInput}`;
          out += `  ↳ 日期继承: +"${turnContext.lastDate}"\n`;
        }

        if (resolvedInput !== turnInput) {
          out += `  ↳ 解析后输入: "${resolvedInput}"\n`;
        }
        out += "\n";

        const turnCandidates = collectHeuristicCandidates(resolvedInput);
        const turnBest = turnCandidates.length > 0 ? turnCandidates[0].intent : createClarifyIntent("");
        const turnArgs = turnBest.args as Record<string, unknown> | undefined;

        out += `  → 意图: ${turnBest.intent} (${((turnBest.confidence ?? 0) * 100).toFixed(0)}%)\n`;

        if (turnArgs?.entityName) {
          const result = resolveTarget(tc.seedData, turnArgs.entityName as string, turnContext.entityType);
          turnContext.entities = result.matchedEntities;
          turnContext.entityType = (turnArgs.entityType as string) || turnContext.entityType;
        }
        if (turnBest.intent === "query_schedule" || turnBest.intent === "compose_schedule_item") {
          const dateMatch = resolvedInput.match(/(今天|明天|后天|\d+月\d+[号日]|\d+月\d+)/);
          if (dateMatch) turnContext.lastDate = dateMatch[1];
        }
        turnContext.lastIntent = turnBest.intent;
      } else {
        const firstCandidates = collectHeuristicCandidates(turnInput);
        const firstBest = firstCandidates.length > 0 ? firstCandidates[0].intent : createClarifyIntent("");
        const firstArgs = firstBest.args as Record<string, unknown> | undefined;

        out += `  → 意图: ${firstBest.intent} (${((firstBest.confidence ?? 0) * 100).toFixed(0)}%)\n\n`;

        if (firstArgs?.entityName) {
          const etype = (firstArgs.entityType as string) || "plan";
          const result = resolveTarget(tc.seedData, firstArgs.entityName as string, etype);
          turnContext.entities = result.matchedEntities;
          turnContext.entityType = etype;
        } else {
          const nameMatch = turnInput.match(/「(.+?)」|"(.+?)"/);
          if (nameMatch) {
            const name = nameMatch[1] || nameMatch[2] || "";
            const result = resolveTarget(tc.seedData, name, "plan");
            if (result.matchedEntities.length > 0) {
              turnContext.entities = result.matchedEntities;
              turnContext.entityType = result.matchedEntities[0].type;
            }
          }
        }

        const dateMatch = turnInput.match(/(今天|明天|后天|\d+月\d+[号日]|\d+月\d+)/);
        if (dateMatch) turnContext.lastDate = dateMatch[1];
        turnContext.lastIntent = firstBest.intent;
      }
    }

    out += "\n";
  }

  let finalInput = input;
  if (Array.isArray(tc.userInput) && tc.userInput.length > 1) {
    let resolved = input;
    if (turnContext.entities.length === 1 && /它|这个|那个|刚才那个/.test(input)) {
      const ref = turnContext.entities[0];
      resolved = input.replace(/它|这个|那个|刚才那个/g, `「${ref.title}」(#${ref.id})`);
    } else if (turnContext.entities.length > 1 && /第一个/.test(input)) {
      const ref = turnContext.entities[0];
      resolved = input.replace(/第一个/g, `「${ref.title}」(#${ref.id})`);
    }
    if (turnContext.lastDate && /早上|下午|晚上/.test(input) && !/(今天|明天|\d+月)/.test(input)) {
      resolved = `${turnContext.lastDate} ${resolved}`;
    }
    if (/再帮|再把/.test(input) && turnContext.entities.length > 0) {
      const ref = turnContext.entities[0];
      const prefix = turnContext.lastDate ? `${turnContext.lastDate} ` : "";
      resolved = `${prefix}${input.replace(/再帮|再把/, (m: string) => m.replace("再", ""))}「${ref.title}」(#${ref.id})`;
    }
    if (resolved !== input) finalInput = resolved;
  }

  out += `  🔍 最终输入${finalInput !== input ? "(多轮上下文解析后)" : ""}: "${finalInput}"\n\n`;

  const ctx = buildContext(tc.seedData);
  let llmResult: Awaited<ReturnType<typeof resolveUnifiedIntent>> | null = null;
  let llmError: string | null = null;
  let llmTiming = 0;

  if (LLM_ENABLED) {
    const t0 = Date.now();
    try {
      llmResult = await resolveUnifiedIntent({
        context: ctx,
        history: [],
        message: finalInput,
        pendingAction: null,
      });
      llmTiming = Date.now() - t0;
    } catch (e) {
      llmError = String(e);
      llmTiming = Date.now() - t0;
    }
  }

  const candidates = collectHeuristicCandidates(finalInput);
  const heuristicBest = candidates.length > 0 ? candidates[0].intent : createClarifyIntent("无法识别");

  const chosenIntent = llmResult?.intent?.intent || heuristicBest.intent;
  const chosenArgs = llmResult?.intent?.args || heuristicBest.args;
  const chosenEngine = llmResult?.engine || "heuristic";
  const tokenUsage = llmResult?.tokenUsage;
  const toolInfo = getIntentToolInfo(chosenIntent);
  const args = chosenArgs as Record<string, unknown> | undefined;
  const entityType = (args?.entityType as string) || "plan";

  out += `  ══ 1. LLM Router ${LLM_ENABLED ? "(LLM优先)" : "(heuristic only)"} ══\n`;

  if (LLM_ENABLED) {
    out += `  ⏱  耗时: ${llmTiming}ms\n`;
    if (llmResult) {
      out += `  🤖 引擎: ${chosenEngine === "model" ? "✅ LLM (model)" : chosenEngine === "heuristic" ? "⚠️ 降级到启发式" : chosenEngine}\n`;
      out += `  🤖 意图: ${chosenIntent} (${((llmResult.intent.confidence ?? 0) * 100).toFixed(0)}%)\n`;
      if (tokenUsage && tokenUsage.totalTokens) {
        out += `  🤖 Token: ${tokenUsage.totalTokens} (入${tokenUsage.inputTokens || "?"} 出${tokenUsage.outputTokens || "?"})\n`;
      }
      out += `  🤖 仲裁: route=${llmResult.arbitration.route} reason="${llmResult.arbitration.reason}"\n`;
      if (llmResult.arbitration.requiresWrite !== undefined) {
        out += `  🤖 需写入: ${llmResult.arbitration.requiresWrite}\n`;
      }
    } else if (llmError) {
      const short = llmError.length > 150 ? llmError.slice(0, 150) + "..." : llmError;
      out += `  ❌ LLM 失败 (${llmTiming}ms): ${short}\n`;
      out += `  → 降级到启发式规则\n`;
    } else {
      out += `  ⚠️  LLM 未返回结果 (${llmTiming}ms)\n`;
      out += `  → 降级到启发式规则\n`;
    }
  }

  out += `  📋 启发式候选 (${candidates.length} 条):\n`;
  if (candidates.length === 0) {
    out += `     → 未匹配任何规则\n`;
  } else {
    for (let i = 0; i < Math.min(candidates.length, 5); i++) {
      const c = candidates[i];
      const isSelected = !llmResult && i === 0;
      out += `  ${isSelected ? "★" : " "} ${c.intent.intent} (${((c.intent.confidence ?? 0) * 100).toFixed(0)}%) ← ${c.source}\n`;
      if (i === 0 && c.intent.args && Object.keys(c.intent.args).length > 0) {
        for (const [k, v] of Object.entries(c.intent.args)) {
          if (v) out += `        ${k}: ${String(v).slice(0, 80)}\n`;
        }
      }
    }
  }
  out += `  → 最终选中: ${chosenIntent} (来源: ${chosenEngine})\n\n`;

  out += "  ══ 2. Policy Guard ══\n";
  const isWrite = toolInfo.writeRequired;
  const needsConfirm = toolInfo.requiresConfirmation;
  out += `  isWriteIntent: ${isWrite ? "YES" : "NO"}\n`;
  out += `  riskLevel: ${toolInfo.riskLevel}\n`;
  out += `  requiresConfirmation: ${needsConfirm ? "YES" : "NO"}\n`;
  if (isWrite && !needsConfirm) out += `  ⚠️  WRITE WITHOUT CONFIRMATION\n`;
  out += "\n";

  const isCreate = /^(create_|compose_|save_memory)/.test(chosenIntent);
  const isModify = chosenIntent === "modify_record";
  const isDelete = chosenIntent === "delete_record" || chosenIntent === "cancel_schedule_item";

  const needsTarget = isModify || isDelete;
  let resolverResult: ResolverResult = { resolution: "skipped", dryRunAllowed: true, matchedEntities: [] };

  if (needsTarget) {
    const entityName = (args?.entityName as string) || "";
    resolverResult = resolveTarget(tc.seedData, entityName, entityType);

    out += "  ══ 3. Target Resolver ══\n";
    out += `  entityName: "${entityName || "N/A"}"\n`;
    out += `  entityType: ${entityType}\n`;
    out += `  resolution: ${resolverResult.resolution}`;
    if (resolverResult.resolution === "unique") {
      out += ` → #${resolverResult.matchedEntities[0].id} "${resolverResult.matchedEntities[0].title}"`;
    } else if (resolverResult.resolution === "multiple") {
      out += ` (${resolverResult.matchedEntities.length} 个匹配: ${resolverResult.matchedEntities.map((e) => `#${e.id}`).join(", ")})`;
    }
    out += "\n";
    out += `  dryRunAllowed: ${resolverResult.dryRunAllowed ? "YES" : "⛔ NO"}\n`;
    if (!resolverResult.dryRunAllowed) {
      const reason =
        resolverResult.resolution === "not_found"
          ? "未找到目标实体"
          : resolverResult.resolution === "multiple"
            ? "目标不唯一，需用户选择"
            : "";
      out += `  → ${reason}\n`;
    }
    out += "\n";
  }

  const toolPlan = buildToolPlan(chosenIntent, isWrite);

  out += "  ══ 4. Tool Dispatcher (tool-registry) ══\n";
  out += `  operation: ${isCreate ? "create" : isModify ? "update" : isDelete ? "delete" : "read"}\n`;
  if (toolPlan.searchTools.length > 0) out += `  plannedSearch: [${toolPlan.searchTools.join(", ")}]\n`;
  if (toolPlan.writeTools.length > 0) out += `  plannedWrite:  [${toolPlan.writeTools.join(", ")}]\n`;
  out += `  plannedTools:  [${toolPlan.allTools.join(", ") || "无"}]\n`;
  out += `  registryTools: [${toolInfo.tools.join(", ") || "无"}]\n`;

  const registryTools = toolInfo.tools;
  const toolMismatch =
    toolPlan.allTools.length > 0 &&
    (toolPlan.allTools.length !== registryTools.length ||
      !toolPlan.allTools.every((t) => registryTools.includes(t)));
  if (toolMismatch && toolPlan.allTools.length > 0) {
    out += `  ⚠️  TOOL MISMATCH: planned ≠ registry\n`;
  }
  out += "\n";

  const mixedIntent = detectMixedIntent(finalInput);
  if (mixedIntent) {
    out += `  🔀 混合意图检测: ${mixedIntent}\n`;
    out += `  → 应拆分为独立意图分别确认\n\n`;
  }

  out += "  ══ 5. Final Workflow ══\n";
  if (isWrite && needsTarget && !resolverResult.dryRunAllowed) {
    out += `  ⛔ BLOCKED: Target Resolver returned ${resolverResult.resolution}\n`;
    out += `  → 必须先解决目标定位，禁止进入 dry_run\n`;
  } else if (isWrite) {
    out += `  ${chosenIntent} → dry_run → confirmation → ${toolPlan.writeTools.join(" → ") || chosenIntent}\n`;
  } else if (chosenIntent === "clarify") {
    out += `  clarify → ask user for more info\n`;
  } else {
    out += `  ${chosenIntent} → ${toolPlan.allTools.join(" → ")}\n`;
  }
  out += "\n";

  out += "  ── 预期 vs 实际校验 ──\n";
  const exp = tc.expected;

  const expIntent = exp.intent as string | null;
  if (expIntent) {
    const match = chosenIntent === expIntent;
    out += `  意图: 预期=${expIntent} 实际=${chosenIntent} ${match ? "✅" : "⚠️"}\n`;
  }

  const expConfirm = exp.requiresConfirmation as boolean;
  const actualConfirm = toolInfo.requiresConfirmation;
  out += `  确认: 预期=${expConfirm} 实际=${actualConfirm} ${expConfirm === actualConfirm ? "✅" : "⚠️"}\n`;

  const expWrite = exp.writeRequired as boolean;
  const actualWrite = toolInfo.writeRequired;
  out += `  写入: 预期=${expWrite} 实际=${actualWrite} ${expWrite === actualWrite ? "✅" : "⚠️"}\n`;

  const expTools = (exp.mustCallTools as string[]) || [];
  if (expTools.length > 0) {
    const covered = expTools.filter((t) => toolPlan.allTools.includes(t));
    const missing = expTools.filter((t) => !toolPlan.allTools.includes(t));
    out += `  工具计划: 预期=[${expTools.join(",")}] 计划=[${toolPlan.allTools.join(",")}]\n`;
    if (covered.length > 0) out += `    已覆盖: ${covered.join(", ")} ✅\n`;
    if (missing.length > 0) {
      out += `    未覆盖: ${missing.join(", ")} ⚠️ (legacy names in test JSON)\n`;
    }
  }

  if (toolMismatch && toolPlan.allTools.length > 0) {
    out += `  ⛔ 工具计划不一致: plannedTools≠registryTools\n`;
  }

  const forbiddenTools = (exp.mustNotCallTools as string[]) || [];
  const violations = forbiddenTools.filter((t) => toolPlan.allTools.includes(t));
  if (violations.length > 0) {
    out += `  ⛔ 禁止工具违规: ${violations.join(", ")}\n`;
  } else if (forbiddenTools.length > 0) {
    out += `  禁止工具检查: 通过 ✅\n`;
  }

  if (exp.forbiddenBehavior) {
    out += `  🛡️  禁止行为: ${exp.forbiddenBehavior}\n`;
  }

  out += "\n\n";
  return out;
}

test("GENERATE PIPELINE TRACES", async () => {
  mkdirSync(path.dirname(outFile), { recursive: true });

  const modelDebug = await loadModelDebug();

  let header = "";
  header += "╔" + "═".repeat(88) + "╗\n";
  header += "║  SunnyPanel Agent — 完整流水线追踪报告 (diagnostic, not CI gate)" + " ".repeat(18) + "║\n";
  header += "║  多轮上下文: simulated regex | 写入工具: tool-registry | 读: context+response" + " ".repeat(5) + "║\n";
  header += "║  执行时间: " + new Date().toISOString() + " ".repeat(39) + "║\n";
  header += `║  LLM: ${LLM_ENABLED ? "已启用" : "已禁用"}`.padEnd(89) + "║\n";
  if (LLM_ENABLED) {
    header += `║  调试: key=${modelDebug.apiKey} url=${modelDebug.baseUrl.slice(0, 40)} model=${modelDebug.model}`.padEnd(89) + "║\n";
  }
  header += "║  总用例数: " + cases.length + " ".repeat(73) + "║\n";
  header += "╚" + "═".repeat(88) + "╝\n\n\n";
  writeFileSync(outFile, header, "utf8");
  console.log(header);

  const byCategory: Record<string, { total: number; intentMatch: number; confirmMatch: number; toolMatch: number }> =
    {};
  let llmOk = 0;
  let llmFail = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const caseOutput = await traceTestCase(tc);
    writeFileSync(outFile, caseOutput, { flag: "a" });

    const input = Array.isArray(tc.userInput) ? tc.userInput[tc.userInput.length - 1] : tc.userInput;
    const isLLM = caseOutput.includes("引擎: ✅");
    const isLLMFail = caseOutput.includes("❌ LLM");
    const icon = isLLM ? "🤖" : isLLMFail ? "❌" : "📋";
    console.log(`[${i + 1}/${cases.length}] ${icon} ${tc.id}: ${input.slice(0, 60)}`);

    if (isLLM) llmOk++;
    else if (isLLMFail) llmFail++;

    const cat = tc.category;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, intentMatch: 0, confirmMatch: 0, toolMatch: 0 };
    byCategory[cat].total++;
    if (/意图:.*✅/.test(caseOutput)) byCategory[cat].intentMatch++;
    if (/确认: 预期=(true|false) 实际=\1/.test(caseOutput)) byCategory[cat].confirmMatch++;
    if (/已覆盖:/.test(caseOutput) && !/未覆盖:/.test(caseOutput)) byCategory[cat].toolMatch++;
  }

  let summary = "\n╔" + "═".repeat(88) + "╗\n";
  summary += "║  汇总统计" + " ".repeat(76) + "║\n";
  summary += "╚" + "═".repeat(88) + "╝\n\n";
  if (LLM_ENABLED) summary += `  🤖 LLM: ${llmOk}成功 ${llmFail}失败 model=${modelDebug.model}\n\n`;
  summary += "  分类             用例  意图匹配  确认匹配  工具匹配\n  " + "─".repeat(60) + "\n";
  for (const [cat, stats] of Object.entries(byCategory)) {
    summary += `  ${cat.padEnd(16)} ${String(stats.total).padStart(3)}  ${String(stats.intentMatch).padStart(5)}     ${String(stats.confirmMatch).padStart(5)}     ${String(stats.toolMatch).padStart(5)}\n`;
  }
  summary += "  " + "─".repeat(60) + "\n";
  const total = cases.length;
  const tI = Object.values(byCategory).reduce((s, c) => s + c.intentMatch, 0);
  const tC = Object.values(byCategory).reduce((s, c) => s + c.confirmMatch, 0);
  const tT = Object.values(byCategory).reduce((s, c) => s + c.toolMatch, 0);
  summary += `  ${"合计".padEnd(16)} ${String(total).padStart(3)}  ${String(tI).padStart(5)}     ${String(tC).padStart(5)}     ${String(tT).padStart(5)}\n`;

  writeFileSync(outFile, summary, { flag: "a" });
  console.log(summary);
  console.log(`\n完整报告: ${outFile}`);
});
