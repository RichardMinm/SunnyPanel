import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const palettes = ["cobalt", "forest", "wine", "midnight", "slate"] as const;

const tokenSourceFiles = new Set([
  "src/app/styles/sunny-palettes.css",
  "src/app/styles/sunny-tokens.css",
]);

const literalColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|rgb\(/;

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
  "src/app/styles/sunny-dashboard-writing-layout.css",
  "src/app/styles/sunny-dashboard-writing-library.css",
  "src/app/styles/sunny-dashboard-writing-editor.css",
  "src/app/styles/sunny-dashboard-writing-chrome.css",
  "src/app/styles/sunny-dashboard-writing-inspector.css",
  "src/app/styles/sunny-dashboard-writing-misc.css",
  "src/app/styles/sunny-dashboard-memory.css",
  "src/app/styles/sunny-agent.css",
  "src/app/styles/sunny-category.css",
  "src/app/styles/sunny-ui.css",
  "src/app/styles/sunny-settings.css",
  "src/app/styles/sunny-base.css",
  "src/app/styles/sunny-chrome.css",
  "src/app/styles/sunny-markdown.css",
  "src/app/styles/sunny-prose.css",
  "src/app/styles/sunny-payload-bridge.css",
  "src/app/(payload)/admin-theme.css",
];

const collectSourceFiles = (dir: string, extensions: string[]): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath, extensions));
      continue;
    }

    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
};

const dashboardTsxFiles = readdirSync("src/components/dashboard", { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx"))
  .map((entry) => join("src/components/dashboard", entry));

const publicTsxFiles = collectSourceFiles("src/components/public", [".tsx"]);
const uiTsxFiles = collectSourceFiles("src/components/ui", [".tsx"]);

describe("Color token unification", () => {
  test("consumer source files do not contain literal hex or rgb/rgba colors", () => {
    const files = [
      ...collectSourceFiles("src/app/styles", [".css"]),
      ...collectSourceFiles("src/components", [".tsx", ".ts"]),
      ...collectSourceFiles("src/lib", [".ts"]),
      ...collectSourceFiles("src/app", [".tsx", ".ts"]),
    ].filter((file) => !tokenSourceFiles.has(file.replace(/\\/g, "/")));

    const offenders: string[] = [];

    for (const file of files) {
      if (!statSync(file).isFile()) {
        continue;
      }

      const source = read(file);
      if (literalColorPattern.test(source)) {
        offenders.push(file);
      }
    }

    assert.deepEqual(offenders, [], `literal colors found outside token sources: ${offenders.join(", ")}`);
  });

  test("semantic role aliases are defined in sunny-tokens.css", () => {
    const tokensCss = read("src/app/styles/sunny-tokens.css");

    for (const token of [
      "--bg-app:",
      "--bg-panel:",
      "--bg-card:",
      "--text-primary:",
      "--text-secondary:",
      "--border-subtle:",
      "--border-default:",
      "--danger:",
      "--warning:",
      "--success:",
      "--radius-sm:",
      "--radius-md:",
      "--radius-lg:",
      "--space-1:",
      "--space-8:",
      "--shadow-popover:",
      "--height-button:",
      "--height-menu-item:",
      "--settings-width:",
    ]) {
      assert.match(tokensCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  test("semantic color tokens are defined in sunny-tokens.css", () => {
    const tokensCss = read("src/app/styles/sunny-tokens.css");

    for (const token of [
      "--destructive:",
      "--mode-review-bg:",
      "--mode-timeline-bg:",
      "--surface-glass-70:",
      "--shadow-soft:",
      "--shadow-elevated:",
      "--settings-bg:",
      "--writing-editor-bg:",
      "--writing-rail-bg:",
      "--writing-canvas-bg:",
      "--writing-drawer-shadow:",
    ]) {
      assert.match(tokensCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

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

  test("guarded CSS files do not hardcode legacy Tailwind accent blues or literal colors", () => {
    for (const file of guardedCssFiles) {
      const css = read(file);
      const accentMatches = css.match(forbiddenAccentHex);
      assert.equal(accentMatches, null, `${file} still contains forbidden accent hex: ${accentMatches?.join(", ")}`);
      assert.doesNotMatch(css, literalColorPattern, `${file} contains literal colors`);
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
    assert.match(tokensCss, /--agent-panel-bg:[\s\S]*var\(--surface\)/);
  });

  test("dashboard TSX components avoid inline hex colors", () => {
    const inlineHex = /(?:color|background|borderColor|fill|stroke)\s*:\s*["']#|style=\{\{[^}]*#/;

    for (const file of dashboardTsxFiles) {
      const source = read(file);
      assert.doesNotMatch(source, inlineHex, `${file} contains inline hex color styling`);
    }
  });

  test("public and ui TSX avoid inline hex/rgba and Tailwind color literals", () => {
    const forbiddenPatterns = [
      /#[0-9a-fA-F]{3,8}/,
      /rgba?\(/,
      /bg-white\//,
      /emerald-\d+/,
      /shadow-\[[^\]]*rgba/,
      /bg-\[[^\]]*rgba/,
    ];

    for (const file of [...publicTsxFiles, ...uiTsxFiles]) {
      const source = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(source, pattern, `${file} contains forbidden color literal: ${pattern}`);
      }
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

  test("palette preview swatches are CSS-driven via data-palette-id", () => {
    const paletteCss = read("src/app/styles/sunny-palettes.css");
    const sitePalette = read("src/lib/site-palette.ts");
    const paletteToggle = read("src/components/public/PaletteToggle.tsx");

    assert.doesNotMatch(sitePalette, /#/);
    assert.doesNotMatch(paletteToggle, /swatchDark|resolvedTheme|--palette-preview/);
    assert.match(paletteToggle, /data-palette-id=\{option\.id\}/);

    for (const palette of palettes) {
      assert.match(paletteCss, new RegExp(`data-palette-id="${palette}"`));
      assert.match(paletteCss, new RegExp(`--palette-preview:`));
    }
  });

  test("agent conversation dark mode avoids legacy hardcoded colors and inverted text tokens", () => {
    const agentCss = read("src/app/styles/sunny-agent.css");
    const userCardBlock =
      agentCss.match(/\.sunny-message-card-user \.sunny-message-card-body[\s\S]*?\}/)?.[0] ?? "";

    assert.doesNotMatch(userCardBlock, /#f4f5f7/);
    assert.match(userCardBlock, /--agent-bubble-user-bg/);
    assert.match(userCardBlock, /--agent-bubble-user-border/);
    assert.doesNotMatch(agentCss, literalColorPattern);
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
      /html\[data-theme="dark"\] \.sunny-dashboard-project-row[\s\S]*?color:\s*var\(--background\)/,
    );
    assert.doesNotMatch(
      darkBlock,
      /html\[data-theme="dark"\] \.sunny-dashboard-sidebar-search-input[\s\S]*?background:\s*var\(--foreground\)/,
    );
    assert.doesNotMatch(darkBlock, /html\[data-theme="dark"\] \.sunny-agent-thread-header/);
  });

  test("sunny-core.css defines font tokens independent of Tailwind", () => {
    const core = read("src/app/styles/sunny-core.css");

    assert.match(core, /--font-sans:\s*var\(--sunny-font-sans\)/);
    assert.match(core, /--font-mono:\s*var\(--sunny-font-mono\)/);
    assert.match(core, /sunny-primitives\.css/);
    assert.match(core, /sunny-settings\.css/);
  });
});
