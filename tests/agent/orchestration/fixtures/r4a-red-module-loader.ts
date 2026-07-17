import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const loadR4AGreenModule = async <T>(
  repoRelativePath: string,
  contract: string,
): Promise<T> => {
  const absolutePath = resolve(process.cwd(), repoRelativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `R4A_RED_UNIMPLEMENTED:${contract}:${repoRelativePath}`,
    );
  }
  return import(pathToFileURL(absolutePath).href) as Promise<T>;
};

export const R4A_GREEN_MODULES = Object.freeze({
  boundary: "src/lib/agent/orchestration/query-boundary-resolver.ts",
  candidateValidator: "src/lib/agent/orchestration/hybrid-candidate-validator.ts",
  composer: "src/lib/agent/orchestration/fixed-task-plan-composer.ts",
  evaluation: "src/lib/agent/orchestration/hybrid-query-boundary-evaluation.ts",
  focusedGate: "src/lib/agent/orchestration/hybrid-focused-gate.ts",
  focusedGatePreflight:
    "src/lib/agent/orchestration/hybrid-focused-gate-preflight.ts",
  focusedGateReport:
    "src/lib/agent/orchestration/hybrid-focused-gate-report.ts",
  focusedGateRunner:
    "src/lib/agent/orchestration/hybrid-focused-gate-runner.ts",
  hybrid: "src/lib/agent/orchestration/hybrid-query-boundary.ts",
  productionEvaluation: "src/lib/agent/orchestration/hybrid-production-evaluation.ts",
  residual: "src/lib/agent/orchestration/residual-langchain-planner.ts",
} as const);
