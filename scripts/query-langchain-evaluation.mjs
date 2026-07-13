import { writeFileSync } from "node:fs";

import {
  executeQueryEvaluation,
} from "../src/lib/agent/query/evaluation.ts";
import { isModelError } from "../src/lib/agent/llm/model-errors.ts";
import { createModelConfig } from "../src/lib/agent/llm/model-config.ts";

const buildModelConfig = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DeepSeek provider configuration is unavailable.");
  const config = createModelConfig({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    maxRetries: 0,
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    provider: "deepseek",
    temperature: 0.1,
    timeoutMs: 45_000,
  });
  if (isModelError(config)) throw new Error(config.code);
  return config;
};

const runQueryEvaluation = async () => {
  const result = await executeQueryEvaluation({ modelConfig: buildModelConfig() });
  for (const run of result.runs) {
    console.log(JSON.stringify({
      category: run.category,
      commentaryStatus: run.commentaryStatus,
      fixtureId: run.fixtureId,
      intent: run.intent ?? null,
      latencyMs: run.latencyMs,
      omissionReason: run.omissionReason ?? null,
      terminalStatus: run.terminalStatus,
      ttftMs: run.ttftMs,
    }));
  }
  const stamp = new Date().toISOString().replaceAll(":", "-");
  writeFileSync(`/tmp/query-langchain-evaluation-${stamp}.json`, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ gates: result.gates, metrics: result.report }));
  if (!result.gates.pass) process.exitCode = 1;
};

if (process.env.AGENT_LIVE_LLM_EVAL !== "1" || process.env.AGENT_QUERY_RUNTIME !== "langchain") {
  console.error("Set AGENT_LIVE_LLM_EVAL=1 and AGENT_QUERY_RUNTIME=langchain explicitly.");
  process.exitCode = 1;
} else if (process.env.DATABASE_URL) {
  console.error("Unset DATABASE_URL: this evaluation must not connect to a database.");
  process.exitCode = 1;
} else {
  await runQueryEvaluation();
}
