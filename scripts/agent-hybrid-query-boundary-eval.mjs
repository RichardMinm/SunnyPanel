#!/usr/bin/env node

/**
 * Retired one-time R4 Hybrid focused Provider gate.
 *
 * The Production Seam focused stage is the only executable replacement.
 */

process.stdout.write(`${JSON.stringify({
  errorCode: "HYBRID_FOCUSED_GATE_RETIRED",
  passed: false,
  providerAttempts: 0,
  replacement: "production_seam_focused",
})}\n`);
process.exitCode = 1;
