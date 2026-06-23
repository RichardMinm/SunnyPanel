"use client";

import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuSub,
  AppDropdownMenuSubContent,
  AppDropdownMenuSubTrigger,
} from "@/components/primitives/AppDropdownMenu";
import { DashboardIcon } from "@/components/dashboard/icons";

type ComposerAddMenuItem = {
  action?: "context" | "plan" | "memory" | "file" | "slash" | "debug";
  children?: Array<{ label: string }>;
  label: string;
};

const REFERENCE_ITEMS: ComposerAddMenuItem[] = [
  {
    label: "添加上下文",
    action: "context",
    children: [{ label: "当前计划" }, { label: "最近日程" }, { label: "关联清单" }, { label: "相关记忆" }],
  },
  { label: "项目上下文", action: "context", children: [{ label: "当前项目" }, { label: "关联文档" }] },
  { label: "工作流规则", action: "memory", children: [{ label: "偏好/习惯" }, { label: "工作流规则" }] },
];

const ADD_ITEMS: ComposerAddMenuItem[] = [
  {
    label: "添加计划",
    action: "plan",
    children: [{ label: "起草新计划" }, { label: "关联当前计划" }],
  },
  {
    label: "添加记忆",
    action: "memory",
    children: [{ label: "偏好/习惯" }, { label: "项目上下文" }, { label: "工作流规则" }],
  },
  { label: "添加文件", action: "file" },
];

type ComposerAddMenuProps = {
  debugMode: boolean;
  input: string;
  onDebugModeChange: (next: boolean) => void;
  onInputChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger: React.ReactNode;
  triggerAriaLabel?: string;
  triggerClassName?: string;
};

export function ComposerAddMenu({
  debugMode,
  input,
  onDebugModeChange,
  onInputChange,
  onOpenChange,
  open,
  trigger,
  triggerAriaLabel = "添加上下文 / 文件 / 命令",
  triggerClassName,
}: ComposerAddMenuProps) {
  const handleChildSelect = (parent: ComposerAddMenuItem, childLabel: string) => {
    if (parent.action === "context") {
      onInputChange(`${input} @${childLabel} `);
    } else if (parent.action === "plan") {
      onInputChange(childLabel === "起草新计划" ? "/plan " : "/plan 关联当前计划 ");
    } else if (parent.action === "memory") {
      onInputChange(`/memory ${childLabel} `);
    }
    onOpenChange?.(false);
  };

  const renderGroup = (title: string, items: ComposerAddMenuItem[]) => (
    <>
      <AppDropdownMenuLabel>{title}</AppDropdownMenuLabel>
      {items.map((item) =>
        item.children && item.children.length > 0 ? (
          <AppDropdownMenuSub key={item.label}>
            <AppDropdownMenuSubTrigger className="app-menu-item">
              <span className="app-menu-item-label">{item.label}</span>
              <span className="app-menu-item-chevron">
                <DashboardIcon name="chevronRight" />
              </span>
            </AppDropdownMenuSubTrigger>
            <AppDropdownMenuSubContent className="app-dropdown-content">
              {item.children.map((child) => (
                <AppDropdownMenuItem key={child.label} onSelect={() => handleChildSelect(item, child.label)}>
                  {child.label}
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenuSubContent>
          </AppDropdownMenuSub>
        ) : (
          <AppDropdownMenuItem
            key={item.label}
            onSelect={() => {
              if (item.action === "slash") onInputChange("/");
              if (item.action === "debug") onDebugModeChange(!debugMode);
              onOpenChange?.(false);
            }}
          >
            {item.label}
          </AppDropdownMenuItem>
        ),
      )}
    </>
  );

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
      {renderGroup("引用", REFERENCE_ITEMS)}
      <AppDropdownMenuSeparator />
      {renderGroup("添加", ADD_ITEMS)}
      <AppDropdownMenuSeparator />
      <AppDropdownMenuLabel>命令</AppDropdownMenuLabel>
      <AppDropdownMenuItem onSelect={() => { onInputChange("/"); onOpenChange?.(false); }}>
        斜杠命令
      </AppDropdownMenuItem>
      {process.env.NODE_ENV === "development" || debugMode ? (
        <>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuLabel>开发</AppDropdownMenuLabel>
          <AppDropdownMenuItem onSelect={() => { onDebugModeChange(!debugMode); onOpenChange?.(false); }}>
            {debugMode ? "关闭调试模式" : "调试模式"}
          </AppDropdownMenuItem>
        </>
      ) : null}
    </AppDropdownMenu>
  );
}
