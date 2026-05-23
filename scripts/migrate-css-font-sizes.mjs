#!/usr/bin/env node
/**
 * One-off / maintenance: map literal rem font-size in CSS to type tokens.
 * sunny-tokens.css is the only file allowed to define raw rem scale values.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const REM_TO_TOKEN = [
  ["0.4rem", "var(--text-icon)"],
  ["0.58rem", "var(--text-3xs)"],
  ["0.6rem", "var(--text-2xs)"],
  ["0.62rem", "var(--text-2xs)"],
  ["0.64rem", "var(--text-xs)"],
  ["0.65rem", "var(--text-xs)"],
  ["0.66rem", "var(--text-xs)"],
  ["0.68rem", "var(--text-xs)"],
  ["0.7rem", "var(--text-xs)"],
  ["0.72rem", "var(--text-sm-compact)"],
  ["0.74rem", "var(--text-sm-compact)"],
  ["0.75rem", "var(--text-sm-compact)"],
  ["0.76rem", "var(--text-sm-compact)"],
  ["0.78rem", "var(--text-sm-compact)"],
  ["0.8rem", "var(--text-sm)"],
  ["0.82rem", "var(--text-sm)"],
  ["0.86rem", "var(--text-base)"],
  ["0.85rem", "var(--text-base)"],
  ["0.875rem", "var(--text-base)"],
  ["0.88rem", "var(--text-base)"],
  ["0.9rem", "var(--text-md)"],
  ["0.92rem", "var(--text-md)"],
  ["0.94rem", "var(--text-md)"],
  ["0.95rem", "var(--text-md)"],
  ["0.97rem", "var(--text-md)"],
  ["0.98rem", "var(--text-md)"],
  ["1rem", "var(--text-lg)"],
  ["2rem", "var(--text-3xl)"],
];

const CALC_REPLACEMENTS = [
  ["calc(0.95rem * var(--site-scale))", "calc(var(--text-md) * var(--site-scale))"],
  ["calc(0.92rem * var(--site-scale))", "calc(var(--text-md) * var(--site-scale))"],
  ["calc(0.78rem * var(--site-scale))", "calc(var(--text-sm-compact) * var(--site-scale))"],
  ["calc(0.76rem * var(--site-scale))", "calc(var(--text-sm-compact) * var(--site-scale))"],
];

const TARGETS = [
  "src/app/styles/sunny-agent.css",
  "src/app/styles/sunny-ui.css",
  "src/app/styles/sunny-admin-unified.css",
  "src/app/styles/sunny-admin-shell.css",
  "src/app/(payload)/admin-theme.css",
  "src/app/styles/sunny-prose.css",
];

function migrateCss(content) {
  let next = content;
  for (const [from, to] of CALC_REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  for (const [from, to] of REM_TO_TOKEN) {
    next = next.replaceAll(`font-size: ${from}`, `font-size: ${to}`);
  }
  return next;
}

for (const rel of TARGETS) {
  const file = resolve(ROOT, rel);
  const before = readFileSync(file, "utf8");
  const after = migrateCss(before);
  if (before !== after) {
    writeFileSync(file, after);
    const count = [...before.matchAll(/font-size:\s*0\.\d+rem/g)].length -
      [...after.matchAll(/font-size:\s*0\.\d+rem/g)].length;
    console.log(`migrated ${rel} (~${count} literals)`);
  }
}
