import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { test } from "node:test";

import type { FocusedGateReportModule } from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadReport = () =>
  loadR4AGreenModule<FocusedGateReportModule>(
    R4A_GREEN_MODULES.focusedGateReport,
    "hybrid_focused_gate_report",
  );

test("report path guard permits only the fixed Harness-owned /tmp file", async () => {
  const {
    assertHybridFocusedGateReportPath,
    HYBRID_FOCUSED_GATE_REPORT_PATH,
  } = await loadReport();

  assert.equal(
    await assertHybridFocusedGateReportPath(
      HYBRID_FOCUSED_GATE_REPORT_PATH,
    ),
    HYBRID_FOCUSED_GATE_REPORT_PATH,
  );
  await assert.rejects(
    assertHybridFocusedGateReportPath(
      "/tmp/../Users/richardluo/report.json",
    ),
  );
  await assert.rejects(
    assertHybridFocusedGateReportPath(
      process.cwd() + "/hybrid-report.json",
    ),
  );
  await assert.rejects(
    assertHybridFocusedGateReportPath("/tmp/another-report.json"),
  );
});

test("recursive retention scan rejects nested raw keys and nested sensitive values", async () => {
  const { scanHybridFocusedGateReport } = await loadReport();
  const rawKey = scanHybridFocusedGateReport({
    observations: [{ nested: { rawResponse: "not retained" } }],
  });
  assert.equal(rawKey.rawRetentionViolation, true);
  assert.equal(rawKey.violationCodes.includes("forbidden_key"), true);

  const rawValue = scanHybridFocusedGateReport(
    { observations: [{ nested: [{ safe: "R4A_TASK7_SECRET" }] }] },
    ["R4A_TASK7_SECRET"],
  );
  assert.equal(rawValue.rawRetentionViolation, true);
  assert.equal(rawValue.violationCodes.includes("forbidden_value"), true);

  const safeCounter = scanHybridFocusedGateReport({
    providerAttempts: 4,
    providerRequests: 4,
  });
  assert.equal(safeCounter.rawRetentionViolation, false);
});

test("writer scans before creating the fixed report and writes safe JSON exclusively", async () => {
  const {
    HYBRID_FOCUSED_GATE_REPORT_PATH,
    writeHybridFocusedGateReport,
  } = await loadReport();
  await rm(HYBRID_FOCUSED_GATE_REPORT_PATH, { force: true });

  await assert.rejects(
    writeHybridFocusedGateReport({
      report: { observations: [{ prompt: "forbidden" }] },
    }),
  );
  await assert.rejects(
    access(HYBRID_FOCUSED_GATE_REPORT_PATH, constants.F_OK),
  );

  const result = await writeHybridFocusedGateReport({
    report: {
      commentaryMode: "omitted",
      observations: [],
      summary: {
        expectedObservations: 12,
        passed: true,
      },
    },
  });
  assert.equal(result.path, HYBRID_FOCUSED_GATE_REPORT_PATH);
  assert.equal(result.bytes > 0, true);
  const parsed = JSON.parse(
    await readFile(HYBRID_FOCUSED_GATE_REPORT_PATH, "utf8"),
  ) as { commentaryMode: string };
  assert.equal(parsed.commentaryMode, "omitted");

  await assert.rejects(
    writeHybridFocusedGateReport({
      report: { observations: [], summary: { passed: true } },
    }),
  );
  await rm(HYBRID_FOCUSED_GATE_REPORT_PATH, { force: true });
});
