#!/usr/bin/env node

/**
 * Retired L3-B authoritative Orchestrator Provider gate.
 *
 * The manifest-bound Production Seam Gate is the only executable replacement.
 */

process.stdout.write(`${JSON.stringify({
  errorCode: "L3B_AUTHORITATIVE_GATE_RETIRED",
  passed: false,
  providerAttempts: 0,
  replacement: "production_seam_gate",
})}\n`);
process.exitCode = 1;
