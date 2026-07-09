"use client";

import {
  AppDropdownMenu,
  AppDropdownMenuItem,
} from "@/components/primitives/AppDropdownMenu";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

const MODE_OPTIONS: Array<{
  key: AgentWorkbenchMode;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "ask",
    label: "自动",
    description: "系统会判断回答或规划，执行前需要确认。",
    placeholder: "输入问题或任务...",
  },
  {
    key: "answer",
    label: "只回答",
    description: "只回答当前问题，不主动生成写入计划。",
    placeholder: "输入要咨询的问题，Agent 会直接回答",
  },
  {
    key: "plan",
    label: "规划",
    description: "会生成计划建议，默认不会写入数据库。",
    placeholder: "描述你的目标，Agent 会生成计划草案",
  },
  {
    key: "execute",
    label: "执行",
    description: "会先生成 DryRun，确认后才会写入数据库。",
    placeholder: "描述要执行的操作，系统会先生成 DryRun",
  },
  {
    key: "review",
    label: "回顾",
    description: "会复盘计划、日程或阶段，默认不会写入数据库。",
    placeholder: "输入要复盘的计划、日程或阶段",
  },
  {
    key: "timeline",
    label: "时间线",
    description: "记录或查询时间线事件，默认不会写入数据库。",
    placeholder: "描述要记录的时间线事件或查询条件",
  },
  {
    key: "today",
    label: "今日",
    description: "整理今天最应该推进的工作，默认不写入数据库。",
    placeholder: "输入要关注的重点或日期范围",
  },
  {
    key: "writing",
    label: "写作",
    description: "整理写作素材或起草内容，默认不写入数据库。",
    placeholder: "描述写作主题或素材类型",
  },
];

export function getComposerModeOption(mode: AgentWorkbenchMode) {
  return MODE_OPTIONS.find((entry) => entry.key === mode) ?? MODE_OPTIONS[0];
}

type ComposerModeSelectProps = {
  modelName?: string;
  onOpenChange?: (open: boolean) => void;
  onWorkbenchModeChange: (mode: AgentWorkbenchMode) => void;
  open?: boolean;
  trigger: React.ReactNode;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  workbenchMode: AgentWorkbenchMode;
};

export function ComposerModeSelect({
  modelName = "DeepSeek V3",
  onOpenChange,
  onWorkbenchModeChange,
  open,
  trigger,
  triggerAriaLabel = "选择工作模式",
  triggerClassName,
  workbenchMode,
}: ComposerModeSelectProps) {
  return (
    <AppDropdownMenu
      align="start"
      collisionPadding={16}
      onOpenChange={onOpenChange}
      open={open}
      side="top"
      sideOffset={8}
      trigger={trigger}
      triggerAriaLabel={triggerAriaLabel}
      triggerClassName={triggerClassName}
    >
      {MODE_OPTIONS.map((mode) => (
        <AppDropdownMenuItem
          key={mode.key}
          className={mode.key === workbenchMode ? "is-active" : undefined}
          description={mode.description}
          onSelect={() => {
            onWorkbenchModeChange(mode.key);
            onOpenChange?.(false);
          }}
        >
          <strong>{mode.label}</strong>
          {mode.key === workbenchMode ? ` · ${modelName}` : null}
        </AppDropdownMenuItem>
      ))}
    </AppDropdownMenu>
  );
}

export { MODE_OPTIONS as composerModeOptions };
