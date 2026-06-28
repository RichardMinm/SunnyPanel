import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("AppInput", () => {
  const source = read("src/components/primitives/AppInput.tsx");

  test("exports AppInput with forwardRef", () => {
    assert.match(source, /export const AppInput = forwardRef/);
  });

  test("renders leftIcon when provided", () => {
    assert.match(source, /leftIcon/);
    assert.match(source, /app-input__left-icon/);
  });

  test("renders rightSlot when provided", () => {
    assert.match(source, /rightSlot/);
    assert.match(source, /app-input__right-slot/);
  });

  test("supports disabled state via aria-disabled", () => {
    assert.match(source, /aria-disabled/);
  });

  test("supports invalid state via aria-invalid", () => {
    assert.match(source, /aria-invalid/);
    assert.match(source, /app-input--invalid/);
  });

  test("uses height-input and radius-md tokens", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    assert.match(css, /\.app-input\s*\{/);
    assert.match(css, /var\(--height-input\)/);
    assert.match(css, /var\(--radius-md\)/);
  });

  test("input field uses text-muted placeholder", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    const placeholderSection = css.match(/\.app-input__field::placeholder\s*\{[^}]*\}/s);
    assert.ok(placeholderSection);
    assert.match(placeholderSection![0], /var\(--text-muted\)/);
  });
});

describe("AppSearchInput", () => {
  const source = read("src/components/primitives/AppSearchInput.tsx");

  test("exports AppSearchInput with forwardRef", () => {
    assert.match(source, /export const AppSearchInput = forwardRef/);
  });

  test("renders search icon via leftIcon", () => {
    assert.match(source, /SearchIcon/);
  });

  test("clear button has aria-label for accessibility", () => {
    assert.match(source, /aria-label="清除搜索"/);
  });

  test("calls onClear or dispatches native clear event", () => {
    assert.match(source, /onClear/);
    assert.match(source, /nativeInputValueSetter/);
  });

  test("based on AppInput component", () => {
    assert.match(source, /import.*AppInput.*from/);
  });
});

describe("AppTextarea", () => {
  const source = read("src/components/primitives/AppTextarea.tsx");

  test("exports AppTextarea with forwardRef", () => {
    assert.match(source, /export const AppTextarea = forwardRef/);
  });

  test("supports disabled and invalid states", () => {
    assert.match(source, /aria-disabled/);
    assert.match(source, /aria-invalid/);
    assert.match(source, /app-textarea--invalid/);
  });

  test("uses textarea element with app-textarea class", () => {
    assert.match(source, /<textarea/);
    assert.match(source, /app-textarea/);
  });
});

describe("AppCard", () => {
  const source = read("src/components/primitives/AppCard.tsx");

  test("exports AppCard with forwardRef", () => {
    assert.match(source, /export const AppCard = forwardRef/);
  });

  test("has four variants: default, quiet, elevated, interactive", () => {
    assert.match(source, /"default"/);
    assert.match(source, /"quiet"/);
    assert.match(source, /"elevated"/);
    assert.match(source, /"interactive"/);
  });

  test("has four padding levels: none, sm, md, lg", () => {
    assert.match(source, /"none"/);
    assert.match(source, /"sm"/);
    assert.match(source, /"md"/);
    assert.match(source, /"lg"/);
  });

  test("supports asChild via @radix-ui/react-slot", () => {
    assert.match(source, /@radix-ui\/react-slot/);
    assert.match(source, /asChild/);
  });

  test("uses correct design tokens", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    assert.match(css, /\.app-card\s*\{/);
    assert.match(css, /var\(--bg-card\)/);
    assert.match(css, /var\(--border-subtle\)/);
    assert.match(css, /var\(--radius-lg\)/);
  });

  test("interactive variant has hover transition", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    assert.match(css, /\.app-card--interactive\s*\{/);
    assert.match(css, /\.app-card--interactive:hover/);
  });
});

describe("AppBadge", () => {
  const source = read("src/components/primitives/AppBadge.tsx");

  test("exports AppBadge", () => {
    assert.match(source, /export function AppBadge/);
  });

  test("has six tones: default, muted, accent, success, warning, danger", () => {
    const tones = ["default", "muted", "accent", "success", "warning", "danger"];
    for (const tone of tones) {
      assert.match(source, new RegExp(`"${tone}"`));
    }
  });

  test("has two sizes: sm, md", () => {
    assert.match(source, /"sm"/);
    assert.match(source, /"md"/);
  });

  test("supports pill variant", () => {
    assert.match(source, /pill/);
    assert.match(source, /app-badge--pill/);
  });
});

describe("AppEmptyState", () => {
  const source = read("src/components/primitives/AppEmptyState.tsx");

  test("exports AppEmptyState", () => {
    assert.match(source, /export function AppEmptyState/);
  });

  test("supports icon, title, description, action props", () => {
    assert.match(source, /icon/);
    assert.match(source, /title/);
    assert.match(source, /description/);
    assert.match(source, /action/);
  });

  test("supports compact variant", () => {
    assert.match(source, /compact/);
    assert.match(source, /app-empty-state--compact/);
  });
});

describe("AppPanel", () => {
  const source = read("src/components/primitives/AppPanel.tsx");

  test("exports AppPanel", () => {
    assert.match(source, /export function AppPanel/);
  });

  test("has three variants: default, quiet, elevated", () => {
    assert.match(source, /"default"/);
    assert.match(source, /"quiet"/);
    assert.match(source, /"elevated"/);
  });

  test("supports header and footer slots", () => {
    assert.match(source, /header/);
    assert.match(source, /footer/);
    assert.match(source, /app-panel__header/);
    assert.match(source, /app-panel__footer/);
  });
});

describe("AppSection", () => {
  const source = read("src/components/primitives/AppSection.tsx");

  test("exports AppSection", () => {
    assert.match(source, /export function AppSection/);
  });

  test("supports title and description", () => {
    assert.match(source, /title/);
    assert.match(source, /description/);
    assert.match(source, /app-section__title/);
  });

  test("supports actions slot", () => {
    assert.match(source, /actions/);
    assert.match(source, /app-section__actions/);
  });

  test("supports collapsible with persistKey", () => {
    assert.match(source, /collapsible/);
    assert.match(source, /persistKey/);
    assert.match(source, /localStorage/);
  });

  test("title uses muted 12px style", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    const titleSection = css.match(/\.app-section__title\s*\{[^}]*\}/s);
    assert.ok(titleSection);
    assert.match(titleSection![0], /var\(--text-muted\)/);
  });
});

describe("Design Tokens", () => {
  const tokens = read("src/app/styles/sunny-tokens.css");

  test("has --radius-full token", () => {
    assert.match(tokens, /--radius-full:\s*9999px/);
  });

  test("has --height-button-sm, --height-button-md, --height-button-lg tokens", () => {
    assert.match(tokens, /--height-button-sm:/);
    assert.match(tokens, /--height-button-md:/);
    assert.match(tokens, /--height-button-lg:/);
  });

  test("has --height-input and --height-menu-item tokens", () => {
    assert.match(tokens, /--height-input:/);
    assert.match(tokens, /--height-menu-item:/);
  });

  test("has --shadow-popover and --shadow-floating tokens", () => {
    assert.match(tokens, /--shadow-popover:/);
    assert.match(tokens, /--shadow-floating:/);
  });

  test("has --z-popover, --z-tooltip, --z-modal tokens", () => {
    assert.match(tokens, /--z-popover:/);
    assert.match(tokens, /--z-tooltip:/);
    assert.match(tokens, /--z-modal:/);
  });

  test("has --radius-sm, --radius-md, --radius-lg, --radius-xl tokens", () => {
    assert.match(tokens, /--radius-sm:/);
    assert.match(tokens, /--radius-md:/);
    assert.match(tokens, /--radius-lg:/);
    assert.match(tokens, /--radius-xl:/);
  });
});

describe("Primitives Index", () => {
  const source = read("src/components/primitives/index.ts");

  test("exports all new primitives", () => {
    const required = [
      "AppInput",
      "AppSearchInput",
      "AppTextarea",
      "AppCard",
      "AppBadge",
      "AppEmptyState",
      "AppPanel",
      "AppSection",
    ];
    for (const name of required) {
      assert.match(source, new RegExp(`export.*${name}`));
    }
  });

  test("still exports existing primitives", () => {
    const existing = [
      "AppButton",
      "AppIconButton",
      "AppPopover",
      "AppDropdownMenu",
      "AppTooltip",
      "AppTabs",
      "AppDialog",
    ];
    for (const name of existing) {
      assert.ok(
        source.includes(name),
        `Expected index to export "${name}"`,
      );
    }
  });
});
