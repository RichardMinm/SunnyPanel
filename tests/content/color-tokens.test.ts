import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const palettes = ["cobalt", "forest", "wine", "midnight", "slate"] as const;

const requiredCategoryTokens = [
  "--cat-course-dot",
  "--cat-course-bg",
  "--cat-course-text",
  "--cat-study-dot",
  "--cat-study-bg",
  "--cat-study-text",
  "--cat-plan-dot",
  "--cat-plan-bg",
  "--cat-plan-text",
  "--cat-agent-dot",
  "--cat-agent-bg",
  "--cat-agent-text",
  "--cat-exam-dot",
  "--cat-exam-bg",
  "--cat-exam-text",
  "--cat-default-dot",
  "--cat-default-bg",
  "--cat-default-text",
];

const forbiddenAccentHex = /#2563eb|#1d4ed8|#3b82f6|#eef6ff|#e8f1ff/gi;

const guardedCssFiles = [
  "src/app/styles/sunny-dashboard-shell.css",
  "src/app/styles/sunny-dashboard-right-panel.css",
  "src/app/styles/sunny-dashboard-schedule.css",
  "src/app/styles/sunny-dashboard-writing.css",
  "src/app/styles/sunny-dashboard-memory.css",
  "src/app/styles/sunny-agent.css",
  "src/app/styles/sunny-category.css",
];

const dashboardTsxFiles = readdirSync("src/components/dashboard", { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx"))
  .map((entry) => join("src/components/dashboard", entry));

describe("Color token unification", () => {
  test("each palette defines full category token sets for light and dark", () => {
    const paletteCss = read("src/app/styles/sunny-palettes.css");

    for (const palette of palettes) {
      const lightBlock = paletteCss.match(new RegExp(`html\\[data-palette="${palette}"\\][\\s\\S]*?\\}`, "m"));
      assert.ok(lightBlock, `missing light block for ${palette}`);
      for (const token of requiredCategoryTokens) {
        assert.match(lightBlock![0], new RegExp(`${token}:`), `${palette} light missing ${token}`);
      }

      const darkBlock = paletteCss.match(
        new RegExp(`html\\[data-palette="${palette}"\\]\\[data-theme="dark"\\][\\s\\S]*?\\}`, "m"),
      );
      assert.ok(darkBlock, `missing dark block for ${palette}`);
      for (const token of requiredCategoryTokens) {
        assert.match(darkBlock![0], new RegExp(`${token}:`), `${palette} dark missing ${token}`);
      }
    }
  });

  test("dashboard and agent CSS do not hardcode legacy Tailwind accent blues", () => {
    for (const file of guardedCssFiles) {
      const css = read(file);
      const matches = css.match(forbiddenAccentHex);
      assert.equal(matches, null, `${file} still contains forbidden accent hex: ${matches?.join(", ")}`);
    }
  });

  test("dashboard shell layout colors alias palette tokens", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    assert.match(shellCss, /--dashboard-app-bg:\s*var\(--background\)/);
    assert.match(shellCss, /--dashboard-card-shadow:[\s\S]*var\(--card-shadow\)/);
  });

  test("composer tokens reference palette semantics", () => {
    const tokensCss = read("src/app/styles/sunny-tokens.css");
    assert.match(tokensCss, /--composer-placeholder:\s*var\(--muted\)/);
    assert.match(tokensCss, /--composer-aux-icon:\s*var\(--muted\)/);
    assert.match(tokensCss, /--agent-panel-bg:\s*var\(--surface\)/);
  });

  test("dashboard TSX components avoid inline hex colors", () => {
    const inlineHex = /(?:color|background|borderColor|fill|stroke)\s*:\s*["']#|style=\{\{[^}]*#/;

    for (const file of dashboardTsxFiles) {
      const source = read(file);
      assert.doesNotMatch(source, inlineHex, `${file} contains inline hex color styling`);
    }
  });

  test("schedule and timeline views use category CSS classes instead of hex config", () => {
    const schedule = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");
    const timeline = read("src/components/dashboard/timeline/TimelineView.tsx");

    assert.doesNotMatch(schedule, /dotColor|chipBg|chipText|#[0-9a-fA-F]{3,8}/);
    assert.doesNotMatch(timeline, /dotColor|#[0-9a-fA-F]{3,8}/);
    assert.match(timeline, /data-category=\{typeCfg\.category\}/);
    assert.match(schedule, /cat-\$\{cat\}/);
  });
});
