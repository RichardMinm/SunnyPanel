/**
 * Phase LLM-R3: Tool Catalog tests.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLLMToolCatalog } from "../../src/lib/agent/tool-planner";

test("catalog contains all 19 tools by default", () => {
  const catalog = buildLLMToolCatalog();
  assert.equal(catalog.length, 19);
});

test("catalog entries have required metadata fields", () => {
  const catalog = buildLLMToolCatalog();
  for (const entry of catalog) {
    assert.ok(typeof entry.name === "string" && entry.name.length > 0, `${entry.name}: missing name`);
    assert.ok(typeof entry.description === "string" && entry.description.length > 0, `${entry.name}: missing description`);
    assert.ok(entry.capability, `${entry.name}: missing capability`);
    assert.ok(entry.riskLevel, `${entry.name}: missing riskLevel`);
    assert.ok(entry.inputSchema, `${entry.name}: missing inputSchema`);
    assert.equal(typeof entry.canRunWithoutConfirmation, "boolean");
    assert.equal(typeof entry.supportsDryRun, "boolean");
    assert.equal(typeof entry.supportsExecute, "boolean");
    assert.equal(typeof entry.supportsRollback, "boolean");
  }
});

test("catalog contains no function implementations", () => {
  const catalog = buildLLMToolCatalog();
  for (const entry of catalog) {
    const serialized = JSON.stringify(entry);
    assert.ok(!serialized.includes("=>"), `${entry.name}: must not contain arrow functions`);
    assert.ok(!serialized.includes("function"), `${entry.name}: must not contain function keyword`);
  }
});

test("catalog contains no secrets or raw code", () => {
  const catalog = buildLLMToolCatalog();
  const serialized = JSON.stringify(catalog);
  assert.ok(!serialized.includes("sk-"), "Must not contain API key prefix");
  assert.ok(!serialized.includes("Bearer"), "Must not contain auth header");
  assert.ok(!serialized.includes("api_key"), "Must not contain api_key");
});

test("all write tools have supportsDryRun=true", () => {
  const catalog = buildLLMToolCatalog();
  for (const entry of catalog) {
    if (entry.capability === "write") {
      assert.equal(entry.supportsDryRun, true, `${entry.name}: write tool must support dry-run`);
      assert.equal(entry.supportsExecute, true, `${entry.name}: write tool must support execute`);
    }
  }
});

test("read tools have correct metadata", () => {
  const catalog = buildLLMToolCatalog();
  const readTools = catalog.filter((e) => e.capability === "read");
  assert.equal(readTools.length, 2, "should have 2 read tools: query_plan_progress + query_schedule");
  for (const tool of readTools) {
    assert.equal(tool.supportsDryRun, true, `${tool.name}: supportsDryRun`);
    assert.equal(tool.riskLevel, "low", `${tool.name}: riskLevel=low`);
    assert.equal(tool.supportsRollback, false, `${tool.name}: supportsRollback=false`);
  }
  // query_schedule is read-only (no execute)
  const qs = readTools.find((t) => t.name === "query_schedule")!;
  assert.ok(qs, "query_schedule must be in read tools");
  assert.equal(qs.supportsExecute, false);
  // query_plan_progress supports execute
  const qpp = readTools.find((t) => t.name === "query_plan_progress")!;
  assert.ok(qpp, "query_plan_progress must be in read tools");
  assert.equal(qpp.supportsExecute, true);
});

test("catalog filters by capability", () => {
  const writeOnly = buildLLMToolCatalog({ includeWriteTools: true, includeDraftTools: false, includeReadTools: false });
  for (const entry of writeOnly) {
    assert.equal(entry.capability, "write");
  }

  const readOnly = buildLLMToolCatalog({ includeWriteTools: false, includeDraftTools: false, includeReadTools: true });
  assert.equal(readOnly.length, 2, "should have 2 read tools");
  const readNames = readOnly.map((e) => e.name);
  assert.ok(readNames.includes("query_plan_progress"));
  assert.ok(readNames.includes("query_schedule"));
});

test("catalog respects maxDescriptionLength", () => {
  const catalog = buildLLMToolCatalog({ maxDescriptionLength: 20 });
  for (const entry of catalog) {
    assert.ok(
      entry.description.length <= 23, // 20 + "..."
      `${entry.name}: description too long (${entry.description.length})`,
    );
  }
});

test("catalog tool names are unique", () => {
  const catalog = buildLLMToolCatalog();
  const names = catalog.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
});
