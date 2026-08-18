import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = process.cwd();
const agentRoot = resolve(repositoryRoot, "src/lib/agent");

const collectTypeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }

    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });

const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("no active Agent source imports the legacy completeStructured boundary", () => {
  // These files are quarantined, currently unreachable legacy implementations.
  // Their presence is not an active-path pass: Cognitive Advisory and Tool Planner
  // remain explicit D6-B retirement work, while the old generic agent/enhancer files
  // are no longer referenced by the active Schedule and Suggestions entrypoints.
  const quarantinedLegacyImporters = new Set([
    "src/lib/agent/agents/enrich-intent.ts",
    "src/lib/agent/cognitive-advisory.ts",
    "src/lib/agent/suggestions-llm.ts",
    "src/lib/agent/tool-planner/llm-tool-planner.ts",
  ]);
  const importers = collectTypeScriptFiles(agentRoot)
    .filter((path) =>
      /(?:from\s+|import\()["'][^"']*complete-structured["']/u.test(
        readFileSync(path, "utf8"),
      ),
    )
    .map((path) => relative(repositoryRoot, path));
  const unexpectedActiveImporters = importers.filter(
    (path) => !quarantinedLegacyImporters.has(path),
  );

  assert.deepEqual(unexpectedActiveImporters, []);
});

test("active Schedule and Suggestions entrypoints cannot reach their retired legacy seams", () => {
  const registry = source("src/lib/agent/agents/registry.ts");
  const suggestions = source("src/lib/agent/suggestions.ts");
  const activeSources = `${registry}\n${suggestions}`;

  assert.doesNotMatch(registry, /schedule-agent|enrichScheduleIntent/u);
  assert.doesNotMatch(suggestions, /suggestions-llm|enhanceSuggestionsWithLLM/u);
  assert.doesNotMatch(activeSources, /completeStructured|complete-structured/u);
});
