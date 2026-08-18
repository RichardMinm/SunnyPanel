import type { StructuredOutputDiagnostics } from "./model-errors";

export type StrictSchemaRepairContract = Readonly<{
  allowedFields: readonly string[];
  contractName: string;
}>;

const formatIssuePath = (
  issue: StructuredOutputDiagnostics["issues"][number],
): string => issue.path.length > 0 ? issue.path.join(".") : "<root>";

/**
 * Build a payload-free repair instruction for prompt-JSON Providers.
 * Only schema paths, issue codes, and the static allowlist are included; model
 * values and raw Provider output never enter the retry prompt or diagnostics.
 */
export const buildStrictSchemaRepairInstruction = (
  contract: StrictSchemaRepairContract,
  issues: StructuredOutputDiagnostics["issues"],
): string => {
  const issueSummary = issues
    .slice(0, 8)
    .map((issue) => `${formatIssuePath(issue)}:${issue.code}:${issue.missing ? "missing" : "invalid"}`)
    .join(", ");

  return [
    `上一次输出不符合 ${contract.contractName} 的严格 JSON 合同。`,
    `顶层只允许字段：${contract.allowedFields.join(", ")}。`,
    issueSummary ? `需要修复的结构路径：${issueSummary}。` : null,
    "请返回一个完整 JSON 对象；补齐缺失字段、修正类型并删除额外字段。不要输出 Markdown 或解释。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};
