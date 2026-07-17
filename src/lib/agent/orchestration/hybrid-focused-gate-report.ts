/**
 * Exclusive, sanitized report writer for the R4 Hybrid focused gate.
 */

import { constants } from "node:fs";
import {
  lstat,
  open,
  realpath,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const HYBRID_FOCUSED_GATE_REPORT_PATH =
  "/tmp/l3b-r4a-hybrid-focused-gate.json";

export type HybridFocusedGateReportErrorCode =
  | "REPORT_PATH_OCCUPIED"
  | "REPORT_PATH_UNSAFE";

export class HybridFocusedGateReportError extends Error {
  readonly code: HybridFocusedGateReportErrorCode;

  constructor(code: HybridFocusedGateReportErrorCode) {
    super(code);
    this.code = code;
    this.name = "HybridFocusedGateReportError";
  }
}

const FORBIDDEN_KEYS = new Set([
  "actorid",
  "apikey",
  "authorization",
  "chainofthought",
  "cookie",
  "credential",
  "errormessage",
  "message",
  "password",
  "planid",
  "prompt",
  "rawprompt",
  "rawrequest",
  "rawresponse",
  "reasoning",
  "request",
  "response",
  "secret",
  "stack",
  "title",
  "token",
  "userid",
  "workspace",
  "workspacecontext",
]);

const SAFE_NUMERIC_KEYS = new Set([
  "acceptableFinalResults",
  "actualLogicalCalls",
  "actualProviderAttempts",
  "answerLogicalCalls",
  "answerProviderAttempts",
  "authorizedLogicalCallBudget",
  "authorizedProviderAttemptBudget",
  "businessMutations",
  "databaseConnections",
  "databaseMutations",
  "expectedClarifies",
  "expectedObservations",
  "fullOrchestratorLogicalCalls",
  "fullOrchestratorProviderAttempts",
  "latencyMs",
  "latencyP50Ms",
  "latencyUpperTailMs",
  "maxAttemptsPerLogicalCall",
  "observationIndex",
  "observations",
  "providerAttempts",
  "providerFailures",
  "queryCommentaryLogicalCalls",
  "queryCommentaryProviderAttempts",
  "rawRetentionViolations",
  "replanLogicalCalls",
  "replanProviderAttempts",
  "residualPlannerLogicalCalls",
  "residualPlannerProviderAttempts",
  "residualProviderObservations",
  "round",
  "semanticMatches",
  "specialistLogicalCalls",
  "specialistProviderAttempts",
  "schemaRetries",
  "strictResidualSchemaValid",
  "taskExecutions",
  "temperature",
  "timeouts",
  "timeoutMs",
  "transportRetries",
  "unexpectedDuplicateModelCalls",
  "unusedAttempts",
  "usablePlans",
  "usableResults",
  "outputBudget",
]);

const secretPattern =
  /(?:\bBearer\s+\S+|\bsk-[a-zA-Z0-9_-]{8,})/u;

const isPlainObject = (
  value: object,
): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const scanHybridFocusedGateReport = (
  report: unknown,
  sensitiveValues: readonly unknown[] = [],
): Readonly<{
  rawRetentionViolation: boolean;
  violationCodes: readonly string[];
}> => {
  const violations = new Set<string>();
  const sensitiveStrings = sensitiveValues.flatMap((value) =>
    typeof value === "string" && value.length > 0 ? [value] : []
  );
  const sensitiveNumbers = new Set(
    sensitiveValues.filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    ),
  );
  const ancestors = new WeakSet<object>();

  const visit = (value: unknown, parentKey = ""): void => {
    if (typeof value === "string") {
      if (
        secretPattern.test(value)
        || sensitiveStrings.some((sensitive) =>
          value.includes(sensitive)
        )
      ) {
        violations.add("forbidden_value");
      }
      return;
    }
    if (typeof value === "number") {
      if (
        sensitiveNumbers.has(value)
        && !SAFE_NUMERIC_KEYS.has(parentKey)
      ) {
        violations.add("forbidden_value");
      }
      return;
    }
    if (
      value === null
      || typeof value === "boolean"
      || typeof value === "undefined"
    ) {
      return;
    }
    if (typeof value !== "object") {
      violations.add("unsupported_value");
      return;
    }
    if (ancestors.has(value)) {
      violations.add("cyclic_value");
      return;
    }
    ancestors.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, parentKey);
      ancestors.delete(value);
      return;
    }
    if (!isPlainObject(value)) {
      violations.add("unsupported_object");
      ancestors.delete(value);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        violations.add("forbidden_key");
      }
      visit(child, key);
    }
    ancestors.delete(value);
  };

  visit(report);
  return Object.freeze({
    rawRetentionViolation: violations.size > 0,
    violationCodes: Object.freeze([...violations].sort()),
  });
};

export const assertHybridFocusedGateReportPath = async (
  path: string,
): Promise<string> => {
  const resolvedPath = resolve(path);
  if (resolvedPath !== HYBRID_FOCUSED_GATE_REPORT_PATH) {
    throw new HybridFocusedGateReportError("REPORT_PATH_UNSAFE");
  }
  const [realTmp, realParent] = await Promise.all([
    realpath("/tmp"),
    realpath(dirname(resolvedPath)),
  ]);
  if (realParent !== realTmp) {
    throw new HybridFocusedGateReportError("REPORT_PATH_UNSAFE");
  }
  return resolvedPath;
};

const assertUnoccupiedReportPath = async (path: string): Promise<void> => {
  try {
    await lstat(path);
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return;
    }
    throw new HybridFocusedGateReportError("REPORT_PATH_UNSAFE");
  }
  throw new HybridFocusedGateReportError("REPORT_PATH_OCCUPIED");
};

export const assertHybridFocusedGateReportReady =
  async (): Promise<string> => {
    const path = await assertHybridFocusedGateReportPath(
      HYBRID_FOCUSED_GATE_REPORT_PATH,
    );
    await assertUnoccupiedReportPath(path);
    return path;
  };

export const writeHybridFocusedGateReport = async (input: Readonly<{
  report: unknown;
  sensitiveValues?: readonly unknown[];
}>): Promise<Readonly<{
  bytes: number;
  path: string;
}>> => {
  const scan = scanHybridFocusedGateReport(
    input.report,
    input.sensitiveValues,
  );
  if (scan.rawRetentionViolation) {
    throw new Error("Hybrid report retention scan failed.");
  }
  const contents = `${JSON.stringify(input.report, null, 2)}\n`;
  const path = await assertHybridFocusedGateReportReady();

  let created = false;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    created = true;
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = null;
    return Object.freeze({
      bytes: Buffer.byteLength(contents),
      path,
    });
  } catch {
    await handle?.close().catch(() => undefined);
    if (created) await rm(path, { force: true }).catch(() => undefined);
    throw new Error("Hybrid report write failed.");
  }
};
