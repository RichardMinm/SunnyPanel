import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("floating command trigger", () => {
  test("CommandPalette wires the floating trigger hook and drag hint", () => {
    const palette = read("src/components/public/CommandPalette.tsx");
    const hook = read("src/lib/command/use-floating-command-trigger.ts");

    assert.match(palette, /useFloatingCommandTrigger/);
    assert.match(palette, /handlePointerDown/);
    assert.match(palette, /consumeDragClick/);
    assert.match(palette, /onDoubleClick=\{resetPosition\}/);
    assert.match(palette, /triggerHint/);
    assert.match(hook, /localStorage/);
    assert.match(hook, /sunny-command-trigger-position/);
    assert.match(hook, /COMMAND_TRIGGER_DRAG_THRESHOLD_PX = 6/);
  });

  test("CSS exposes dragging state for the command trigger", () => {
    const uiCss = read("src/app/styles/sunny-ui.css");

    assert.match(uiCss, /html\.sunny-command-trigger-is-dragging/);
    assert.match(uiCss, /\.sunny-command-trigger\.is-dragging/);
  });

  test("Composer floating wrapper was removed", () => {
    assert.equal(existsSync("src/components/dashboard/agent/FloatingAgentComposer.tsx"), false);
    assert.equal(existsSync("src/components/dashboard/agent/use-floating-composer.ts"), false);

    const workbench = read("src/components/dashboard/agent/AgentWorkbench.tsx");
    assert.doesNotMatch(workbench, /FloatingAgentComposer/);
  });
});
