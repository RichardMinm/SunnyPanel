import { createHash } from "node:crypto";

import { ORCHESTRATOR_OUTPUT_SCHEMA_VERSION } from "../llm/schemas/orchestrator-output";
import {
  ANSWER_FIRST_TOKEN_TIMEOUT_MS,
  ANSWER_MAX_OUTPUT_TOKENS,
  ANSWER_MAX_PARAGRAPHS,
  ANSWER_TOTAL_TIMEOUT_MS,
} from "../answer/config";

export const L3B_EVALUATION_CONFIG_VERSION = "l3b-r2-provider-protocol-v1";
export const L3B_PROMPT_PROTOCOL_VERSION = "l3b-r1-semantic-decision-v1";
export const L3B_RESOURCE_PROTOCOL_VERSION = 2;

export type L3BEvaluationConfig = Readonly<{
  answerFirstTokenTimeoutMs: number;
  answerMaxOutputTokens: number;
  answerMaxParagraphs: number;
  answerTotalTimeoutMs: number;
  baseURL: string;
  evaluationConfigVersion: string;
  model: string;
  orchestratorMaxOutputTokens: number;
  orchestratorThinkingMode: "disabled";
  orchestratorTimeoutMs: number;
  promptProtocolVersion: string;
  provider: "deepseek";
  resourceProtocolVersion: number;
  schemaRetries: number;
  schemaVersion: number;
  semanticRetries: number;
  structuredOutputMode: "provider_default";
  temperature: number;
  transportRetries: number;
}>;

export const L3B_EVALUATION_CONFIG: L3BEvaluationConfig = Object.freeze({
  answerFirstTokenTimeoutMs: ANSWER_FIRST_TOKEN_TIMEOUT_MS,
  answerMaxOutputTokens: ANSWER_MAX_OUTPUT_TOKENS,
  answerMaxParagraphs: ANSWER_MAX_PARAGRAPHS,
  answerTotalTimeoutMs: ANSWER_TOTAL_TIMEOUT_MS,
  baseURL: "https://api.deepseek.com",
  evaluationConfigVersion: L3B_EVALUATION_CONFIG_VERSION,
  model: "deepseek-v4-pro",
  orchestratorMaxOutputTokens: 4096,
  orchestratorThinkingMode: "disabled",
  orchestratorTimeoutMs: 30_000,
  promptProtocolVersion: L3B_PROMPT_PROTOCOL_VERSION,
  provider: "deepseek",
  resourceProtocolVersion: L3B_RESOURCE_PROTOCOL_VERSION,
  schemaRetries: 0,
  schemaVersion: ORCHESTRATOR_OUTPUT_SCHEMA_VERSION,
  semanticRetries: 0,
  structuredOutputMode: "provider_default",
  temperature: 0.1,
  transportRetries: 1,
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

export const hashL3BEvaluationConfig = (
  config: L3BEvaluationConfig,
): string => createHash("sha256")
  .update(JSON.stringify(canonicalize(config)))
  .digest("hex");

export const L3B_EVALUATION_CONFIG_HASH = hashL3BEvaluationConfig(
  L3B_EVALUATION_CONFIG,
);
