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

  test("each palette dark block has depth, semantic tones, and distinct category accents", () => {
    const paletteCss = read("src/app/styles/sunny-palettes.css");
    const lightPaperHex = /#f2f4f7|#fff7ed|#f0fdf4|#fef2f2|#f5f3ff|#ecfdf5|#fff1f2/i;
    const agentDots: string[] = [];

    for (const palette of palettes) {
      const darkBlock = paletteCss.match(
        new RegExp(`html\\[data-palette="${palette}"\\]\\[data-theme="dark"\\][\\s\\S]*?\\}`, "m"),
      );
      assert.ok(darkBlock, `missing dark block for ${palette}`);

      const top = darkBlock![0].match(/--page-gradient-top:\s*([^;]+);/)?.[1]?.trim();
      const bottom = darkBlock![0].match(/--page-gradient-bottom:\s*([^;]+);/)?.[1]?.trim();
      assert.ok(top && bottom, `${palette} dark missing page gradient tokens`);
      assert.notEqual(top, bottom, `${palette} dark page gradient should have depth`);

      assert.doesNotMatch(darkBlock![0], lightPaperHex, `${palette} dark contains light-only paper hex`);

      for (const token of ["--tone-success-text", "--tone-danger-text", "--tone-neutral-text"]) {
        assert.match(darkBlock![0], new RegExp(`${token}:`), `${palette} dark missing ${token}`);
      }

      const agentDot = darkBlock![0].match(/--cat-agent-dot:\s*([^;]+);/)?.[1]?.trim();
      assert.ok(agentDot, `${palette} dark missing --cat-agent-dot`);
      agentDots.push(agentDot!);

      const lightAccent = paletteCss
        .match(new RegExp(`html\\[data-palette="${palette}"\\][\\s\\S]*?--accent:\\s*([^;]+);`, "m"))?.[1]
        ?.trim();
      const darkAccent = darkBlock![0].match(/--accent:\s*([^;]+);/)?.[1]?.trim();
      assert.ok(lightAccent && darkAccent, `${palette} missing accent tokens`);
      assert.notEqual(lightAccent, darkAccent, `${palette} dark accent should differ from light accent`);
    }

    assert.ok(new Set(agentDots).size >= 3, "dark cat-agent-dot values should vary across palettes");
  });

  test("palette options expose dark preview swatches", () => {
    const sitePalette = read("src/lib/site-palette.ts");
    const paletteToggle = read("src/components/public/PaletteToggle.tsx");

    assert.match(sitePalette, /darkPrimary/);
    assert.match(sitePalette, /swatchDark/);
    assert.match(paletteToggle, /swatchDark/);
    assert.match(paletteToggle, /resolvedTheme/);
  });

  test("agent conversation dark mode avoids legacy hardcoded colors and inverted text tokens", () => {
    const agentCss = read("src/app/styles/sunny-agent.css");
    const userCardBlock =
      agentCss.match(/\.sunny-message-card-user \.sunny-message-card-body[\s\S]*?\}/)?.[0] ?? "";

    assert.doesNotMatch(userCardBlock, /#f4f5f7/);
    assert.match(userCardBlock, /--agent-bubble-user-bg/);
    assert.match(userCardBlock, /--agent-bubble-user-border/);
    assert.doesNotMatch(agentCss, /#0b1120/);
    assert.doesNotMatch(agentCss, /rgba\(59,130,246/);
    assert.doesNotMatch(agentCss, /html\[data-theme="dark"\][\s\S]*?color:\s*var\(--background\)/);
    assert.match(
      agentCss,
      /html\[data-theme="dark"\] \.sunny-agent-composer-input[\s\S]*color:\s*var\(--foreground\)/,
    );
  });

  test("dashboard shell dark mode keeps semantic foreground/background tokens", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const darkBlock = shellCss.match(/\/\* ═══ Dark Mode ═══ \*\/[\s\S]*/)?.[0] ?? "";

    assert.match(darkBlock, /html\[data-theme="dark"\] \.sunny-dashboard-shell[\s\S]*background:\s*var\(--background\)/);
    assert.match(darkBlock, /html\[data-theme="dark"\] \.sunny-dashboard-main[\s\S]*background:\s*var\(--background\)/);
    assert.doesNotMatch(
      darkBlock,
      /html\[data-theme="dark"\] \.sunny-dashboard-shell[\s\S]*?background:\s*var\(--foreground\)/,
    );
    assert.doesNotMatch(
      darkBlock,
      /html\[data-theme="dark"\] \.sunny-codex-project-row[\s\S]*?color:\s*var\(--background\)/,
    );
    assert.doesNotMatch(
      darkBlock,
      /html\[data-theme="dark"\] \.sunny-codex-sidebar-search-input[\s\S]*?background:\s*var\(--foreground\)/,
    );
    assert.doesNotMatch(darkBlock, /html\[data-theme="dark"\] \.sunny-agent-thread-header/);
  });
});
