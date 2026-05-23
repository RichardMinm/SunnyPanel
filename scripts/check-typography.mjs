#!/usr/bin/env node
/**
 * CI: forbid new hardcoded rem font sizes outside the type-scale source file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

const ALLOWLIST = new Set([
  "src/app/styles/sunny-tokens.css",
]);

const CSS_PATTERN = /font-size:\s*0\.\d+rem/g;
const TSX_PATTERN = /text-\[0\.\d+rem\]|text-\[2rem\]/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(css|tsx|ts|jsx|js)$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

const violations = [];

for (const rel of walk(SRC)) {
  if (ALLOWLIST.has(rel)) continue;
  const content = readFileSync(join(ROOT, rel), "utf8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (CSS_PATTERN.test(line)) {
      violations.push(`${rel}:${index + 1}  CSS  ${line.trim()}`);
    }
    CSS_PATTERN.lastIndex = 0;

    if (/\.tsx?$/.test(rel) && TSX_PATTERN.test(line)) {
      violations.push(`${rel}:${index + 1}  TSX  ${line.trim()}`);
    }
    TSX_PATTERN.lastIndex = 0;
  });
}

if (violations.length > 0) {
  console.error("Typography check failed — use --text-* tokens or semantic classes:\n");
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  console.error(`\n${violations.length} violation(s). Define scale only in sunny-tokens.css.`);
  process.exit(1);
}

console.log("Typography check passed.");
