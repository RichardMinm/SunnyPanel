"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SiteLocale } from "@/lib/site-copy";

type CommandItem = {
  href: string;
  keywords: string[];
  label: string;
  section: "create" | "navigate";
};

const commandCopy = {
  en: {
    close: "Close",
    create: "Create",
    empty: "No command found",
    navigate: "Navigate",
    open: "Command",
    placeholder: "Search pages and actions...",
    shortcut: "Cmd K",
    title: "Command Palette",
  },
  zh: {
    close: "关闭",
    create: "新建",
    empty: "没有找到匹配命令",
    navigate: "导航",
    open: "命令",
    placeholder: "搜索页面和操作...",
    shortcut: "⌘K",
    title: "命令面板",
  },
} as const;

const getCommandItems = (locale: SiteLocale): CommandItem[] => {
  const isEn = locale === "en";

  return [
    {
      href: "/",
      keywords: ["home", "index", "首页"],
      label: isEn ? "Go to Home" : "前往首页",
      section: "navigate",
    },
    {
      href: "/dashboard",
      keywords: ["dashboard", "workspace", "工作台", "私有"],
      label: isEn ? "Go to Dashboard" : "前往工作台",
      section: "navigate",
    },
    {
      href: "/blog",
      keywords: ["blog", "post", "writing", "文章", "写作"],
      label: isEn ? "Go to Blog" : "前往 Blog",
      section: "navigate",
    },
    {
      href: "/notes",
      keywords: ["notes", "note", "短札", "笔记"],
      label: isEn ? "Go to Notes" : "前往 Notes",
      section: "navigate",
    },
    {
      href: "/updates",
      keywords: ["updates", "update", "动态"],
      label: isEn ? "Go to Updates" : "前往 Updates",
      section: "navigate",
    },
    {
      href: "/timeline",
      keywords: ["timeline", "memory", "时间线", "记忆"],
      label: isEn ? "Go to Timeline" : "前往 Timeline",
      section: "navigate",
    },
    {
      href: "/admin",
      keywords: ["admin", "payload", "后台"],
      label: isEn ? "Go to Admin" : "前往后台",
      section: "navigate",
    },
    {
      href: "/admin/collections/posts/create",
      keywords: ["new post", "post", "article", "文章"],
      label: isEn ? "New Post" : "新建文章",
      section: "create",
    },
    {
      href: "/admin/collections/notes/create",
      keywords: ["new note", "note", "短札"],
      label: isEn ? "New Note" : "新建短札",
      section: "create",
    },
    {
      href: "/admin/collections/updates/create",
      keywords: ["new update", "update", "动态"],
      label: isEn ? "New Update" : "新建动态",
      section: "create",
    },
    {
      href: "/admin/collections/timeline-events/create",
      keywords: ["new timeline", "timeline event", "时间线", "节点"],
      label: isEn ? "New Timeline Event" : "新建时间线节点",
      section: "create",
    },
    {
      href: "/admin/collections/plans/create",
      keywords: ["new plan", "plan", "计划"],
      label: isEn ? "New Plan" : "新建计划",
      section: "create",
    },
    {
      href: "/admin/collections/media/create",
      keywords: ["upload", "media", "image", "媒体", "上传"],
      label: isEn ? "Upload Media" : "上传媒体",
      section: "create",
    },
  ];
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

export function CommandPalette({ locale }: { locale: SiteLocale }) {
  const router = useRouter();
  const copy = commandCopy[locale];
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const commands = useMemo(() => getCommandItems(locale), [locale]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCommands = useMemo(() => {
    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = [command.label, command.href, ...command.keywords].join(" ").toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [commands, normalizedQuery]);

  const groupedCommands = filteredCommands.reduce<Record<CommandItem["section"], CommandItem[]>>(
    (accumulator, command) => {
      accumulator[command.section].push(command);
      return accumulator;
    },
    { create: [], navigate: [] },
  );

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const runCommand = useCallback((command: CommandItem) => {
    closePalette();
    router.push(command.href);
  }, [closePalette, router]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);

      if (isCommandK) {
        event.preventDefault();
        openPalette();
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          filteredCommands.length === 0 ? 0 : (current - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const activeCommand = filteredCommands[activeIndex];

        if (activeCommand) {
          runCommand(activeCommand);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, closePalette, filteredCommands, isOpen, openPalette, runCommand]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  return (
    <>
      <button
        aria-label={copy.title}
        className="sunny-command-trigger"
        onClick={openPalette}
        type="button"
      >
        <span>{copy.open}</span>
        <kbd>{copy.shortcut}</kbd>
      </button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="sunny-command-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isEditableTarget(event.target)) {
              closePalette();
            }
          }}
          role="dialog"
        >
          <div className="sunny-command-panel">
            <div className="sunny-command-input-row">
              <input
                ref={inputRef}
                aria-label={copy.placeholder}
                className="sunny-command-input"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={copy.placeholder}
                value={query}
              />
              <button className="sunny-command-close" onClick={closePalette} type="button">
                {copy.close}
              </button>
            </div>

            <div className="sunny-command-list">
              {filteredCommands.length > 0 ? (
                (["navigate", "create"] as const).map((section) =>
                  groupedCommands[section].length > 0 ? (
                    <div key={section} className="sunny-command-section">
                      <p className="sunny-command-section-label">
                        {section === "navigate" ? copy.navigate : copy.create}
                      </p>
                      {groupedCommands[section].map((command) => {
                        const commandIndex = filteredCommands.indexOf(command);
                        const isActive = commandIndex === activeIndex;

                        return (
                          <button
                            key={`${command.section}-${command.href}`}
                            className={`sunny-command-item ${isActive ? "sunny-command-item-active" : ""}`}
                            onMouseEnter={() => setActiveIndex(commandIndex)}
                            onClick={() => runCommand(command)}
                            type="button"
                          >
                            <span>{command.label}</span>
                            <span>{command.href}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null,
                )
              ) : (
                <div className="sunny-command-empty">{copy.empty}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
