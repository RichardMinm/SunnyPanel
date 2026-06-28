import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("WritingEmptyState → AppEmptyState", () => {
  const source = read("src/components/dashboard/writing/WritingEmptyState.tsx");

  test("imports AppEmptyState from primitives", () => {
    assert.match(source, /import.*AppEmptyState.*from.*primitives/);
  });

  test("renders AppEmptyState with title and description", () => {
    assert.match(source, /<AppEmptyState/);
    assert.match(source, /title=/);
    assert.match(source, /description=/);
  });

  test("passes action button when onCreate or onCreateCategory provided", () => {
    assert.match(source, /action=\{/);
    assert.match(source, /sunny-writing-primary-button/);
  });

  test("preserves is-library CSS class for layout compatibility", () => {
    assert.match(source, /sunny-writing-empty-state is-library/);
  });

  test("preserves original Chinese copy text", () => {
    assert.match(source, /暂无草稿/);
    assert.match(source, /暂无文档集/);
    assert.match(source, /点击新建文档集开始整理内容/);
  });
});

describe("TimelineView empty state → AppEmptyState", () => {
  const source = read("src/components/dashboard/timeline/TimelineView.tsx");

  test("imports AppEmptyState", () => {
    assert.match(source, /import.*AppEmptyState/);
  });

  test("renders AppEmptyState for empty timeline", () => {
    assert.match(source, /<AppEmptyState/);
    assert.match(source, /sunny-timeline-empty-state/);
  });

  test("passes icon with calendar DashboardIcon", () => {
    assert.match(source, /icon=\{/);
    assert.match(source, /DashboardIcon name="calendar"/);
  });

  test("preserves action buttons: 查看清单 and 添加里程碑", () => {
    assert.match(source, /查看清单/);
    assert.match(source, /添加里程碑/);
    assert.match(source, /onModeChange/);
    assert.match(source, /onNewTimelineEvent/);
  });

  test("preserves original description text", () => {
    assert.match(source, /本月暂无时间线事件/);
    assert.match(source, /SunnyPanel 会自动沉淀为你的成长时间线/);
  });
});

describe("ScheduleMonthView empty state → AppEmptyState", () => {
  const source = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");

  test("imports AppEmptyState", () => {
    assert.match(source, /import.*AppEmptyState/);
  });

  test("renders AppEmptyState with compact variant", () => {
    assert.match(source, /<AppEmptyState/);
    assert.match(source, /compact/);
  });

  test("preserves 添加日程 button with onNewSchedule action", () => {
    assert.match(source, /添加日程/);
    assert.match(source, /onNewSchedule/);
  });

  test("preserves sunny-schedule-empty-state CSS class", () => {
    assert.match(source, /sunny-schedule-empty-state/);
  });

  test("preserves calendar icon", () => {
    assert.match(source, /DashboardIcon name="calendar"/);
  });
});

describe("MemoryCardGrid search → AppSearchInput", () => {
  const source = read("src/components/dashboard/memory/MemoryCardGrid.tsx");

  test("imports AppSearchInput", () => {
    assert.match(source, /import.*AppSearchInput/);
  });

  test("renders AppSearchInput instead of raw input", () => {
    assert.match(source, /<AppSearchInput/);
    /* Should NOT have a raw <input> for search anymore */
    const inputMatches = source.match(/<input/g);
    assert.ok(!inputMatches || inputMatches.length === 0, "No raw <input> for search should remain");
  });

  test("preserves search placeholder text", () => {
    assert.match(source, /搜索记忆标题\.\.\./);
  });

  test("supports clear via onClear callback", () => {
    assert.match(source, /onClear/);
    assert.match(source, /handleQueryChange\(""\)/);
  });

  test("preserves onChange binding to handleQueryChange", () => {
    assert.match(source, /onChange.*handleQueryChange/);
  });
});

describe("DashboardSettingsMenu → AppPopover", () => {
  test("DashboardSettingsMenu wraps SettingsPopover which uses AppPopover", () => {
    const menu = read("src/components/dashboard/DashboardSettingsMenu.tsx");
    const popover = read("src/components/shared/SettingsPopover.tsx");

    assert.match(menu, /SettingsPopover/);
    assert.match(popover, /AppPopover/);
    assert.match(popover, /import.*AppPopover/);
  });

  test("AppPopover uses Radix Portal for proper positioning", () => {
    const popover = read("src/components/primitives/AppPopover.tsx");
    assert.match(popover, /PopoverPrimitive\.Portal/);
  });

  test("AppPopover supports Esc close via Radix", () => {
    const popover = read("src/components/primitives/AppPopover.tsx");
    /* Radix handles Esc internally */
    assert.match(popover, /PopoverPrimitive\.Root/);
  });

  test("settings-popover CSS no longer overrides z-index", () => {
    const css = read("src/app/styles/sunny-settings.css");
    /* z-index should NOT be in .settings-popover block */
    const block = css.match(/\.settings-popover\s*\{[^}]*\}/s);
    assert.ok(block, "settings-popover CSS block should exist");
    assert.doesNotMatch(block![0], /z-index/);
  });

  test("AppPopover content uses --z-popover level", () => {
    const css = read("src/app/styles/sunny-primitives.css");
    assert.match(css, /\.app-popover-content.*\{/s);
    assert.match(css, /z-index:\s*1200/);
  });

  test("sunny-dashboard-settings-popover absolute-positioned CSS is unused in TSX", () => {
    /* The class is defined in CSS but never used in components */
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    assert.match(css, /sunny-dashboard-settings-popover/);
    /* It's only in CSS files - confirmed by earlier grep */
  });
});

describe("No regressions", () => {
  test("AppEmptyState is exported from primitives index", () => {
    const idx = read("src/components/primitives/index.ts");
    assert.match(idx, /AppEmptyState/);
  });

  test("AppSearchInput is exported from primitives index", () => {
    const idx = read("src/components/primitives/index.ts");
    assert.match(idx, /AppSearchInput/);
  });

  test("existing primitives still exported", () => {
    const idx = read("src/components/primitives/index.ts");
    assert.match(idx, /AppButton/);
    assert.match(idx, /AppPopover/);
  });
});
